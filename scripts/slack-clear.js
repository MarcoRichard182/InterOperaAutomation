// scripts/slack-clear.js
const fs = require('fs');
const path = require('path');

function getPath() {
  const p = (process.env.SLACK_COLLECT_PATH || '').trim();
  if (p) return p;
  const env = (process.env.TARGET_ENV || 'env').toLowerCase();
  return path.join('test-results', `slack-${env}.jsonl`);
}

const filePath = getPath();
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, '', 'utf8');
console.log(`[SlackClear] Cleared collector: ${filePath}`);
