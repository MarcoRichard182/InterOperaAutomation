import { test, expect, Page, Locator } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';

type Module = {
  name: string;
  panelName: string;

  // allow different paths per env
  hrefByEnv: { dev: string; prod: string };

  // allow different URL matchers per env
  urlMatchesByEnv: { dev: RegExp; prod: RegExp };

  // ✅ ADDED: allow old/alias hrefs so they aren't flagged as extras
  hrefAliases?: string[]; 
};

const SOLUTION_NAME = 'ESG & Compliance';

const MODULES: Module[] = [
  {
    name: 'Overview',
    panelName: 'Overview',
    hrefByEnv: { dev: '/srec-new/overview', prod: '/srec-new/overview' },
    urlMatchesByEnv: { dev: /\/srec-new\/overview(?:[/?#]|$)/i, prod: /\/srec-new\/overview(?:[/?#]|$)/i },
    // ✅ Allow old link
    hrefAliases: ['/srec/overview'],
  },
  {
    name: 'Scheduler',
    panelName: 'Scheduler',
    hrefByEnv: { dev: '/srec-new/scheduler', prod: '/srec-new/scheduler' },
    urlMatchesByEnv: { dev: /\/srec-new\/scheduler(?:[/?#]|$)/i, prod: /\/srec-new\/scheduler(?:[/?#]|$)/i },
    // ✅ Allow old link
    hrefAliases: ['/srec/scheduler'],
  },

  {
    name: 'Compliance',
    panelName: 'Compliance',
    hrefByEnv: {
      dev: '/srec-new/compliance',
      prod: '/srec-new/compliance', // Assuming prod also moved to new, based on pattern
    },
    urlMatchesByEnv: {
      dev: /\/srec-new\/compliance(?:[/?#]|$)/i,
      prod: /\/srec-new\/compliance(?:[/?#]|$)/i,
    },
  },
  {
    name: 'Sustainability',
    panelName: 'Sustainability',
    hrefByEnv: {
      dev: '/srec-new/sustainability-monitoring',
      // ✅ UPDATED: prod to match actual link
      prod: '/srec-new/sustainability-monitoring',
    },
    urlMatchesByEnv: {
      dev: /\/srec-new\/sustainability-monitoring(?:[/?#]|$)/i,
      prod: /\/srec-new\/sustainability-monitoring(?:[/?#]|$)/i,
    },
  },
];

function currentEnv(): 'dev' | 'prod' {
  const t = (process.env.TARGET_ENV || '').toLowerCase();
  return t === 'prod' ? 'prod' : 'dev';
}

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
    if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
    return raw.split('?')[0].split('#')[0];
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

function pushAllMissingAccess(
  rows: MenuCheckRow[],
  solutionName: string,
  modules: Module[],
  detail = `No access / menu not visible for "${solutionName}" (likely permissions).`,
) {
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

async function assertLoaded(page: Page, urlMatches: RegExp, moduleName: string) {
  await waitForAppIdle(page);
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 10_000 });
  await expect(page).toHaveURL(urlMatches, { timeout: 25_000 });

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`Landed on 404/not-found page for: ${moduleName}`);
  }
}

async function clickFromTopMenu(page: Page, name: string, href: string) {
  const nameRx = new RegExp(`^\\s*${escRx(name)}\\s*$`, 'i');
  const hrefLoc = page.locator(`a[href="${href}"], a[href^="${href}?"], a[href^="${href}#"]`).first();

  const target = await firstVisibleLocator(
    [
      hrefLoc,
      page.getByRole('tab', { name: nameRx }).first(),
      page.getByRole('link', { name: nameRx }).first(),
      page.locator('a').filter({ hasText: nameRx }).first(),
    ] as any,
    2000,
  );

  if (!target) throw new Error(`Top menu item not found for: ${name}`);
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
  // Side panel is open already; read from the whole page to avoid brittle selectors.
  // Filter to relevant hrefs only.
  return discoverLinksInScope(page.locator('body'), /\/srec(?:-new)?(?:\/|$)/i);
}

async function discoverTopLinks(page: Page) {
  const headerCandidates = [
    page.locator('header').first(),
    page.locator('[role="navigation"]').first(),
    page.locator('nav').first(),
  ];
  const header = await firstVisibleLocator(headerCandidates as any, 1200);
  const scope = header ?? page.locator('body');
  return discoverLinksInScope(scope, /\/srec(?:-new)?(?:\/|$)/i);
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(240_000);
    const rows: MenuCheckRow[] = [];
    const env = currentEnv();

    try {
      await login(page);

      // Open panel (if no access -> mark all and return)
      try {
        await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
      } catch (e: any) {
        pushAllMissingAccess(rows, SOLUTION_NAME, MODULES, e?.message || String(e));
        return;
      }

      // SIDE checks
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);
          await clickModuleFromPanel(page, mod.panelName);
          await assertLoaded(page, mod.urlMatchesByEnv[env], mod.name);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // TOP checks (ensure we are in solution first)
      const first = MODULES[0]; // Overview
      if (!/\/srec/i.test(page.url())) {
        await openSolutionPanel(page, SOLUTION_NAME, first.panelName);
        await clickModuleFromPanel(page, first.panelName);
        await assertLoaded(page, first.urlMatchesByEnv[env], first.name);
      }

      for (const mod of MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          const href = mod.hrefByEnv[env];
          await clickFromTopMenu(page, mod.name, href);
          await assertLoaded(page, mod.urlMatchesByEnv[env], mod.name);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // EXTRA detection (Side + Top)
      await openSolutionPanel(page, SOLUTION_NAME, MODULES[0].panelName);

      // ✅ UPDATED: Include hrefAliases in the expected set
      const expected = new Set(
        MODULES.flatMap((m) => [m.hrefByEnv[env], ...(m.hrefAliases || [])])
          .filter(Boolean)
          .map(normalizeHref),
      );

      const discoveredSide = await discoverSideLinks(page);
      const sideExtras = discoveredSide.filter((d) => !expected.has(d.href));
      for (const ex of sideExtras) {
        rows.push({
          label: `Side menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      const discoveredTop = await discoverTopLinks(page);
      const topExtras = discoveredTop.filter((d) => !expected.has(d.href));
      for (const ex of topExtras) {
        rows.push({
          label: `Top menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      if (rows.some((r) => r.status === 'ERROR')) throw new Error('Some ESG & Compliance navigation checks failed.');
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'ESG & Compliance - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});