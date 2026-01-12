import { Locator, Page } from '@playwright/test';

export const WAIT_SHORT  = Number(process.env.WAIT_SHORT  ?? 400);
export const WAIT_MEDIUM = Number(process.env.WAIT_MEDIUM ?? 900);
export const WAIT_LONG   = Number(process.env.WAIT_LONG   ?? 1600);

export async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}
export async function waitForAppIdle(page: Page, extraMs = WAIT_MEDIUM) {
  await page.waitForTimeout(50).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const spinners = ['.ant-spin-spinning','.MuiCircularProgress-root','[aria-busy="true"]','.ant-skeleton','.chakra-spinner','.loading,.spinner'].join(',');
  await page.waitForSelector(spinners, { state: 'detached', timeout: 2000 }).catch(() => {});
  await page.evaluate(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }).catch(() => {});
  if (extraMs > 0) await sleep(extraMs);
}
export async function firstVisibleLocator(locators: Locator[], timeoutEach = 800): Promise<Locator | null> {
  for (const loc of locators) {
    if (await loc.first().isVisible({ timeout: timeoutEach }).catch(() => false)) return loc.first();
  }
  return null;
}
export async function retry<T>(fn: () => Promise<T>, tries = 2, baseDelay = 600): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(baseDelay * (i + 1)); }
  }
  throw last;
}
