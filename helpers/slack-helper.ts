// helpers/slack-helper.ts
import https from 'https';
import { URL } from 'url';

export type ReportRow = {
  section: string;
  field: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

};

function stripAnsi(s: string) {
  // removes ESC[ ... m
  return (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function firstLine(s: string) {
  return stripAnsi(s ?? '').split('\n')[0].trim();
}


function shorten(s: string, max = 140) {
  const v = stripAnsi(s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

function statusEmoji(s: ReportRow['status']) {
  if (s === 'PASS') return '✅';
  if (s === 'FAIL') return '❌';
  if (s === 'ERROR') return '🛑';
  return '⏭️'; // SKIP
}


/** Normalize noisy Playwright/system errors so they’re readable and dedupe-able. */
function normalizeErrorText(raw: string) {
  let line = firstLine(raw);

  // remove evidence tail so duplicates dedupe properly
  line = line.replace(/\s*\|\s*url=.*$/i, '').trim();
  line = line.replace(/\s*\|\s*shot=.*$/i, '').trim();

  if (/Target page, context or browser has been closed/i.test(line)) {
    return 'Browser/Page closed unexpectedly (possible navigation crash, logout, reload, or app error).';
  }
  if (/Test timeout of \d+ms exceeded/i.test(line)) {
    return 'Test timed out while waiting for UI/network.';
  }

  return line
    .replace(/^Error:\s*/i, '')
    .replace(/^expect\.[^:]+:\s*/i, 'Expect failed: ');
}


function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const v = normalizeErrorText(i);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function guessEnvLabel() {
  const target = (process.env.TARGET_ENV || '').toLowerCase();
  if (target) return target.toUpperCase();

  const base = (process.env.BASE_URL || '').toLowerCase();
  if (base.includes('dev')) return 'DEV';
  if (base.includes('prod')) return 'PROD';
  return 'ENV';
}

async function httpsPostJson(urlStr: string, body: any, headers: Record<string, string> = {}) {
  const url = new URL(urlStr);
  const payload = JSON.stringify(body);

  const options: https.RequestOptions = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
      ...headers,
    },
  };

  return new Promise<{ statusCode?: number; raw: string }>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (d) => (raw += d));
      res.on('end', () => resolve({ statusCode: res.statusCode, raw }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Sends report to Slack via webhook.
 * NOTE: Right now you hardcode mention ID. We'll keep that behavior.
 */
export async function sendComplianceSlackReport(input: {
  title: string;
  viewDetailsUrl: string;
  complianceFormUrl?: string;
  submitterEmailForMention?: string;
  rows: ReportRow[];
  errors?: string[];
}) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.warn('[Slack] SLACK_WEBHOOK_URL is not set. Skipping Slack report.');
    return;
  }

  const envLabel = guessEnvLabel();

  const passRows = input.rows.filter((r) => r.status === 'PASS');
  const failRows = input.rows.filter((r) => r.status === 'FAIL');
  const errorRows = input.rows.filter((r) => r.status === 'ERROR');

  const passCount = passRows.length;
  const failCount = failRows.length;
  const errorCount = errorRows.length;

  const extraErrors = input.errors ?? [];

  // We ping if anything is FAIL or ERROR or extraErrors exist
  const needPing = failCount > 0 || errorCount > 0 || extraErrors.length > 0;

  // keep your hardcoded mention for now
  const mention = needPing ? '<@U089BQX3Z6F>' : '';

  // ✅ make ERROR look like ERROR (🛑) not warning
  const summary =
    `*${input.title}* — *${envLabel}*\n` +
    `Result: ✅ ${passCount}  ❌ ${failCount}  🛑 ${errorCount}`;

  const links = [
    `• View Details: ${input.viewDetailsUrl}`,
    input.complianceFormUrl ? `• Compliance Form: ${input.complianceFormUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const section = (name: string, body: string) => `*${name}*\n${body}`;

  // --------- WHERE IT STOPPED (Top errors) ----------
  // Prefer ERROR rows; fall back to extraErrors.
  const topErrorCandidates: string[] = [];

for (const r of errorRows.slice(0, 4)) {
  topErrorCandidates.push(`${r.section} > ${r.field}: ${r.actual}`);
}

// only use extraErrors if there were no ERROR rows
if (topErrorCandidates.length === 0) {
  for (const e of extraErrors.slice(0, 4)) topErrorCandidates.push(e);
}

const topUnique = dedupeStrings(topErrorCandidates).slice(0, 2);

  const whereStopped =
    topUnique.length > 0
      ? topUnique.map((e) => `• ${e}`).join('\n')
      : '• (none)';

  // --------- MISMATCHES (FAIL) ----------
  const mismatchBullets =
    failRows.length > 0
      ? failRows
          .slice(0, 15)
          .map(
            (r) =>
              `• ${r.section} > ${r.field}: expected "${shorten(r.expected)}" → got "${shorten(
                r.actual,
              )}"`,
          )
          .join('\n')
      : '• (none)';

  // --------- ERRORS (deduped, readable) ----------
  // Merge errorRows + extraErrors, normalize+dedupe, show top N
  const mergedErrors: string[] = [
    ...errorRows.map((r) => `${r.section} > ${r.field}: ${r.actual}`),
    ...extraErrors,
  ];

  const errorBullets =
    mergedErrors.length > 0
      ? dedupeStrings(mergedErrors)
          .slice(0, 10)
          .map((e) => `• ${e}`)
          .join('\n')
      : '• (none)';

  // --------- Optional: show Overview & Docs if PASS ----------
  const overviewRows = input.rows.filter((r) => r.section === 'Overview' && r.status !== 'ERROR');
  const docsRows = input.rows.filter((r) => r.section === 'Documents & Data' && r.status !== 'ERROR');

  const overviewBullets =
    overviewRows.length > 0
      ? overviewRows.map((r) => `• ${r.field}: ${shorten(r.actual)}`).join('\n')
      : '• (no overview data)';

  const docsBullets =
    docsRows.length > 0
      ? docsRows.map((r) => `• ${r.field}: ${shorten(r.actual)}`).join('\n')
      : '• (no extracted answers)';

  let body = '';

  if (!needPing) {
    // PASS: concise useful info
    body =
      section('OVERVIEW', overviewBullets) +
      '\n\n' +
      section('SUBMITTED ANSWERS (Documents & Data)', docsBullets);
  } else {
    // FAIL/ERROR: super readable summary
    body =
      section('WHERE IT STOPPED', whereStopped) +
      '\n\n' +
      section('MISMATCHES', mismatchBullets) +
      '\n\n' +
      section('ERRORS (deduped)', errorBullets);
  }

  const text = `${mention ? `${mention}\n` : ''}${summary}\n${links}\n\n${body}`;

  const res = await httpsPostJson(webhook, { text });
  if (res.statusCode && res.statusCode >= 400) {
    console.warn(`[Slack] webhook returned ${res.statusCode}: ${res.raw}`);
  }
}
