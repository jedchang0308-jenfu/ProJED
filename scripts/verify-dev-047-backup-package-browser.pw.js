/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };
  const screenshot = path => page.screenshot({ path: `output/playwright/dev-047-backup-package/${path}`, fullPage: false });
  const assertNoOverflow = async label => {
    const metrics = await page.evaluate(() => ({
      root: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      body: [document.body.scrollWidth, document.body.clientWidth],
      clippedButtons: Array.from(document.querySelectorAll('button')).filter(button => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && button.getBoundingClientRect().width > 0 && button.scrollWidth > button.clientWidth + 1;
      }).map(button => button.textContent?.trim()).filter(Boolean),
    }));
    assert(metrics.root[0] <= metrics.root[1] + 1, `${label} root has horizontal overflow`, metrics);
    assert(metrics.body[0] <= metrics.body[1] + 1, `${label} body has horizontal overflow`, metrics);
    assert(metrics.clippedButtons.length === 0, `${label} has clipped button labels`, metrics);
  };
  const seedSession = () => page.evaluate(() => {
    const account = {
      id: 'local-test-user', uid: 'local-test-user', email: 'test@projed.local',
      displayName: 'ProJED local QA', createdAt: 1704067200000,
    };
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
  });
  const openSettings = async () => {
    const settings = page.locator('[data-sidebar-settings-button="true"]').first();
    if (await settings.count() === 0) await page.locator('[data-main-sidebar-toggle="true"]').first().click();
    await page.locator('[data-sidebar-settings-button="true"]').first().click();
    await page.locator('[data-backup-settings-section="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };
  const getCurrentTarget = () => page.evaluate(() => {
    const workspaces = JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]');
    const workspaceId = localStorage.getItem('projed-last-ws');
    const boardId = localStorage.getItem('projed-last-board');
    const workspace = workspaces.find(item => item.id === workspaceId);
    const board = workspace?.boards?.find(item => item.id === boardId);
    const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const sourceNodes = Object.values(nodes)
      .filter(node => node.workspaceId === workspaceId && node.boardId === boardId)
      .sort((left, right) => left.id.localeCompare(right.id));
    return { workspaceId, boardId, workspaceTitle: workspace?.title, boardTitle: board?.title, sourceNodes };
  });
  const setJsonFile = (name, value) => page.locator('[data-backup-file-input="true"]').evaluate(
    (input, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([file.text], file.name, { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { name, text: typeof value === 'string' ? value : JSON.stringify(value) },
  );
  const closeMobileSidebar = async () => {
    const backdrop = page.locator('[data-mobile-sidebar-backdrop="true"]');
    if (await backdrop.count() && await backdrop.isVisible()) {
      await backdrop.click();
      await backdrop.waitFor({ state: 'hidden', timeout: 5000 });
    }
  };
  const dismissToasts = async () => {
    const closeButtons = page.locator('div.fixed.top-4.right-4 button');
    while (await closeButtons.count()) await closeButtons.first().click();
  };

  let step = 'open local test app';
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18&qcCalendarBoards=2', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    await openSettings();
    const target = await getCurrentTarget();
    assert(target.workspaceId && target.boardId && target.boardTitle, 'current board fixture must exist', target);

    step = 'canonical export and V2 download';
    const pageText = await page.locator('[data-backup-settings-section="true"]').innerText();
    assert(pageText.includes('建立看板備份') && pageText.includes('匯入或還原'), 'backup page must expose the two task sections', { pageText });
    assert(!pageText.includes('匯出全域快照'), 'backup page must not claim a global snapshot', { pageText });
    await page.locator('[data-backup-export-counts="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-backup-download-v2="true"]').waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-backup-download-v2="true"]').click();
    const download = await downloadPromise;
    const validPath = await download.path();
    assert(validPath, 'download must have a readable path');
    assert(
      download.suggestedFilename().startsWith('projed-')
        && download.suggestedFilename().endsWith('.backup.json')
        && download.suggestedFilename().includes(target.boardTitle.replace(/\s+/g, '-')),
      'download filename must identify board scope',
      { filename: download.suggestedFilename(), boardTitle: target.boardTitle },
    );
    const stream = await download.createReadStream();
    let validText = '';
    for await (const chunk of stream) validText += chunk.toString('utf8');
    const packageValue = JSON.parse(validText);
    assert(packageValue.format === 'projed-backup' && packageValue.schemaVersion === 2, 'download must be a V2 package', packageValue);
    assert(packageValue.scope?.type === 'board', 'download scope must be one board', packageValue.scope);
    assert(packageValue.source.boardId === target.boardId, 'download source must match selected board', { source: packageValue.source, target });

    step = 'all-board export as separate V2 downloads';
    const allBoardCount = await page.evaluate(() => JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]')
      .reduce((sum, workspace) => sum + (workspace.boards?.length || 0), 0));
    await page.locator('[data-backup-source-board-select="true"]').selectOption('__all_boards__');
    await page.locator('[data-backup-export-batch-summary="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const batchSummary = await page.locator('[data-backup-export-batch-summary="true"]').innerText();
    const readyBatchCount = await page.locator('[data-backup-export-batch-status="ready"]').count();
    const failedBatchCount = await page.locator('[data-backup-export-batch-status="failed"]').count();
    assert(allBoardCount >= 2, 'fixture must contain multiple boards for all-board backup', { allBoardCount });
    assert(readyBatchCount === allBoardCount && failedBatchCount === 0, 'all-board export must create one ready package per board', {
      allBoardCount,
      readyBatchCount,
      failedBatchCount,
      batchSummary,
    });
    await screenshot('1440-all-board-batch.png');
    await assertNoOverflow('1440 all-board batch');
    const batchDownloads = [];
    const batchDownloadHandler = downloadEvent => { batchDownloads.push(downloadEvent); };
    page.on('download', batchDownloadHandler);
    await page.locator('[data-backup-download-all-v2="true"]').click();
    for (let attempt = 0; attempt < 40 && batchDownloads.length < readyBatchCount; attempt += 1) {
      await page.waitForTimeout(250);
    }
    page.off('download', batchDownloadHandler);
    const batchFilenames = new Set();
    const batchBoardIds = new Set();
    for (const batchDownload of batchDownloads) {
      batchFilenames.add(batchDownload.suggestedFilename());
      const batchStream = await batchDownload.createReadStream();
      let batchText = '';
      for await (const chunk of batchStream) batchText += chunk.toString('utf8');
      const batchPackage = JSON.parse(batchText);
      assert(batchPackage.format === 'projed-backup' && batchPackage.schemaVersion === 2, 'batch download must be a V2 package', batchPackage);
      assert(batchPackage.scope?.type === 'board', 'batch download must stay single-board scoped', batchPackage.scope);
      batchBoardIds.add(batchPackage.source.boardId);
    }
    assert(batchDownloads.length === allBoardCount, 'all-board CTA must trigger one file per board', {
      allBoardCount,
      downloads: batchDownloads.length,
    });
    assert(batchFilenames.size === batchDownloads.length, 'batch filenames should be unique enough for separate files', {
      filenames: Array.from(batchFilenames),
    });
    assert(batchBoardIds.size === allBoardCount, 'batch downloads must cover every board exactly once', {
      allBoardCount,
      boardIds: Array.from(batchBoardIds),
    });
    await page.locator('[data-backup-source-board-select="true"]').selectOption(`${target.workspaceId}\u001f${target.boardId}`);
    await page.locator('[data-backup-export-counts="true"]').waitFor({ state: 'visible', timeout: 15000 });

    step = 'inspect without mutation';
    const sourceBeforeInspect = JSON.stringify((await getCurrentTarget()).sourceNodes);
    await page.locator('[data-backup-file-input="true"]').setInputFiles(validPath);
    await page.locator('[data-backup-inspection-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const inspectText = await page.locator('[data-backup-inspection-ready="true"]').innerText();
    assert(inspectText.includes('檔案已通過完整性檢查'), 'inspection must show checksum success', { inspectText });
    assert(inspectText.includes('SHA-256'), 'inspection must expose checksum identity', { inspectText });
    assert(inspectText.includes('V2'), 'inspection must show schema version', { inspectText });
    assert(JSON.stringify((await getCurrentTarget()).sourceNodes) === sourceBeforeInspect, 'inspection must not mutate current board');
    assert(await page.locator('[data-backup-mode-copy="true"]').getAttribute('aria-checked') === 'true', 'copy must be the default mode');
    await screenshot('1440-inspection.png');
    await assertNoOverflow('1440 inspection');

    step = 'copy plan and execution';
    await page.locator('[data-backup-new-board-title="true"]').fill('DEV-047 QC copy');
    await page.locator('[data-backup-build-plan="true"]').click();
    await page.locator('[data-backup-plan-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const copyPlanText = await page.locator('[data-backup-plan-ready="true"]').innerText();
    assert(copyPlanText.includes('可以執行') && copyPlanText.includes('新增'), 'copy plan must show executable counts', { copyPlanText });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.locator('[data-backup-plan-ready="true"]').scrollIntoViewIfNeeded();
    await screenshot('1024-copy-plan.png');
    await assertNoOverflow('1024 copy plan');
    await page.locator('[data-backup-execute="true"]').click();
    await page.locator('[data-backup-import-success="true"]').waitFor({ state: 'visible', timeout: 20000 });
    const successText = await page.locator('[data-backup-import-success="true"]').innerText();
    assert(successText.includes('匯入與讀回驗證完成'), 'copy must only report success after read-back verification', { successText });
    assert(successText.includes('DEV-047 QC copy'), 'success report must identify target board', { successText });
    const copyEvidence = await page.evaluate(({ target, packageTaskIds }) => {
      const workspaces = JSON.parse(localStorage.getItem('projed-local-test.workspaces') || '[]');
      const nodes = Object.values(JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}'));
      const workspace = workspaces.find(item => item.id === target.workspaceId);
      const copiedBoard = workspace?.boards?.find(item => item.title === 'DEV-047 QC copy');
      const sourceNodes = nodes.filter(node => node.workspaceId === target.workspaceId && node.boardId === target.boardId)
        .sort((left, right) => left.id.localeCompare(right.id));
      const copiedNodes = nodes.filter(node => node.workspaceId === target.workspaceId && node.boardId === copiedBoard?.id);
      return {
        copiedBoardId: copiedBoard?.id,
        sourceNodes,
        copiedTaskCount: copiedNodes.length,
        taskIdIntersection: copiedNodes.filter(node => packageTaskIds.includes(node.id)).map(node => node.id),
      };
    }, { target, packageTaskIds: packageValue.payload.tasks.map(task => task.sourceId) });
    assert(JSON.stringify(copyEvidence.sourceNodes) === sourceBeforeInspect, 'copy must not mutate source board', copyEvidence);
    assert(copyEvidence.copiedTaskCount === packageValue.payload.tasks.length, 'copy must create every task', copyEvidence);
    assert(copyEvidence.taskIdIntersection.length === 0, 'copy task IDs must be isolated', copyEvidence);
    await dismissToasts();
    await page.setViewportSize({ width: 390, height: 844 });
    await closeMobileSidebar();
    await page.locator('[data-backup-import-success="true"]').scrollIntoViewIfNeeded();
    await screenshot('390-copy-success.png');
    await assertNoOverflow('390 copy success');

    step = 'same-origin destructive replace with pre-backup';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-backup-file-input="true"]').setInputFiles(validPath);
    await page.locator('[data-backup-inspection-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const replaceMode = page.locator('[data-backup-mode-replace="true"]');
    assert(!(await replaceMode.isDisabled()), 'same-origin backup must enable replace for owner');
    await replaceMode.click();
    await page.locator('[data-backup-build-plan="true"]').click();
    await page.locator('[data-backup-plan-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
    const replacePlanText = await page.locator('[data-backup-plan-ready="true"]').innerText();
    assert(replacePlanText.includes('更新') && replacePlanText.includes('移除') && replacePlanText.includes('保留'), 'replace plan must expose destructive diff', { replacePlanText });
    await page.locator('[data-backup-replace-confirmation="true"]').fill(target.boardTitle);
    const destructiveButton = page.locator('[data-backup-execute="true"]');
    assert((await destructiveButton.getAttribute('class')).includes('bg-rose-600'), 'replace CTA must use danger styling');
    await screenshot('1440-replace-plan.png');
    const preBackupPromise = page.waitForEvent('download');
    await destructiveButton.click();
    const preBackupDownload = await preBackupPromise;
    assert(preBackupDownload.suggestedFilename().startsWith('projed-') && preBackupDownload.suggestedFilename().endsWith('.backup.json'), 'replace must download a pre-replacement package');
    await page.locator('[data-backup-import-success="true"]').waitFor({ state: 'visible', timeout: 20000 });
    const replaceSuccess = await page.locator('[data-backup-import-success="true"]').innerText();
    assert(replaceSuccess.includes('執行前安全備份也已下載'), 'replace report must communicate pre-backup evidence', { replaceSuccess });
    await dismissToasts();
    await screenshot('1440-replace-success.png');

    step = 'cross-origin compatibility gate';
    const foreignPackage = JSON.parse(JSON.stringify(packageValue));
    foreignPackage.source.boardId = 'foreign-board-id';
    await setJsonFile('foreign-board.json', foreignPackage);
    await page.locator('[data-backup-inspection-ready="true"]').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('[data-backup-mode-replace="true"]').isDisabled(), 'cross-origin package must disable replace');
    assert(await page.locator('[data-backup-mode-copy="true"]').getAttribute('aria-checked') === 'true', 'cross-origin package must keep copy available');
    await page.setViewportSize({ width: 390, height: 844 });
    await closeMobileSidebar();
    await page.locator('[data-backup-inspection-ready="true"]').scrollIntoViewIfNeeded();
    await screenshot('390-cross-origin-inspection.png');
    await assertNoOverflow('390 cross-origin inspection');

    step = 'tampered package fail closed';
    const tamperedPackage = JSON.parse(JSON.stringify(packageValue));
    tamperedPackage.payload.tasks[0].title = 'Tampered without checksum update';
    await setJsonFile('tampered.json', tamperedPackage);
    const tamperAlert = page.locator('[data-backup-import-panel="true"] [role="alert"]');
    await tamperAlert.waitFor({ state: 'visible', timeout: 15000 });
    const tamperText = await tamperAlert.innerText();
    assert(tamperText.includes('完整性驗證失敗'), 'tampered package must show checksum failure', { tamperText });
    assert(await page.locator('[data-backup-inspection-ready="true"]').count() === 0, 'tampered package must not reach inspection-ready');
    assert(await page.locator('[data-backup-execute="true"]').count() === 0, 'tampered package must not expose execute CTA');
    await page.setViewportSize({ width: 320, height: 844 });
    await closeMobileSidebar();
    await page.locator('[data-backup-import-panel="true"]').scrollIntoViewIfNeeded();
    await screenshot('320-tampered-error.png');
    await assertNoOverflow('320 tampered error');

    step = 'ambiguous legacy package fail closed';
    const legacy = {
      version: 'wbs-2.0',
      nodes: [
        { id: 'legacy-a', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null, title: 'A', status: 'todo', order: 0 },
        { id: 'legacy-b', workspaceId: 'workspace-a', boardId: 'board-b', parentId: null, title: 'B', status: 'todo', order: 0 },
      ],
    };
    await setJsonFile('legacy-multi-board.json', legacy);
    await tamperAlert.waitFor({ state: 'visible', timeout: 15000 });
    const legacyText = await tamperAlert.innerText();
    assert(legacyText.includes('包含 2 個看板') && legacyText.includes('不能直接合併'), 'ambiguous legacy file must explain the scope blocker', { legacyText });
    assert(await page.locator('[data-backup-execute="true"]').count() === 0, 'ambiguous legacy file must not expose execute CTA');

    step = 'visible error and runtime sweep';
    const bodyText = await page.locator('body').innerText();
    assert(!/HTTP 4\d\d|HTTP 5\d\d|Internal Server Error|Not Found|Unhandled Promise/i.test(bodyText), 'backup UI must not show runtime/server errors', { bodyText: bodyText.slice(0, 1000) });
    assert(diagnostics.length === 0, 'browser must not emit console/page errors', { diagnostics });
    console.log(JSON.stringify({
      status: 'passed',
      downloaded: download.suggestedFilename(),
      taskCount: packageValue.payload.tasks.length,
      dependencyCount: packageValue.payload.dependencies.length,
      copiedBoardId: copyEvidence.copiedBoardId,
      screenshots: [
        '1440-all-board-batch.png', '1440-inspection.png', '1024-copy-plan.png',
        '390-copy-success.png', '1440-replace-plan.png', '1440-replace-success.png',
        '390-cross-origin-inspection.png', '320-tampered-error.png',
      ],
    }));
  } catch (error) {
    throw new Error(`DEV-047 browser QC failed at ${step}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
