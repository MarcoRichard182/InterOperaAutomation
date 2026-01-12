import { test, expect, Page } from '@playwright/test';
import { login } from '../../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../../helpers/slack-menu-report';

type Module = {
  name: string;
  panelName: string;
  href?: string;     // relative href when same domain
  urlMatches: RegExp;
};

const SOLUTION_NAME = 'Sales & Projects';

const MODULES: Module[] = [
  { name: 'Sales & Strategic Partnerships', panelName: 'Sales & Strategic Partnerships', href: '/smm/sales-strategic-partnership', urlMatches: /\/smm\/sales-strategic-partnership(?:[/?#]|$)/i },
  // cross-domain: app.operax... (no reliable relative href)
  { name: 'Project Management', panelName: 'Project Management', href: '/smm/deals', urlMatches: /\/\/app\.operax\.interopera\.co\/smm\/deals(?:[/?#]|$)/i },
  { name: 'Product Management', panelName: 'Product Management', href: '/smm/products', urlMatches: /\/smm\/products(?:[/?#]|$)/i },
];

function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function norm(s: string) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

async function openSolutionPanel(page: Page) {
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

  const hint = page.getByText(new RegExp(escRx(MODULES[0].panelName), 'i')).first();
  await expect(hint, 'Solution panel did not open / module list not visible').toBeVisible({ timeout: 10_000 });
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

async function assertLoaded(page: Page, mod: Module) {
  await waitForAppIdle(page);
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 10_000 });

  // cross-domain OK
  await expect(page).toHaveURL(mod.urlMatches, { timeout: 30_000 });

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) throw new Error(`Landed on 404/not-found page for: ${mod.name}`);
}

async function clickFromTopMenu(page: Page, mod: Module) {
  const nameRx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  // for same-domain items, prefer href
  const hrefLoc = mod.href
    ? page.locator(`a[href="${mod.href}"], a[href^="${mod.href}?"], a[href^="${mod.href}#"]`).first()
    : page.locator('___never___');

  // For cross-domain item, rely on visible text/tab/link
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

      // SIDE
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openSolutionPanel(page);
          await clickModuleFromPanel(page, mod.panelName);
          await assertLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // TOP (ensure we are in /smm first if possible)
      if (!/\/smm\//i.test(page.url())) {
        await openSolutionPanel(page);
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
      await openSolutionPanel(page);
      const discovered = await discoverLinks(page);
      const expected = new Set(MODULES.map((m) => m.href).filter(Boolean) as string[]);
      const extras = discovered.filter((d) => d.href.includes('/smm') && !expected.has(d.href));
      for (const ex of extras) {
        rows.push({ label: `Side menu EXTRA — ${ex.name}`, status: 'ERROR', detail: `Unexpected module link found: ${ex.href}` });
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
