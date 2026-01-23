// helpers/slack-menu-report.ts
import fs from 'fs';
import path from 'path';
import https from 'https';
import { URL } from 'url';

export type MenuCheckRow = {
  label: string; // e.g. "Top menu — AI Hub" | "Side menu — AI Hub" | "Side menu EXTRA — Something"
  status: 'PASS' | 'ERROR';
  detail?: string;
};

type CollectedReport = {
  title: string;        // e.g. "Corporate Planning - Navigation Report"
  rows: MenuCheckRow[];
  createdAt: string;
};

function guessEnvLabel() {
  const target = (process.env.TARGET_ENV || '').toLowerCase();
  if (target) return target.toUpperCase();

  const base = (process.env.BASE_URL || '').toLowerCase();
  if (base.includes('dev')) return 'DEV';
  if (base.includes('prod')) return 'PROD';
  return 'ENV';
}

function emoji(status: MenuCheckRow['status']) {
  return status === 'PASS' ? '✅' : '🛑';
}

function shorten(s: string, max = 140) {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

function stripAnsi(s: string) {
  return (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function simplifyDetail(detail?: string) {
  const d = stripAnsi(detail || '').replace(/\s+/g, ' ').trim();
  if (!d) return 'Unknown error';

  // Playwright URL mismatch -> make it human
  if (/toHaveURL/.test(d) && /Received string:/i.test(d)) {
    const received =
      d.match(/Received string:\s*"([^"]+)"/i)?.[1] ||
      d.match(/Received string:\s*([^\s]+)/i)?.[1];

    // show only path if possible
    let nice = received || '';
    try {
      if (nice.startsWith('http')) {
        nice = new URL(nice).pathname;
      }
    } catch {}

    return nice ? `Navigated to unexpected URL (${nice})` : 'Navigated to unexpected URL';
  }

  if (/Timeout/i.test(d)) return 'Timeout waiting for the page to load';
  if (/not found|404/i.test(d)) return 'Page not found (404)';

  return shorten(d, 120);
}

async function httpsPostJson(urlStr: string, body: any) {
  const url = new URL(urlStr);
  const payload = JSON.stringify(body);

  const options: https.RequestOptions = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
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

/** Collector helpers */
function collectorEnabled() {
  return (process.env.SLACK_COLLECT || '').toLowerCase() === '1';
}
function collectPath() {
  return process.env.SLACK_COLLECT_PATH || path.join('test-results', 'slack.json');
}

export function clearCollectedReports() {
  const p = collectPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify([]), 'utf8');
  console.log(`[SlackCollect] Cleared collector: ${p}`);
}

export function readCollectedReports(): CollectedReport[] {
  const p = collectPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CollectedReport[];
  } catch {
    return [];
  }
}

export function collectMenuSlackReport(input: { title: string; rows: MenuCheckRow[] }) {
  const p = collectPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });

  const existing = readCollectedReports();
  existing.push({
    title: input.title,
    rows: input.rows,
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
}

/** The function your specs call */
export async function sendMenuSlackReport(input: {
  title: string;
  rows: MenuCheckRow[];
  mentionUserId?: string;
  includeErrorDetails?: boolean;
}) {
  // collect mode => do NOT post, just store
  if (collectorEnabled()) {
    collectMenuSlackReport({ title: input.title, rows: input.rows });
    return;
  }

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const envLabel = guessEnvLabel();
  const pass = input.rows.filter((r) => r.status === 'PASS').length;
  const err = input.rows.filter((r) => r.status === 'ERROR').length;

  const header =
    `${input.mentionUserId ? `${input.mentionUserId}\n` : ''}` +
    `*${input.title}* — *${envLabel}*\n` +
    `Result: ✅ ${pass}  🛑 ${err}\n`;

  const checklist = input.rows.map((r) => `• ${r.label} ${emoji(r.status)}`).join('\n');

  const errorDetails =
    (input.includeErrorDetails ?? true) && err > 0
      ? '\n\n*Error details*\n' +
        input.rows
          .filter((r) => r.status === 'ERROR')
          .map((r) => `• ${r.label}: ${simplifyDetail(r.detail)}`)
          .join('\n')
      : '';

  const text = `${header}\n${checklist}${errorDetails}`;
  const res = await httpsPostJson(webhook, { text });

  if (res.statusCode && res.statusCode >= 400) {
    console.warn(`[Slack] webhook returned ${res.statusCode}: ${res.raw}`);
  }
}

/** Combined formatter (your requested layout) */
function normalizeSolutionName(title: string) {
  return title
    .replace(/\s*—\s*(DEV|PROD|ENV)\s*$/i, '')
    .replace(/\s*-\s*Navigation Report\s*$/i, '')
    .replace(/\s*Solution\s*$/i, '')
    .trim();
}

function parseRow(row: MenuCheckRow) {
  const label = row.label || '';
  const isTop = /^Top menu/i.test(label);
  const isSide = /^Side menu/i.test(label);
  const isExtra = /EXTRA/i.test(label);

  // remove prefixes
  const clean = label
    .replace(/^Top menu\s*—\s*/i, '')
    .replace(/^Side menu\s*—\s*/i, '')
    .replace(/^Side menu\s*EXTRA\s*—\s*/i, '')
    .trim();

  return {
    menu: isTop ? 'TOP' : isSide ? 'SIDE' : 'OTHER',
    isExtra,
    item: clean,
  };
}

function buildCombinedMessage(opts: {
  envLabel: string;
  title: string; // e.g. "Solutions - Navigation Report"
  mentionUserId?: string;
  reports: CollectedReport[];
}) {
  const allRows = opts.reports.flatMap((r) => r.rows);
  const pass = allRows.filter((r) => r.status === 'PASS').length;
  const err = allRows.filter((r) => r.status === 'ERROR').length;

  const header =
    `${opts.mentionUserId ? `${opts.mentionUserId}\n` : ''}` +
    `*${opts.title}* — *${opts.envLabel}*\n` +
    `Result: ✅ ${pass}  🛑 ${err}\n`;

  // group rows by menu + solution
  const by = {
    TOP: new Map<string, MenuCheckRow[]>(),
    SIDE: new Map<string, MenuCheckRow[]>(),
  };

  for (const rep of opts.reports) {
    const sol = normalizeSolutionName(rep.title);

    for (const row of rep.rows) {
      const p = parseRow(row);
      if (p.menu === 'TOP') {
        by.TOP.set(sol, [...(by.TOP.get(sol) || []), row]);
      } else if (p.menu === 'SIDE') {
        by.SIDE.set(sol, [...(by.SIDE.get(sol) || []), row]);
      }
    }
  }

  const sortSolutions = (m: Map<string, any>) =>
    Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  function renderSolutionBlock(sol: string, rows: MenuCheckRow[]) {
    // keep only normal rows in main list
    const normal = rows.filter((r) => !parseRow(r).isExtra);
    const lines: string[] = [];
    lines.push(`*${sol}*`);
    for (const r of normal) {
      const item = parseRow(r).item;
      lines.push(`• ${item} ${emoji(r.status)}`);
    }
    return lines.join('\n');
  }

  const topBlocks = sortSolutions(by.TOP)
    .map(([sol, rows]) => renderSolutionBlock(sol, rows))
    .join('\n\n');

  const sideBlocks = sortSolutions(by.SIDE)
    .map(([sol, rows]) => renderSolutionBlock(sol, rows))
    .join('\n\n');

  // Error section: include extras + failed rows
  const errorLines: string[] = [];
  for (const rep of opts.reports) {
    const sol = normalizeSolutionName(rep.title);
    for (const row of rep.rows) {
      const p = parseRow(row);
      if (row.status === 'ERROR' || p.isExtra) {
        const menuLabel =
          p.menu === 'TOP' ? 'Top Menu' : p.menu === 'SIDE' ? 'Side Menu' : 'Menu';
        const item = p.item || row.label;
        const detail = row.status === 'ERROR' ? simplifyDetail(row.detail) : 'Unexpected menu item found';
        errorLines.push(`• *${sol}* — ${menuLabel}: ${item} — ${detail}`);
      }
    }
  }

  const errorSection =
    errorLines.length > 0 ? `\n\n*Error*\n${errorLines.join('\n')}` : '';

  const body =
    `\n*Top Menu →*\n${topBlocks || '• (none)'}\n\n` +
    `*Side Menu →*\n${sideBlocks || '• (none)'}` +
    errorSection;

  return header + body;
}

/** Flush combined report to Slack (call this once at the end) */
export async function flushCollectedReports(input?: {
  title?: string;          // default "Solutions - Navigation Report"
  mentionUserId?: string;  // optional "<@Uxxxx>"
}) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('[SlackFlush] SLACK_WEBHOOK_URL not set, skip.');
    return;
  }

  const reports = readCollectedReports();
  if (!reports.length) {
    console.log('[SlackFlush] No collected reports found. Skipping.');
    return;
  }

  const envLabel = guessEnvLabel();

  // mention if any error exists
  const hasError = reports.some((r) => r.rows.some((x) => x.status === 'ERROR' || /EXTRA/i.test(x.label)));

  const text = buildCombinedMessage({
    envLabel,
    title: input?.title || 'Solutions - Navigation Report',
    mentionUserId: input?.mentionUserId || (hasError ? '<@U089BQX3Z6F>' : undefined),
    reports,
  });

  const res = await httpsPostJson(webhook, { text });
  if (res.statusCode && res.statusCode >= 400) {
    console.warn(`[Slack] webhook returned ${res.statusCode}: ${res.raw}`);
  }
}
