import { expect, test, Page } from '@playwright/test';
import type { MenuReport } from './report';
import { pushError } from './report';

export async function runModules(
  page: Page,
  menuName: string,
  modules: Array<{ name: string; run: (page: Page) => Promise<void> }>,
  report: MenuReport,
) {
  for (const m of modules) {
    await test.step(`${menuName} > ${m.name}`, async () => {
      try {
        await m.run(page);
        report.rows.push({
          section: menuName,
          field: m.name,
          expected: 'Module loads and is usable',
          actual: 'OK',
          status: 'PASS',
        });
      } catch (e) {
        pushError(report, `${menuName} > ${m.name}`, e);
        // keep going but mark the test as having issues
        expect.soft(false, `Module failed: ${menuName} > ${m.name}`).toBeTruthy();
      }
    });
  }
}
