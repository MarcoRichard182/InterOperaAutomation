// tests/solutions/research-intelligence/research_check.spec.ts
import { test, expect, Page, Locator } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';

type Module = {
  name: string;
  panelName: string;
  href: string;
  urlMatches: RegExp;
  hrefAliases?: string[];
};

const SOLUTION_NAME = 'Research Intelligence';

const MODULES: Module[] = [
  { 
    name: 'Overview', 
    panelName: 'Overview', 
    href: '/ri/overview', 
    urlMatches: /\/ri\/overview(?:[/?#]|$)/i 
  },
  { 
    name: 'Integrated Intelligence', 
    panelName: 'Integrated Intelligence', 
    href: '/ri/integrated-intelligence', 
    urlMatches: /\/ri\/integrated-intelligence(?:[/?#]|$)/i 
  },
  { 
    name: 'Market Research', 
    panelName: 'Market Research', 
    href: '/ri/market-research-new', 
    urlMatches: /\/ri\/market-research-new(?:[/?#]|$)/i 
  },
  { 
    name: 'E-Mobility', 
    panelName: 'E-Mobility', 
    href: '/ri/emobility', 
    urlMatches: /\/ri\/emobility(?:[/?#]|$)/i 
  },
  { 
    name: 'Scheduler', 
    panelName: 'Scheduler', 
    href: '/ri/scheduler', 
    urlMatches: /\/ri\/scheduler(?:[/?#]|$)/i 
  },
];

/** * Normalize URLs by stripping query parameters and trailing slashes 
 * to ensure /path?query=true matches /path 
 */
function normalizeHref(href: string): string {
  const raw = (href || '').trim();
  if (!raw) return '';
  try {
    return raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  } catch {
    return raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}

function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function norm(s: string) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
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
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`Landed on 404/not-found page for: ${mod.name}`);
  }
}

async function clickFromTopMenu(page: Page, mod: Module) {
  const hrefLoc = page.locator(`a[href="${mod.href}"], a[href^="${mod.href}?"], a[href^="${mod.href}#"]`).first();
  const nameRx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  const target = await firstVisibleLocator(
    [
      hrefLoc,
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
  // Use /ri prefix for Research Intelligence
  return discoverLinksInScope(page.locator('body'), /\/ri(?:\/|$)/i);
}

async function discoverTopLinks(page: Page) {
  const headerCandidates = [
    page.locator('header').first(), 
    page.locator('[role="navigation"]').first(), 
    page.locator('nav').first()
  ];
  const header = await firstVisibleLocator(headerCandidates as any, 1200);
  return discoverLinksInScope((header ?? page.locator('body')) as Locator, /\/ri(?:\/|$)/i);
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(260_000);
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      // Open Panel
      try {
        const hint = MODULES[0]?.panelName || MODULES[0]?.name;
        await openSolutionPanel(page, SOLUTION_NAME, hint);
      } catch (e: any) {
        // If we can't open the panel, we can't test side menu
        const detail = e?.message || String(e);
        for (const m of MODULES) rows.push({ label: `Side menu — ${m.name}`, status: 'ERROR', detail });
        return; 
      }

      // SIDE MENU
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

      // TOP MENU (ensure we are in RI first)
      if (!/\/ri\//i.test(page.url())) {
        await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
        await clickModuleFromPanel(page, MODULES[0].panelName);
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

      // EXTRAS (Side + Top)
      await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
      
      const expected = new Set(MODULES.map((m) => normalizeHref(m.href)));

      const discoveredSide = await discoverSideLinks(page);
      for (const ex of discoveredSide.filter((d) => !expected.has(d.href))) {
        rows.push({ label: `Side menu EXTRA — ${ex.name}`, status: 'ERROR', detail: `Unexpected module link found: ${ex.href}` });
      }

      const discoveredTop = await discoverTopLinks(page);
      for (const ex of discoveredTop.filter((d) => !expected.has(d.href))) {
        rows.push({ label: `Top menu EXTRA — ${ex.name}`, status: 'ERROR', detail: `Unexpected module link found: ${ex.href}` });
      }

      if (rows.some((r) => r.status === 'ERROR')) throw new Error('Some Research Intelligence navigation checks failed.');
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Research Intelligence - Navigation Report', // Corrected Title
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});