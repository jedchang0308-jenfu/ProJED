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

  const expandProjectImport = async (stepSelector, label) => {
    assert((await page.locator('[data-project-change-import-panel]').count()) === 0, `${label} should default-collapse project import panel`);
    await page.locator(stepSelector).first().click();
    await page.locator('[data-project-change-import-panel]').waitFor({ state: 'visible', timeout: 10000 });
    const panelInsideWorkflow = await page.evaluate(() => {
      const workflow = document.querySelector('[data-record-composer-workflow]');
      return Boolean(workflow?.querySelector('[data-project-change-import-panel]'));
    });
    assert(panelInsideWorkflow, `${label} should expand project import panel inside workflow card`);
  };

  await openApp({ width: 1440, height: 950 });

  assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 1, 'topbar should expose meeting entry');
  assert((await page.locator('nav button', { hasText: '新增個人紀錄' }).count()) === 1, 'topbar should expose work log entry');
  assert((await page.locator('button', { hasText: '紀錄庫(開發中)' }).count()) === 0, 'records tab should not be marked as in-development');

  await page.locator('nav button', { hasText: '新增個人紀錄' }).click();
  await page.locator('[data-record-context-summary]').waitFor({ state: 'attached', timeout: 10000 });

  assert((await page.locator('[data-record-composer-shell]').count()) === 1, 'work log should use the shared composer shell');
  assert((await page.locator('[data-record-composer-header]').count()) === 1, 'work log should use the shared composer header');
  assert((await page.locator('[data-record-composer-close]').count()) === 1, 'work log should expose the shared close tool slot');
  assert((await page.locator('[data-record-composer-close][aria-label="離開紀錄"]').count()) === 1, 'work log close control should use the unified exit record name');
  assert((await page.locator('[data-record-composer-summary]').count()) === 1, 'work log should show the shared composer summary');
  assert((await page.locator('[data-record-composer-linked-tasks] button', { hasText: '選取任務' }).count()) === 1, 'work log should use the unified linked-task action label');
  assert((await page.locator('[data-meeting-workflow-arrow-stepper]').count()) === 0, 'work log should not show meeting workflow');
  assert((await page.locator('[data-record-workflow-kind="work-log"]').count()) === 1, 'work log should show the work-log workflow card');
  assert((await page.locator('[data-work-log-workflow-step]').count()) === 4, 'work log workflow should show import/write/save/publish steps');
  assert((await page.locator('[data-work-log-workflow-step="project_import"]').count()) === 1, 'work log workflow should include project import step');
  await assertWorkflowOrder('DEV-020 work log composer order');
  await expandProjectImport('[data-work-log-workflow-step="project_import"]', 'DEV-020 work log project import');
  assert((await page.locator('nav [data-active-record-kind="work-log"]', { hasText: '紀錄中' }).count()) === 1, 'topbar should show compact active record state while work log is open');
  assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 0, 'topbar should hide meeting entry while work log is open');
  assert((await page.locator('nav button', { hasText: '新增個人紀錄' }).count()) === 0, 'topbar should hide duplicate work log creation while editing a record');
  assert((await page.locator('[data-record-sidebar-header] button', { hasText: '新增個人紀錄' }).count()) === 0, 'sidebar header should not duplicate work log creation');
  assert((await page.locator('[data-record-sidebar-header] button', { hasText: '新增會後會議紀錄' }).count()) === 0, 'sidebar header should not duplicate meeting record creation');
  assert((await page.locator('[data-project-change-import-panel] input[type="date"]').count()) === 2, 'project change import should use explicit date range');
  assert((await page.locator('[data-project-change-import-panel] button', { hasText: '整個看板' }).count()) === 1, 'project change import should support board scope');
  assert((await page.locator('[data-project-change-import-panel] button', { hasText: '整個工作區' }).count()) === 1, 'project change import should support workspace scope');
  assert((await page.locator('[data-project-change-import-panel] button', { hasText: '最近 24 小時' }).count()) === 0, 'project change import should not expose quick range chips');

  await page.locator('button[aria-label="紀錄功能說明"]').click();
  await page.locator('[data-record-help-dialog]').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('[data-record-help-dialog]', { hasText: '使用流程' }).count()) === 1, 'help dialog should include flow guide');
  assert((await page.locator('[data-record-help-dialog]', { hasText: '專案變化匯入' }).count()) === 1, 'help dialog should explain project change import');
  await page.locator('[data-record-help-dialog] button[title="關閉功能說明"]').click();
  await page.locator('[data-record-help-dialog]').waitFor({ state: 'hidden', timeout: 10000 });

  const titleInput = page.locator('aside label', { hasText: '標題' }).locator('input').first();
  await titleInput.fill('DEV-020 未儲存測試');
  await page.locator('[data-record-composer-close]').click();
  await page.locator('.global-dialog-content').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('.global-dialog-content', { hasText: '離開紀錄？' }).count()) === 1, 'dirty work log exit should use unified exit record dialog title');
  assert((await page.locator('.global-dialog-content button', { hasText: '存草稿後繼續' }).count()) === 1, 'dirty work log exit should offer save and continue');
  assert((await page.locator('.global-dialog-content button', { hasText: '不儲存，繼續' }).count()) === 1, 'dirty work log exit should offer continue without saving');
  assert((await page.locator('.global-dialog-content button', { hasText: '取消' }).count()) === 1, 'dirty work log exit should offer cancel');
  await page.locator('.global-dialog-content button', { hasText: '取消' }).click();
  await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
  assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 0, 'canceling dirty work log exit should keep meeting entry hidden');

  await page.locator('[data-record-composer-close]').click();
  await page.locator('.global-dialog-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.global-dialog-content button', { hasText: '不儲存，繼續' }).click();
  await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });
  await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 10000 });
  assert((await page.locator('nav button', { hasText: '新增會議記錄' }).count()) === 1, 'topbar should restore meeting entry after leaving work log');
  assert((await page.locator('nav button', { hasText: '新增個人紀錄' }).count()) === 1, 'topbar should restore work log entry after leaving work log');

  await assertNoHorizontalOverflow('DEV-020 1440x950 work log workflow');
  await page.screenshot({ path: 'output/playwright/dev-020-record-workflow-1440.png', fullPage: true });

  await openApp({ width: 1024, height: 768 });
  if ((await page.locator('[data-work-log-workflow-step="project_import"]').count()) === 0) {
    await page.locator('nav button', { hasText: '新增個人紀錄' }).click();
  }
  if ((await page.locator('[data-project-change-import-panel]').count()) === 0) {
    await page.locator('[data-work-log-workflow-step="project_import"]').first().click();
  }
  await page.locator('[data-project-change-import-panel]').waitFor({ state: 'visible', timeout: 10000 });
  await assertNoHorizontalOverflow('DEV-020 1024x768 project change import');
  await page.screenshot({ path: 'output/playwright/dev-020-record-workflow-1024.png', fullPage: true });

  await openApp({ width: 1280, height: 800 });
  await page.locator('nav button', { hasText: '新增會議記錄' }).click();
  await page.locator('[data-record-composer-close][aria-label="離開紀錄"]').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('nav [data-active-record-kind="meeting"]', { hasText: '紀錄中' }).count()) === 1, 'topbar should immediately switch to compact active record state while meeting note is open');
  assert((await page.locator('nav button', { hasText: '離開會議' }).count()) === 0, 'topbar should not expose leave meeting while meeting note is open');
  assert((await page.locator('[data-record-workflow-kind="meeting"]').count()) === 1, 'meeting should show the meeting workflow card');
  assert((await page.locator('[data-meeting-workflow-step]').count()) === 5, 'meeting workflow should show import/capture/AI/review/publish steps');
  await assertWorkflowOrder('DEV-020 meeting composer order');
  await expandProjectImport('[data-meeting-workflow-step="project_import"]', 'DEV-020 meeting project import');
  const meetingTitleInput = page.locator('aside label', { hasText: '標題' }).locator('input').first();
  await meetingTitleInput.fill('DEV-020 會議離開測試');
  await page.locator('[data-record-composer-close]').click();
  await page.locator('.global-dialog-content').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('.global-dialog-content', { hasText: '離開會議模式？' }).count()) === 1, 'dirty meeting exit should keep meeting-mode guard title');
  assert((await page.locator('.global-dialog-content', { hasText: /不會發布|不保存新變更/ }).count()) === 1, 'dirty meeting exit should explain that exit does not publish or save new changes');
  assert((await page.locator('.global-dialog-content button', { hasText: '存草稿後離開' }).count()) === 1, 'dirty meeting exit should offer save and exit');
  assert((await page.locator('.global-dialog-content button', { hasText: '直接離開' }).count()) === 1, 'dirty meeting exit should offer exit without saving');
  assert((await page.locator('.global-dialog-content button', { hasText: '取消' }).count()) === 1, 'dirty meeting exit should offer cancel');
  await page.locator('.global-dialog-content button', { hasText: '取消' }).click();
  await page.locator('.global-dialog-content').waitFor({ state: 'hidden', timeout: 10000 });

  return {
    passed: true,
    screenshots: [
      'output/playwright/dev-020-record-workflow-1440.png',
      'output/playwright/dev-020-record-workflow-1024.png',
    ],
  };
}
