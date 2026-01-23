// scripts/run-combined.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const { spawn } = require('child_process');

function guessEnvLabel() {
  const t = (process.env.TARGET_ENV || '').toLowerCase();
  if (t) return t.toUpperCase();
  const base = (process.env.BASE_URL || '').toLowerCase();
  if (base.includes('dev')) return 'DEV';
  if (base.includes('prod')) return 'PROD';
  return 'ENV';
}

function stripAnsi(s) {
  return (s || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function shorten(s, max = 120) {
  const v = stripAnsi(s || '').replace(/\s+/g, ' ').trim();
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

function simplifyDetail(detail) {
  const d = stripAnsi(detail || '').replace(/\s+/g, ' ').trim();
  if (!d) return 'Unknown error';

  if (/toHaveURL/.test(d) && /Received string:/i.test(d)) {
    const received =
      (d.match(/Received string:\s*"([^"]+)"/i) || [])[1] ||
      (d.match(/Received string:\s*([^\s]+)/i) || [])[1];

    let nice = received || '';
    try {
      if (nice.startsWith('http')) nice = new URL(nice).pathname;
    } catch {}
    return nice ? `Navigated to unexpected URL (${nice})` : 'Navigated to unexpected URL';
  }

  if (/Timeout/i.test(d)) return 'Timeout waiting for the page to load';
  if (/not found|404/i.test(d)) return 'Page not found (404)';
  return shorten(d);
}

function parseRowLabel(label) {
  const isTop = /^Top menu/i.test(label);
  const isSide = /^Side menu/i.test(label);
  const isExtra = /EXTRA/i.test(label);

  const clean = (label || '')
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

function normalizeSolutionName(title) {
  return (title || '')
    .replace(/\s*—\s*(DEV|PROD|ENV)\s*$/i, '')
    .replace(/\s*-\s*Navigation Report\s*$/i, '')
    .trim();
}

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8');
}

function postSlack(text) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('[Slack] SLACK_WEBHOOK_URL not set, skip posting.');
    return Promise.resolve();
  }

  const url = new URL(webhook);
  const payload = JSON.stringify({ text });

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
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.warn(`[Slack] webhook returned ${res.statusCode}: ${raw}`);
        }
        resolve();
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildCombinedMessage(envLabel, reports) {
  // reports: [{ title, rows }]
  const allRows = reports.flatMap((r) => r.rows || []);
  const pass = allRows.filter((r) => r.status === 'PASS').length;
  const err = allRows.filter((r) => r.status === 'ERROR').length;

  const header = `*Solutions - Navigation Report* — *${envLabel}*\nResult: ✅ ${pass}  🛑 ${err}\n`;

  const topMap = new Map();
  const sideMap = new Map();

  for (const rep of reports) {
    const sol = normalizeSolutionName(rep.title);
    for (const row of rep.rows || []) {
      const p = parseRowLabel(row.label);
      if (p.menu === 'TOP') topMap.set(sol, [...(topMap.get(sol) || []), row]);
      if (p.menu === 'SIDE') sideMap.set(sol, [...(sideMap.get(sol) || []), row]);
    }
  }

  const sortEntries = (m) => Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const renderBlock = (sol, rows) => {
    const normal = rows.filter((r) => !parseRowLabel(r.label).isExtra);
    const lines = [`*${sol}*`];
    for (const r of normal) {
      const item = parseRowLabel(r.label).item;
      lines.push(`• ${item} ${r.status === 'PASS' ? '✅' : '🛑'}`);
    }
    return lines.join('\n');
  };

  const topBlocks = sortEntries(topMap).map(([sol, rows]) => renderBlock(sol, rows)).join('\n\n');
  const sideBlocks = sortEntries(sideMap).map(([sol, rows]) => renderBlock(sol, rows)).join('\n\n');

  // Error section: failed + extras
  const errorLines = [];
  for (const rep of reports) {
    const sol = normalizeSolutionName(rep.title);
    for (const row of rep.rows || []) {
      const p = parseRowLabel(row.label);
      if (row.status === 'ERROR' || p.isExtra) {
        const menuLabel = p.menu === 'TOP' ? 'Top Menu' : p.menu === 'SIDE' ? 'Side Menu' : 'Menu';
        const detail = row.status === 'ERROR' ? simplifyDetail(row.detail) : 'Unexpected menu item found';
        errorLines.push(`• *${sol}* — ${menuLabel}: ${p.item} — ${detail}`);
      }
    }
  }

  const errorSection = errorLines.length ? `\n\n*Error*\n${errorLines.join('\n')}` : '';

  return (
    header +
    `\n*Top Menu →*\n${topBlocks || '• (none)'}\n\n` +
    `*Side Menu →*\n${sideBlocks || '• (none)'}` +
    errorSection
  );
}

async function main() {
  const envName = (process.argv[2] || 'dev').toLowerCase(); // dev|prod
  const envFileArg = process.argv[3]; // optional: .env.ci
  const envFile = envFileArg || (envName === 'prod' ? '.env.prod' : '.env.dev');

  // load env file
  require('dotenv').config({ path: envFile });

  process.env.TARGET_ENV = envName;
  process.env.SLACK_COLLECT = '1';

  const collectPath = path.join('test-results', `slack-${envName}.json`);
  process.env.SLACK_COLLECT_PATH = collectPath;

  // clear collector
  writeJson(collectPath, []);

  // IMPORTANT: CI must be headless
  process.env.CI = process.env.CI || ''; // keep existing

  const args = ['playwright', 'test', '--workers=1', 'tests/solutions'];
  const child = spawn('npx', args, { stdio: 'inherit', shell: true });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));

  // flush once
  const reports = readJsonSafe(collectPath);

  // If empty, show a loud warning (this is your current bug)
  if (!reports.length) {
    await postSlack(
      `*Solutions - Navigation Report* — *${guessEnvLabel()}*\n` +
        `Result: ✅ 0  🛑 0\n\n` +
        `🛑 *No rows were collected.*\n` +
        `Check that every spec calls sendMenuSlackReport() in finally, and that SLACK_COLLECT_PATH matches: \`${collectPath}\``
    );
    process.exit(exitCode);
  }

  const text = buildCombinedMessage(guessEnvLabel(), reports);
  await postSlack(text);

  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[run-combined] failed:', e);
  process.exit(1);
});
