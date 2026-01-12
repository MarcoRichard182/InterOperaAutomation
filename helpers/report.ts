export type ReportStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';

export type ReportRow = {
  section: string;
  field: string;
  expected: string;
  actual: string;
  status: ReportStatus;
};

export type MenuReport = {
  title: string;
  startedAtIso: string;
  finishedAtIso?: string;
  baseUrl?: string;
  meta?: Record<string, string>;
  links?: Record<string, string>;
  rows: ReportRow[];
  errors: string[];
};

export function createMenuReport(title: string, meta: MenuReport['meta'] = {}): MenuReport {
  return {
    title,
    startedAtIso: new Date().toISOString(),
    meta,
    rows: [],
    errors: [],
  };
}

export function pushError(report: MenuReport, where: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  report.errors.push(`${where}: ${msg}`);
  report.rows.push({
    section: 'System',
    field: where,
    expected: 'No error',
    actual: msg,
    status: 'ERROR',
  });
}
