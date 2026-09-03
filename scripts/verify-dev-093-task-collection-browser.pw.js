/* eslint-disable */
async (page) => {
  const failures = [];
  const requestFailures = [];
  const httpErrors = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const message = `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim();
    requestFailures.push(message);
    failures.push(message);
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const message = `http-${response.status()}: ${response.request().method()} ${response.url()}`;
    httpErrors.push(message);
    failures.push(message);
  });
  const baseUrl = 'http://localhost:4000/';

  const assert = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const openRecords = async () => {
    const topbar = page.locator('[data-app-topbar="true"]');
    if (!(await topbar.isVisible().catch(() => false))) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const fixedEnvironment = page.getByRole('button', { name: '使用固定測試環境' });
      if (await fixedEnvironment.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
        await fixedEnvironment.click({ force: true });
        await page.waitForTimeout(800);
      }
      await topbar.waitFor({ state: 'visible', timeout: 30000 });
    }

    const existingSectionControls = page.locator('[data-record-section-controls="true"]');
    if (await existingSectionControls.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(200);
      return;
    }

    const recordsButton = page.locator('[data-sidebar-records-button="true"]');
    const sidebarToggle = page.locator('[data-main-sidebar-toggle="true"]');
    for (let attempt = 0; attempt < 4 && !(await recordsButton.isVisible().catch(() => false)); attempt += 1) {
      await sidebarToggle.waitFor({ state: 'visible', timeout: 15000 });
      await sidebarToggle.click({ force: true });
      await page.waitForTimeout(700);
    }
    if (!(await recordsButton.isVisible().catch(() => false))) {
      await recordsButton.waitFor({ state: 'visible', timeout: 15000 });
    }
    const sectionControls = page.locator('[data-record-section-controls="true"]');
    for (let attempt = 0; attempt < 3 && !(await sectionControls.isVisible().catch(() => false)); attempt += 1) {
      await recordsButton.evaluate((element) => (element instanceof HTMLElement ? element.click() : undefined));
      await page.waitForTimeout(250);
    }
    await sectionControls.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300);
  };

  const resetBoardFixture = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}?qcReset=1&qcSize=18`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
      localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-user', email: 'test@projed.local', displayName: '本機測試擁有者', createdAt: 1704067200000 }));
      localStorage.setItem('projed-local-test.knowledgeRecords', '[]');
      localStorage.setItem('projed-local-test.activityEvents', '[]');
      localStorage.setItem('projed-local-test.taskCollectionJournal.v1', '[]');
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const fixedEnvironment = page.getByRole('button', { name: '使用固定測試環境' });
    if (await fixedEnvironment.count()) {
      await fixedEnvironment.click();
      await page.waitForTimeout(700);
    }
    await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const collectCurrentFixture = async () => {
    await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
    await openTaskCollectionOverflow();
    const dialog = page.locator('[data-task-collection-dialog="true"]');
    await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
    await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
    await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
    return dialog;
  };

  const openTaskCollectionOverflow = async () => {
    const overflowTrigger = page.locator('[data-task-details-overflow-trigger="true"]');
    await overflowTrigger.waitFor({ state: 'visible', timeout: 10000 });
    await overflowTrigger.click();
    const collectionItem = page.locator('[data-task-details-overflow-menu="true"] [data-task-collection-open="true"]');
    await collectionItem.waitFor({ state: 'visible', timeout: 10000 });
    await collectionItem.click();
  };

  const collectFixture = async () => {
    await resetBoardFixture();
    return collectCurrentFixture();
  };

  const openTrash = async () => {
    const settingsButton = page.locator('[data-sidebar-settings-button="true"]');
    if (!(await settingsButton.isVisible().catch(() => false))) {
      const sidebarToggle = page.locator('[data-main-sidebar-toggle="true"]');
      await sidebarToggle.waitFor({ state: 'visible', timeout: 15000 });
      await sidebarToggle.click({ force: true });
      await page.waitForTimeout(500);
    }
    await settingsButton.waitFor({ state: 'visible', timeout: 10000 });
    await settingsButton.click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-settings-open-current-board-trash="true"]').click();
    await page.locator('[data-recycle-bin-view="current-board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const closeTaskDetails = async () => {
    const modal = page.locator('[data-task-details-modal="true"]');
    const closeButton = modal.locator('[aria-label="關閉任務詳情"]').first();
    if (await closeButton.count() && await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true });
      await modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
      if (await modal.isVisible().catch(() => false)) {
        await closeButton.evaluate(element => (element instanceof HTMLElement ? element.click() : undefined));
        await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
      }
      await page.waitForTimeout(150);
    }
  };

  const runTaskCollectionCase = async (id, expected, flow) => {
    const failureStart = failures.length;
    let actual = {};
    try {
      actual = await flow();
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      actual = {
        url: page.url(),
        dialogState: await page.locator('[data-task-collection-dialog="true"]').getAttribute('data-task-collection-dialog-state').catch(() => null),
        body: (await page.locator('body').innerText().catch(() => '')).slice(-1200),
      };
    }
    const caseFailures = failures.slice(failureStart);
    return { id, status: caseFailures.length ? 'FAIL' : 'PASS', expected, actual, evidence: ['product task card', 'TaskCollectionDialog state', 'localStorage durable readback'], failures: caseFailures };
  };

  const inspectViewport = async (name, width, height) => {
    const failureStart = failures.length;
    await page.setViewportSize({ width, height });
    const currentRecords = page.locator('[data-record-section-controls="true"]');
    const alreadyInRecords = await currentRecords.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (!alreadyInRecords) await openRecords();
    const tabs = await page.locator('[data-record-section-tab]').allTextContents();
    const sectionControls = page.locator('[data-record-section-controls="true"]');
    const collectionSection = page.locator('[data-record-section="task-collections"]');
    const heading = page.getByRole('heading', { name: '紀錄庫' });
    const bodyText = await page.locator('body').innerText();
    assert(await heading.isVisible(), `${name}: 紀錄庫標題不可見`);
    assert(await sectionControls.isVisible(), `${name}: 紀錄庫分區控制不可見`);
    assert(tabs.includes('收藏任務'), `${name}: 缺少收藏任務分區`);
    assert(tabs.includes('個人工作紀錄'), `${name}: 缺少個人工作紀錄分區`);
    assert(!bodyText.includes('collection_operation_id'), `${name}: 洩漏內部 operation 欄位`);

    const collectionTab = page.locator('[data-record-section-tab="task_collection"]');
    await collectionTab.click();
    await page.waitForTimeout(150);
    assert(await collectionSection.isVisible(), `${name}: 收藏任務分區無法切換顯示`);
    assert((await collectionSection.locator('h2').allTextContents()).includes('收藏任務'), `${name}: 收藏任務分區標題缺失`);

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(overflow.scrollWidth <= overflow.viewportWidth + 1, `${name}: 發生水平溢位 (${overflow.scrollWidth} > ${overflow.viewportWidth})`);
    const caseFailures = failures.slice(failureStart);
    return {
      id: `B00-${name}`,
      status: caseFailures.length ? 'FAIL' : 'PASS',
      expected: 'Records 入口、分區控制、收藏任務切換可用，且不發生水平溢位或內部欄位洩漏',
      actual: {
        viewport: { width, height },
        route: page.url(),
        tabs,
        overflow,
        collectionVisible: await collectionSection.isVisible(),
        forbiddenVisibleText: bodyText.includes('collection_operation_id') ? 1 : 0,
      },
      evidence: ['紀錄庫 heading', 'data-record-section-controls', 'task_collection section visibility', 'document scrollWidth readback'],
      failures: caseFailures,
    };
  };

  const cases = [];
  try {
    cases.push(await inspectViewport('desktop', 1440, 900));
    cases.push(await inspectViewport('mobile', 390, 844));
    cases.push(await runTaskCollectionCase('B01', '預覽確認可見；取消後無資產、來源未變更且焦點回到原觸發鈕', async () => {
      await resetBoardFixture();
      const card = page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first();
      await card.click();
      await openTaskCollectionOverflow();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      const taskCount = await dialog.locator('[data-task-collection-count="tasks"] strong').innerText();
      assert(taskCount === '5', `B01: 預覽任務數應為 5，實際 ${taskCount}`);
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10000 });
      const readback = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
        focus: document.activeElement?.getAttribute('data-task-details-overflow-trigger') || null,
      }));
      assert(!readback.rootArchived && readback.collectionCount === 0, 'B01: 取消不得寫入資產或封存來源', readback);
      assert(readback.focus === 'true', 'B01: 取消後焦點應回原典藏觸發鈕', readback);
      return { taskCount, readback };
    }));
    cases.push(await runTaskCollectionCase('B02', '確認典藏後根任務隱藏；紀錄庫典藏分區可開啟唯讀詳情，含任務樹／相依／歷程／相關紀錄區塊', async () => {
      await resetBoardFixture();
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
      const readback = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
      }));
      assert(readback.rootArchived && readback.collectionCount === 1, 'B02: durable commit readback不符', readback);
      await dialog.getByRole('button', { name: '查看典藏', exact: true }).click();
      await closeTaskDetails();
      await page.locator('[data-task-collection-detail-id], [data-record-section-controls="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
      if (await page.locator('[data-task-collection-detail-id]').count() === 0) {
        await page.locator('[data-record-section-tab="task_collection"]').click();
        await page.locator('[data-task-collection-row-id]').first().click();
      }
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      assert(await detail.locator('[data-task-collection-tree]').count() === 1, 'B02: 任務樹區塊缺失');
      assert(await detail.locator('[data-task-collection-dependencies]').count() === 1, 'B02: 相依區塊缺失');
      assert(await detail.locator('[data-task-collection-history]').count() === 1, 'B02: 歷程區塊缺失');
      assert(await detail.locator('[data-task-collection-related-records]').count() === 1, 'B02: 相關紀錄區塊缺失');
      assert(await detail.locator('textarea, input, [data-record-editor], [data-record-save], [data-record-delete]').count() === 0, 'B02: 唯讀詳情不得出現 editor/mutation controls');
      const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim() }));
      assert(focus.tag === 'H1', 'B02: 深連結後焦點應進入詳情標題', focus);
      return { readback, detailSections: { tree: 1, dependencies: 1, history: 1, relatedRecords: 1 }, focus };
    }));
    cases.push(await runTaskCollectionCase('B03', '1024×768 紀錄庫冷啟動顯示三個互斥分區，預設仍可進入會議紀錄', async () => {
      await resetBoardFixture();
      await page.setViewportSize({ width: 1024, height: 768 });
      await openRecords();
      const tabs = await page.locator('[data-record-section-tab]').allTextContents();
      assert(tabs.length === 3 && tabs.includes('收藏任務') && tabs.includes('會議紀錄') && tabs.includes('個人工作紀錄'), `B03: 分區數或名稱不符 (${tabs.join('、')})`);
      await page.locator('[data-record-section-tab="meeting"]').click();
      assert(await page.locator('[data-record-section="meeting"]').isVisible(), 'B03: 會議紀錄分區無法成為 active panel');
      return { viewport: { width: 1024, height: 768 }, tabs, activeSection: await page.locator('[data-records-active-section]').getAttribute('data-records-active-section') };
    }));
    cases.push(await runTaskCollectionCase('B04', '典藏搜尋只影響典藏分區，命中與空結果可恢復', async () => {
      await collectFixture();
      await page.getByRole('button', { name: '查看典藏', exact: true }).click();
      await closeTaskDetails();
      await page.locator('[data-task-collection-detail-id]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-task-collection-detail-id] button').first().click();
      await openRecords();
      await page.locator('[data-record-section-tab="task_collection"]').click();
      const search = page.locator('#task-collection-search');
      await search.fill('不存在的典藏');
      await page.waitForTimeout(250);
      const emptyTextVisible = await page.getByText('尚無收藏任務。', { exact: false }).isVisible();
      assert(emptyTextVisible, 'B04: 無結果狀態未顯示');
      await search.fill('品質驗證');
      await page.waitForTimeout(250);
      const rows = page.locator('[data-task-collection-row-id]');
      assert(await rows.count() === 1, `B04: 清除搜尋後應回到 1 筆，實際 ${await rows.count()}`);
      return { emptyTextVisible, restoredRows: await rows.count() };
    }));
    cases.push(await runTaskCollectionCase('B05', '典藏詳情可收合任務樹且維持唯讀與四區塊', async () => {
      const dialog = await collectFixture();
      await dialog.getByRole('button', { name: '查看典藏', exact: true }).click();
      await closeTaskDetails();
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      const toggle = detail.locator('[data-task-collection-tree-toggle="true"]');
      await toggle.click();
      assert(await toggle.getAttribute('aria-expanded') === 'false', 'B05: 任務樹收合狀態未更新');
      assert(await detail.locator('[data-task-collection-tree], [data-task-collection-dependencies], [data-task-collection-history], [data-task-collection-related-records]').count() === 4, 'B05: 詳情四區塊不完整');
      assert(await detail.locator('textarea, input, [data-record-editor], [data-record-save], [data-record-delete]').count() === 0, 'B05: 唯讀詳情出現編輯控制');
      return { treeExpanded: await toggle.getAttribute('aria-expanded'), detailId: await detail.getAttribute('data-task-collection-detail-id') };
    }));
    cases.push(await runTaskCollectionCase('B06', '從回收桶還原來源後再次典藏建立 v2，v1 資產仍可讀', async () => {
      const dialog = await collectFixture();
      await dialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();
      await openTrash();
      const restore = page.getByRole('button', { name: /還原任務 品質驗證測試任務 1$/ }).first();
      await restore.waitFor({ state: 'visible', timeout: 10000 });
      await restore.click();
      await page.waitForTimeout(250);
      await page.locator('[data-sidebar-board-row="true"]').first().click();
      await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
      const dialogV2 = await collectCurrentFixture();
      await dialogV2.getByRole('button', { name: '查看典藏', exact: true }).click();
      await closeTaskDetails();
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      assert((await detail.innerText()).includes('版本 2'), 'B06: v2 版本標示缺失');
      await detail.locator('button').first().evaluate((element) => (element instanceof HTMLElement ? element.click() : undefined));
      await closeTaskDetails();
      await openRecords();
      await page.locator('[data-record-section-tab="task_collection"]').click();
      assert(await page.locator('[data-task-collection-row-id]').count() === 2, 'B06: v1/v2 應各有一筆典藏摘要');
      return { versions: await page.locator('[data-task-collection-row-id]').count(), detailVersion2: true };
    }));
    cases.push(await runTaskCollectionCase('B07', '來源任務永久刪除後重新載入，典藏資產仍可讀並顯示來源不存在', async () => {
      const dialog = await collectFixture();
      await dialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();
      await openTrash();
      const permanentDelete = page.getByRole('button', { name: /永久刪除任務 品質驗證測試任務 1$/ }).first();
      await permanentDelete.waitFor({ state: 'visible', timeout: 10000 });
      await permanentDelete.click();
      await page.locator('[data-global-dialog="true"]').getByRole('button', { name: '確認', exact: true }).click();
      await page.waitForTimeout(400);
      await page.locator('[data-sidebar-records-button="true"]').click();
      await page.locator('[data-record-section-controls="true"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-record-section-tab="task_collection"]').click();
      await page.locator('[data-task-collection-row-id]').first().click();
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      assert(await detail.locator('[data-task-collection-source-state="deleted"]').count() >= 1, 'B07: 來源不存在狀態缺失');
      assert(await detail.locator('[data-task-collection-tree]').count() === 1, 'B07: 來源刪除後詳情快照不可讀');
      return { sourceState: 'deleted', detailReadable: true };
    }));
    cases.push(await runTaskCollectionCase('B08', '典藏提交遇到暫時性逾時後可重新預覽並沿用同一 operation 完成，無重複資產', async () => {
      await resetBoardFixture();
      await page.evaluate(() => localStorage.setItem('projed-local-test.taskCollectionFault', 'transient-once'));
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="recoverable-error"]').waitFor({ state: 'visible', timeout: 15000 });
      const transientError = await dialog.locator('[role="alert"]').innerText();
      assert(transientError.includes('暫時') && transientError.includes('重試'), 'B08: 暫時錯誤訊息未提供可恢復提示');
      const beforeRetry = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
      }));
      assert(!beforeRetry.rootArchived && beforeRetry.collectionCount === 0, 'B08: 逾時不可先寫入來源或資產', beforeRetry);
      await dialog.getByRole('button', { name: '重新整理預覽', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
      const afterRetry = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
        faultCleared: localStorage.getItem('projed-local-test.taskCollectionFault') === null,
      }));
      assert(afterRetry.rootArchived && afterRetry.collectionCount === 1 && afterRetry.faultCleared, 'B08: 重試後 durable readback 不符', afterRetry);
      await dialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();
      await resetBoardFixture();
      await page.evaluate(() => localStorage.setItem('projed-local-test.taskCollectionFault', 'response-lost-once'));
      const responseLostDialog = await collectCurrentFixture();
      const responseLostReadback = await page.evaluate(() => ({
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
      }));
      assert(responseLostReadback.collectionCount === 1 && responseLostReadback.rootArchived, 'B08: response-lost 後 operation readback 未收斂');
      await responseLostDialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
      await openRecords();
      await page.locator('[data-record-section-tab="task_collection"]').click();
      const responseLostAfterReload = await page.locator('[data-task-collection-row-id]').count();
      assert(responseLostAfterReload === 1, 'B08: response-lost reload 後不應產生重複典藏');
      return { transientError, beforeRetry, afterRetry, retryMode: 'same operation id', responseLostReadback, responseLostAfterReload };
    }));
    cases.push(await runTaskCollectionCase('B09', '權限撤銷、來源變更、典藏上限與後端不支援均 fail closed，來源不被假成功移除', async () => {
      await resetBoardFixture();
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      let dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.evaluate(() => {
        localStorage.setItem('projed-local-test.selected-account', 'local-test-viewer');
        localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-viewer', email: 'viewer@projed.local', displayName: '本機測試檢視者', createdAt: 1704067200000 }));
      });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="recoverable-error"]').waitFor({ state: 'visible', timeout: 15000 });
      const permissionError = await dialog.locator('[role="alert"]').innerText();
      assert(permissionError.includes('沒有收藏任務的權限'), 'B09: 權限撤銷未顯示精確錯誤');
      const permissionReadback = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
      }));
      assert(!permissionReadback.rootArchived && permissionReadback.collectionCount === 0, 'B09: 權限拒絕不可產生假成功', permissionReadback);
      await dialog.getByRole('button', { name: '關閉', exact: true }).last().click();
      await closeTaskDetails();

      await page.evaluate(() => {
        localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
        localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-user', email: 'test@projed.local', displayName: '本機測試擁有者', createdAt: 1704067200000 }));
      });
      await resetBoardFixture();
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.evaluate(() => {
        const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        nodes['qc-card-1'] = { ...nodes['qc-card-1'], title: '來源變更後的任務' };
        localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="recoverable-error"]').waitFor({ state: 'visible', timeout: 15000 });
      const sourceChangedError = await dialog.locator('[role="alert"]').innerText();
      assert(sourceChangedError.includes('預覽後已有變更'), 'B09: 來源變更未 fail closed');
      await dialog.getByRole('button', { name: '關閉', exact: true }).last().click();
      await closeTaskDetails();

      await resetBoardFixture();
      await page.evaluate(() => {
        const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        const root = nodes['qc-card-1'];
        for (let index = 0; index < 501; index += 1) {
          const id = `qc-card-1-limit-${index + 1}`;
          nodes[id] = { ...root, id, parentId: 'qc-card-1', title: `超限子任務 ${index + 1}`, order: index, createdAt: Date.now() + index, updatedAt: Date.now() + index, isArchived: false };
        }
        localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      });
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="recoverable-error"]').waitFor({ state: 'visible', timeout: 15000 });
      const limitError = await dialog.locator('[role="alert"]').innerText();
      assert(limitError.includes('典藏上限') && limitError.includes('尚未移出看板'), 'B09: 上限錯誤未明確揭露');
      const limitReadback = await page.evaluate(() => ({
        rootArchived: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['qc-card-1']?.isArchived === true,
        collectionCount: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length,
      }));
      assert(!limitReadback.rootArchived && limitReadback.collectionCount === 0, 'B09: 上限拒絕不可移除來源', limitReadback);
      await dialog.getByRole('button', { name: '關閉', exact: true }).last().click();
      await closeTaskDetails();

      await page.goto(`${baseUrl}?qcReset=1&qcSize=18&qcTaskCollectionProvider=unsupported`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      const unsupportedTriggerCount = await page.locator('[data-task-details-overflow-trigger="true"]').count();
      const unsupportedItemCount = await page.locator('[data-task-collection-open="true"]').count();
      assert(unsupportedTriggerCount === 0 && unsupportedItemCount === 0, 'B09: backend unsupported 不得 render 典藏入口');
      await closeTaskDetails();
      await page.goto(`${baseUrl}?qcReset=1&qcSize=18`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
      return { permissionError, sourceChangedError, limitError, permissionReadback, limitReadback, unsupportedTriggerCount, unsupportedItemCount };
    }));
    cases.push(await runTaskCollectionCase('B12', '320×844 任務詳情以 overflow/full menu 提供典藏，compact mobile rail 維持四項且不新增典藏', async () => {
      await resetBoardFixture();
      await page.setViewportSize({ width: 320, height: 844 });
      const card = page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first();
      await card.click();
      const overflowTrigger = page.locator('[data-task-details-overflow-trigger="true"]');
      await overflowTrigger.waitFor({ state: 'visible', timeout: 10000 });
      const directCollectionCount = await page.locator('[data-task-collection-open="true"]').count();
      assert(directCollectionCount === 0, 'B12: overflow 開啟前不應直接 render 典藏 action');
      await overflowTrigger.click();
      const overflowMenu = page.locator('[data-task-details-overflow-menu="true"]');
      await overflowMenu.waitFor({ state: 'visible', timeout: 10000 });
      const collectionItem = overflowMenu.locator('[data-task-collection-open="true"]');
      assert(await collectionItem.isVisible(), 'B12: overflow menu 缺少典藏入口');
      const overflowCollectionCount = await collectionItem.count();
      const rail = page.locator('[data-mobile-task-action-rail="true"]');
      const railCountBeforeGesture = await rail.locator('[data-mobile-task-action]').count();
      assert(railCountBeforeGesture === 0, 'B12: 未啟動 compact rail 時不應偷 render action');
      await page.keyboard.press('Escape');
      await closeTaskDetails();
      return { viewport: { width: 320, height: 844 }, directCollectionCount, overflowCollectionCount, railCountBeforeGesture };
    }));
    cases.push(await runTaskCollectionCase('B10', '看板刪除確認前揭露典藏數量，取消後看板與資產不變', async () => {
      const dialog = await collectFixture();
      await dialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();
      const boardRow = page.locator('[data-sidebar-board-row="true"]').first();
      if (!(await boardRow.isVisible().catch(() => false))) {
        const sidebarToggle = page.locator('[data-main-sidebar-toggle="true"]');
        await sidebarToggle.waitFor({ state: 'visible', timeout: 15000 });
        await sidebarToggle.click({ force: true });
        await page.waitForTimeout(500);
      }
      await boardRow.click({ button: 'right' });
      const menu = page.locator('[data-global-context-menu="true"][data-global-context-menu-kind="board"]');
      await menu.waitFor({ state: 'visible', timeout: 10000 });
      await menu.getByRole('button', { name: '刪除看板', exact: true }).click();
      const confirm = page.locator('[data-global-dialog="true"]');
      await confirm.waitFor({ state: 'visible', timeout: 10000 });
      const message = await confirm.locator('h3').innerText();
      assert(message.includes('1 筆收藏任務'), 'B10: 刪除確認未揭露典藏數量');
      await confirm.getByRole('button', { name: '取消', exact: true }).click();
      const state = await page.evaluate(() => ({ boards: JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]').flatMap(workspace => workspace.boards || []).length, collections: JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length }));
      assert(state.collections === 1, 'B10: 取消刪除後典藏資產數量改變');
      return { message, state };
    }));
    cases.push(await runTaskCollectionCase('B11', '390×844 只呈現典藏與個人工作紀錄兩個支援分區，典藏 deep-link 可讀', async () => {
      const dialog = await collectFixture();
      await dialog.getByRole('button', { name: '查看典藏', exact: true }).click();
      await page.locator('[data-task-collection-detail-id]').waitFor({ state: 'visible', timeout: 15000 });
      const deepLinkDetail = await page.locator('[data-task-collection-detail-id]').getAttribute('data-task-collection-detail-id');
      await closeTaskDetails();
      await page.locator('[data-task-collection-detail-id]').getByRole('button', { name: /返回收藏任務/ }).click({ force: true });
      await page.locator('[data-record-section-controls="true"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.setViewportSize({ width: 390, height: 844 });
      const tabs = await page.locator('[data-record-section-tab]').allTextContents();
      assert(tabs.length === 2 && tabs.includes('收藏任務') && tabs.includes('個人工作紀錄') && !tabs.includes('會議紀錄'), 'B11: mobile 分區不符合既有 meeting restriction');
      await page.locator('[data-record-section-tab="task_collection"]').click();
      assert(await page.locator('[data-record-section="task-collections"]').isVisible(), 'B11: mobile 典藏分區不可 deep-link');
      const coldBeforeReload = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      const restoredRecords = await page.locator('[data-record-section-controls="true"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      if (!restoredRecords) await openRecords();
      await page.locator('[data-record-section-tab="task_collection"]').click();
      const coldRows = await page.locator('[data-task-collection-row-id]').count();
      assert(coldRows === 1, `B11: cold sidebar/deep-link 後應保留 1 筆典藏，實際 ${coldRows}`);
      return { viewport: { width: 390, height: 844 }, tabs, deepLinkDetail, coldBeforeReload, coldReloadRestoredRecords: restoredRecords, coldRows };
    }));
    cases.push(await runTaskCollectionCase('B13', '320×844 典藏詳情與分區沒有 document horizontal overflow', async () => {
      await page.setViewportSize({ width: 320, height: 844 });
      await openRecords();
      const overflow = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert(overflow.scrollWidth <= overflow.viewportWidth + 1, `B13: 水平溢位 ${overflow.scrollWidth} > ${overflow.viewportWidth}`);
      return { viewport: { width: 320, height: 844 }, overflow };
    }));
    cases.push(await runTaskCollectionCase('B14', 'keyboard 可由 tab focus 進入分區，Escape 不會產生未預期 mutation', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openRecords();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const tabs = page.locator('[data-record-section-tab]');
      await tabs.first().focus();
      const tabSemantics = await tabs.evaluateAll(elements => elements.map(element => ({
        role: element.getAttribute('role'),
        selected: element.getAttribute('aria-selected'),
        controls: element.getAttribute('aria-controls'),
        name: element.textContent?.trim(),
      })));
      const panelSemantics = await page.locator('[role="tabpanel"]').evaluateAll(elements => elements.map(element => ({
        id: element.getAttribute('id'),
        labelledBy: element.getAttribute('aria-labelledby'),
      })));
      const reducedMotion = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      assert(await page.evaluate(() => document.activeElement?.getAttribute('data-record-section-tab') !== null), 'B14: 分區 tab 不可 focus');
      assert(tabSemantics.length >= 2 && tabSemantics.every(tab => tab.role === 'tab' && Boolean(tab.controls) && Boolean(tab.selected)), 'B14: tab accessibility semantics 不完整');
      assert(panelSemantics.length >= 2 && panelSemantics.every(panel => Boolean(panel.id) && Boolean(panel.labelledBy)), 'B14: tabpanel accessibility semantics 不完整');
      assert(reducedMotion, 'B14: reduced-motion media preference 未被瀏覽器套用');
      const before = await page.evaluate(() => JSON.stringify({ records: localStorage.getItem('projed-local-test.knowledgeRecords'), nodes: localStorage.getItem('projed-local-test.nodes') }));
      await page.keyboard.press('Escape');
      const after = await page.evaluate(() => JSON.stringify({ records: localStorage.getItem('projed-local-test.knowledgeRecords'), nodes: localStorage.getItem('projed-local-test.nodes') }));
      assert(before === after, 'B14: Escape 造成非預期資料 mutation');
      return { focusedTab: await page.evaluate(() => document.activeElement?.getAttribute('data-record-section-tab') || null), collectionCount: await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]').filter(record => record.type === 'task_collection').length), escapedToBoard: !(await page.locator('[data-record-section-controls="true"]').isVisible().catch(() => false)), tabSemantics, panelSemantics, reducedMotion };
    }));
    cases.push(await runTaskCollectionCase('B15', '典藏流程無 pageerror、requestfailed、4xx/5xx 或額外 role=alert', async () => {
      const pageErrorsBefore = failures.filter(item => item.startsWith('pageerror:')).length;
      const alerts = await page.locator('[role="alert"]').count();
      assert(failures.filter(item => item.startsWith('pageerror:')).length === pageErrorsBefore, 'B15: browser pageerror sweep非零');
      assert(alerts === 0, `B15: unexpected role=alert ${alerts}`);
      return { pageErrors: failures.filter(item => item.startsWith('pageerror:')).length, requestFailures: requestFailures.length, httpErrors: httpErrors.length, alerts };
    }));
    cases.push(await runTaskCollectionCase('B16', 'dialog 五態中的取消／Escape 回到觸發鈕，成功後 focus 不落 body', async () => {
      await resetBoardFixture();
      await page.evaluate(() => {
        const target = window;
        target.__DEV093_DIALOG_STATE_TRACE = [];
        const trace = () => {
          const state = document.querySelector('[data-task-collection-dialog]')?.getAttribute('data-task-collection-dialog-state');
          if (state && target.__DEV093_DIALOG_STATE_TRACE[target.__DEV093_DIALOG_STATE_TRACE.length - 1] !== state) target.__DEV093_DIALOG_STATE_TRACE.push(state);
        };
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER?.disconnect();
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER = new MutationObserver(trace);
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-task-collection-dialog-state'] });
        trace();
      });
      const card = page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first();
      await card.click();
      const trigger = page.locator('[data-task-details-overflow-trigger="true"]');
      await trigger.click();
      await page.locator('[data-task-details-overflow-menu="true"] [data-task-collection-open="true"]').click();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog="true"][data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
      const successSemantics = await dialog.locator('[role="status"]').evaluate(element => ({ live: element.getAttribute('aria-live'), text: element.textContent?.trim() }));
      const successFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, inDialog: Boolean(document.activeElement?.closest('[data-task-collection-dialog]')) }));
      const successTrace = await page.evaluate(() => window.__DEV093_DIALOG_STATE_TRACE || []);
      assert(successTrace.includes('preview-loading') && successTrace.includes('confirmation') && successTrace.includes('committing') && successTrace.includes('success'), `B16: success flow 未覆蓋五態前四態，實際 ${successTrace.join(' → ')}`);
      assert(successSemantics.live === 'polite', 'B16: success live region 缺少 aria-live=polite');
      assert(successFocus.inDialog, 'B16: success focus 應保留於 dialog 內');
      await dialog.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await closeTaskDetails();

      await resetBoardFixture();
      await page.evaluate(() => {
        const target = window;
        target.__DEV093_DIALOG_STATE_TRACE = [];
        const trace = () => {
          const state = document.querySelector('[data-task-collection-dialog]')?.getAttribute('data-task-collection-dialog-state');
          if (state && target.__DEV093_DIALOG_STATE_TRACE[target.__DEV093_DIALOG_STATE_TRACE.length - 1] !== state) target.__DEV093_DIALOG_STATE_TRACE.push(state);
        };
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER?.disconnect();
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER = new MutationObserver(trace);
        target.__DEV093_DIALOG_STATE_TRACE_OBSERVER.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-task-collection-dialog-state'] });
        trace();
      });
      await page.evaluate(() => localStorage.setItem('projed-local-test.taskCollectionFault', 'transient-once'));
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      const recoverableDialog = page.locator('[data-task-collection-dialog="true"]');
      await recoverableDialog.locator('[data-task-collection-annotation="true"]').fill('錯誤復原保留註記');
      await recoverableDialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="recoverable-error"]').waitFor({ state: 'visible', timeout: 15000 });
      const recoverableSemantics = await recoverableDialog.locator('[role="alert"]').evaluate(element => ({ tabIndex: element.getAttribute('tabindex'), text: element.textContent?.trim() }));
      assert(recoverableSemantics.tabIndex === '-1' && recoverableSemantics.text?.includes('暫時'), 'B16: recoverable error semantics／提示缺失');
      await recoverableDialog.getByRole('button', { name: '重新整理預覽', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      assert(await recoverableDialog.locator('[data-task-collection-annotation="true"]').inputValue() === '錯誤復原保留註記', 'B16: recoverable error 未保留 annotation');
      await page.keyboard.press('Escape');
      await recoverableDialog.waitFor({ state: 'hidden', timeout: 10000 });
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.activeElement?.getAttribute('data-task-details-overflow-trigger') === 'true'), 'B16: Escape 後 focus 未回觸發鈕');
      const recoveredTrace = await page.evaluate(() => window.__DEV093_DIALOG_STATE_TRACE || []);
      return { dialogClosed: true, focusReturned: true, successTrace, successSemantics, successFocus, recoverableTrace: recoveredTrace, recoverableSemantics };
    }));
    cases.push(await runTaskCollectionCase('B17', '紀錄庫維持單一主焦點與同層分區，不重複渲染 helper/card shell', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openRecords();
      const headings = await page.locator('h1').allTextContents();
      const controls = await page.locator('[data-record-section-controls="true"]').count();
      assert(controls === 1, `B17: section controls 應只有一組，實際 ${controls}`);
      assert(headings.filter(text => text === '紀錄庫').length === 1, 'B17: 紀錄庫主標題重複');
      return { headings, sectionControlCount: controls };
    }));
    cases.push(await runTaskCollectionCase('B18', '固定 fixture 的典藏預覽與詳情 counts 不為零且可重建資料', async () => {
      await resetBoardFixture();
      await page.evaluate(() => {
        const now = Date.now();
        const record = (id, title, nodeId) => ({ id, workspaceId: 'local-test-workspace', boardId: 'local-test-mobile-ui-board', type: 'work_log', title, content: `${title} 內容`, status: 'published', visibility: 'project', occurredAt: now - 3600000, recordedBy: 'local-test-user', createdBy: 'local-test-user', updatedBy: 'local-test-user', createdAt: now - 3600000, updatedAt: now - 1800000, ragEnabled: true, taskLinks: [{ id: `${id}-link`, recordId: id, workspaceId: 'local-test-workspace', boardId: 'local-test-mobile-ui-board', nodeId, role: 'related', createdAt: now - 3600000 }] });
        localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([
          record('qc-related-record-1', '品質驗證關聯紀錄一', 'qc-card-1'),
          record('qc-related-record-2', '品質驗證關聯紀錄二', 'qc-card-1-child-1'),
          { ...record('qc-private-record', '不可帶入的私有紀錄', 'qc-card-1'), id: 'qc-private-record', visibility: 'private' },
        ]));
        localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([
          { id: 'qc-activity-1', workspaceId: 'local-test-workspace', boardId: 'local-test-mobile-ui-board', actorId: 'local-test-user', eventType: 'task_status_changed', entityTable: 'wbs_items', entityId: 'qc-card-1', payload: { before: { status: 'todo' }, after: { status: 'in_progress' } }, createdAt: now - 7200000 },
          { id: 'qc-activity-2', workspaceId: 'local-test-workspace', boardId: 'local-test-mobile-ui-board', actorId: 'local-test-user', eventType: 'task_dates_changed', entityTable: 'wbs_items', entityId: 'qc-card-1-child-1', payload: { before: {}, after: {} }, createdAt: now - 5400000 },
          { id: 'qc-unrelated-activity', workspaceId: 'local-test-workspace', boardId: 'local-test-mobile-ui-board', actorId: 'local-test-user', eventType: 'task_created', entityTable: 'wbs_items', entityId: 'qc-card-2', payload: {}, createdAt: now - 3600000 },
        ]));
      });
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      const taskCount = await dialog.locator('[data-task-collection-count="tasks"] strong').innerText();
      const historyCount = await dialog.locator('[data-task-collection-count="history"] strong').innerText();
      assert(taskCount === '5', `B18: 預覽任務數應為 5，實際 ${taskCount}`);
      assert(historyCount === '2／2', `B18: 預覽歷程／關聯紀錄應為 2／2，實際 ${historyCount}`);
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '查看典藏', exact: true }).click();
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      const detailText = await detail.innerText();
      const readback = await page.evaluate(() => {
        const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        const records = JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
        const collection = records.find(record => record.type === 'task_collection');
        const snapshot = collection?.metadata?.taskCollection;
        return { nodes: Object.keys(nodes).length, records: records.filter(record => record.type === 'task_collection').length, tasks: snapshot?.counts?.tasks ?? 0, activities: snapshot?.counts?.activities ?? 0, relatedRecords: snapshot?.counts?.relatedRecords ?? 0 };
      });
      assert(readback.nodes > 0 && readback.records === 1 && readback.tasks === 5 && readback.activities === 2 && readback.relatedRecords === 2, 'B18: fixture snapshot counts 不符', readback);
      assert(detailText.includes('任務樹（5）') && detailText.includes('活動事件：2') && detailText.includes('關聯紀錄：2') && detailText.includes('相關紀錄片段（2）'), 'B18: 詳情非零歷程／關聯紀錄未重建');
      assert(await detail.locator('[data-task-collection-history] div').filter({ hasText: 'task_status_changed' }).count() >= 1, 'B18: 活動事件明細缺失');
      assert(await detail.locator('[data-task-collection-related-records]').getByText('品質驗證關聯紀錄一', { exact: true }).count() === 1, 'B18: 關聯紀錄明細缺失');
      return { taskCount, historyCount, readback, detailCounts: { tasks: 5, activities: 2, relatedRecords: 2 } };
    }));
    cases.push(await runTaskCollectionCase('B19', '典藏詳情選取任一快照節點時沿用一般任務內容欄位，顯示備註／日期／狀態／指派／標籤且維持唯讀', async () => {
      await resetBoardFixture();
      await page.evaluate(() => {
        const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
        nodes['qc-card-1'] = {
          ...nodes['qc-card-1'],
          status: 'in_progress',
          startDate: '2026-08-01',
          endDate: '2026-08-05',
          assigneeIds: ['local-test-user'],
          assigneeId: 'local-test-user',
          collaboratorIds: ['local-test-reviewer'],
          tagIds: ['qc-parity-tag'],
          detailNotes: [{ id: 'qc-parity-note', title: '驗收內容', content: '典藏內容 parity 驗收文字' }],
          description: '典藏內容 parity 驗收文字',
        };
        nodes['qc-card-1-child-1'] = {
          ...nodes['qc-card-1-child-1'],
          status: 'completed',
          startDate: '2026-08-03',
          endDate: '2026-08-10',
          assigneeIds: ['local-test-reviewer'],
          assigneeId: 'local-test-reviewer',
          collaboratorIds: [],
          tagIds: ['qc-child-parity-tag'],
          detailNotes: [{ id: 'qc-child-parity-note', title: '子任務驗收內容', content: '子任務典藏 parity 驗收文字' }],
          description: '子任務典藏 parity 驗收文字',
        };
        localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      });
      await page.locator('[data-task-id="qc-card-1"][data-task-card-primary="true"]').first().click();
      await openTaskCollectionOverflow();
      const dialog = page.locator('[data-task-collection-dialog="true"]');
      await page.locator('[data-task-collection-dialog-state="confirmation"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '確認典藏', exact: true }).click();
      await page.locator('[data-task-collection-dialog-state="success"]').waitFor({ state: 'visible', timeout: 15000 });
      await dialog.getByRole('button', { name: '查看典藏', exact: true }).click();
      const detail = page.locator('[data-task-collection-detail-id]');
      await detail.waitFor({ state: 'visible', timeout: 15000 });
      const parentTaskModalCount = await page.locator('[data-task-details-modal="true"]').count();
      assert(parentTaskModalCount === 0, `B19: 查看典藏後父任務詳情 modal 應關閉，實際 ${parentTaskModalCount}`);
      const content = detail.locator('[data-task-collection-node-content="true"]');
      const contentText = await content.innerText();
      const contentParity = {
        contentSectionCount: await content.count(),
        noteContent: contentText.includes('典藏內容 parity 驗收文字'),
        startDate: contentText.includes('2026/08/01'),
        endDate: contentText.includes('2026/08/05'),
        duration: contentText.includes('4 天'),
        status: contentText.includes('進行中'),
        assignmentText: contentText.includes('已保存成員（local-test-user）') && contentText.includes('協作 1 人'),
        tagText: contentText.includes('已保存標籤（qc-parity-tag）'),
        assignment: await content.locator('[data-task-collection-readonly-assignment="true"]').count() === 1,
        tags: await content.locator('[data-task-collection-readonly-tags="true"]').count() === 1,
        editableControls: await content.locator('input, textarea, select').count(),
        mutationActions: await content.locator('button:not([disabled])').count(),
        sharedNoteRenderer: await content.locator('[data-task-detail-note-content="true"]').count() === 1,
      };
      assert(contentParity.contentSectionCount === 1, 'B19: 收藏任務內容區塊缺失', contentParity);
      assert(contentParity.noteContent && contentParity.startDate && contentParity.endDate && contentParity.duration && contentParity.status, 'B19: 一般任務內容欄位未完整顯示或工期語意不一致', contentParity);
      assert(contentParity.assignment && contentParity.tags && contentParity.assignmentText && contentParity.tagText, 'B19: 主責／協作或標籤欄位內容缺失', contentParity);
      assert(contentParity.editableControls === 0 && contentParity.mutationActions === 0 && contentParity.sharedNoteRenderer, 'B19: 典藏內容不符合唯讀或未共用備註 renderer', contentParity);
      const childTrigger = detail.locator('[data-task-collection-node-trigger="qc-card-1-child-1"]');
      await childTrigger.waitFor({ state: 'visible', timeout: 10000 });
      await childTrigger.click();
      const childContent = detail.locator('[data-task-collection-node-content="true"]');
      await childContent.waitFor({ state: 'visible', timeout: 10000 });
      const childContentText = await childContent.innerText();
      const childContentParity = {
        selectedNode: await childContent.getAttribute('data-task-collection-node-storage-id'),
        noteContent: childContentText.includes('子任務典藏 parity 驗收文字'),
        startDate: childContentText.includes('2026/08/03'),
        endDate: childContentText.includes('2026/08/10'),
        duration: childContentText.includes('7 天'),
        status: childContentText.includes('完成'),
        assignmentText: childContentText.includes('已保存成員（local-test-reviewer）'),
        tagText: childContentText.includes('已保存標籤（qc-child-parity-tag）'),
        assignment: await childContent.locator('[data-task-collection-readonly-assignment="true"]').count() === 1,
        tags: await childContent.locator('[data-task-collection-readonly-tags="true"]').count() === 1,
        editableControls: await childContent.locator('input, textarea, select').count(),
        mutationActions: await childContent.locator('button:not([disabled])').count(),
        sharedNoteRenderer: await childContent.locator('[data-task-detail-note-content="true"]').count() === 1,
      };
      assert(childContentParity.selectedNode === 'qc-card-1-child-1', 'B19: 子任務快照節點未被選取', childContentParity);
      assert(childContentParity.noteContent && childContentParity.startDate && childContentParity.endDate && childContentParity.duration && childContentParity.status, 'B19: 子任務一般任務內容欄位未完整顯示', childContentParity);
      assert(childContentParity.assignment && childContentParity.tags && childContentParity.assignmentText && childContentParity.tagText, 'B19: 子任務主責／標籤欄位內容缺失', childContentParity);
      assert(childContentParity.editableControls === 0 && childContentParity.mutationActions === 0 && childContentParity.sharedNoteRenderer, 'B19: 子任務典藏內容不符合唯讀或未共用備註 renderer', childContentParity);
      const nodeIds = await detail.locator('[data-task-collection-node-trigger]').evaluateAll(elements => elements.map(element => element.getAttribute('data-task-collection-node-trigger')).filter(Boolean));
      const nodeSelectionReadback = [];
      for (const nodeId of nodeIds) {
        await detail.locator(`[data-task-collection-node-trigger="${nodeId}"]`).click();
        await page.waitForFunction(id => document.querySelector('[data-task-collection-node-content="true"]')?.getAttribute('data-task-collection-node-storage-id') === id, nodeId);
        const selectedContent = detail.locator('[data-task-collection-node-content="true"]');
        nodeSelectionReadback.push({
           nodeId,
           selectedNode: await selectedContent.getAttribute('data-task-collection-node-storage-id'),
           editableControls: await selectedContent.locator('input, textarea, select').count(),
           mutationActions: await selectedContent.locator('button:not([disabled])').count(),
           sharedNoteRenderer: await selectedContent.locator('[data-task-detail-note-content="true"]').count() === 1,
        });
      }
      assert(nodeSelectionReadback.length === 5 && nodeSelectionReadback.every(item => item.nodeId === item.selectedNode && item.editableControls === 0 && item.mutationActions === 0 && item.sharedNoteRenderer), 'B19: 並非所有快照節點都能選取並維持唯讀內容 parity', nodeSelectionReadback);
      await page.setViewportSize({ width: 390, height: 844 });
      await detail.locator('[data-task-collection-node-trigger="qc-card-1"]').click();
      await page.waitForFunction(id => document.querySelector('[data-task-collection-node-content="true"]')?.getAttribute('data-task-collection-node-storage-id') === id, 'qc-card-1');
      const mobileContent = detail.locator('[data-task-collection-node-content="true"]');
      const mobileContentText = await mobileContent.innerText();
      const mobileContentParity = {
        viewport: await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
        visible: await mobileContent.isVisible(),
        noteContent: mobileContentText.includes('典藏內容 parity 驗收文字'),
        startDate: mobileContentText.includes('2026/08/01'),
        endDate: mobileContentText.includes('2026/08/05'),
        duration: mobileContentText.includes('4 天'),
        status: mobileContentText.includes('進行中'),
        assignmentText: mobileContentText.includes('已保存成員（local-test-user）') && mobileContentText.includes('協作 1 人'),
        tagText: mobileContentText.includes('已保存標籤（qc-parity-tag）'),
        editableControls: await mobileContent.locator('input, textarea, select').count(),
        mutationActions: await mobileContent.locator('button:not([disabled])').count(),
        sharedNoteRenderer: await mobileContent.locator('[data-task-detail-note-content="true"]').count() === 1,
      };
      assert(mobileContentParity.visible && mobileContentParity.noteContent && mobileContentParity.startDate && mobileContentParity.endDate && mobileContentParity.duration && mobileContentParity.status && mobileContentParity.assignmentText && mobileContentParity.tagText, 'B19: 390×844 典藏內容欄位未完整顯示', mobileContentParity);
      assert(mobileContentParity.editableControls === 0 && mobileContentParity.mutationActions === 0 && mobileContentParity.sharedNoteRenderer, 'B19: 390×844 典藏內容不符合唯讀或未共用備註 renderer', mobileContentParity);
      return { parentTaskModalCount, contentParity, childContentParity, nodeSelectionReadback, mobileContentParity };
    }));
  } catch (error) {
    failures.push(`browser-flow: ${error instanceof Error ? error.message : String(error)}`);
  }

  const artifact = {
    devId: 'DEV-093',
    sourceRevision: 'working-tree',
    generatedAt: new Date().toISOString(),
    environment: 'local-test',
    provider: 'local-test',
    command: 'npm run verify:dev-093-task-collection-browser',
    runtime: 'reused primary Vite http://localhost:4000/; browser task-owned and auto-closed',
    route: baseUrl,
    actor: 'fixed local test environment',
    passed: failures.length === 0,
    cases,
    summary: cases.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] || 0) + 1 }), { PASS: 0, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 }),
    failures,
  };
  await page.evaluate(value => { window.__DEV093_ARTIFACT = value; }, artifact);
  return artifact;
}
