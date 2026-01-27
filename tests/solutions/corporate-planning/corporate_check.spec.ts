// tests/solutions/corporate-planning/corporate_check.spec.ts
import { test, expect, Page } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';



type Module = {
  name: string;          // report label
  panelName: string;     // UI text in the Corporate panel
  href: string;          // expected href (for discovery + click)
  urlMatches: RegExp;    // URL verification
};

const SOLUTION_NAME = 'Corporate Planning';

const MODULES: Module[] = [
  { name: 'Overview', panelName: 'Corporate Planning', href: '/corporate', urlMatches: /\/corporate(?:[/?#]|$)/i },
  { name: 'Accounting', panelName: 'Accounting', href: '/corporate/accounting', urlMatches: /\/corporate\/accounting(?:[/?#]|$)/i },
  { name: 'Finance', panelName: 'Finance', href: '/corporate/finance', urlMatches: /\/corporate\/finance(?:[/?#]|$)/i },
  { name: 'Asset Management', panelName: 'Assets Management', href: '/corporate/asset-management', urlMatches: /\/corporate\/asset-management(?:[/?#]|$)/i },
  { name: 'Asset Operations', panelName: 'Assets Operations', href: '/corporate/asset-operations', urlMatches: /\/corporate\/asset-operations(?:[/?#]|$)/i },
  { name: 'HR', panelName: 'Human Resources (HR)', href: '/corporate/hr', urlMatches: /\/corporate\/hr(?:[/?#]|$)/i },
  { name: 'REC Management', panelName: 'REC', href: '/corporate/rec', urlMatches: /\/corporate\/rec(?:[/?#]|$)/i },
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

// ✅ FIX: make openSolutionPanel take solutionName + hint so it's not "undefined" / wrong-args
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


function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function norm(s: string) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

async function openCorporatePanel(page: Page) {
  await waitForAppIdle(page);

  const solRx = new RegExp(`^\\s*${escRx(SOLUTION_NAME)}\\s*$`, 'i');
  const candidates = [
    page.getByRole('button', { name: solRx }).first(),
    page.getByRole('link', { name: solRx }).first(),
    page.locator('button').filter({ hasText: solRx }).first(),
    page.locator('a').filter({ hasText: solRx }).first(),
    page.getByText(solRx).first(),
  ];

  const sol = await firstVisibleLocator(candidates as any, 2500);
  if (!sol) throw new Error(`Side menu "${SOLUTION_NAME}" not found`);

  await sol.scrollIntoViewIfNeeded().catch(() => {});
  await sol.click({ force: true });

  // Make sure panel is really open: one known module should be visible
  const hint = page.getByText(new RegExp(escRx(MODULES[1].panelName), 'i')).first();
  await expect(hint, 'Corporate panel did not open / module list not visible').toBeVisible({ timeout: 10_000 });
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
  await expect(page).toHaveURL(mod.urlMatches, { timeout: 20_000 });

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`Landed on 404/not-found page for: ${mod.name}`);
  }
}

/**
 * Discover corporate module links visible on the page.
 * We use href pattern "/corporate" to detect modules that exist (including unwanted extras).
 */
async function discoverCorporateLinks(page: Page) {
  // Any visible anchors that navigate to /corporate...
  const anchors = page.locator('a[href^="/corporate"], a[href*="/corporate"]').filter({ hasText: /./ });

  const count = await anchors.count().catch(() => 0);
  const items: { name: string; href: string }[] = [];

  for (let i = 0; i < count; i++) {
    const a = anchors.nth(i);
    const visible = await a.isVisible().catch(() => false);
    if (!visible) continue;

    const href = (await a.getAttribute('href').catch(() => '')) || '';
    const text = norm(await a.innerText().catch(() => ''));
    if (!href || !text) continue;

    // Reduce noise: only keep items that look like module menu items
    // (You can loosen/tighten later.)
    items.push({ name: text, href });
  }

  // Dedup by href+name
  const key = (x: { name: string; href: string }) => `${x.href}|||${x.name}`;
  return uniq(items.map((x) => ({ ...x }))).filter((x, idx, arr) => arr.findIndex((y) => key(y) === key(x)) === idx);
}

async function clickFromTopMenu(page: Page, mod: Module) {
  // Try to click using href first (most stable)
  const hrefLoc = page.locator(`a[href="${mod.href}"], a[href^="${mod.href}?"], a[href^="${mod.href}#"]`).first();
  const nameRx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  const target = await firstVisibleLocator(
    [
      hrefLoc,
      page.getByRole('tab', { name: nameRx }).first(),
      page.getByRole('link', { name: nameRx }).first(),
      page.locator('a').filter({ hasText: nameRx }).first(),
    ] as any,
    2000,
  );

  if (!target) throw new Error(`Top menu item not found for: ${mod.name} (${mod.href})`);

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(220_000);

    const rows: MenuCheckRow[] = [];

    try {
      await login(page);
      const ok = await ensureSolutionPanelOrMarkAll(page, rows, SOLUTION_NAME, MODULES);
      if (!ok) return;
      // -----------------------
      // SIDE MENU (panel)
      // -----------------------
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openCorporatePanel(page);
          await clickModuleFromPanel(page, mod.panelName);
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // -----------------------
      // TOP MENU
      // (make sure we are on /corporate first)
      // -----------------------
      if (!/\/corporate/i.test(page.url())) {
        // go to Overview first so top menu should exist (if the app has it)
        await openCorporatePanel(page);
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

      // -----------------------
      // DETECT UNEXPECTED MODULES (extras)
      // We discover visible /corporate links and flag those not in our expected href list.
      // -----------------------
      // Open the panel so module list is visible, which helps discovery pick up menu links.
      await openCorporatePanel(page);

      const discovered = await discoverCorporateLinks(page);
      const expectedHrefs = new Set(MODULES.map((m) => m.href));

      const extras = discovered.filter((d) => d.href.startsWith('/corporate') && !expectedHrefs.has(d.href));
      for (const ex of extras) {
        rows.push({
          label: `Side menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      // Fail after loops (Slack still sends in finally)
      if (rows.some((r) => r.status === 'ERROR')) {
        throw new Error('Some Corporate Planning navigation checks failed.');
      }
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Corporate Planning - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined, // tag only when ERROR
        includeErrorDetails: true,
      });
    }
  });
});