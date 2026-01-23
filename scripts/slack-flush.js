// scripts/slack-flush.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

function getPathFromEnv() {
  const p = (process.env.SLACK_COLLECT_PATH || '').trim();
  if (p) return p;
  const env = (process.env.TARGET_ENV || 'env').toLowerCase();
  return path.join('test-results', `slack-${env}.jsonl`);
}

function stripAnsi(s) {
  return (s || '').replace(/\u001b\[[0-9;]*m/g, '');
}
function norm(s) {
  return stripAnsi(s || '').replace(/\s+/g, ' ').trim();
}
function shorten(s, max = 140) {
  const v = norm(s);
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}
function simplifyDetail(raw) {
  const s = norm(raw);

  if (/toHaveURL/i.test(s) || /Expected pattern:/i.test(s)) {
    const m = s.match(/Received string:\s*"([^"]+)"/i);
    const received = m && m[1];
    return received
      ? `Navigation failed (landed on ${received}).`
      : `Navigation failed (URL did not match expected route).`;
  }

  if (/Timeout/i.test(s)) return 'Navigation failed (timeout waiting for page to load).';
  if (/not found/i.test(s)) return 'Navigation failed (menu item not found).';

  return shorten(s, 160);
}

function guessEnvLabel() {
  const target = (process.env.TARGET_ENV || '').toLowerCase();
  if (target) return target.toUpperCase();

  const base = (process.env.BASE_URL || '').toLowerCase();
  if (base.includes('dev')) return 'DEV';
  if (base.includes('prod')) return 'PROD';
  return 'ENV';
}

async function httpsPostJson(urlStr, body) {
  const url = new URL(urlStr);
  const payload = JSON.stringify(body);

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    },
  };

  return new Promise((resolve, reject) => {
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

function buildCombinedMessage(reports) {
  // flatten all rows
  const allRows = [];
  for (const r of reports) {
    if (Array.isArray(r.rows)) allRows.push(...r.rows);
  }

  const passRows = allRows.filter((x) => x.status === 'PASS');
  const errRows = allRows.filter((x) => x.status === 'ERROR');

  const envLabel = guessEnvLabel();
  const title = process.env.SLACK_COMBINED_TITLE || 'Solutions - Navigation Report';
  const mention = errRows.length ? (process.env.SLACK_MENTION || '') : '';

  const header =
    `${mention ? `${mention}\n` : ''}` +
    `*${title}* — *${envLabel}*\n` +
    `Result: ✅ ${passRows.length}  🛑 ${errRows.length}\n`;

  const passedBlock =
    `\n*✅ Passed (${passRows.length})*\n` +
    (passRows.length ? passRows.map((r) => `• ${r.label} ✅`).join('\n') : '• (none)');

  const failedBlock =
    `\n\n*🛑 Failed (${errRows.length})*\n` +
    (errRows.length
      ? errRows.map((r) => `• ${r.label} 🛑 — ${simplifyDetail(r.detail || '')}`).join('\n')
      : '• (none)');

  return `${header}${passedBlock}${failedBlock}`;
}

async function main() {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('[SlackFlush] SLACK_WEBHOOK_URL not set, skip.');
    return;
  }

  const filePath = getPathFromEnv();
  if (!fs.existsSync(filePath)) {
    console.log(`[SlackFlush] Collector not found: ${filePath}`);
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    console.log('[SlackFlush] No collected reports found. Skipping.');
    return;
  }

  const reports = lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const text = buildCombinedMessage(reports);

  const res = await httpsPostJson(webhook, { text });
  if (res.statusCode && res.statusCode >= 400) {
    console.warn(`[SlackFlush] webhook returned ${res.statusCode}: ${res.raw}`);
  } else {
    console.log('[SlackFlush] Sent combined Slack report.');
  }

  // clear after flush
  fs.writeFileSync(filePath, '', 'utf8');
}

main().catch((e) => {
  console.error('[SlackFlush] Failed:', e);
  process.exit(1);
});
