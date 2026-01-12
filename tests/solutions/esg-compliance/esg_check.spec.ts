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

const SOLUTION_NAME = 'ESG & Compliance';

const MODULES: ModuleDef[] = [
  { name: 'Compliance', slug: '/srec/compliance', urlIncludes: /\/srec\/compliance(?:[/?#]|$)/i },
  { name: 'Sustainability', slug: '/srec/sustainability-monitoring', urlIncludes: /\/srec\/sustainability-monitoring(?:[/?#]|$)/i },
];

test.describe('ESG & Compliance solution checker (Option A)', () => {
  test('modules accessible via side menu and top menu', async ({ page }) => {
    const rows: MenuCheckRow[] = [];

    try {
      await login(page);

      const expectedNames = MODULES.map(m => m.name);

      await openSolutionPanel(page, SOLUTION_NAME, MODULES[0]?.name);

      const discovered = await discoverModulesFromPanel(page, expectedNames);
      const { missing, extra } = compareDiscoveredModules(expectedNames, discovered);

      for (const m of missing) rows.push({ label: `Side menu — MISSING expected module: ${m}`, status: 'ERROR' });
      for (const x of extra) rows.push({ label: `Side menu — NEW module detected: ${x}`, status: 'ERROR' });

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

      for (const mod of MODULES) {
        const label = `Top menu — ${mod.name}`;
        try {
          await clickModuleFromTop(page, mod);
          await assertModuleLoaded(page, mod);
          rows.push({ label, status: 'PASS' });
        } catch (e: any) {
          rows.push({ label, status: 'ERROR', detail: e?.message || String(e) });
        }
      }

      if (rows.some(r => r.status === 'ERROR')) throw new Error('Some ESG & Compliance checks failed.');
    } finally {
      const hasError = rows.some(r => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'ESG & Compliance - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
