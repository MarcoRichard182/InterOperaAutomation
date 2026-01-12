export function normalizeErrorMessage(msg: string) {
  // keep only first line, remove noisy playwright prefixes
  const first = (msg || '').split('\n')[0].trim();

  // unify common Playwright crash
  if (/Target page, context or browser has been closed/i.test(first)) {
    return 'Browser/Page closed unexpectedly (likely navigation crash, logout, or app reload).';
  }

  // shorten expect(...) messages
  return first
    .replace(/^Error:\s*/i, '')
    .replace(/^expect\.[^(]+\([^)]*\):\s*/i, 'Expect failed: ');
}

export function dedupeErrors(errors: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of errors) {
    const n = normalizeErrorMessage(e);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
