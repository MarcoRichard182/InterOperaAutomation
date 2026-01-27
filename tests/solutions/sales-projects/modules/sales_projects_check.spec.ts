// tests/solutions/sales-projects/modules/sales_projects_check.spec.ts
import { test, expect, Page } from '@playwright/test';
import { login } from '../../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../../helpers/slack-menu-report';

type Module = {
  name: string;
  panelName: string;
  href?: string; // relative href when same domain
  urlMatches: RegExp;
};

const SOLUTION_NAME = 'Sales & Projects';

const MODULES: Module[] = [
  { name: 'Overview', panelName: 'Overview', href: '/smm/overview', urlMatches: /\/smm\/overview(?:[/?#]|$)/i },
  {
    name: 'Sales & Strategic Partnerships',
    panelName: 'Sales & Strategic Partnerships',
    href: '/smm/sales-strategic-partnership',
    urlMatches: /\/smm\/sales-strategic-partnership(?:[/?#]|$)/i,
  },
  {
    name: 'Product Management',
    panelName: 'Product Management',
    href: '/smm/products',
    urlMatches: /\/smm\/products(?:[/?#]|$)/i,
  },
  { name: 'Overview', panelName: 'Overview', href: '/smm/overview', urlMatches: /\/smm\/overview(?:[/?#]|$)/i },
];

function pushAllMissingAccess(
  rows: MenuCheckRow[],
  solutionName: string,
  modules: Module[],
  detail = `No access / menu not visible for "${solutionName}" (likely permissions).`,
) {
  for (const m of modules) rows.push({ label: `Side menu — ${m.name}`, status: 'ERROR', detail });
  for (const m of modules) rows.push({ label: `Top menu — ${m.name}`, status: 'ERROR', detail });
}

// ✅ SAFE: never throws on undefined
function escRx(s?: string) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function norm(s: string) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// ✅ FIXED SIGNATURE: takes solutionName + hint
async function openSolutionPanel(page: Page, solutionName: string, firstModuleHint: string) {
  await waitForAppIdle(page);

  const solRx = new RegExp(`^\\s*${escRx(solutionName)}\\s*$`, 'i');
  const candidates = [
    page.getByRole('button', { name: solRx }).first(),
    page.getByRole('link', { name: solRx }).first(),
    page.locator('button').filter({ hasText: solRx }).first(),
    page.locator('a').filter({ hasText: solRx }).first(),
    page.getByText(solRx).first(),
  ];

  const sol = await firstVisibleLocator(candidates as any, 2500);
  if (!sol) throw new Error(`Side menu "${solutionName}" not found (maybe permissions)`);

  await sol.scrollIntoViewIfNeeded().catch(() => {});
  await sol.click({ force: true });

  const hint = page.getByText(new RegExp(escRx(firstModuleHint), 'i')).first();
  await expect(hint, `Solution panel "${solutionName}" did not open`).toBeVisible({ timeout: 10_000 });
}

// ✅ wrapper so we can safely call openPanel(page) everywhere
async function openPanel(page: Page) {
  const hint = MODULES[0]?.panelName || MODULES[0]?.name || SOLUTION_NAME;
  await openSolutionPanel(page, SOLUTION_NAME, hint);
}

async function ensureSolutionPanelOrMarkAll(
  page: Page,
  rows: MenuCheckRow[],
  solutionName: string,
  modules: Module[],
): Promise<boolean> {
  try {
    const hint = modules[0]?.panelName || modules[0]?.name || solutionName;
    await openSolutionPanel(page, solutionName, hint);
    return true;
  } catch (e: any) {
    pushAllMissingAccess(rows, solutionName, modules, e?.message || String(e));
    return false;
  }
}

async function clickModuleFromPanel(page: Page, panelName: string) {
  if (!panelName) throw new Error('Config error: panelName is missing.');
  const rx = new RegExp(`^\\s*${escRx(panelName)}\\s*$`, 'i');

  const candidates = [
    page.getByRole('button', { name: rx }).first(),
    page.getByRole('link', { name: rx }).first(),
    page.locator('button').filter({ hasText: rx }).first(),
    page.locator('a').filter({ hasText: rx }).first(),
    page.getByText(rx).first(),
  ];

  const target = await firstVisibleLocator(candidates as any, 2500);
  if (!target) throw new Error(`Module not found in panel: ${panelName}`);

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

async function assertLoaded(page: Page, mod: Module) {
  await waitForAppIdle(page);
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 10_000 });
  await expect(page).toHaveURL(mod.urlMatches, { timeout: 30_000 });

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) throw new Error(`Landed on 404/not-found page for: ${mod.name}`);
}

async function clickFromTopMenu(page: Page, mod: Module) {
  const nameRx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  const hrefLoc = mod.href
    ? page.locator(`a[href="${mod.href}"], a[href^="${mod.href}?"], a[href^="${mod.href}#"]`).first()
    : page.locator('___never___');

  const target = await firstVisibleLocator(
    [
      hrefLoc,
      page.getByRole('tab', { name: nameRx }).first(),
      page.getByRole('link', { name: nameRx }).first(),
      page.locator('a').filter({ hasText: nameRx }).first(),
      page.getByRole('button', { name: nameRx }).first(),
    ] as any,
    2000,
  );

  if (!target) throw new Error(`Top menu item not found for: ${mod.name}`);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

async function discoverLinks(page: Page) {
  const anchors = page.locator('a[href*="/smm"], a[href^="/smm"]').filter({ hasText: /./ });
  const count = await anchors.count().catch(() => 0);

  const items: { name: string; href: string }[] = [];
  for (let i = 0; i < count; i++) {
    const a = anchors.nth(i);
    if (!(await a.isVisible().catch(() => false))) continue;

    const href = (await a.getAttribute('href').catch(() => '')) || '';
    const text = norm(await a.innerText().catch(() => ''));
    if (!href || !text) continue;

    items.push({ name: text, href });
  }

  const key = (x: { name: string; href: string }) => `${x.href}|||${x.name}`;
  return uniq(items.map((x) => ({ ...x }))).filter((x, idx, arr) => arr.findIndex((y) => key(y) === key(x)) === idx);
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(240_000);
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      const ok = await ensureSolutionPanelOrMarkAll(page, rows, SOLUTION_NAME, MODULES);
      if (!ok) return;

      // SIDE
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openPanel(page);
          await clickModuleFromPanel(page, mod.panelName);
          await assertLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // TOP (ensure we are in /smm first)
      if (!/\/smm\//i.test(page.url())) {
        await openPanel(page);
        await clickModuleFromPanel(page, MODULES[0].panelName);
        await assertLoaded(page, MODULES[0]);
      }

      for (const mod of MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          await clickFromTopMenu(page, mod);
          await assertLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // EXTRA detection (only checks /smm links on current domain)
      await openPanel(page);
      const discovered = await discoverLinks(page);
      const expected = new Set(MODULES.map((m) => m.href).filter(Boolean) as string[]);
      const extras = discovered.filter((d) => d.href.includes('/smm') && !expected.has(d.href));

      for (const ex of extras) {
        rows.push({
          label: `Side menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      if (rows.some((r) => r.status === 'ERROR')) throw new Error('Some Sales & Projects navigation checks failed.');
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Sales & Projects - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
