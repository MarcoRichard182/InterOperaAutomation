// helpers/step-report.ts
import type { Page } from '@playwright/test';
import type { ReportRow } from './slack-helper';

type StepStatus = ReportRow['status'];

function slugify(s: string) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function firstLine(s: string) {
  return (s ?? '').split('\n')[0].trim();
}

export function createStepReporter(args: {
  page: Page;
  reportRows: ReportRow[];
  errors: string[];
  sectionName?: string; // default "Flow"
  stopOnError?: boolean; // default true
}) {
  const section = args.sectionName ?? 'Flow';
  const stopOnError = args.stopOnError ?? true;

  let halted = false;

  const push = (field: string, status: StepStatus, expected = 'Step completes', actual = '') => {
    args.reportRows.push({ section, field, expected, actual, status });
  };

  const markSkipped = (name: string) => {
    push(name, 'SKIP', 'Step completes', 'Skipped because a previous step failed.');
  };

  const recordError = async (name: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    const url = (() => {
      try { return args.page.url(); } catch { return '(no page)'; }
    })();

    const shot = `logs/flow_${Date.now()}_${slugify(name)}.png`;
    await args.page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    const compact = (msg ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].trim();


    args.errors.push(`${name}: ${compact}`);
    push(name, 'ERROR', 'Step completes', `${compact} | url=${url} | shot=${shot}`);
  };

  return {
    /** Runs a step; if a prior step failed and stopOnError=true, it marks SKIP. */
    async step(name: string, fn: () => Promise<void>) {
      if (halted) {
        markSkipped(name);
        return false;
      }
      try {
        await fn();
        push(name, 'PASS', 'Step completes', 'OK');
        return true;
      } catch (e) {
        await recordError(name, e);
        if (stopOnError) halted = true;
        return false;
      }
    },

    /** If you want to keep running after errors, set stopOnError=false in createStepReporter. */
    isHalted() {
      return halted;
    },
  };
}
