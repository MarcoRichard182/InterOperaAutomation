// helpers/slack-report.ts

function stripAnsi(input: string) {
  // removes \u001b[...m color codes from Playwright/terminal logs
  return (input || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function compactError(msg: string) {
  const clean = stripAnsi(msg).replace(/\s+/g, ' ').trim();

  // If it's a huge Playwright expect error, keep it short
  // (Slack becomes readable + you still get the key part)
  if (clean.length > 260) return clean.slice(0, 260) + '…';
  return clean;
}

/**
 * Sends markdown text to Slack.
 * IMPORTANT: do NOT auto-prefix bullets here.
 * The caller should provide formatting.
 */
export async function sendSlackReport(title: string, lines: string[]) {
  // READ FROM ENV DIRECTLY
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL is not set. Skipping Slack report.');
    return;
  }

  const bodyLines = lines.map((l) => compactError(l));
  const text = [`*${title}*`, ...bodyLines].join('\n');

  // Using global fetch (Node 18+ or Playwright environment)
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText} ${body}`);
  }
}