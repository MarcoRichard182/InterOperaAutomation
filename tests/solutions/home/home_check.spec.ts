// tests/home/home_check.spec.ts
import { test, expect, Page, Locator } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';

type HomeModule = {
  name: string;
  slug: string; // url segment: /home/<slug>
  heading?: RegExp; // page loaded signal
};

const HOME_MODULES: HomeModule[] = [
  { name: 'AI Hub', slug: 'ai-hub', heading: /^AI Hub$/i },
  { name: 'AI Organisation', slug: 'ai-organisation', heading: /^AI Organisation$/i },
  { name: 'Scheduler', slug: 'scheduler', heading: /Scheduler/i },
  { name: 'Data Management', slug: 'data-management', heading: /^Data Management$/i },
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
    if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
    return raw.split('?')[0].split('#')[0];
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

async function openHomePanel(page: Page) {
  await waitForAppIdle(page);

  const homeCandidates = [
    page.getByRole('link', { name: /^Home$/i }).first(),
    page.getByRole('button', { name: /^Home$/i }).first(),
    page.locator('a').filter({ hasText: /^Home$/i }).first(),
    page.locator('button').filter({ hasText: /^Home$/i }).first(),
    page.getByText(/^Home$/i).first(),
  ];

  const homeItem = await firstVisibleLocator(homeCandidates as any, 1500);
  if (!homeItem) throw new Error('Left sidebar "Home" item not found');

  await homeItem.scrollIntoViewIfNeeded().catch(() => {});
  await homeItem.click({ force: true });

  const aiHubBtn = page.getByRole('button', { name: /^AI Hub$/i }).first();
  await expect(aiHubBtn, 'Home panel did not open (AI Hub not visible)').toBeVisible({ timeout: 10_000 });
}

async function clickModuleFromHomePanel(page: Page, moduleName: string) {
  const rx = new RegExp(`^\\s*${escRx(moduleName)}\\s*$`, 'i');
  const btn = page.getByRole('button', { name: rx }).first();

  await expect(btn, `Module button not visible in Home panel: ${moduleName}`).toBeVisible({ timeout: 10_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true });
}

async function clickModuleFromTopBar(page: Page, mod: HomeModule) {
  const linkByHref = page.locator(`a[href*="/home/${mod.slug}"]`).first();
  const rx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  const target = await firstVisibleLocator(
    [
      linkByHref,
      page.getByRole('tab', { name: rx }).first(),
      page.getByRole('link', { name: rx }).first(),
      page.locator('a').filter({ hasText: rx }).first(),
      page.getByRole('button', { name: rx }).first(),
    ] as any,
    1500,
  );

  if (!target) throw new Error(`Top bar module not found: ${mod.name}`);

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

async function assertHomeModuleLoaded(page: Page, mod: HomeModule) {
  await waitForAppIdle(page);

  await expect(page, 'Unexpectedly navigated to login page').not.toHaveURL(/\/login/i, { timeout: 10_000 });

  await expect(page, `URL did not include /home/${mod.slug}`).toHaveURL(
    new RegExp(`/home/${escRx(mod.slug)}(?:[/?#]|$)`, 'i'),
    { timeout: 15_000 },
  );

  if (mod.heading) {
    const ok =
      (await page.getByRole('heading', { name: mod.heading }).first().isVisible().catch(() => false)) ||
      (await page.getByText(mod.heading).first().isVisible().catch(() => false));
    if (!ok) throw new Error(`Page loaded but expected heading/text not found for module: ${mod.name}`);
  }

  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) throw new Error(`Landed on a 404/not-found page for module: ${mod.name}`);
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

async function discoverTopLinks(page: Page) {
  const headerCandidates = [
    page.locator('header').first(),
    page.locator('[role="navigation"]').first(),
    page.locator('nav').first(),
  ];
  const header = await firstVisibleLocator(headerCandidates as any, 1200);
  const scope = header ?? page.locator('body');
  return discoverLinksInScope(scope, /\/home\//i);
}

test.describe('Home solution checker', () => {
  test('home modules accessible via side menu and top menu, and detect unexpected modules', async ({ page }) => {
    test.setTimeout(240_000);
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      // SIDE
      for (const mod of HOME_MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openHomePanel(page);
          await clickModuleFromHomePanel(page, mod.name);
          await assertHomeModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // TOP
      for (const mod of HOME_MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          if (!/\/home\//i.test(page.url())) {
            await openHomePanel(page);
            await clickModuleFromHomePanel(page, 'AI Hub');
            await assertHomeModuleLoaded(page, HOME_MODULES[0]);
          }

          await clickModuleFromTopBar(page, mod);
          await assertHomeModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // EXTRA detection (Side + Top)
      await openHomePanel(page);

      const expected = new Set<string>(HOME_MODULES.map((m) => `/home/${m.slug}`));

      // Side extras: scan whole page for /home/ links (Home panel is visible now)
      const discoveredSide = await discoverLinksInScope(page.locator('body'), /\/home\//i);
      for (const ex of discoveredSide.filter((d) => !expected.has(d.href))) {
        rows.push({
          label: `Side menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      // Top extras
      const discoveredTop = await discoverTopLinks(page);
      for (const ex of discoveredTop.filter((d) => !expected.has(d.href))) {
        rows.push({
          label: `Top menu EXTRA — ${ex.name}`,
          status: 'ERROR',
          detail: `Unexpected module link found: ${ex.href}`,
        });
      }

      if (rows.some((r) => r.status === 'ERROR')) throw new Error('Some Home navigation checks failed.');
    } finally {
      const hasError = rows.some((r) => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Home Solution - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
