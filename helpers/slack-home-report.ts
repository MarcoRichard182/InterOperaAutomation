// helpers/slack-home-report.ts
import { sendComplianceSlackReport, ReportRow } from './slack-helper';

export async function sendHomeSlackReport(input: {
  envTitle: string;
  rows: ReportRow[];
  errors: string[];
}) {
  // reuse existing sender but with different title + no links
  await sendComplianceSlackReport({
    title: input.envTitle,
    viewDetailsUrl: '(n/a)',
    complianceFormUrl: undefined,
    submitterEmailForMention: process.env.USER_EMAIL,
    rows: input.rows,
    errors: input.errors,
  });
}
