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
  if (await page.locator('[data-record-status-summary]').count() !== 0) throw new Error('meeting composer should not render a redundant status summary');
  if (await page.locator('[data-project-change-import-panel]').count()) throw new Error('meeting default import must not render the work-log settings panel');
  const importTrigger = page.locator('[data-meeting-import-trigger]');
  await importTrigger.waitFor({ state: 'visible', timeout: 1000 });
  if ((await importTrigger.textContent())?.trim() !== '匯入專案變化') throw new Error('meeting import first layer should expose one clear entry point');
  const firstLayerBefore = await page.locator('[data-record-content-header]').boundingBox();
  await importTrigger.click();
  const importMenu = page.locator('[data-meeting-import-menu]');
  await importMenu.waitFor({ state: 'visible', timeout: 1000 });
  if (await importMenu.locator('[data-meeting-import-default]').count() !== 1 || await importMenu.locator('[data-meeting-import-custom-toggle]').count() !== 1) {
    throw new Error('meeting import second layer should expose default and custom choices');
  }
  await page.screenshot({ path: 'output/playwright/dev-094/meeting-import-menu-1440x900.png', fullPage: true });
  const firstLayerAfterOpen = await page.locator('[data-record-content-header]').boundingBox();
  if (!firstLayerBefore || !firstLayerAfterOpen || Math.abs(firstLayerBefore.top - firstLayerAfterOpen.top) > 1 || Math.abs(firstLayerBefore.height - firstLayerAfterOpen.height) > 1) {
    throw new Error(`meeting import overlay changed first-layer layout: ${JSON.stringify({ firstLayerBefore, firstLayerAfterOpen })}`);
  }
  await importMenu.locator('[data-meeting-import-custom-toggle]').click();
  await importMenu.locator('[data-meeting-import-custom-panel]').waitFor({ state: 'visible', timeout: 1000 });
  if (await importMenu.locator('[data-meeting-import-default]').count() !== 0 || await importMenu.locator('[data-meeting-import-custom-start]').count() !== 1 || await importMenu.locator('[data-meeting-import-custom-end]').count() !== 1) {
    throw new Error('meeting custom import should open as the second-layer overlay view');
  }
  await page.screenshot({ path: 'output/playwright/dev-094/meeting-import-custom-1440x900.png', fullPage: true });
  await importMenu.locator('[data-meeting-import-custom-back]').click();
  if (await importMenu.locator('[data-meeting-import-custom-toggle]').count() !== 1) throw new Error('meeting import overlay should return to its option list');
  await importMenu.locator('[data-meeting-import-menu-close]').click();
  await importMenu.waitFor({ state: 'hidden', timeout: 1000 });
  await importTrigger.click();
  await importMenu.waitFor({ state: 'visible', timeout: 1000 });
  await importMenu.locator('[data-meeting-import-default]').click();
  await page.waitForFunction(() => {
    const trigger = document.querySelector('[data-meeting-import-trigger]');
    return trigger && !trigger.hasAttribute('disabled');
  }, { timeout: 10000 });
  if (await page.getByText('沒有可帶入的變更。', { exact: true }).count() !== 0) throw new Error('empty meeting import should not render a persistent message');
  const evidence = await page.evaluate(() => ({
  workflow: Boolean(document.querySelector('[data-record-composer-workflow][data-record-workflow-kind="meeting"]')),
  editor: Boolean(document.querySelector('[data-record-content-editor]')),
  importControl: Boolean(document.querySelector('[data-meeting-project-change-import-control]')),
  importTriggerLabel: document.querySelector('[data-meeting-import-trigger]')?.textContent?.trim() || null,
  importMenuClosed: !document.querySelector('[data-meeting-import-menu]'),
  actions: Boolean(document.querySelector('[data-record-meeting-actions]')),
  publishAction: Boolean(document.querySelector('[data-record-meeting-publish]')),
  actionPlacement: (() => {
    const editor = document.querySelector('[data-record-content-editor]')?.getBoundingClientRect();
    const actions = document.querySelector('[data-record-meeting-actions]')?.getBoundingClientRect();
    return editor && actions ? { editorBottom: editor.bottom, actionsTop: actions.top } : null;
  })(),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  visibleAlerts: document.querySelectorAll('[role="alert"]').length,
  }));
  if (!evidence.workflow || !evidence.editor || !evidence.importControl || evidence.importTriggerLabel !== '匯入專案變化' || !evidence.importMenuClosed || !evidence.actions || evidence.publishAction || !evidence.actionPlacement || evidence.actionPlacement.actionsTop < evidence.actionPlacement.editorBottom - 1 || evidence.horizontalOverflow) {
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
