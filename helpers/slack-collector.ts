// helpers/slack-collector.ts
import fs from 'fs';
import path from 'path';

export type CollectedReport = {
  title: string;
  mentionUserId?: string;
  rows: any[];
};

const OUT_PATH = process.env.SLACK_COLLECT_PATH || 'test-results/slack-collect.jsonl';

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function collectSlackReport(payload: CollectedReport) {
  ensureDir(OUT_PATH);
  fs.appendFileSync(OUT_PATH, JSON.stringify(payload) + '\n', 'utf8');
}

export function readCollectedReports(): CollectedReport[] {
  if (!fs.existsSync(OUT_PATH)) return [];
  const raw = fs.readFileSync(OUT_PATH, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function clearCollectedReports() {
  if (fs.existsSync(OUT_PATH)) fs.unlinkSync(OUT_PATH);
}
