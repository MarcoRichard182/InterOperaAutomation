// tests/subscription/subscription_check.spec.ts
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
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

// Helper to click menu items by text
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
  if (solutionKey === 'home') return 'Home';
  if (solutionKey === 'corporate') return 'Corporate Planning';
  if (solutionKey === 'ri') return 'Research Intelligence';
  if (solutionKey === 'smm') return 'Sales & Projects';
  if (solutionKey === 'srec') return 'ESG & Compliance';
  return solutionKey;
}

test.describe('Subscription Navigation Check', () => {
  // Use .env.client logic if you have a custom setup, 
  // otherwise default ENV logic applies.
  
  test('All clients', async ({ browser }) => {
    test.setTimeout(30 * 60 * 1000); // Increased timeout for many clients

    const lines: string[] = [];
    let pass = 0;
    let fail = 0;

    try {
      for (const client of CLIENTS) {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Header for Slack
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
            await context.close().catch(() => {});
            continue; 
          }

          // ---- SOLUTIONS ----
          for (const [solutionKey, moduleKeys] of Object.entries(client.solutions)) {
            const solName = solutionLabel(solutionKey);
            lines.push(`  • ${solName}`);

            // 1. Open Solution Panel (Home usually defaults to open, but we click to be safe)
            try {
              await clickExact(page, solName);
            } catch (e: any) {
              fail++;
              lines.push(`     - ❌ Cannot open solution panel (${compactError(e)})`);
              continue;
            }

            // 2. Check each module in this solution
            for (const moduleKey of moduleKeys || []) {
              const mod = MODULE_REGISTRY[moduleKey];
              if (!mod) {
                fail++;
                lines.push(`     - ${moduleKey}: ❌ (Config Error: Not in Registry)`);
                continue;
              }

              // --- SIDE MENU CHECK ---
              let sideOk = false;
              try {
                // Ensure panel is open (re-click solution if needed to expand)
                if (solutionKey !== 'home') {
                   // Home items are usually always visible or under 'Home', 
                   // but for others we might need to toggle.
                   // Simple retry strategy: click solution, then click module panel name.
                   await clickExact(page, solName).catch(() => {});
                }

                await clickExact(page, mod.panelName);
                await expect(page).toHaveURL(mod.urlMatch, { timeout: 25_000 });
                
                pass++;
                sideOk = true;
                lines.push(`     - Side: ${moduleKey} ✅`);
              } catch (e: any) {
                fail++;
                lines.push(`     - Side: ${moduleKey} ❌ (${compactError(e)})`);
              }

              // --- TOP MENU CHECK ---
              // Only check top menu if side menu worked (confirms access exists)
              // and if we are not in Home (Home top menu behaves differently or is absent for some items)
              if (sideOk) {
                try {
                  await clickExact(page, mod.name);
                  await expect(page).toHaveURL(mod.urlMatch, { timeout: 25_000 });
                  pass++;
                  lines.push(`     - Top:  ${moduleKey} ✅`);
                } catch (e: any) {
                  // Soft fail for Top menu if side worked
                  fail++;
                  lines.push(`     - Top:  ${moduleKey} ❌ (${compactError(e)})`);
                }
              }
            }
          }
        } catch (e: any) {
          fail++;
          lines.push(`  • ❌ Client run crashed (${compactError(e)})`);
        } finally {
          await context.close().catch(() => {});
        }
      }
    } finally {
      // Send Report
      await sendSlackReport(`Subscription Check Report (✅ ${pass} | 🛑 ${fail})`, lines);
    }

    if (fail > 0) {
      throw new Error(`Subscription check had ${fail} failures.`);
    }
  });
});