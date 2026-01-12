// reporters/slack-reporter.ts
//
// Sends a summary to Slack for Main Menu + Submenu + Wrapper + Upload tests.
// Includes a "Failures Summary" section and uploads screenshots for failures
// using Slack's modern files.getUploadURLExternal + files.completeUploadExternal APIs.

import type { FullConfig } from '@playwright/test/reporter';
import type { Reporter } from '@playwright/test/reporter';

import fs from 'fs';
import path from 'path';
import https from 'https';
import FormData from 'form-data';

type Status = 'PASS' | 'FAIL' | 'SKIPPED';
type Category = 'Main Menu' | 'Submenu' | 'Upload' | 'Wrapper' | 'Compliance';

type Row = {
  timestamp?: string;
  category: Category;
  menu: string;
  submenu?: string;
  status: Status;
  url?: string;
  responseTimeMs?: number;
  speed?: string;
  screenshot_path?: string;
  details?: string;
};

function csvExists(p: string) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readCsvFile(filePath: string): Row[] {
  if (!csvExists(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf-8').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const header = lines[0].split(',').map(h => h.trim());
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = splitCsvLine(lines[i]);
    const obj: any = {};
    header.forEach((h, idx) => { obj[h] = parsed[idx] ?? ''; });

    const category = (obj.category || '').trim() as Category;

    rows.push({
      timestamp: obj.timestamp,
      category,
      menu: obj.menu || obj['menu '] || '',
      submenu: obj.submenu || '',
      status: (obj.status as Status) || 'SKIPPED',
      url: obj.url || '',
      responseTimeMs: obj.response_time_ms
        ? Number(obj.response_time_ms)
        : (obj.responseTimeMs ? Number(obj.responseTimeMs) : undefined),
      speed: obj.speed || '',
      screenshot_path: obj.screenshot_path || '',
      details: obj.details || ''
    });
  }

  return rows;
}

// Simple CSV splitter (supports quoted commas)
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

function pad(str: string, len: number) {
  return (str || '').toString().padEnd(len, ' ');
}

function formatMs(ms?: number) {
  return (ms ?? 0).toString();
}

function tableFor(category: Category, rows: Row[]): string {
  if (!rows.length) return '';
  const subHdr = category === 'Submenu' || category === 'Wrapper' || category === 'Compliance';

  const wMenu = subHdr ? 26 : 22;
  const wSub  = subHdr ? 28 : 0;
  const wStat = 8;
  const wMs   = 6;

  let out = '';
  out += '```' + '\n';
  out += (subHdr ? 'Menu > Submenu' : 'Menu').padEnd(subHdr ? (wMenu + 3 + wSub) : wMenu)
       + pad('Status', wStat)
       + pad('ms', wMs)
       + '\n';
  out += '-'.repeat((subHdr ? (wMenu + 3 + wSub) : wMenu) + wStat + wMs) + '\n';

  rows.forEach(r => {
    const left = subHdr
      ? (pad(r.menu, wMenu) + ' > ' + pad(r.submenu || '', wSub))
      : pad(r.menu, wMenu);

    out += left
      + pad(r.status, wStat)
      + pad(formatMs(r.responseTimeMs), wMs)
      + '\n';
  });

  out += '```';
  return out;
}


function failuresSummary(all: Row[]): string {
  const fails = all.filter(r => r.status === 'FAIL');
  if (!fails.length) {
    return '*Failures Summary*\n• None 🎉\n';
  }

  let out = '*Failures Summary*\n';
  out += fails.map((r, i) => {
    const where = (r.category === 'Submenu' || r.category === 'Wrapper')
      ? `${r.menu} > ${r.submenu}`
      : r.menu;
    const ms = r.responseTimeMs ?? 0;
    const details = r.details ? ` — ${r.details}` : '';
    return `• ${i + 1}. [${r.category}] ${where} (${ms} ms)${details}`;
  }).join('\n');
  return out + '\n';
}

function postToWebhook(webhookUrl: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text });
    const url = new URL(webhookUrl);
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// --- Slack modern upload flow ---

async function slackGetUploadUrlExternal(
  token: string,
  filename: string,
  length: number
): Promise<{ upload_url: string; file_id: string }> {
  const form = new FormData();
  form.append('filename', filename);
  form.append('length', String(length));

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'slack.com',
      path: '/api/files.getUploadURLExternal',
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(body);
          if (!json.ok) {
            console.warn('[SlackReporter] files.getUploadURLExternal failed:', json.error || body);
            return reject(new Error(json.error || 'files.getUploadURLExternal failed'));
          }
          resolve({ upload_url: json.upload_url, file_id: json.file_id });
        } catch (e) {
          console.warn('[SlackReporter] Could not parse files.getUploadURLExternal response:', body);
          reject(e);
        }
      });
    });

    req.on('error', err => {
      console.warn('[SlackReporter] Error calling files.getUploadURLExternal:', err);
      reject(err);
    });

    form.pipe(req);
  });
}

async function slackUploadFileBytes(uploadUrl: string, filePath: string, length: number): Promise<void> {
  const url = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': length,
      },
    }, res => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        console.warn('[SlackReporter] Upload bytes failed with status', status);
      }
      res.on('data', () => {});
      res.on('end', () => resolve());
    });

    req.on('error', err => {
      console.warn('[SlackReporter] Error uploading file bytes:', err);
      reject(err);
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', err => {
      console.warn('[SlackReporter] Error reading screenshot file:', err);
      reject(err);
    });
    stream.pipe(req);
  });
}

async function slackCompleteUploadExternal(
  token: string,
  channelId: string,
  fileId: string,
  title: string,
  initialComment?: string
): Promise<void> {
  const form = new FormData();
  form.append('files', JSON.stringify([{ id: fileId, title }]));
  form.append('channel_id', channelId);
  if (initialComment) form.append('initial_comment', initialComment);

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'slack.com',
      path: '/api/files.completeUploadExternal',
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(body);
          if (!json.ok) {
            console.warn('[SlackReporter] files.completeUploadExternal failed:', json.error || body);
          } else {
            console.log('[SlackReporter] Screenshot uploaded OK via completeUploadExternal.');
          }
        } catch (e) {
          console.warn('[SlackReporter] Could not parse files.completeUploadExternal response:', body);
        }
        resolve();
      });
    });

    req.on('error', err => {
      console.warn('[SlackReporter] Error calling files.completeUploadExternal:', err);
      reject(err);
    });

    form.pipe(req);
  });
}

async function uploadScreenshotToSlack(
  token: string,
  channel: string,
  filePath: string,
  initialComment?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.warn('[SlackReporter] screenshot path does not exist:', filePath);
    return;
  }

  const stat = fs.statSync(filePath);
  const length = stat.size;
  const filename = path.basename(filePath);

  console.log('[SlackReporter] Uploading screenshot via new Slack file APIs:', filePath);

  const { upload_url, file_id } = await slackGetUploadUrlExternal(token, filename, length);
  await slackUploadFileBytes(upload_url, filePath, length);
  await slackCompleteUploadExternal(token, channel, file_id, filename, initialComment);
}

// ------------------------- Reporter --------------------------

export default class SlackReporter implements Reporter {
  private webhook?: string;
  private botToken?: string;
  private channel?: string;
  private runStart?: number;
  private envName?: string;

  onBegin(_cfg: FullConfig): void {
    this.webhook  = (process.env.SLACK_WEBHOOK_URL || process.env.WEBHOOK_URL || '').trim();
    this.botToken = (process.env.SLACK_BOT_TOKEN || '').trim();
    this.channel  = (process.env.SLACK_CHANNEL || '').trim();
    this.runStart = Date.now();
    this.envName  = (process.env.TARGET_ENV || process.env.ENV_NAME || '').trim();

    console.log('[SlackReporter] Initialized. env =', this.envName || '(none)');
  }

  async onEnd(): Promise<void> {
    const logDir = path.join(process.cwd(), 'logs');

    const menuRaw    = readCsvFile(path.join(logDir, 'menu_test_results.csv'));
    const submenuRaw = readCsvFile(path.join(logDir, 'submenu_test_results.csv'));
    const wrapperRaw = readCsvFile(path.join(logDir, 'wrapper_test_results.csv'));
    const uploadRaw  = readCsvFile(path.join(logDir, 'upload_test_results.csv'));

    const menuRows    = menuRaw.filter(r => r.category === 'Main Menu');
    const submenuRows = submenuRaw.filter(r => r.category === 'Submenu');
    const wrapperRows = wrapperRaw.filter(r => r.category === 'Wrapper');
    const uploadRows  = uploadRaw.filter(r => r.category === 'Upload');

    const allRows: Row[] = [...menuRows, ...submenuRows, ...wrapperRows, ...uploadRows];

    const pass = allRows.filter(r => r.status === 'PASS').length;
    const fail = allRows.filter(r => r.status === 'FAIL').length;
    const skip = allRows.filter(r => r.status === 'SKIPPED').length;

    const mainTbl    = tableFor('Main Menu', menuRows);
    const subTbl     = tableFor('Submenu',  submenuRows);
    const wrapperTbl = tableFor('Wrapper',  wrapperRows);

    const elapsed = this.runStart ? Math.round((Date.now() - this.runStart) / 1000) : 0;
    const envLabel = (this.envName || 'unknown').toUpperCase();

    let text = '';
    text += `*${envLabel} – QA Automation Results*\n`;
    text += `• ✅ Passed: ${pass}\n`;
    text += `• ❌ Failed: ${fail}\n`;
    text += `• ⏭️ Skipped: ${skip}\n`;
    text += `• ⏱️ Total time: ${elapsed}s\n\n`;

    if (menuRows.length) {
      text += `*Main Menus*\n${mainTbl}\n\n`;
    }
    if (submenuRows.length) {
      text += `*Submenus*\n${subTbl}\n\n`;
    }
    if (wrapperRows.length) {
      text += `*Research Wrappers*\n${wrapperTbl}\n\n`;
    }
    if (uploadRows.length) {
      text += `*Uploads*\n` +
              '```' + '\n' +
              pad('Stage', 18) + pad('Status', 8) + pad('ms', 6) + '\n' +
              '-'.repeat(18 + 8 + 6) + '\n' +
              uploadRows
                .map(r => pad(r.menu, 18) + pad(r.status, 8) + pad(formatMs(r.responseTimeMs), 6))
                .join('\n') +
              '\n```' + '\n\n';
    }

    // Failures summary (for quick diagnosis)
    text += failuresSummary(allRows);

    const webhook = this.webhook;
    if (webhook) {
      try {
        console.log('[SlackReporter] Posting summary message to Slack webhook...');
        await postToWebhook(webhook, text);
        console.log('[SlackReporter] Summary posted.');
      } catch (e) {
        console.warn('[SlackReporter] Slack webhook post failed:', e);
      }
    } else {
      console.warn('[SlackReporter] No SLACK_WEBHOOK_URL configured, skipping summary post.');
    }

    const token = this.botToken;
    const channel = this.channel;
    if (token && channel) {
      const failuresWithShots = allRows.filter(
        r => r.status === 'FAIL' && r.screenshot_path && fs.existsSync(r.screenshot_path)
      );

      if (failuresWithShots.length) {
        console.log(`[SlackReporter] Found ${failuresWithShots.length} failed rows with screenshots. Uploading...`);
      } else {
        console.log('[SlackReporter] No failures with screenshots found.');
      }

      for (const r of failuresWithShots) {
        const where = (r.category === 'Submenu' || r.category === 'Wrapper')
          ? `${r.menu} > ${r.submenu}`
          : r.menu;
        const prefix = this.envName ? `[${this.envName}] ` : '';
        const caption = `${prefix}[${r.category}] ${where} — ${r.details || 'Failure screenshot'}`;
        try {
          await uploadScreenshotToSlack(token, channel, r.screenshot_path!, caption);
        } catch (e) {
          console.warn('[SlackReporter] Screenshot upload failed:', e);
        }
      }
    } else {
      console.warn('[SlackReporter] SLACK_BOT_TOKEN or SLACK_CHANNEL not set, skipping screenshot uploads.');
    }
  }
}
