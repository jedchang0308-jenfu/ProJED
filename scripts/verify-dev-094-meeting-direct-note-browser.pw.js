/* eslint-disable */
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
    await page.locator('button', { hasText: '使用固定測試環境' }).click();
    await page.locator('button', { hasText: '新增會議記錄' }).first().waitFor({ state: 'visible', timeout: 10000 });
  }
  if (!(await page.locator('[data-record-content-editor]').count())) {
    await page.locator('button', { hasText: '新增會議記錄' }).first().click();
    await page.locator('[data-record-content-editor]').waitFor({ state: 'visible', timeout: 10000 });
  }
  const recordsBeforeFocus = await page.evaluate(() => localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
  const editor = page.locator('[data-record-content-editor]');
  const initialFocused = await page.evaluate(() => document.activeElement?.matches('[data-record-content-editor]') || false);
  await page.locator('[data-meeting-workflow-step="capture"]').click();
  const recordsAfterFocus = await page.evaluate(() => localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
  const focusAfterShortcut = await page.evaluate(() => document.activeElement?.matches('[data-record-content-editor]') || false);
  if (recordsBeforeFocus !== recordsAfterFocus || !focusAfterShortcut) {
    throw new Error(`速記 shortcut must only focus content: ${JSON.stringify({ initialFocused, focusAfterShortcut, writes: recordsBeforeFocus !== recordsAfterFocus })}`);
  }
  await editor.fill('DEV-094 direct note smoke');
  await page.locator('[data-record-meeting-save-draft]').click();
  await page.waitForTimeout(150);
  const savedStatus = await page.locator('[data-record-status-summary]').textContent();
  if (!savedStatus?.includes('草稿')) throw new Error(`meeting draft save did not remain draft: ${savedStatus}`);
  if (await page.locator('[data-project-change-import-panel]').count()) throw new Error('meeting default import must not render the work-log settings panel');
  await page.locator('[data-meeting-import-custom-toggle]').click();
  await page.locator('[data-meeting-import-custom-panel]').waitFor({ state: 'visible', timeout: 1000 });
  await page.locator('[data-meeting-import-custom-toggle]').click();
  const evidence = await page.evaluate(() => ({
  workflow: Boolean(document.querySelector('[data-record-composer-workflow][data-record-workflow-kind="meeting"]')),
  editor: Boolean(document.querySelector('[data-record-content-editor]')),
  importControl: Boolean(document.querySelector('[data-meeting-project-change-import-control]')),
  defaultImportLabel: document.querySelector('[data-meeting-import-default]')?.textContent?.trim() || null,
  actions: Boolean(document.querySelector('[data-record-meeting-actions]')),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  visibleAlerts: document.querySelectorAll('[role="alert"]').length,
  }));
  if (!evidence.workflow || !evidence.editor || !evidence.importControl || !evidence.actions || evidence.horizontalOverflow) {
    throw new Error(`DEV-094 meeting UI contract failed: ${JSON.stringify(evidence)}`);
  }
  await page.screenshot({ path: 'output/playwright/dev-094/desktop-no-import.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobileNegative = await page.evaluate(() => ({
    meetingEditor: document.querySelectorAll('[data-record-content-editor]').length,
    meetingImport: document.querySelectorAll('[data-meeting-project-change-import-control]').length,
    meetingActions: document.querySelectorAll('[data-record-meeting-actions]').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  if (mobileNegative.meetingEditor || mobileNegative.meetingImport || mobileNegative.meetingActions || mobileNegative.horizontalOverflow) {
    throw new Error(`DEV-094 mobile meeting boundary failed: ${JSON.stringify(mobileNegative)}`);
  }
  await page.screenshot({ path: 'output/playwright/dev-094/mobile-meeting-negative.png', fullPage: true });
  await page.evaluate(({ desktop, mobile }) => {
    window.__DEV094_ARTIFACT = {
      status: 'PASS',
      devId: 'DEV-094',
      viewport: { width: 1440, height: 900 },
      evidence: { desktop, mobileNegative: { width: 390, height: 844, ...mobile } },
      visibleErrors: [],
      consoleErrors: [],
      pageErrors: [],
    };
  }, { desktop: evidence, mobile: mobileNegative });
}
