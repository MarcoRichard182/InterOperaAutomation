// helpers/slack-menu-report.ts
import https from 'https';
import { URL } from 'url';

export type MenuCheckRow = {
  label: string; // e.g. "Side menu — AI Hub"
  status: 'PASS' | 'ERROR';
  detail?: string; // optional short error
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

export async function sendMenuSlackReport(input: {
  title: string;                 // "Home Solution - Navigation Report"
  rows: MenuCheckRow[];          // checklist rows
  mentionUserId?: string;        // optional "<@Uxxxx>"
  includeErrorDetails?: boolean; // default true
}) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const envLabel = guessEnvLabel();
  const pass = input.rows.filter(r => r.status === 'PASS').length;
  const err  = input.rows.filter(r => r.status === 'ERROR').length;

  const header =
    `${input.mentionUserId ? `${input.mentionUserId}\n` : ''}` +
    `*${input.title}* — *${envLabel}*\n` +
    `Result: ✅ ${pass}  🛑 ${err}\n`;

  // ✅ The checklist you want
  const checklist = input.rows
    .map(r => `• ${r.label} ${emoji(r.status)}`)
    .join('\n');

  const errorDetails =
    (input.includeErrorDetails ?? true) && err > 0
      ? '\n\n*Error details*\n' +
        input.rows
          .filter(r => r.status === 'ERROR')
          .map(r => `• ${r.label}: ${shorten(r.detail || 'Unknown error')}`)
          .join('\n')
      : '';

  const text = `${header}\n${checklist}${errorDetails}`;

  const res = await httpsPostJson(webhook, { text });
  if (res.statusCode && res.statusCode >= 400) {
    console.warn(`[Slack] webhook returned ${res.statusCode}: ${res.raw}`);
  }
}
