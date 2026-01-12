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

const SOLUTION_NAME = 'Research Intelligence';

const MODULES: ModuleDef[] = [
  { name: 'Integrated Intelligence', slug: '/ri/integrated-intelligence', urlIncludes: /\/ri\/integrated-intelligence(?:[/?#]|$)/i },
  { name: 'Market Research', slug: '/ri/market-research-new', urlIncludes: /\/ri\/market-research-new(?:[/?#]|$)/i },
  { name: 'E- Mobility', slug: '/ri/emobility', urlIncludes: /\/ri\/emobility(?:[/?#]|$)/i },
];

test.describe('Research Intelligence solution checker (Option A)', () => {
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

      if (rows.some(r => r.status === 'ERROR')) throw new Error('Some Research Intelligence checks failed.');
    } finally {
      const hasError = rows.some(r => r.status === 'ERROR');
      await sendMenuSlackReport({
        title: 'Research Intelligence - Navigation Report',
        rows,
        mentionUserId: hasError ? '<@U089BQX3Z6F>' : undefined,
        includeErrorDetails: true,
      });
    }
  });
});
