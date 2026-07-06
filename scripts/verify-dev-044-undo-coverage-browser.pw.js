/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const screenshotBase = `output/playwright/dev-044-undo-coverage-${Date.now()}`;

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const seedSession = async () => {
    await page.evaluate(({ account }) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      localStorage.setItem('projed-last-view', 'board');
    }, { account });
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await seedSession();
    await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await seedSession();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.app-board-title').waitFor({ state: 'visible', timeout: 10000 });
  };

  const titleText = async () => (await page.locator('.app-board-title').innerText()).trim();

  const waitForTitle = async (expected) => {
    await page.waitForFunction(
      (value) => document.querySelector('.app-board-title')?.textContent?.trim() === value,
      expected,
      { timeout: 5000 },
    );
  };

  const runCase = async (id, scenario, fn) => {
    const startedAt = new Date().toISOString();
    try {
      const details = await fn();
      results.push({ id, scenario, result: 'PASS', startedAt, details: details || {} });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', startedAt, error: error.message, screenshotPath });
    }
  };

  try {
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(20000);
    await openApp();

    await runCase('QA-044-B01', 'board title undo/redo uses stable toolbar command labels', async () => {
      const title = page.locator('.app-board-title').first();
      const originalTitle = await titleText();
      const nextTitle = `${originalTitle} DEV044`;

      await title.click();
      await title.evaluate((element, value) => {
        element.textContent = value;
      }, nextTitle);
      await page.keyboard.press('Tab');
      await waitForTitle(nextTitle);

      const undo = page.locator('#btn-undo');
      await page.waitForFunction(() => !document.querySelector('#btn-undo')?.hasAttribute('disabled'), null, { timeout: 5000 });
      const undoTitle = await undo.getAttribute('title');
      assert(/修改看板名稱/.test(undoTitle || ''), 'undo button should expose board title command label', { undoTitle });

      await undo.click();
      await waitForTitle(originalTitle);
      const redo = page.locator('#btn-redo');
      await page.waitForFunction(() => !document.querySelector('#btn-redo')?.hasAttribute('disabled'), null, { timeout: 5000 });
      const redoTitle = await redo.getAttribute('title');
      assert(/修改看板名稱/.test(redoTitle || ''), 'redo button should expose board title command label', { redoTitle });

      await redo.click();
      await waitForTitle(nextTitle);

      const screenshotPath = `${screenshotBase}-board-title-redone.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { originalTitle, nextTitle, undoTitle, redoTitle, screenshotPath };
    });

    await runCase('QA-044-B02', 'undo suppress guard prevents stack contamination after undo', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.app-board-title').waitFor({ state: 'visible', timeout: 10000 });
      const title = page.locator('.app-board-title').first();
      const currentTitle = await titleText();
      const nextTitle = `${currentTitle} suppress`;
      await title.click();
      await title.evaluate((element, value) => {
        element.textContent = value;
      }, nextTitle);
      await page.keyboard.press('Tab');
      await waitForTitle(nextTitle);

      await page.waitForFunction(() => !document.querySelector('#btn-undo')?.hasAttribute('disabled'), null, { timeout: 5000 });
      await page.locator('#btn-undo').click();
      await waitForTitle(currentTitle);
      const undoDisabledAfterUndo = await page.locator('#btn-undo').isDisabled();
      const redoDisabledAfterUndo = await page.locator('#btn-redo').isDisabled();
      assert(undoDisabledAfterUndo, 'undo should be disabled after consuming the only command', { undoDisabledAfterUndo });
      assert(!redoDisabledAfterUndo, 'redo should be enabled after undo', { redoDisabledAfterUndo });
      return { currentTitle, nextTitle, undoDisabledAfterUndo, redoDisabledAfterUndo };
    });

    await runCase('QA-044-B03', 'record archive undo restores saved record snapshot', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      const recordTitle = `DEV-044 undo record ${Date.now()}`;
      const recordContent = 'DEV-044 封存復原瀏覽器驗證內容';

      const workLogButton = page.locator('nav button', { hasText: '新增個人紀錄' }).first();
      await workLogButton.waitFor({ state: 'visible', timeout: 10000 });
      await workLogButton.click();
      const recordPanel = page.locator('[data-record-composer-shell]').first();
      await recordPanel.waitFor({ state: 'visible', timeout: 10000 });

      await page.locator('aside label', { hasText: '標題' }).locator('input').first().fill(recordTitle);
      const editor = page.locator('aside div[contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type(recordContent);
      await page.locator('aside button', { hasText: '存草稿' }).first().click();
      await page.waitForFunction(
        () => /新增紀錄/.test(document.querySelector('#btn-undo')?.getAttribute('title') || ''),
        null,
        { timeout: 10000 },
      );

      const archiveButton = page.locator('aside button', { hasText: '封存' }).first();
      await archiveButton.waitFor({ state: 'visible', timeout: 10000 });
      await archiveButton.click();
      await page.waitForFunction(
        () => /封存紀錄/.test(document.querySelector('#btn-undo')?.getAttribute('title') || ''),
        null,
        { timeout: 10000 },
      );
      const undoTitle = await page.locator('#btn-undo').getAttribute('title');

      await page.locator('#btn-undo').click();
      await page.waitForFunction(
        () => /封存紀錄/.test(document.querySelector('#btn-redo')?.getAttribute('title') || ''),
        null,
        { timeout: 10000 },
      );

      const recordsButton = page.locator('button', { hasText: '紀錄庫' }).first();
      await recordsButton.waitFor({ state: 'visible', timeout: 10000 });
      await recordsButton.click();
      await page.locator('h1', { hasText: '紀錄庫' }).waitFor({ state: 'visible', timeout: 10000 });
      const restoredRow = page.locator('.record-list-row', { hasText: recordTitle }).first();
      await restoredRow.waitFor({ state: 'visible', timeout: 10000 });
      const restoredText = await restoredRow.innerText();
      assert(restoredText.includes(recordContent), 'restored record row should keep saved content preview', { restoredText });

      const screenshotPath = `${screenshotBase}-record-archive-undo.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { recordTitle, recordContent, undoTitle, restoredText, screenshotPath };
    });
  } finally {
    const failed = results.filter((result) => result.result !== 'PASS');
    console.log(JSON.stringify({
      ok: failed.length === 0,
      summary: { pass: results.length - failed.length, fail: failed.length },
      results,
      diagnostics,
    }, null, 2));
    if (failed.length > 0) throw new Error(`DEV-044 browser verifier failed: ${failed.map((item) => item.id).join(', ')}`);
  }
}
