// helpers/compliance-validate.ts
import { expect, Page, Locator } from '@playwright/test';
import { waitForAppIdle } from '../../../../../helpers/page-utils';
import type { ReportRow } from '../../../../../helpers/slack-helper';

export async function gotoComplianceControl(page: Page, baseUrl: string) {
  const url = `${baseUrl}/srec/compliance`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForAppIdle(page);

  await expect(page.getByText('Compliance Control', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function filterByCheckName(page: Page, checkName: string) {
  const searchInput = page.getByPlaceholder(/Search/i).first();
  await expect(searchInput, 'Search input not visible').toBeVisible({ timeout: 15_000 });

  await searchInput.fill('');
  await searchInput.fill(checkName);
  await waitForAppIdle(page);

  await expect(page.getByText(checkName, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
}

export async function openViewDetailsFromRow(page: Page, checkName: string) {
  const row = page.locator('tr', { has: page.getByText(checkName, { exact: false }) }).first();
  await expect(row, `Row for "${checkName}" not found`).toBeVisible({ timeout: 20_000 });

  // 3 dots = Actions button (your DOM had sr-only "Actions")
  const actionsBtn = row.getByRole('button', { name: /Actions/i }).first();
  await expect(actionsBtn, 'Actions (3 dots) button not visible').toBeVisible({ timeout: 15_000 });
  await actionsBtn.click({ force: true });

  const viewDetails = page.getByRole('menuitem', { name: /View Details/i }).first();
  await expect(viewDetails, '"View Details" menu item not visible').toBeVisible({ timeout: 10_000 });
  await viewDetails.click();

  await waitForAppIdle(page);

  await expect(page.getByText(/^View Details$/i).first()).toBeVisible({ timeout: 20_000 });
}

async function expectDetailValue(page: Page, label: RegExp, expected: string | RegExp) {
  const labelEl = page.locator('div.font-semibold').filter({ hasText: label }).first();
  await expect(labelEl, `Label not found: ${label}`).toBeVisible({ timeout: 20_000 });

  const valueEl = labelEl.locator('xpath=following-sibling::*[1]').first();
  await expect(valueEl, `Value not found for label: ${label}`).toBeVisible({ timeout: 20_000 });

  await expect(valueEl).toContainText(expected, { timeout: 20_000 });
}

export async function validatePersonnelCheckViewDetails(
  page: Page,
  input: {
    checkName: string;
    description: string;
    submitterEmail: string;
    frequencyText: RegExp; // e.g. /Special Check\s*\(Ad-?hoc\)/i
  },
) {
  await expectDetailValue(page, /Compliance Check Name/i, input.checkName);
  await expectDetailValue(page, /Description/i, input.description);
  await expectDetailValue(page, /Check Frequency/i, input.frequencyText);

  // keep date flexible (avoid flaky exact date formatting)
  await expectDetailValue(page, /Effective Date/i, /\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/);

  await expectDetailValue(page, /^Submitter$/i, input.submitterEmail);
  await expectDetailValue(page, /^Approver$/i, input.submitterEmail);
}

/**
 * From View Details URL:
 *   https://app.operax.interopera.co/srec/compliance/1554
 * Go to:
 *   https://app.operax.interopera.co/compliance-form/1554
 */
export async function gotoComplianceFormFromViewDetails(page: Page, baseUrl: string) {
  const current = page.url();

  const m =
    current.match(/\/srec\/compliance\/(\d+)(?:\/|\?|#|$)/i) ||
    current.match(/\/compliance\/(\d+)(?:\/|\?|#|$)/i);

  if (!m?.[1]) {
    throw new Error(`Could not extract compliance id from url: ${current}`);
  }

  const id = m[1];
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const formUrl = `${cleanBase}/compliance-form/${id}`;

  await page.goto(formUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppIdle(page);

  await expect(page).toHaveURL(new RegExp(`/compliance-form/${id}(?:[/?#]|$)`, 'i'), {
    timeout: 15_000,
  });

  return { id, formUrl };
}

function basename(filePath: string) {
  return filePath.split(/[/\\]/).pop() || filePath;
}

export async function answerAndSubmitComplianceForm(
  page: Page,
  input: { shortAnswer: string; choiceLabel: 'Yes' | 'No'; uploadFilePath: string },
) {
  const getQuestionCard = (questionTitleRegex: RegExp): Locator => {
    return page
      .getByText(questionTitleRegex)
      .first()
      .locator('xpath=ancestor::div[contains(@class,"border")][1]');
  };

  // ---------- Q1: Short Answer ----------
  const q1Card = getQuestionCard(/^1\.\s*Test short answer question$/i);
  const q1Input = q1Card.getByPlaceholder(/Your answer/i).first();
  await expect(q1Input, 'Short answer input not found').toBeVisible({ timeout: 15_000 });
  await q1Input.fill(input.shortAnswer);

  // ---------- Q2: Multiple Choice (Yes/No) ----------
  const q2Card = getQuestionCard(/^2\.\s*Test multiple choice question$/i);
  const radio = q2Card
    .getByRole('radio', { name: new RegExp(`^${input.choiceLabel}$`, 'i') })
    .first();
  await expect(radio, `Radio "${input.choiceLabel}" not found`).toBeVisible({ timeout: 15_000 });
  await radio.click({ force: true });

  // ---------- Q3: File Upload ----------
  const q3Card = getQuestionCard(/^3\.\s*Test file upload question$/i);

  const fileInput = q3Card.locator('input[type="file"]').first();
  await expect(fileInput, 'File input not found').toBeAttached({ timeout: 15_000 });

  await fileInput.setInputFiles(input.uploadFilePath);

  // best-effort: confirm file name shows in the card
  const fileName = basename(input.uploadFilePath);
  await expect
    .poll(async () => (await q3Card.innerText().catch(() => '')).includes(fileName), {
      timeout: 60_000,
      message: `Uploaded file name "${fileName}" not detected in UI`,
    })
    .toBeTruthy();

  // ---------- Submit ----------
  const submitBtn = page.getByRole('button', { name: /^Submit$/i }).first();
  await expect(submitBtn, 'Submit button not visible').toBeVisible({ timeout: 15_000 });
  await expect(submitBtn, 'Submit button disabled').toBeEnabled({ timeout: 15_000 });

  await submitBtn.click({ force: true });

  // Success signal: redirect OR toast OR success text
  const successToast = page.locator('.ant-message-success, .ant-notification-notice-success').first();
  const successText = page.getByText(/submitted|success|thank you/i).first();

  const ok = await Promise.race([
    page
      .waitForURL(/\/srec\/compliance\/\d+|submitted|success|thank/i, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false),
    successToast
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false),
    successText
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false),
  ]);

  if (!ok) {
    throw new Error('Submit did not show a success signal (no redirect/toast/success text within 30s).');
  }

  await waitForAppIdle(page);
}

// --- ADD THIS: read actual value text from a "label/value" block ---
async function readDetailValue(page: Page, label: RegExp): Promise<string> {
  const labelEl = page.locator('div.font-semibold').filter({ hasText: label }).first();
  await expect(labelEl, `Label not found: ${label}`).toBeVisible({ timeout: 20_000 });

  const valueEl = labelEl.locator('xpath=following-sibling::*[1]').first();
  await expect(valueEl, `Value not found for label: ${label}`).toBeVisible({ timeout: 20_000 });

  const txt = (await valueEl.innerText().catch(() => '')).trim();
  return txt;
}


// --- ADD THIS: validate Overview & return report rows ---
export async function validateOverviewAndCollectReport(
  page: Page,
  input: {
    checkName: string;
    description: string;
    submitterEmail: string;
    frequencyText: RegExp;
  },
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];

  const push = (field: string, expected: string, actual: string, pass: boolean) => {
    rows.push({
      section: 'Overview',
      field,
      expected,
      actual,
      status: pass ? 'PASS' : 'FAIL',
    });
  };

  const nameActual = await readDetailValue(page, /Compliance Check Name/i);
  push('Compliance Check Name', input.checkName, nameActual, nameActual.includes(input.checkName));

  const descActual = await readDetailValue(page, /Description/i);
  push('Description', input.description, descActual, descActual.includes(input.description));

  const freqActual = await readDetailValue(page, /Check Frequency/i);
  push('Check Frequency', input.frequencyText.toString(), freqActual, input.frequencyText.test(freqActual));

  const dateActual = await readDetailValue(page, /Effective Date/i);
  // We keep expected flexible because formatting may vary by locale
  const dateOk = /\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/.test(dateActual) || dateActual.length > 0;
  push('Effective Date', '(non-empty)', dateActual, dateOk);

  const submitterActual = await readDetailValue(page, /^Submitter$/i);
  push('Submitter', input.submitterEmail, submitterActual, submitterActual.includes(input.submitterEmail));

  const approverActual = await readDetailValue(page, /^Approver$/i);
  push('Approver', input.submitterEmail, approverActual, approverActual.includes(input.submitterEmail));

  return rows;
}

// --- ADD THIS: go Documents & Data -> expand -> View -> extract answers -> compare ---
export async function validateDocumentsAndDataAnswersAndCollectReport(
  page: Page,
  input: {
    expected: {
      shortAnswer: string;
      multipleChoice: string; // "Yes"
      uploadedFileName: string; // just the file name
    };
    submitterEmail: string; // marco.palisuan@...
  },
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];
  const push = (field: string, expected: string, actual: string, pass: boolean) => {
    rows.push({
      section: 'Documents & Data',
      field,
      expected,
      actual,
      status: pass ? 'PASS' : 'FAIL',
    });
  };

  // click Documents & Data tab (from your screenshot it's an <a> with href ...tab=documents)
  const docsTab =
    page.getByRole('link', { name: /Documents\s*&\s*Data/i }).first();

  if (await docsTab.isVisible().catch(() => false)) {
    await docsTab.click();
  } else {
    await page.locator('a[href*="tab=documents"]').first().click();
  }

  await waitForAppIdle(page);
  await expect(page.getByText(/Documents\s*&\s*Data/i).first()).toBeVisible({ timeout: 15_000 });

  // expand "No due date" accordion
  const noDue = page
    .locator('div.cursor-pointer')
    .filter({ hasText: /No due date/i })
    .first();

  if (await noDue.isVisible().catch(() => false)) {
    await noDue.click({ force: true });
  } else {
    await page.getByText(/No due date/i).first().click({ force: true });
  }
  await waitForAppIdle(page);

  // expand submitter (marco.palisuan@interopera.co)
  const submitterRow = page
    .locator('div.cursor-pointer')
    .filter({ hasText: new RegExp(input.submitterEmail.replace('.', '\\.'), 'i') })
    .first();

  if (await submitterRow.isVisible().catch(() => false)) {
    await submitterRow.click({ force: true });
  } else {
    await page.getByText(input.submitterEmail, { exact: false }).first().click({ force: true });
  }

  await waitForAppIdle(page);

  // click "View" for the first row in the table
  const firstDataRow = page.locator('table tbody tr').first();
  await expect(firstDataRow, 'No document row found in Documents & Data table').toBeVisible({
    timeout: 20_000,
  });

  const viewBtn =
    firstDataRow.getByRole('button', { name: /^View$/i }).first()
      .or(firstDataRow.getByRole('link', { name: /^View$/i }).first());

  await expect(viewBtn, 'View button not found in document row').toBeVisible({ timeout: 15_000 });
  await viewBtn.click({ force: true });

  // modal: Document Details
  const dialog = page.getByRole('dialog').filter({ hasText: /Document Details/i }).first();
  await expect(dialog, 'Document Details modal not visible').toBeVisible({ timeout: 20_000 });

  // extract Q/A from the table inside modal
  const qaRows = dialog.locator('table tbody tr');
  const count = await qaRows.count();
  if (count === 0) {
    throw new Error('Document Details has no extracted rows.');
  }

  const actualMap: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const tr = qaRows.nth(i);
    const q = (await tr.locator('td').nth(0).innerText().catch(() => '')).trim();
    const a = (await tr.locator('td').nth(1).innerText().catch(() => '')).trim();
    if (q) actualMap[q] = a;
  }

  // Compare expected vs actual
  const shortActual = actualMap['Test short answer question'] ?? '';
  push('Test short answer question', input.expected.shortAnswer, shortActual, shortActual.includes(input.expected.shortAnswer));

  const mcActual = actualMap['Test multiple choice question'] ?? '';
  push('Test multiple choice question', input.expected.multipleChoice, mcActual, mcActual.includes(input.expected.multipleChoice));

  const fileActual = actualMap['Test file upload question'] ?? '';
  push('Test file upload question', input.expected.uploadedFileName, fileActual, fileActual.includes(input.expected.uploadedFileName));

  // close modal
  const closeBtn = dialog.getByRole('button', { name: /Close/i }).first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true });
  }

  return rows;
}