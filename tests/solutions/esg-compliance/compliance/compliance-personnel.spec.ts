import { test, expect, Page, Locator } from '@playwright/test';

import { login } from '../../../../helpers/login-helper';
import { waitForAppIdle } from '../../../../helpers/page-utils';
import { sendComplianceSlackReport, type ReportRow } from '../../../../helpers/slack-helper';
import { createStepReporter } from '../../../../helpers/step-report';

import {
  gotoComplianceControl,
  filterByCheckName,
  openViewDetailsFromRow,
  validatePersonnelCheckViewDetails,
  gotoComplianceFormFromViewDetails,
  answerAndSubmitComplianceForm,
  validateOverviewAndCollectReport,
  validateDocumentsAndDataAnswersAndCollectReport,
} from './helper/compliance-validate';

const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');
const SUBMITTER_EMAIL = process.env.USER_EMAIL || 'marco.palisuan@interopera.co';

// Put your sample file in this path (inside your repo)
const FILE_UPLOAD_SAMPLE_PATH =
  'tests/fixtures/Pemrek Tab-Indah Laruna Prima-EKTP (1).pdf';

/* --------------------- Date picker helpers --------------------- */

async function clickAndWaitForOpenDatepicker(page: Page, dateInput: Locator) {
  const pickerWrapper = dateInput
    .locator('xpath=ancestor::*[contains(@class,"ant-picker")]')
    .first();

  await dateInput.scrollIntoViewIfNeeded();

  if (await pickerWrapper.isVisible().catch(() => false)) {
    await pickerWrapper.click({ force: true });
  } else {
    await dateInput.click({ force: true });
  }

  const openDropdown = page
    .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    .last();

  await expect(openDropdown, 'Datepicker dropdown did not open').toBeVisible({ timeout: 10_000 });
}

async function pickTodayAntd(page: Page, dateInput: Locator) {
  await clickAndWaitForOpenDatepicker(page, dateInput);

  const openDropdown = page
    .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    .last();

  const todayBtn = openDropdown.locator('a.ant-picker-now-btn');
  if (await todayBtn.isVisible().catch(() => false)) {
    await todayBtn.click({ force: true });
  } else {
    const todayCell = openDropdown.locator('td.ant-picker-cell-today').first();
    if (await todayCell.isVisible().catch(() => false)) {
      await todayCell.click({ force: true });
    } else {
      await openDropdown
        .locator('td.ant-picker-cell:not(.ant-picker-cell-disabled)')
        .first()
        .click({ force: true });
    }
  }

  await expect(dateInput, 'Effective Date still empty').not.toHaveValue('', { timeout: 10_000 });
}

/* --------------------- Frequency (native <select>) --------------------- */

async function assignCheckFrequencyAdhoc(page: Page) {
  const freqLabel = page.getByText(/Check Frequency|Frekuensi Pemeriksaan/i).first();
  await expect(freqLabel, 'Frequency label not visible').toBeVisible({ timeout: 15_000 });

  const select = freqLabel.locator('xpath=following::select[1]').first();
  await expect(select, 'Frequency <select> not visible').toBeVisible({ timeout: 15_000 });

  await select.selectOption({ value: 'adhoc' });
  await expect(select, 'Frequency not set to adhoc').toHaveValue('adhoc', { timeout: 10_000 });
}

/* --------------------- Submitter assignment --------------------- */

async function assignSubmitter(page: Page, email: string) {
  const header = page.getByText(/Submitter|Pengirim/i, { exact: false }).first();
  await expect(header, 'Submitter header not visible').toBeVisible({ timeout: 15_000 });

  const container = header
    .locator('xpath=ancestor::div[contains(@class,"border")][1]')
    .first();

  const input = container.locator('input:not([type="hidden"])').first();
  await expect(input, 'Submitter input not visible').toBeVisible({ timeout: 15_000 });

  await input.click({ force: true });
  await input.fill('');
  await input.type(email, { delay: 30 });

  // often confirms suggestion
  await page.keyboard.press('Enter');

  const addBtn = container.getByRole('button', { name: /Add|Tambah/i }).first();
  await expect(addBtn, 'Submitter Add button not visible').toBeVisible({ timeout: 15_000 });
  await addBtn.click();

  await waitForAppIdle(page);

  await expect(container.getByText(email, { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/* --------------------- Navigation helpers --------------------- */

async function gotoCompliance(page: Page) {
  await page.goto(`${BASE}/srec/compliance`, { waitUntil: 'domcontentloaded' });
  await waitForAppIdle(page);

  await expect(page.getByText('Compliance Control', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
}

async function clickCreateNewCheck(page: Page) {
  const plusLink = page.locator('a[href$="/srec/compliance/create"]').first();
  await expect(plusLink).toBeVisible({ timeout: 15_000 });
  await plusLink.click();

  await expect(page).toHaveURL(/\/srec\/compliance\/create/i, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /Create New Check/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function choosePersonnelCheck(page: Page) {
  await page.getByText('Personnel Check', { exact: false }).first().click();

  const continueBtn = page.getByRole('button', { name: /^Continue$/i }).first();
  await expect(continueBtn).toBeVisible({ timeout: 15_000 });
  await continueBtn.click();

  await waitForAppIdle(page);

  await expect(page.getByText(/Personnel Check \(Step 1 of 4\)/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

/* --------------------- Step 1 – Basic Info --------------------- */

async function fillBasicInfoStep(page: Page, checkName: string) {
  const nameInput = page.getByPlaceholder(/Enter Compliance Check Name/i).first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill(checkName);

  const descInput = page.locator('textarea').first();
  await expect(descInput).toBeVisible({ timeout: 15_000 });
  await descInput.fill('Automated test personnel compliance check');

  const dateInput = page.getByPlaceholder(/Select a date|Pilih tanggal/i).first();
  await expect(dateInput).toBeVisible({ timeout: 15_000 });
  await pickTodayAntd(page, dateInput);

  await assignCheckFrequencyAdhoc(page);
  await assignSubmitter(page, SUBMITTER_EMAIL);

  const continueBtn = page.locator('button:visible', { hasText: 'Continue' }).last();
  await expect(continueBtn).toBeVisible({ timeout: 15_000 });
  await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
  await continueBtn.click();

  await waitForAppIdle(page);
  await expect(page.getByText(/Checklist\s*&\s*Task\s*Creation/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

/* --------------------- Step 2 – Questions --------------------- */

async function addQuestionViaModal(
  page: Page,
  type: 'Short Answer' | 'Multiple Choice',
  questionText: string,
) {
  await page.getByRole('button', { name: /Add Question or Task/i }).first().click();

  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  const typeSelect = dialog
    .getByText(/Question Type/i)
    .first()
    .locator('xpath=following::div[contains(@class,"ant-select")][1]')
    .first();

  await typeSelect.click({ force: true });

  const dd = page.locator('.ant-select-dropdown:visible').last();
  await expect(dd).toBeVisible({ timeout: 10_000 });

  await dd
    .locator('.ant-select-item-option-content')
    .filter({ hasText: new RegExp(`^${type}$`, 'i') })
    .first()
    .click({ force: true });

  const qTextarea = dialog.locator('textarea').first();
  await expect(qTextarea).toBeVisible({ timeout: 10_000 });
  await qTextarea.fill(questionText);

  if (type === 'Multiple Choice') {
    const opt1 = dialog.getByPlaceholder(/Option 1/i).first();
    const opt2 = dialog.getByPlaceholder(/Option 2/i).first();
    if (await opt1.isVisible().catch(() => false)) await opt1.fill('Option A');
    if (await opt2.isVisible().catch(() => false)) await opt2.fill('Option B');
  }

  const okBtn = dialog.getByRole('button', { name: /^OK$/i }).first();
  await expect(okBtn).toBeEnabled({ timeout: 10_000 });
  await okBtn.click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await waitForAppIdle(page);

  await expect(page.getByText(questionText, { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function addFileUploadQuestion(page: Page, questionText: string, filePath: string) {
  // open modal
  await page.getByRole('button', { name: /Add Question or Task/i }).first().click();

  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // select Question Type = File Upload (AntD select)
  const typeSelect = dialog
    .getByText(/Question Type/i)
    .first()
    .locator('xpath=following::div[contains(@class,"ant-select")][1]')
    .first();

  await expect(typeSelect).toBeVisible({ timeout: 10_000 });
  await typeSelect.click({ force: true });

  const dd = page.locator('.ant-select-dropdown:visible').last();
  await expect(dd).toBeVisible({ timeout: 10_000 });

  await dd
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^File Upload$/i })
    .first()
    .click({ force: true });

  // fill question textarea
  const qTextarea = dialog.locator('textarea').first();
  await expect(qTextarea).toBeVisible({ timeout: 10_000 });
  await qTextarea.fill(questionText);

  // ---------- helpers ----------
  const getFieldsFound = async (): Promise<number> => {
    const loc = dialog.getByText(/fields?\s+found/i).first();
    const txt = await loc.innerText().catch(() => '');
    const m = txt.match(/(\d+)\s*fields?\s*found/i);
    return m ? parseInt(m[1], 10) : 0;
  };

  const clickUploadAreaAndChooseFile = async () => {
    // Click the visible upload area (NOT drag)
    const uploadArea = dialog
      .getByText(/Click or drag file to this area to upload/i)
      .first()
      .locator('xpath=ancestor::label[1]');

    // Some builds might not wrap in <label>, so fallback to the dashed container
    const uploadFallback = dialog
      .locator('label')
      .filter({ hasText: /Click or drag file to this area to upload/i })
      .first();

    const target = (await uploadArea.count()) ? uploadArea : uploadFallback;

    // Try real file chooser (most "human" way)
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5_000 }),
        target.click({ force: true }),
      ]);
      await chooser.setFiles(filePath);
      return;
    } catch {
      // Fallback: directly set on the hidden input
      const input = dialog.locator('input[type="file"]').first();
      await expect(input).toBeAttached({ timeout: 10_000 });
      await input.setInputFiles(filePath);
    }
  };

  const waitForDetectionOrFail = async (timeoutMs: number) => {
    // ensure the detection section is there
    await expect(dialog.getByText(/AI detected these fields/i).first()).toBeVisible({
      timeout: 60_000,
    });

    // wait until fields found >= 3, or timeout
    await expect
      .poll(async () => await getFieldsFound(), {
        timeout: timeoutMs,
        message: 'Detection did not produce enough fields.',
      })
      .toBeGreaterThanOrEqual(3);
  };

  const clickFirstNDetectedFields = async (n: number) => {
    // Detected field pills are those blue-ish buttons with class text-xs
    const pills = dialog.locator('button.text-xs');

    await expect
      .poll(async () => await pills.count(), {
        timeout: 60_000,
        message: 'Detected field pills did not render.',
      })
      .toBeGreaterThanOrEqual(n);

    for (let i = 0; i < n; i++) {
      await pills.nth(i).click();
    }
  };

  // ---------- upload with retry (double upload) ----------
  let success = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await clickUploadAreaAndChooseFile();

    // small kick-off delay so UI enters processing state
    await page.waitForTimeout(800);

    try {
      // wait up to 50s per attempt for detection to return >= 3 fields
      await waitForDetectionOrFail(50_000);
      success = true;
      break;
    } catch {
      // If still 0 fields found, retry once more
      const found = await getFieldsFound().catch(() => 0);
      if (attempt === 1 && found < 3) {
        await page.waitForTimeout(1000);
        continue;
      }
      throw new Error(`File upload detection failed after ${attempt} attempt(s). fieldsFound=${found}`);
    }
  }

  if (!success) {
    throw new Error('File upload detection failed (unknown reason).');
  }

  // choose 3 detected fields
  await clickFirstNDetectedFields(3);

  // click OK
  const okBtn = dialog.getByRole('button', { name: /^OK$/i }).first();
  await expect(okBtn).toBeVisible({ timeout: 10_000 });
  await expect(okBtn).toBeEnabled({ timeout: 60_000 });
  await okBtn.click();

  // modal closes
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await waitForAppIdle(page);

  // sanity: question appears on the page
  await expect(page.getByText(questionText, { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function completeChecklistStep(
  page: Page,
  reportRows: ReportRow[],
  errors: string[],
  filePath: string,
) {
  const section = 'Checklist & Task Creation';

  // Q1
  try {
    await addQuestionViaModal(page, 'Short Answer', 'Test short answer question');
    reportRows.push({
      section,
      field: 'Add Question: Short Answer',
      expected: 'Question is added',
      actual: 'OK',
      status: 'PASS',
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    errors.push(`Add Question: Short Answer: ${msg}`);
    reportRows.push({
      section,
      field: 'Add Question: Short Answer',
      expected: 'Question is added',
      actual: msg,
      status: 'ERROR',
    });
  }

  // Q2
  try {
    await addQuestionViaModal(page, 'Multiple Choice', 'Test multiple choice question');
    reportRows.push({
      section,
      field: 'Add Question: Multiple Choice',
      expected: 'Question is added',
      actual: 'OK',
      status: 'PASS',
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    errors.push(`Add Question: Multiple Choice: ${msg}`);
    reportRows.push({
      section,
      field: 'Add Question: Multiple Choice',
      expected: 'Question is added',
      actual: msg,
      status: 'ERROR',
    });
  }

  // Q3 (File Upload) — must be ERROR if fails
  try {
    await addFileUploadQuestion(page, 'Test file upload question', filePath);

    reportRows.push({
      section,
      field: 'Add Question: File Upload',
      expected: 'File Upload question added + AI detects fields',
      actual: 'OK',
      status: 'PASS',
    });
  } catch (e: any) {
    const msg = e?.message || String(e);

    errors.push(`Add Question: File Upload: ${msg}`);
    reportRows.push({
      section,
      field: 'Add Question: File Upload',
      expected: 'File Upload question added + AI detects fields',
      actual: msg,
      status: 'ERROR',
    });

    // IMPORTANT: do not throw here; we want the run to continue and still send Slack report
  }

  // Continue (best-effort)
  const continueBtn = page.locator('button:visible', { hasText: 'Continue' }).last();
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click().catch(() => {});
    await waitForAppIdle(page);

    // Don't hard fail here; just try to see if it moved forward
    await page.getByText(/Rules & Verifications/i).first().isVisible().catch(() => {});
  }
}



/* --------------------- Step 3 – Rules --------------------- */

async function skipRulesStep(page: Page) {
  const continueBtn = page.getByRole('button', { name: /^Continue$/i }).first();
  await expect(continueBtn, 'Continue button (Step 3) not visible').toBeVisible({ timeout: 15_000 });
  await expect(continueBtn, 'Continue button (Step 3) is disabled').toBeEnabled({ timeout: 15_000 });

  await continueBtn.click();
  await waitForAppIdle(page);

  await expect(
    page.getByText(/Personnel Check \(Step 4 of 4\)|Email Notification|Notify Submitter/i).first(),
  ).toBeVisible({ timeout: 20_000 });
}

/* --------------------- Step 4 – Notifications & Publish --------------------- */

async function configureNotificationsAndPublish(page: Page) {
  await expect(
    page.getByText(/Personnel Check \(Step 4 of 4\)|Email Notification/i).first(),
  ).toBeVisible({ timeout: 20_000 });

  async function turnOn(id: 'notify-submitter' | 'notify-creator' | 'notify-reviewer') {
    const input = page.locator(`input#${id}`);
    await expect(input, `Toggle input #${id} not found`).toBeVisible({ timeout: 15_000 });

    if (await input.isChecked().catch(() => false)) return;

    const label = page.locator(`label[for="${id}"]`).first();
    await expect(label, `Label for #${id} not found`).toBeVisible({ timeout: 15_000 });
    await label.scrollIntoViewIfNeeded();

    await label.click({ force: true });

    if (!(await input.isChecked().catch(() => false))) {
      await page.evaluate((toggleId) => {
        const el = document.querySelector(`label[for="${toggleId}"]`) as HTMLElement | null;
        if (el) el.click();
      }, id);
    }

    await expect(input, `Toggle #${id} still OFF after clicking`).toBeChecked({ timeout: 10_000 });
  }

  await turnOn('notify-submitter');
  await turnOn('notify-creator');
  await turnOn('notify-reviewer');

  const publishBtn = page.getByRole('button', { name: /^Publish$/i }).first();
  await expect(publishBtn, 'Publish button not visible').toBeVisible({ timeout: 15_000 });
  await expect(publishBtn, 'Publish button disabled').toBeEnabled({ timeout: 15_000 });

  await publishBtn.scrollIntoViewIfNeeded();
  await publishBtn.click({ force: true });
  await waitForAppIdle(page);
}

/* --------------------- Post-check: verify row --------------------- */

async function assertComplianceCreated(page: Page, checkName: string) {
  await expect(page.getByText('Compliance Control', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });

  const searchInput = page.getByPlaceholder('Search').first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('');
    await searchInput.fill(checkName);
  }

  await waitForAppIdle(page);

  await expect(page.getByText(checkName, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
}

async function recordError(
  page: any,
  reportRows: any[],
  errors: string[],
  section: string,
  field: string,
  err: any
) {
  const msg = err?.message || String(err);
  const url = (() => {
    try { return page.url(); } catch { return '(no page)'; }
  })();

  // optional screenshot
  const shotPath = `logs/${section.replace(/\W+/g,'_')}_${Date.now()}.png`;
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

  errors.push(`${section} > ${field}: ${msg}`);

  reportRows.push({
    section,
    field,
    expected: 'No error',
    actual: `${msg.split('\n')[0]} | url=${url} | shot=${shotPath}`,
    status: 'ERROR',
  });
}


/* --------------------- Main test --------------------- */

test.describe('Compliance – create Personnel Check end-to-end', () => {
  test('create personnel compliance check end-to-end', async ({ page }) => {
    const reportRows: ReportRow[] = [];
    const errors: string[] = [];

    const flow = createStepReporter({ page, reportRows, errors, sectionName: 'Flow', stopOnError: true });

    const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');
    const SUBMITTER_EMAIL = process.env.USER_EMAIL || 'marco.palisuan@interopera.co';
    const FILE_UPLOAD_SAMPLE_PATH =
      process.env.FILE_TO_UPLOAD ||
      'tests/fixtures/Pemrek Tab-Indah Laruna Prima-EKTP (1).pdf';

    let checkName = '';
    let viewDetailsUrl = '(not reached)';
    let complianceFormUrl = '(not reached)';

    try {
      // ---- FLOW CHECKLIST (simple & readable in Slack) ----
      await flow.step('Login', async () => login(page));

      checkName =
        'Auto Personnel Check ' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

      await flow.step('Open Compliance Control', async () => gotoCompliance(page));
      await flow.step('Click Create New Check', async () => clickCreateNewCheck(page));
      await flow.step('Select Personnel Check', async () => choosePersonnelCheck(page));
      await flow.step('Fill Basic Info', async () => fillBasicInfoStep(page, checkName));

      await flow.step('Add Questions (Checklist)', async () =>
        completeChecklistStep(page, reportRows, errors, FILE_UPLOAD_SAMPLE_PATH),
      );

      await flow.step('Skip Rules', async () => skipRulesStep(page));
      await flow.step('Configure Notifications + Publish', async () => configureNotificationsAndPublish(page));
      await flow.step('Verify Check appears in list', async () => assertComplianceCreated(page, checkName));

      // ---- The rest (detailed validations) ----
      await flow.step('Open View Details', async () => {
        await gotoComplianceControl(page, BASE);
        await filterByCheckName(page, checkName);
        await openViewDetailsFromRow(page, checkName);
      });

      await flow.step('Validate View Details Summary', async () => {
        await validatePersonnelCheckViewDetails(page, {
          checkName,
          description: 'Automated test personnel compliance check',
          submitterEmail: SUBMITTER_EMAIL,
          frequencyText: /Special Check\s*\(Ad-?hoc\)/i,
        });
      });

      await flow.step('Open Compliance Form', async () => {
        const { id: complianceId, formUrl } = await gotoComplianceFormFromViewDetails(page, BASE);
        complianceFormUrl = formUrl;
        viewDetailsUrl = `${BASE}/srec/compliance/${complianceId}`;
      });

      await flow.step('Submit Form Answers', async () => {
        await answerAndSubmitComplianceForm(page, {
          shortAnswer: 'this is the short answer',
          choiceLabel: 'Yes',
          uploadFilePath: FILE_UPLOAD_SAMPLE_PATH,
        });
      });

      await flow.step('Re-open View Details', async () => {
        await page.goto(viewDetailsUrl, { waitUntil: 'domcontentloaded' });
        await waitForAppIdle(page);
        await expect(page.getByText(/^View Details$/i).first()).toBeVisible({ timeout: 20_000 });
      });

      // Detailed rows (overview + documents)
      await flow.step('Validate Overview + Documents & Data', async () => {
        // Overview
        try {
          const overviewRows = await validateOverviewAndCollectReport(page, {
            checkName,
            description: 'Automated test personnel compliance check',
            submitterEmail: SUBMITTER_EMAIL,
            frequencyText: /Special Check\s*\(Ad-?hoc\)/i,
          });
          reportRows.push(...overviewRows);
        } catch (e: any) {
          errors.push(`Overview validation failed: ${e?.message || e}`);
          reportRows.push({
            section: 'Overview',
            field: 'Overview Validation',
            expected: 'All overview fields match',
            actual: e?.message || String(e),
            status: 'ERROR',
          });
        }

        // Documents & Data
        try {
          const fileNameOnly =
            FILE_UPLOAD_SAMPLE_PATH.split(/[/\\]/).pop() || FILE_UPLOAD_SAMPLE_PATH;

          const docRows = await validateDocumentsAndDataAnswersAndCollectReport(page, {
            submitterEmail: SUBMITTER_EMAIL,
            expected: {
              shortAnswer: 'this is the short answer',
              multipleChoice: 'Yes',
              uploadedFileName: fileNameOnly,
            },
          });
          reportRows.push(...docRows);
        } catch (e: any) {
          errors.push(`Documents & Data validation failed: ${e?.message || e}`);
          reportRows.push({
            section: 'Documents & Data',
            field: 'Documents & Data Validation',
            expected: 'Extracted answers match submitted answers',
            actual: e?.message || String(e),
            status: 'ERROR',
          });
        }
      });
    } catch (e: any) {
      // Only true “fatal” errors land here (Flow already records step error + screenshot)
      const msg = e?.message || String(e);
      errors.push(`Fatal error: ${msg}`);

      reportRows.push({
        section: 'System',
        field: 'Fatal',
        expected: 'No fatal error',
        actual: msg,
        status: 'ERROR',
      });

      throw e; // keep test red in CI
    } finally {
      await sendComplianceSlackReport({
        title: 'Compliance Personnel Check - Automation Report',
        viewDetailsUrl,
        complianceFormUrl,
        submitterEmailForMention: SUBMITTER_EMAIL,
        rows: reportRows,
        errors,
      });
    }
  });
});

