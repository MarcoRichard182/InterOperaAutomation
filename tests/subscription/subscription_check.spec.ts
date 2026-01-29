import { test, expect, Page } from '@playwright/test';
import { CLIENTS } from '../config/subscription';
import { MODULE_REGISTRY } from '../config/module-registry';
import { loginSubs } from '../../helpers/login-subs-helper';
import { sendSlackReport } from '../../helpers/slack-report';

function escRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(input: string) {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function compactError(err: any) {
  const msg = stripAnsi(err?.message || String(err || '')).replace(/\s+/g, ' ').trim();
  if (!msg) return 'Unknown error';
  // make Slack readable (Playwright expect errors are huge)
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

async function clickExact(page: Page, label: string) {
  const rx = new RegExp(`^\\s*${escRx(label)}\\s*$`, 'i');

  const candidates = [
    page.getByRole('button', { name: rx }).first(),
    page.getByRole('link', { name: rx }).first(),
    page.getByRole('tab', { name: rx }).first(),
    page.locator('button').filter({ hasText: rx }).first(),
    page.locator('a').filter({ hasText: rx }).first(),
    page.getByText(rx).first(),
  ];

  for (const c of candidates) {
    if (await c.isVisible().catch(() => false)) {
      await c.scrollIntoViewIfNeeded().catch(() => {});
      await c.click({ force: true });
      return;
    }
  }
  throw new Error(`Menu item not found: "${label}"`);
}

function solutionLabel(solutionKey: string) {
  if (solutionKey === 'corporate') return 'Corporate Planning';
  if (solutionKey === 'ri') return 'Research Intelligence';
  if (solutionKey === 'smm') return 'Sales & Projects';
  return 'ESG & Compliance';
}

test.describe('PROD – Subscription Navigation Check', () => {
  test('All clients', async ({ browser }) => {
    test.setTimeout(20 * 60 * 1000);

    const lines: string[] = [];
    let pass = 0;
    let fail = 0;

    try {
      for (const client of CLIENTS) {
        const context = await browser.newContext();
        const page = await context.newPage();

        // client header
        lines.push('');
        lines.push(`*${client.client}* (${client.email})`);

        try {
          // ---- LOGIN ----
          try {
            await loginSubs(page, client.email);
            lines.push(`  • Login ✅`);
          } catch (e: any) {
            fail++;
            lines.push(`  • Login ❌ (${compactError(e)})`);
            continue; // can't proceed without login
          }

          // ---- SOLUTIONS ----
          for (const [solutionKey, moduleNames] of Object.entries(client.solutions)) {
            const solName = solutionLabel(solutionKey);
            lines.push(`  • ${solName}`);

            // open solution panel
            try {
              await clickExact(page, solName);
            } catch (e: any) {
              fail++;
              lines.push(`     - ❌ Cannot open solution panel (${compactError(e)})`);
              continue;
            }

            for (const moduleName of moduleNames || []) {
              const mod = MODULE_REGISTRY[moduleName];
              if (!mod) {
                fail++;
                lines.push(`     - ${moduleName}: ❌ (not in MODULE_REGISTRY)`);
                continue;
              }

              // SIDE menu
              let sideOk = false;
              try {
                // UI may collapse; re-open the solution list
                await clickExact(page, solName);
                await clickExact(page, mod.panelName);

                await expect(page).toHaveURL(mod.urlMatch, { timeout: 25_000 });
                pass++;
                sideOk = true;
                lines.push(`     - Side: ${mod.name} ✅`);
              } catch (e: any) {
                fail++;
                lines.push(`     - Side: ${mod.name} ❌ (${compactError(e)})`);
              }

              // TOP menu (only if side nav succeeded -> reduces noise)
              if (!sideOk) continue;

              try {
                await clickExact(page, mod.name);
                await expect(page).toHaveURL(mod.urlMatch, { timeout: 25_000 });
                pass++;
                lines.push(`     - Top:  ${mod.name} ✅`);
              } catch (e: any) {
                fail++;
                lines.push(`     - Top:  ${mod.name} ❌ (${compactError(e)})`);
              }
            }
          }
        } catch (e: any) {
          fail++;
          lines.push(`  • ❌ Client run failed (${compactError(e)})`);
        } finally {
          await context.close().catch(() => {});
        }
      }
    } finally {
      await sendSlackReport(`Solutions – Navigation Report – PROD (✅ ${pass} | 🛑 ${fail})`, lines);
    }

    if (fail > 0) {
      throw new Error(`Subscription navigation check had ${fail} failures.`);
    }
  });
});
