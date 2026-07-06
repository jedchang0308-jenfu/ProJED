/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));

  const results = [];
  const screenshotBase = `output/playwright/dev-024-ai-synthesis-${Date.now()}`;

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const workspace = {
    id: 'dev024-workspace',
    title: 'DEV-024 工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev024-board', title: 'DEV-024 會議紀錄測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev024-root': {
      id: 'dev024-root',
      workspaceId: workspace.id,
      boardId: 'dev024-board',
      parentId: null,
      title: 'DEV-024 測試主線',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev024-task-a': {
      id: 'dev024-task-a',
      workspaceId: workspace.id,
      boardId: 'dev024-board',
      parentId: 'dev024-root',
      title: 'DEV-024 匯入任務',
      status: 'in_progress',
      nodeType: 'task',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev024-task-b': {
      id: 'dev024-task-b',
      workspaceId: workspace.id,
      boardId: 'dev024-board',
      parentId: 'dev024-root',
      title: 'DEV-024 手寫任務',
      status: 'todo',
      nodeType: 'task',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const countOccurrences = (text, needle) => {
    if (!needle) return 0;
    return text.split(needle).length - 1;
  };

  const seed = async ({ activityEvents = [] } = {}) => {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes, activityEvents }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify(activityEvents));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev024-board');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes, activityEvents });

    await page.goto('http://127.0.0.1:4173/?dev024=1', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('nav button', { hasText: '新增會議記錄' }).waitFor({ state: 'visible', timeout: 10000 });
  };

  const openMeetingComposer = async (title, content) => {
    await page.locator('nav button', { hasText: '新增會議記錄' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('aside label', { hasText: '標題' }).locator('input').first().fill(title);

    const editor = page.locator('aside div[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.fill(content);
    const lastLine = content.split('\n').map(line => line.trim()).filter(Boolean).at(-1) || content.trim();
    await page.waitForFunction(
      (expected) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(expected),
      lastLine,
      { timeout: 5000 },
    );
  };

  const appendMeetingContent = async (content) => {
    const editor = page.locator('aside div[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText(`\n${content}`);
    try {
      await page.waitForFunction(
        (expected) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(expected),
        content,
        { timeout: 1500 },
      );
      return;
    } catch {
      const currentText = await editor.innerText();
      await editor.fill(`${currentText.trimEnd()}\n${content}`);
      await page.waitForFunction(
        (expected) => (document.querySelector('aside div[contenteditable="true"]')?.textContent || '').includes(expected),
        content,
        { timeout: 5000 },
      );
    }
  };

  const runAiSynthesis = async () => {
    const aiStep = page.locator('[data-meeting-workflow-step="ai_suggestion"]');
    await aiStep.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector('[data-meeting-workflow-step="ai_suggestion"]')?.hasAttribute('disabled'),
      null,
      { timeout: 10000 },
    );
    await aiStep.click();
    await page.locator('aside', { hasText: 'AI整理完成，請校稿後發布' }).waitFor({ state: 'visible', timeout: 10000 });
  };

  const saveReviewDraft = async (title) => {
    const reviewStep = page.locator('[data-meeting-workflow-step="review"]');
    await page.waitForFunction(
      () => !document.querySelector('[data-meeting-workflow-step="review"]')?.hasAttribute('disabled'),
      null,
      { timeout: 10000 },
    );
    await reviewStep.click();
    await page.waitForFunction((expectedTitle) => {
      const records = JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
      return records.some(record => record.title === expectedTitle && record.content?.trim());
    }, title, { timeout: 10000 });
  };

  const getSavedRecordContent = async (title) => page.evaluate((expectedTitle) => {
    const records = JSON.parse(localStorage.getItem('projed-local-test.knowledgeRecords') || '[]');
    const record = records.find(item => item.title === expectedTitle);
    return record?.content || '';
  }, title);

  const runAndSaveAiDraft = async (title) => {
    await runAiSynthesis();
    await saveReviewDraft(title);
    return getSavedRecordContent(title);
  };

  const importProjectChange = async () => {
    await page.locator('[data-meeting-workflow-step="project_import"]').click();
    const panel = page.locator('[data-project-change-import-panel]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('button', { hasText: '整理專案變化' }).click();
    await panel.locator('button', { hasText: '插入紀錄並開始撰寫' }).waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('button', { hasText: '插入紀錄並開始撰寫' }).click();
    await panel.waitFor({ state: 'detached', timeout: 10000 });
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

    await runCase('ROT-001', 'plain handwritten paragraph survives AI整理', async () => {
      await seed();
      const title = `DEV-024 ROT-001 ${Date.now()}`;
      const handwritten = '客戶要求 6/20 前確認報價風險';
      await openMeetingComposer(title, handwritten);
      const content = await runAndSaveAiDraft(title);
      assert(content.includes(handwritten), 'AI整理 should preserve plain handwritten content', { content });
      assert(countOccurrences(content, handwritten) === 1, 'plain handwritten content should be preserved once', { content });
      const screenshotPath = `${screenshotBase}-ROT-001.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { title, screenshotPath, contentExcerpt: content.slice(0, 500) };
    });

    await runCase('ROT-002', 'custom handwritten section content survives AI整理', async () => {
      await seed();
      const title = `DEV-024 ROT-002 ${Date.now()}`;
      const sectionBody = '本案背景是客戶要先確認量產條件。';
      await openMeetingComposer(title, `## 會議背景\n${sectionBody}`);
      const content = await runAndSaveAiDraft(title);
      assert(content.includes(sectionBody), 'AI整理 should preserve custom section body', { content });
      assert(/會議背景/.test(content), 'custom section context should remain traceable after AI整理', { content });
      const screenshotPath = `${screenshotBase}-ROT-002.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { title, screenshotPath, contentExcerpt: content.slice(0, 500) };
    });

    await runCase('ROT-003-004', 'project change import plus handwritten supplement remains single-record and idempotent', async () => {
      const now = Date.now();
      await seed({
        activityEvents: [
          {
            id: 'dev024-activity-status',
            workspaceId: workspace.id,
            boardId: 'dev024-board',
            actorId: account.id,
            eventType: 'task_status_changed',
            entityTable: 'wbs_items',
            entityId: 'dev024-task-a',
            payload: {
              taskId: 'dev024-task-a',
              taskTitle: 'DEV-024 匯入任務',
              before: { status: 'todo' },
              after: { status: 'in_progress' },
            },
            createdAt: now - 3600_000,
          },
        ],
      });

      const title = `DEV-024 ROT-003 ${Date.now()}`;
      const supplement = '使用者補充：供應商需要週五前確認交期。';
      await openMeetingComposer(title, '會前先整理本週專案變更。');
      await importProjectChange();
      await appendMeetingContent(supplement);

      await runAiSynthesis();
      const firstEditorText = await page.locator('aside div[contenteditable="true"]').first().innerText();
      assert(firstEditorText.includes('DEV-024 匯入任務'), 'first AI整理 should keep imported project task evidence', { firstEditorText });
      assert(firstEditorText.includes(supplement), 'first AI整理 should keep handwritten supplement', { firstEditorText });

      await runAiSynthesis();
      await saveReviewDraft(title);
      const content = await getSavedRecordContent(title);
      assert(content.includes('DEV-024 匯入任務'), 'saved content should keep project change evidence', { content });
      assert(content.includes('狀態由「待辦」改為「進行中」'), 'saved content should keep status-change evidence', { content });
      assert(content.includes(supplement), 'saved content should keep handwritten supplement', { content });
      assert(countOccurrences(content, supplement) === 1, 'repeated AI整理 should not duplicate handwritten supplement', { content });
      assert((content.match(/^1\.\s+/gm) || []).length === 1, 'saved content should keep a single main summary heading', { content });
      assert((content.match(/^2\.\s+/gm) || []).length === 1, 'saved content should keep a single task discussion heading', { content });
      assert((content.match(/^3\.\s+/gm) || []).length === 1, 'saved content should keep a single other heading', { content });
      const screenshotPath = `${screenshotBase}-ROT-003-004.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { title, screenshotPath, contentExcerpt: content.slice(0, 700) };
    });
  } finally {
    const failed = results.filter(result => result.result !== 'PASS');
    console.log(JSON.stringify({
      ok: failed.length === 0,
      summary: { pass: results.length - failed.length, fail: failed.length },
      results,
      diagnostics: diagnostics.slice(-40),
    }, null, 2));
    if (failed.length > 0) {
      throw new Error(`DEV-024 browser ROT verifier failed: ${JSON.stringify(failed, null, 2)}`);
    }
  }
}
