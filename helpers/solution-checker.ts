// helpers/solution-checker.ts
import { expect, Page, Locator } from '@playwright/test';
import { waitForAppIdle, firstVisibleLocator } from './page-utils';

export type ModuleDef = {
  name: string;
  slug?: string;        // optional, used for URL checks if you want
  urlIncludes?: RegExp; // alternative to slug
  heading?: RegExp;     // loaded signal
};

function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** Click a solution name in the LEFT sidebar (e.g., "Home", "Corporate Planning"). */
export async function openSolutionPanel(page: Page, solutionName: string, expectedFirstModuleName?: string) {
  await waitForAppIdle(page);

  const rx = new RegExp(`^\\s*${escRx(solutionName)}\\s*$`, 'i');
  const candidates = [
    page.getByRole('link', { name: rx }).first(),
    page.getByRole('button', { name: rx }).first(),
    page.locator('a').filter({ hasText: rx }).first(),
    page.locator('button').filter({ hasText: rx }).first(),
    page.getByText(rx).first(),
  ];

  const item = await firstVisibleLocator(candidates as any, 1500);
  if (!item) throw new Error(`Left sidebar "${solutionName}" item not found`);

  await item.scrollIntoViewIfNeeded().catch(() => {});
  await item.click({ force: true });

  // Wait for the panel to show something meaningful
  if (expectedFirstModuleName) {
    const mrx = new RegExp(`^\\s*${escRx(expectedFirstModuleName)}\\s*$`, 'i');
    await expect(page.getByRole('button', { name: mrx }).first()).toBeVisible({ timeout: 10_000 });
  } else {
    await page.waitForTimeout(300);
  }
}

/**
 * Best-effort: find the opened solution panel container.
 * Uses expected module names to locate the correct DOM region (to avoid picking random buttons).
 */
async function getSolutionPanelContainer(page: Page, expectedNames: string[]): Promise<Locator> {
  const alt = expectedNames.slice(0, 6).map(escRx).join('|'); // use first few as anchor
  const anchorRx = alt ? new RegExp(`\\b(${alt})\\b`, 'i') : null;

  const candidates = anchorRx
    ? [
        page.locator('div').filter({ hasText: anchorRx }).last(),
        page.locator('section').filter({ hasText: anchorRx }).last(),
        page.locator('nav').filter({ hasText: anchorRx }).last(),
      ]
    : [page.locator('body')];

  for (const c of candidates) {
    if (await c.first().isVisible().catch(() => false)) return c.first();
  }
  return page.locator('body');
}

/**
 * Discover module names displayed in the solution panel (left flyout).
 * Returns unique list of labels.
 */
export async function discoverModulesFromPanel(page: Page, expectedNames: string[]): Promise<string[]> {
  const container = await getSolutionPanelContainer(page, expectedNames);

  // candidates inside panel: buttons + links with text
  const clickables = container.locator('button, a');
  const count = await clickables.count().catch(() => 0);

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const el = clickables.nth(i);

    const txtRaw = await el.innerText().catch(() => '');
    const txt = normalizeLabel(txtRaw.split('\n')[0] || '');

    // ignore empties and obvious non-modules (best effort)
    if (!txt) continue;
    if (/^(close|x|×)$/i.test(txt)) continue;
    if (/^(upload files|share feedback|operations center)$/i.test(txt)) continue;

    // module names are usually short; discard super long paragraph-like text
    if (txt.length > 60) continue;

    out.push(txt);
  }

  // uniq
  const uniq = Array.from(new Set(out));

  // tiny heuristic: keep only items that look like menu/module labels
  // (avoid random buttons like "Manage" that may appear in content area)
  // If expectedNames is provided, keep items that are near expected names:
  const expectedSet = new Set(expectedNames.map((x) => normalizeLabel(x).toLowerCase()));
  const filtered =
    uniq.length && expectedNames.length
      ? uniq.filter((x) => {
          const lx = normalizeLabel(x).toLowerCase();
          return expectedSet.has(lx) || expectedNames.some((e) => lx.includes(normalizeLabel(e).toLowerCase()));
        })
      : uniq;

  // If filtering removed too much (panel structure different), fallback to uniq
  return filtered.length >= Math.min(2, expectedNames.length) ? filtered : uniq;
}

export function compareDiscoveredModules(expectedNames: string[], discovered: string[]) {
  const exp = expectedNames.map((x) => normalizeLabel(x));
  const dis = discovered.map((x) => normalizeLabel(x));

  const expSet = new Set(exp.map((x) => x.toLowerCase()));
  const disSet = new Set(dis.map((x) => x.toLowerCase()));

  const missing = exp.filter((x) => !disSet.has(x.toLowerCase()));
  const extra = dis.filter((x) => !expSet.has(x.toLowerCase()));

  return { missing, extra, discovered: dis };
}

export async function clickModuleFromPanel(page: Page, moduleName: string) {
  const rx = new RegExp(`^\\s*${escRx(moduleName)}\\s*$`, 'i');
  const btn = page.getByRole('button', { name: rx }).first();
  await expect(btn, `Module not visible: ${moduleName}`).toBeVisible({ timeout: 10_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true });
}

export async function clickModuleFromTop(page: Page, mod: ModuleDef) {
  const rx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');
  const byHref = mod.slug ? page.locator(`a[href*="${mod.slug}"]`).first() : null;

  const candidates: Locator[] = [
    ...(byHref ? [byHref] : []),
    page.getByRole('tab', { name: rx }).first(),
    page.getByRole('link', { name: rx }).first(),
    page.locator('a').filter({ hasText: rx }).first(),
    page.getByRole('button', { name: rx }).first(),
  ];

  const target = await firstVisibleLocator(candidates as any, 1500);
  if (!target) throw new Error(`Top menu module not found: ${mod.name}`);

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

export async function assertModuleLoaded(page: Page, mod: ModuleDef) {
  await waitForAppIdle(page);

  await expect(page, 'Unexpectedly navigated to login page').not.toHaveURL(/\/login/i, {
    timeout: 10_000,
  });

  if (mod.urlIncludes) {
    await expect(page, `URL did not match ${mod.urlIncludes}`).toHaveURL(mod.urlIncludes, { timeout: 15_000 });
  } else if (mod.slug) {
    await expect(page, `URL did not include ${mod.slug}`).toHaveURL(new RegExp(escRx(mod.slug), 'i'), {
      timeout: 15_000,
    });
  }

  if (mod.heading) {
    const ok =
      (await page.getByRole('heading', { name: mod.heading }).first().isVisible().catch(() => false)) ||
      (await page.getByText(mod.heading).first().isVisible().catch(() => false));

    if (!ok) throw new Error(`Loaded but heading/text not found for module: ${mod.name}`);
  }

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`Landed on a 404/not-found page for module: ${mod.name}`);
  }
}
