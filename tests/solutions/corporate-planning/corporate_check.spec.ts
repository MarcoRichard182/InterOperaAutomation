import { test } from '@playwright/test';
import { login } from '../../../helpers/login-helper';
import { sendMenuSlackReport, type MenuCheckRow } from '../../../helpers/slack-menu-report';
import {
  openSolutionPanel,
  discoverModulesFromPanel,
  compareDiscoveredModules,
  clickModuleFromPanel,
  clickModuleFromTop,
  assertModuleLoaded,
  type ModuleDef,
} from '../../../helpers/solution-checker';

const SOLUTION_NAME = 'Corporate Planning';

const MODULES: ModuleDef[] = [
  { name: 'Overview', slug: '/corporate', urlIncludes: /\/corporate(?:[/?#]|$)/i },
  { name: 'Accounting', slug: '/corporate/accounting', urlIncludes: /\/corporate\/accounting(?:[/?#]|$)/i },
  { name: 'Finance', slug: '/corporate/finance', urlIncludes: /\/corporate\/finance(?:[/?#]|$)/i },
  { name: 'Asset Management', slug: '/corporate/asset-management', urlIncludes: /\/corporate\/asset-management(?:[/?#]|$)/i },
  { name: 'Asset Operations', slug: '/corporate/asset-operations/real-estate', urlIncludes: /\/corporate\/asset-operations\/real-estate(?:[/?#]|$)/i },
  { name: 'HR', slug: '/corporate/hr', urlIncludes: /\/corporate\/hr(?:[/?#]|$)/i },
  { name: 'Rec Management', slug: '/corporate/rec', urlIncludes: /\/corporate\/rec(?:[/?#]|$)/i },
];

test.describe('Corporate Planning solution checker (Option A)', () => {
  test('modules accessible via side menu and top menu', async ({ page }) => {
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      const expectedNames = MODULES.map(m => m.name);

      // Open panel once for discovery
      await openSolutionPanel(page, SOLUTION_NAME, MODULES[0]?.name);

      // Option A: Discover + compare
      const discovered = await discoverModulesFromPanel(page, expectedNames);
      const { missing, extra } = compareDiscoveredModules(expectedNames, discovered);

      for (const m of missing) rows.push({ label: `Side menu — MISSING expected module: ${m}`, status: 'ERROR' });
      for (const x of extra) rows.push({ label: `Side menu — NEW module detected: ${x}`, status: 'ERROR' });

      // Side menu checks
      for (const mod of MODULES) {
        const label = `Side menu — ${mod.name}`;
        try {
          await openSolutionPanel(page, SOLUTION_NAME, MODULES[0]?.name);
          await clickModuleFromPanel(page, mod.name);
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      // Top menu checks
      for (const mod of MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          await clickModuleFromTop(page, mod);     // uses href if available; fallback by text
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      if (rows.some(r => r.status === 'ERROR')) throw new Error('Some Corporate Planning checks failed.');
    } finally {
      const hasError = rows.some(r => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Corporate Planning - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
