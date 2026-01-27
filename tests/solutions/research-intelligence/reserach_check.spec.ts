// tests/solutions/corporate-planning/corporate_check.spec.ts
import { test, expect, Page, Locator } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';

type Module = {
  name: string;
  panelName: string;
  href: string;
  urlMatches: RegExp;
  hrefAliases?: string[]; // ✅ allow old/alias hrefs for extras detection
};

const SOLUTION_NAME = 'Corporate Planning';

const MODULES: Module[] = [
  {
    name: 'Overview',
    panelName: 'Overview',
    href: '/corporate/overview',
    hrefAliases: ['/corporate'], // ✅ old link still exists in UI
    urlMatches: /\/corporate(?:\/overview)?(?:[/?#]|$)/i, // ✅ accept /corporate and /corporate/overview
  },
  { name: 'Scheduler', panelName: 'Scheduler', href: '/corporate/scheduler', urlMatches: /\/corporate\/scheduler(?:[/?#]|$)/i },

  { name: 'Accounting', panelName: 'Accounting', href: '/corporate/accounting', urlMatches: /\/corporate\/accounting(?:[/?#]|$)/i },
  { name: 'Finance', panelName: 'Finance', href: '/corporate/finance', urlMatches: /\/corporate\/finance(?:[/?#]|$)/i },
  { name: 'Asset Management', panelName: 'Assets Management', href: '/corporate/asset-management', urlMatches: /\/corporate\/asset-management(?:[/?#]|$)/i },
  { name: 'Asset Operations', panelName: 'Assets Operations', href: '/corporate/asset-operations', urlMatches: /\/corporate\/asset-operations(?:[/?#]|$)/i },
  { name: 'HR', panelName: 'Human Resources (HR)', href: '/corporate/hr', urlMatches: /\/corporate\/hr(?:[/?#]|$)/i },
  { name: 'REC Management', panelName: 'REC', href: '/corporate/rec', urlMatches: /\/corporate\/rec(?:[/?#]|$)/i },
];

function escRx(s?: string) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function norm(s: string) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}
function normalizeHref(href: string): string {
  const raw = (href || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname.replace(/\/+$/, '');
    return raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  } catch {
    return raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}
function hrefLocator(page: Page, path: string) {
  const p = normalizeHref(path);
  return page
    .locator(
      `a[href="${p}"],
       a[href^="${p}?"],
       a[href^="${p}#"],
       a[href$="${p}"],
       a[href*="${p}?"],
       a[href*="${p}#"]`,
    )
    .first();
}
function expectedHrefSet(mods: Module[]) {
  const all = mods.flatMap((m) => [m.href, ...(m.hrefAliases ?? [])]);
  return new Set(all.map(normalizeHref).filter(Boolean));
}

function pushAllMissingAccess(rows: MenuCheckRow[], solutionName: string, modules: Module[], detail = `No access / menu not visible for "${solutionName}" (likely permissions).`) {
  for (const m of modules) rows.push({ label: `Side menu — ${m.name}`, status: 'ERROR', detail });
  for (const m of modules) rows.push({ label: `Top menu — ${m.name}`, status: 'ERROR', detail });
}

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

async function ensureSolutionPanelOrMarkAll(page: Page, rows: MenuCheckRow[], solutionName: string, modules: Module[]): Promise<boolean> {
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

async function assertModuleLoaded(page: Page, mod: Module) {
  await waitForAppIdle(page);
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 10_000 });
  await expect(page).toHaveURL(mod.urlMatches, { timeout: 25_000 });

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) throw new Error(`Landed on 404/not-found page for: ${mod.name}`);
}

async function clickFromTopMenu(page: Page, mod: Module) {
  const nameRx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');
  const target = await firstVisibleLocator(
    [
      hrefLocator(page, mod.href),
      page.getByRole('tab', { name: nameRx }).first(),
      page.getByRole('link', { name: nameRx }).first(),
      page.locator('a').filter({ hasText: nameRx }).first(),
    ] as any,
    2500,
  );

  if (!target) throw new Error(`Top menu item not found for: ${mod.name}`);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

async function discoverLinksInScope(scope: Locator, hrefRx: RegExp) {
  const anchors = scope.locator('a[href]').filter({ hasText: /./ });
  const count = await anchors.count().catch(() => 0);

  const items: { name: string; href: string }[] = [];
  for (let i = 0; i < count; i++) {
    const a = anchors.nth(i);
    if (!(await a.isVisible().catch(() => false))) continue;

    const hrefRaw = (await a.getAttribute('href').catch(() => '')) || '';
    const href = normalizeHref(hrefRaw);
    if (!hrefRx.test(href)) continue;

    const text = norm(await a.innerText().catch(() => ''));
    if (!href || !text) continue;

    items.push({ name: text, href });
  }
  const key = (x: { name: string; href: string }) => `${x.href}|||${x.name}`;
  return uniq(items).filter((x, idx, arr) => arr.findIndex((y) => key(y) === key(x)) === idx);
}

async function discoverSideLinks(page: Page) {
  return discoverLinksInScope(page.locator('body'), /\/corporate(?:\/|$)/i);
}
async function discoverTopLinks(page: Page) {
  const headerCandidates = [page.locator('header').first(), page.locator('[role="navigation"]').first(), page.locator('nav').first()];
  const header = await firstVisibleLocator(headerCandidates as any, 1200);
  return discoverLinksInScope((header ?? page.locator('body')) as Locator, /\/corporate(?:\/|$)/i);
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(260_000);
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      const ok = await ensureSolutionPanelOrMarkAll(page, rows, SOLUTION_NAME, MODULES);
      if (!ok) return;

      // SIDE
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
          await clickModuleFromPanel(page, mod.panelName);
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // TOP (ensure we are in corporate by going to Overview)
      if (!/\/corporate/i.test(page.url())) {
        await openSolutionPanel(page, SOLUTION_NAME, 'Overview');
        await clickModuleFromPanel(page, 'Overview');
        await assertModuleLoaded(page, MODULES[0]);
      }

      for (const mod of MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          await clickFromTopMenu(page, mod);
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // EXTRAS (Side + Top) — using alias-aware expected set
      await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
      const expected = expectedHrefSet(MODULES);

      const discoveredSide = await discoverSideLinks(page);
      for (const ex of discoveredSide.filter((d) => !expected.has(d.href))) {
        rows.push({ label: `Side menu EXTRA — ${ex.name}`, status: 'ERROR', detail: `Unexpected module link found: ${ex.href}` });
      }

      const discoveredTop = await discoverTopLinks(page);
      for (const ex of discoveredTop.filter((d) => !expected.has(d.href))) {
        rows.push({ label: `Top menu EXTRA — ${ex.name}`, status: 'ERROR', detail: `Unexpected module link found: ${ex.href}` });
      }

      if (rows.some((r) => r.status === 'ERROR')) throw new Error('Some Corporate Planning navigation checks failed.');
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Corporate Planning - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
