function stripAnsi(input: string) {
  return (input || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function compactError(msg: string) {
  const clean = stripAnsi(msg).replace(/\s+/g, ' ').trim();
  if (clean.length > 260) return clean.slice(0, 260) + '…';
  return clean;
}

export async function sendSlackReport(title: string, lines: string[]) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL is not set. Skipping Slack report.');
    return;
  }

  const bodyLines = lines.map((l) => compactError(l));
  const text = [`*${title}*`, ...bodyLines].join('\n');

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