import { expect, Page } from '@playwright/test';

const BASE = (process.env.BASE_URL ?? 'https://nexus-prod.interopera.co').replace(/\/+$/, '');
const DEFAULT_PASS = (process.env.USER_PASSWORD ?? '').trim();

function now() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function shellVisible(page: Page): Promise<boolean> {
  const checks = [
    page.getByRole('tab', { name: /AI Hub/i }).first(),
    page.getByRole('tab', { name: /Data Management/i }).first(),
    page.getByRole('button', { name: /Upload Files/i }).first(),
    page.getByText(/^Home$/i).first(),
  ];
  for (const c of checks) {
    if (await c.isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      return true;
    }
  }
  return false;
}

async function loginFormVisible(page: Page): Promise<boolean> {
  const email = page
    .locator('input[type="email"], input[name="email"], input[name*="email" i], input[autocomplete="username"]')
    .first();
  const pass = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  const btn = page.getByRole('button', { name: /sign in|log in|login|masuk/i }).first();

  return (
    (await email.isVisible().catch(() => false)) &&
    (await pass.isVisible().catch(() => false)) &&
    (await btn.isVisible().catch(() => false))
  );
}

async function doSubmit(page: Page, emailValue: string, passValue: string) {
  const email = page
    .locator('input[type="email"], input[name="email"], input[name*="email" i], input[autocomplete="username"]')
    .first();
  const pass = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  const btn = page.getByRole('button', { name: /sign in|log in|login|masuk/i }).first();

  await expect(email).toBeVisible({ timeout: 15_000 });
  await email.fill(emailValue);

  await expect(pass).toBeVisible({ timeout: 15_000 });
  await pass.fill(passValue);

  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  await page.waitForTimeout(1200).catch(() => {});
}

async function jumpToHub(page: Page) {
  await page.goto(`${BASE}/aimm/division`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(900).catch(() => {});
}

/** Robust login that tolerates slow redirects and retries once if needed. */
export async function loginSubs(page: Page, email: string, password?: string) {
  if (!BASE) throw new Error('Missing BASE_URL (set BASE_URL in env)');
  if (!email?.trim()) throw new Error('loginSubs(): email is required.');

  const pass = (password ?? DEFAULT_PASS).trim();
  if (!pass) throw new Error('loginSubs(): password is empty (set USER_PASSWORD or pass it in).');

  let lastErr = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

      // already authenticated?
      if (!(await loginFormVisible(page))) {
        await jumpToHub(page);
        if (await shellVisible(page)) return;
      }

      await doSubmit(page, email.trim(), pass);

      await jumpToHub(page);
      if (await shellVisible(page)) return;

      if (await loginFormVisible(page)) {
        lastErr = 'Still on login form after submit';
        continue;
      }

      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(600);
      if (await shellVisible(page)) return;

      lastErr = 'Shell not visible after submit + jump + reload';
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  const uiErr =
    (await page
      .locator(
        'text=/invalid email or password|failed to fetch|incorrect|invalid|failed/i, .ant-message-error, .MuiAlert-message, .chakra-alert__desc, [role="alert"]',
      )
      .first()
      .textContent()
      .catch(() => ''))?.trim() || '';

  const shot = `logs/login_fail_${now()}.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`Login failed for ${email}. ${lastErr}. ${uiErr ? `UI says: "${uiErr}"` : ''} (screenshot: ${shot})`);
}