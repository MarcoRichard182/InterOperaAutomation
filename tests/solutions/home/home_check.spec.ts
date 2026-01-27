// tests/home/home_check.spec.ts
import { test, expect, Page, Locator } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { waitForAppIdle, firstVisibleLocator } from '../../../helpers/page-utils';
import type { ReportRow } from '../../../helpers/slack-helper';
import { sendHomeSlackReport } from '../../../helpers/slack-home-report';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';

import {
  openSolutionPanel,
  discoverModulesFromPanel,
  compareDiscoveredModules,
  clickModuleFromPanel,
  clickModuleFromTop,
  assertModuleLoaded
} from '../../../helpers/solution-checker';



function stepRow(field: string, status: 'PASS' | 'ERROR', actual = ''): ReportRow {
  return { section: 'Flow', field, expected: '', actual, status };
}



type HomeModule = {
  name: string;
  slug: string; // url segment: /home/<slug>
  heading?: RegExp; // page loaded signal
};

const HOME_MODULES: HomeModule[] = [
  { name: 'AI Hub', slug: 'ai-hub', heading: /^AI Hub$/i },
  { name: 'AI Organisation', slug: 'ai-organisation', heading: /^AI Organisation$/i },
  { name: 'Scheduler', slug: 'scheduler', heading: /^Scheduler$/i },
  { name: 'Data Management', slug: 'data-management', heading: /^Data Management$/i },
];



function now() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getLeftSidebar(page: Page): Promise<Locator> {
  // try to find the left nav/aside that contains common menu text
  const candidates = [
    page.locator('aside').filter({ hasText: /Corporate Planning|Research Intelligence|Sales & Projects|ESG & Compliance/i }).first(),
    page.locator('nav').filter({ hasText: /Corporate Planning|Research Intelligence|Sales & Projects|ESG & Compliance/i }).first(),
    page.locator('aside').first(),
    page.locator('nav').first(),
  ];

  const sidebar = await firstVisibleLocator(candidates as any, 1200);
  return sidebar ?? page.locator('body');
}

async function openHomePanel(page: Page) {
  await waitForAppIdle(page);

  // Don’t over-scope early. "Home" in the left sidebar is usually a link (<a>).
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

  // Home panel should show module list (AI Hub etc.)
  const aiHubBtn = page.getByRole('button', { name: /^AI Hub$/i }).first();
  await expect(aiHubBtn, 'Home panel did not open (AI Hub not visible)').toBeVisible({ timeout: 10_000 });
}


async function clickModuleFromHomePanel(page: Page, moduleName: string) {
  const rx = new RegExp(`^\\s*${escRx(moduleName)}\\s*$`, 'i');

  // In your DOM, modules appear as <button> inside the Home panel
  const btn = page.getByRole('button', { name: rx }).first();

  await expect(btn, `Module button not visible in Home panel: ${moduleName}`).toBeVisible({ timeout: 10_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true });
}

async function clickModuleFromTopBar(page: Page, mod: HomeModule) {
  // Prefer href because it’s very stable
  const linkByHref = page.locator(`a[href*="/home/${mod.slug}"]`).first();

  const rx = new RegExp(`^\\s*${escRx(mod.name)}\\s*$`, 'i');

  const target = await firstVisibleLocator(
    [
      linkByHref,
      page.getByRole('tab', { name: rx }).first(),
      page.getByRole('link', { name: rx }).first(),
      page.locator('a').filter({ hasText: rx }).first(),
      page.getByRole('button', { name: rx }).first(),
    ],
    1500,
  );

  if (!target) throw new Error(`Top bar module not found: ${mod.name}`);

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ force: true });
}

async function assertHomeModuleLoaded(page: Page, mod: HomeModule) {
  await waitForAppIdle(page);

  // not logged out
  await expect(page, 'Unexpectedly navigated to login page').not.toHaveURL(/\/login/i, { timeout: 10_000 });

  // URL check (strong + simple)
  await expect(page, `URL did not include /home/${mod.slug}`).toHaveURL(new RegExp(`/home/${escRx(mod.slug)}(?:[/?#]|$)`, 'i'), {
    timeout: 15_000,
  });

  // page loaded signal (heading or text)
  if (mod.heading) {
    const ok =
      (await page.getByRole('heading', { name: mod.heading }).first().isVisible().catch(() => false)) ||
      (await page.getByText(mod.heading).first().isVisible().catch(() => false));

    if (!ok) {
      throw new Error(`Page loaded but expected heading/text not found for module: ${mod.name}`);
    }
  }

  // avoid silent 404-ish pages
  const notFound = page.getByText(/404|not found|page not found/i).first();
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`Landed on a 404/not-found page for module: ${mod.name}`);
  }
}

test.describe('Home solution checker', () => {
  test('home modules accessible via side menu and top menu', async ({ page }) => {
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);
      // -----------------------
      // SIDE MENU: Home panel buttons
      // -----------------------
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

      // -----------------------
      // TOP MENU: tabs/links
      // -----------------------
      for (const mod of HOME_MODULES) {
        const label = `Top menu — ${mod.name}`;

        try {
          // Ensure we are in /home/* so top bar exists
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

      // Optional: fail test if any ERROR (but still sends report in finally)
      const hasError = rows.some((r) => r.status === 'ERROR');
      if (hasError) throw new Error('Some Home navigation checks failed.');
    } finally {

    const hasError = rows.some(r => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Home Solution - Navigation Report',
        rows,
         mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined, // ✅ only tag on error
        includeErrorDetails: true,       // keeps a short "Error details" section
      });
    }
  });
});

