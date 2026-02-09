// tests/solutions/corporate-planning/corporate_check.spec.ts
import { test, expect, Page } from '@playwright/test';
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

const SOLUTION_NAME = 'Corporate Planning';

const MODULES: Module[] = [
  { 
    name: 'Overview', 
    panelName: 'Overview', 
    href: '/corporate', 
    urlMatches: /\/corporate(?:\/overview)?(?:[/?#]|$)/i 
  },
  { 
    name: 'Scheduler', 
    panelName: 'Scheduler', 
    href: '/corporate/scheduler', 
    urlMatches: /\/corporate\/scheduler(?:[/?#]|$)/i 
  },
  { name: 'Accounting', panelName: 'Accounting', href: '/corporate/accounting', urlMatches: /\/corporate\/accounting(?:[/?#]|$)/i },
  { name: 'Finance', panelName: 'Finance', href: '/corporate/finance', urlMatches: /\/corporate\/finance(?:[/?#]|$)/i },
  { name: 'Asset Management', panelName: 'Assets Management', href: '/corporate/asset-management', urlMatches: /\/corporate\/asset-management(?:[/?#]|$)/i },
  { name: 'Asset Operations', panelName: 'Assets Operations', href: '/corporate/asset-operations', urlMatches: /\/corporate\/asset-operations(?:[/?#]|$)/i },
  { name: 'HR', panelName: 'Human Resources (HR)', href: '/corporate/hr', urlMatches: /\/corporate\/hr(?:[/?#]|$)/i },
  { name: 'REC Management', panelName: 'REC', href: '/corporate/rec', urlMatches: /\/corporate\/rec(?:[/?#]|$)/i },
];

/** * NEW: Normalize URLs by stripping query parameters and trailing slashes 
 * to ensure /path?query=true matches /path 
 */
function normalizeHref(href: string): string {
  const raw = (href || '').trim();
  if (!raw) return '';
  try {
    // Strip query strings (?) and hashes (#) then remove trailing slash
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

async function discoverCorporateLinks(page: Page) {
  const anchors = page.locator('a[href^="/corporate"], a[href*="/corporate"]').filter({ hasText: /./ });
  const count = await anchors.count().catch(() => 0);
  const items: { name: string; href: string }[] = [];

  for (let i = 0; i < count; i++) {
    const a = anchors.nth(i);
    const visible = await a.isVisible().catch(() => false);
    if (!visible) continue;

    const hrefRaw = (await a.getAttribute('href').catch(() => '')) || '';
    // UPDATED: Normalize the discovered href
    const href = normalizeHref(hrefRaw);
    const text = norm(await a.innerText().catch(() => ''));
    if (!href || !text) continue;

    items.push({ name: text, href });
  }

  const key = (x: { name: string; href: string }) => `${x.href}|||${x.name}`;
  return uniq(items.map((x) => ({ ...x }))).filter((x, idx, arr) => arr.findIndex((y) => key(y) === key(x)) === idx);
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
    2000,
  );

  if (!target) throw new Error(`Top menu item not found for: ${mod.name}`);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

test.describe(`${SOLUTION_NAME} solution checker`, () => {
  test('modules accessible via side menu + top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(220_000);
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);
      
      // SIDE MENU checks
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

      // TOP MENU checks
      if (!/\/corporate/i.test(page.url())) {
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

      // EXTRA detection (Side + Top)
      await openCorporatePanel(page);

      const discovered = await discoverCorporateLinks(page);
      // UPDATED: Ensure expected hrefs are also normalized for comparison
      const expectedHrefs = new Set(MODULES.map((m) => normalizeHref(m.href)));

      const extras = discovered.filter((d) => d.href.startsWith('/corporate') && !expectedHrefs.has(d.href));
      for (const ex of extras) {
        rows.push({
          label: `Side menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      if (rows.some((r) => r.status === 'ERROR')) {
        throw new Error('Some Corporate Planning navigation checks failed.');
      }
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