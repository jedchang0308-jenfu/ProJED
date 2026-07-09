/* eslint-disable */
async (page) => {
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'confirm') {
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const workspace = {
    id: 'dev050-note-delete-workspace',
    title: 'DEV-050 備註刪除工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev050-note-delete-board', title: '備註刪除測試看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const nodes = {
    'dev050-root': {
      id: 'dev050-root',
      workspaceId: workspace.id,
      boardId: 'dev050-note-delete-board',
      parentId: null,
      title: '備註測試欄位',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev050-task': {
      id: 'dev050-task',
      workspaceId: workspace.id,
      boardId: 'dev050-note-delete-board',
      parentId: 'dev050-root',
      title: '備註刪除任務',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      endDate: '2026-07-16',
      detailNotes: [
        { id: 'dev050-note-a', title: '保留備註', content: '這個備註應該保留' },
        { id: 'dev050-note-b', title: '刪除備註', content: '這個備註應該被刪除' },
      ],
      description: '這個備註應該保留',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  };

  const readStoredNotes = async () => page.evaluate(() => {
    const storedNodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    return storedNodes['dev050-task']?.detailNotes || [];
  });

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ account, workspace, nodes }) => {
    localStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify({
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    }));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', workspace.id);
    localStorage.setItem('projed-last-board', 'dev050-note-delete-board');
    localStorage.setItem('projed-last-view', 'board');
  }, { account, workspace, nodes });
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('[data-layout-region="board-canvas"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('open-task-details', { detail: { taskId: 'dev050-task' } }));
  });

  const modal = page.locator('[data-task-details-modal="true"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  await modal.locator('[data-task-detail-note-card="true"]').first().waitFor({ state: 'visible', timeout: 10000 });

  let beforeDelete = await modal.locator('[data-task-detail-note-card="true"]').count();
  assert(beforeDelete === 2, 'fixture should render two note cards', { beforeDelete });
  assert(await modal.locator('[data-task-detail-note-delete="true"]').count() === 2, 'each note card should expose a delete button');

  await modal.locator('[data-task-detail-note-delete="true"]').nth(1).click();
  await page.waitForFunction(() => {
    const storedNodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const notes = storedNodes['dev050-task']?.detailNotes || [];
    return notes.length === 1 && notes[0]?.id === 'dev050-note-a';
  }, null, { timeout: 10000 });

  const storedAfterFirstDelete = await readStoredNotes();
  assert(
    storedAfterFirstDelete.length === 1 &&
      storedAfterFirstDelete[0].title === '保留備註' &&
      storedAfterFirstDelete[0].content === '這個備註應該保留',
    'deleting a note should remove only that note and preserve the remaining note',
    storedAfterFirstDelete,
  );

  await modal.locator('[data-task-detail-note-delete="true"]').first().click();
  await page.waitForFunction(() => {
    const storedNodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
    const notes = storedNodes['dev050-task']?.detailNotes || [];
    return notes.length === 1 && notes[0]?.title === '備註 1' && notes[0]?.content === '';
  }, null, { timeout: 10000 });

  const result = await page.evaluate(() => {
    const modal = document.querySelector('[data-task-details-modal="true"]');
    const noteCards = Array.from(modal?.querySelectorAll('[data-task-detail-note-card="true"]') || []);
    const deleteButtons = Array.from(modal?.querySelectorAll('[data-task-detail-note-delete="true"]') || []);
    const titleInputs = Array.from(modal?.querySelectorAll('[data-task-detail-note-title-input="true"]') || []);
    const contentInputs = Array.from(modal?.querySelectorAll('[data-task-detail-note-content-input="true"]') || []);
    const visibleAlerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent || '').trim())
      .filter(Boolean);

    return {
      noteCardCount: noteCards.length,
      deleteButtonCount: deleteButtons.length,
      titleValues: titleInputs.map((element) => element.value),
      contentValues: contentInputs.map((element) => element.value),
      deleteButtonTitles: deleteButtons.map((element) => element.getAttribute('title')),
      visibleAlerts,
      storedNotes: JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}')['dev050-task']?.detailNotes || [],
    };
  });

  assert(result.noteCardCount === 1, 'last note deletion should leave one blank note card visible', result);
  assert(result.deleteButtonCount === 1, 'remaining blank note card should still have a delete affordance', result);
  assert(result.titleValues[0] === '備註 1' && result.contentValues[0] === '', 'remaining note should be blank after deleting the last note', result);
  assert(result.deleteButtonTitles[0] === '刪除此備註欄', 'delete affordance should be discoverable by title', result);
  assert(result.visibleAlerts.length === 0, 'note delete flow should not show runtime alerts', result);

  await page.screenshot({ path: 'output/playwright/dev-050-task-detail-note-delete.png', fullPage: true });
  console.log(JSON.stringify({ ...result, diagnostics: diagnostics.slice(-10) }, null, 2));
}
