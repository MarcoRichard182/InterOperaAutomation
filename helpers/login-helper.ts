import { expect, Page } from '@playwright/test';

const BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const EMAIL = (process.env.USER_EMAIL ?? '').trim();
const PASS  = (process.env.USER_PASSWORD ?? '').trim();

function now() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function shellVisible(page: Page): Promise<boolean> {
  const checks = [
    page.getByRole('tab', { name: /AI Hub/i }).first(),
    page.getByRole('tab', { name: /Data Management/i }).first(),
    page.getByRole('button', { name: /Upload Files/i }).first(),
    page.getByText(/^Home$/).first()
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
  const email = page.locator(
    'input[type="email"], input[name="email"], input[name*="email" i], input[autocomplete="username"]'
  ).first();
  const pass  = page.locator(
    'input[type="password"], input[name="password"], input[autocomplete="current-password"]'
  ).first();
  const btn   = page.getByRole('button', { name: /sign in|log in|login|masuk/i }).first();
  const ok =
    (await email.isVisible().catch(() => false)) &&
    (await pass.isVisible().catch(() => false)) &&
    (await btn.isVisible().catch(() => false));
  return ok;
}

async function doSubmit(page: Page) {
  const email = page.locator(
    'input[type="email"], input[name="email"], input[name*="email" i], input[autocomplete="username"]'
  ).first();
  const pass  = page.locator(
    'input[type="password"], input[name="password"], input[autocomplete="current-password"]'
  ).first();
  const btn   = page.getByRole('button', { name: /sign in|log in|login|masuk/i }).first();

  await expect(email).toBeVisible({ timeout: 15_000 });
  await email.fill(EMAIL);

  await expect(pass).toBeVisible({ timeout: 15_000 });
  await pass.fill(PASS);

  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  // let the SPA do its thing briefly
  await page.waitForTimeout(1200).catch(() => {});
}

async function jumpToHub(page: Page) {
  await page.goto(`${BASE}/aimm/division`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(900).catch(() => {});
}

/** Robust login that tolerates slow redirects and retries once if needed. */
export async function login(page: Page) {
  if (!BASE || !EMAIL || !PASS) throw new Error('Missing BASE_URL or credentials in .env');

  let lastErr = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // Always start from clean login route
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

      // If already authenticated somehow, jump to hub
      if (!(await loginFormVisible(page))) {
        await jumpToHub(page);
        if (await shellVisible(page)) return;
      }

      // Submit credentials
      await doSubmit(page);

      // Force-jump to hub and check shell
      await jumpToHub(page);
      if (await shellVisible(page)) return;

      // If we’re still on login, retry once
      if (await loginFormVisible(page)) {
        lastErr = 'Still on login form after submit';
        continue; // next attempt
      }

      // One more nudge: reload hub once
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(600);
      if (await shellVisible(page)) return;

      lastErr = 'Shell not visible after submit + jump + reload';
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  // Final failure → screenshot and surface any UI error text
  const uiErr =
    (await page
      .locator(
        'text=/invalid email or password|failed to fetch|incorrect|invalid|failed/i, .ant-message-error, .MuiAlert-message, .chakra-alert__desc, [role="alert"]'
      )
      .first()
      .textContent()
      .catch(() => ''))?.trim() || '';
  const shot = `logs/login_fail_${now()}.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  throw new Error(`Login failed. ${lastErr}. ${uiErr ? `UI says: "${uiErr}"` : ''} (screenshot: ${shot})`);
}

export async function gotoHub(page: Page) {
  await page.goto(`${BASE}/aimm/division`, { waitUntil: 'domcontentloaded' });
  if (!(await shellVisible(page))) {
    await page.waitForTimeout(600);
    if (!(await shellVisible(page))) {
      throw new Error('App shell not visible on hub.');
    }
  }
}

export async function ensureOnHub(page: Page) {
  // If we’re on login (or any non-hub), just invoke robust login()
  if (/\/login/i.test(page.url()) || !/\/aimm\/division/i.test(page.url())) {
    await login(page);
  } else if (!(await shellVisible(page))) {
    await gotoHub(page);
  }
}
