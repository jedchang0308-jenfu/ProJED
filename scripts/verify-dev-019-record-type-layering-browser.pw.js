/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
      await page.locator('button', { hasText: '使用固定測試環境' }).click();
      await page.locator('button', { hasText: /新增會議記錄|紀錄庫/ }).first().waitFor({ state: 'visible', timeout: 10000 });
    }
  };

  const assertNoHorizontalOverflow = async (label) => {
    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
    }));
    assert(
      overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1 &&
        overflow.rootScrollWidth <= overflow.rootClientWidth + 1,
      `${label} should not have horizontal overflow`,
      overflow,
    );
  };

  const assertWorkflowOrder = async (label) => {
    const orderOk = await page.evaluate(() => {
      const summary = document.querySelector('[data-record-context-summary]');
      const workflow = document.querySelector('[data-record-composer-workflow]');
      if (!summary || !workflow) return false;
      return Boolean(
        summary.compareDocumentPosition(workflow) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    });
    assert(orderOk, `${label} should render summary before workflow`);
  };

  const assertProjectImportPanelInsideWorkflow = async (stepSelector, label) => {
    assert((await page.locator('[data-project-change-import-panel]').count()) === 0, `${label} should default-collapse project import panel`);
    await page.locator(stepSelector).first().click();
    await page.locator('[data-project-change-import-panel]').waitFor({ state: 'visible', timeout: 10000 });
    const panelInsideWorkflow = await page.evaluate(() => {
      const workflow = document.querySelector('[data-record-composer-workflow]');
      return Boolean(workflow?.querySelector('[data-project-change-import-panel]'));
    });
    assert(panelInsideWorkflow, `${label} should expand project import panel inside workflow card`);
  };

  const openMeetingMode = async () => {
    const meetingButton = page.locator('nav button', { hasText: /新增會議記錄|會議紀錄/ }).first();
    assert((await meetingButton.count()) === 1, 'meeting mode topbar button should exist');
    await meetingButton.click();
    await page.locator('[data-record-type-state="meeting-mode-locked"]').waitFor({ state: 'attached', timeout: 10000 });
  };

  const inspectMeetingMode = async (viewport, screenshot) => {
    await openApp(viewport);
    await openMeetingMode();
    assert((await page.locator('[data-record-composer-shell]').count()) === 1, 'meeting mode should use the shared record composer shell');
    assert((await page.locator('[data-record-composer-header]').count()) === 1, 'meeting mode should use the shared composer header');
    assert((await page.locator('[data-record-composer-close]').count()) === 1, 'meeting mode should expose the same close/exit control slot');
    assert((await page.locator('[data-record-composer-close][aria-label="離開紀錄"]').count()) === 1, 'meeting close control should use the unified exit record name');
    assert((await page.locator('[data-record-type-state="meeting-mode-locked"]').count()) === 1, 'meeting mode should show a locked meeting record type summary');
    assert((await page.locator('[data-record-context-summary]').count()) === 1, 'meeting mode should show the shared record context summary');
    assert((await page.locator('[data-record-composer-summary]').count()) === 1, 'meeting mode should expose the shared composer summary selector');
    assert((await page.locator('[data-record-composer-workflow]').count()) === 1, 'meeting mode should show the meeting workflow in the shared workflow slot');
    assert((await page.locator('[data-record-workflow-kind="meeting"]').count()) === 1, 'meeting mode should mark meeting workflow kind');
    assert((await page.locator('[data-meeting-workflow-step]').count()) === 5, 'meeting workflow should show five step buttons');
    assert((await page.locator('[data-meeting-workflow-step="project_import"][data-meeting-workflow-step-optional="true"]').count()) === 1, 'meeting workflow should include optional project import step');
    assert((await page.locator('[data-meeting-workflow-step="ai_suggestion"][data-meeting-workflow-step-optional="true"]').count()) === 1, 'AI整理 step should be optional');
    assert((await page.locator('nav [data-active-record-kind="meeting"]', { hasText: '紀錄中' }).count()) === 1, 'meeting mode should show compact active record state in topbar');
    assert((await page.locator('nav button', { hasText: '離開會議' }).count()) === 0, 'meeting mode should not expose leave meeting as a topbar action');
    await assertWorkflowOrder(`meeting mode ${viewport.width}x${viewport.height}`);
    await assertProjectImportPanelInsideWorkflow('[data-meeting-workflow-step="project_import"]', `meeting mode ${viewport.width}x${viewport.height}`);
    await assertNoHorizontalOverflow(`meeting mode ${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 10000 });
    assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 1, 'closing meeting mode should return to the meeting entry in one click');
  };

  const inspectWorkLogMode = async (viewport, screenshot) => {
    await openApp(viewport);
    const recordsButton = page.locator('button', { hasText: '紀錄庫' }).first();
    if ((await recordsButton.count()) > 0) await recordsButton.click();
    const addWorkLog = page.locator('button', { hasText: '新增個人紀錄' }).first();
    if ((await addWorkLog.count()) === 0) {
      await page.locator('main button, aside button', { hasText: /工作紀錄|個人工作紀錄/ }).first().click();
    } else {
      await addWorkLog.click();
    }
    await page.locator('[data-record-context-summary]').waitFor({ state: 'attached', timeout: 10000 });
    await page.locator('[data-record-type-state="draft-type-locked"]').waitFor({ state: 'attached', timeout: 10000 });
    assert((await page.locator('[data-record-composer-shell]').count()) === 1, 'work log mode should use the shared record composer shell');
    assert((await page.locator('[data-record-composer-header]').count()) === 1, 'work log mode should use the shared composer header');
    assert((await page.locator('[data-record-composer-close]').count()) === 1, 'work log mode should expose the same close control slot');
    assert((await page.locator('[data-record-composer-close][aria-label="離開紀錄"]').count()) === 1, 'work log close control should use the unified exit record name');
    assert((await page.locator('[data-record-composer-summary]').count()) === 1, 'work log mode should expose the shared composer summary selector');
    assert((await page.locator('[data-record-composer-meta]').count()) === 1, 'work log mode should expose the shared metadata section');
    assert((await page.locator('[data-record-composer-linked-tasks]').count()) === 1, 'work log mode should expose the shared linked-task section');
    assert((await page.locator('[data-record-composer-actions]').count()) === 1, 'work log mode should expose one shared action area');
    assert((await page.locator('[data-record-workflow-kind="work-log"]').count()) === 1, 'work log mode should mark work-log workflow kind');
    assert((await page.locator('[data-work-log-workflow-step]').count()) === 4, 'work log workflow should show four steps');
    assert((await page.locator('[data-work-log-workflow-step="project_import"][data-work-log-workflow-step-optional="true"]').count()) === 1, 'work log workflow should include optional project import step');
    assert((await page.locator('[data-work-log-workflow-step="write"]').count()) === 1, 'work log workflow should include write step');
    assert((await page.locator('[data-work-log-workflow-step="save"]').count()) === 1, 'work log workflow should include save draft step');
    assert((await page.locator('[data-work-log-workflow-step="publish"]').count()) === 1, 'work log workflow should include publish step');
    assert((await page.locator('[data-record-type-option]').count()) === 0, 'record type should not be changeable after drafting starts');
    assert((await page.locator('[data-meeting-workflow-arrow-stepper]').count()) === 0, 'work log mode should not show meeting workflow');
    assert((await page.locator('nav [data-active-record-kind="work-log"]', { hasText: '紀錄中' }).count()) === 1, 'work log mode should show compact active record state in topbar');
    assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 0, 'work log mode should hide meeting entry in topbar');
    await assertWorkflowOrder(`work log mode ${viewport.width}x${viewport.height}`);
    await assertProjectImportPanelInsideWorkflow('[data-work-log-workflow-step="project_import"]', `work log mode ${viewport.width}x${viewport.height}`);
    await assertNoHorizontalOverflow(`work log mode ${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: screenshot, fullPage: true });
  };

  await inspectMeetingMode({ width: 1024, height: 768 }, 'output/playwright/dev-019-meeting-1024.png');
  await inspectMeetingMode({ width: 1440, height: 950 }, 'output/playwright/dev-019-meeting-1440.png');
  await inspectWorkLogMode({ width: 1440, height: 950 }, 'output/playwright/dev-019-work-log-1440.png');

  return {
    passed: true,
    screenshots: [
      'output/playwright/dev-019-meeting-1024.png',
      'output/playwright/dev-019-meeting-1440.png',
      'output/playwright/dev-019-work-log-1440.png',
    ],
  };
}
