/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const readEditor = async () =>
    page.evaluate(() => {
      const editor = document.querySelector('div[contenteditable="true"]');
      return {
        text: editor?.innerText ?? '',
        textContent: editor?.textContent ?? '',
        html: editor?.innerHTML ?? '',
        chipCount: document.querySelectorAll('[data-record-task-mention="true"]').length,
        chips: Array.from(document.querySelectorAll('[data-record-task-mention="true"]')).map((chip) => ({
          nodeId: chip.getAttribute('data-node-id'),
          title: chip.getAttribute('data-title'),
          text: chip.textContent,
        })),
      };
    });

  const focusEditor = async () => {
    const editor = page.locator('div[contenteditable="true"]');
    await expectCount(editor, 1, 'record content editor');
    await editor.click();
  };

  const placeEditorCaret = async (position) => {
    await page.evaluate((nextPosition) => {
      const editor = document.querySelector('div[contenteditable="true"]');
      const selection = window.getSelection();
      const range = document.createRange();
      editor.focus();
      range.selectNodeContents(editor);
      range.collapse(nextPosition === 'start');
      selection.removeAllRanges();
      selection.addRange(range);
    }, position);
  };

  const expectCount = async (locator, expected, label) => {
    const count = await locator.count();
    assert(count === expected, `${label} count mismatch`, { expected, actual: count });
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
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

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1440, height: 950 });
  await seedSession();
  await page.goto('http://127.0.0.1:4173/?qcReset=1&qcSize=18', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await seedSession();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  });

  if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
    await page.locator('button', { hasText: '使用固定測試環境' }).click();
    await page.locator('button', { hasText: /新增會議記錄|會議紀錄/ }).waitFor({ state: 'visible', timeout: 10000 });
  }

  if (!(await page.locator('div[contenteditable="true"]').count())) {
    const meetingButton = page.locator('button', { hasText: /新增會議記錄|會議紀錄/ });
    assert((await meetingButton.count()) >= 1, 'meeting entry button missing');
    await meetingButton.first().click();
  }

  await page.locator('div[contenteditable="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page.locator('div[contenteditable="true"]'), 1, 'record content editor');

  await focusEditor();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Alpha');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Beta');
  let state = await readEditor();
  assert(state.text.includes('Alpha') && state.text.includes('Beta'), 'basic typing or Enter failed', state);

  await page.keyboard.press('Control+A');
  await page.keyboard.type('Replaced');
  state = await readEditor();
  assert(state.text.trim() === 'Replaced', 'Ctrl+A replace should replace the whole editor content', state);

  await page.keyboard.press('Control+Z');
  state = await readEditor();
  assert(state.text.includes('Alpha') && state.text.includes('Beta'), 'Ctrl+Z should restore prior content', state);

  await page.keyboard.press('Control+Y');
  state = await readEditor();
  assert(state.text.trim() === 'Replaced', 'Ctrl+Y should restore replacement', state);

  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.evaluate(async () => navigator.clipboard.writeText('Paste One\nPaste Two'));
  await page.keyboard.press('Control+V');
  state = await readEditor();
  assert(
    state.text.includes('Paste One') && state.text.includes('Paste Two') && !state.html.includes('<div>Paste Two</div>'),
    'multiline paste should preserve text without browser-generated div debris',
    state,
  );

  await focusEditor();
  await page.keyboard.press('End');
  const linkedTasksToggle = page.locator('[data-record-linked-tasks-toggle="true"]').first();
  if ((await linkedTasksToggle.count()) === 1) {
    const expanded = await linkedTasksToggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await linkedTasksToggle.click();
  }
  const insertTaskButton = page.locator('button', { hasText: /插入任務|選取任務/ }).first();
  assert((await insertTaskButton.count()) === 1, 'meeting insert/select task button missing');
  await insertTaskButton.click();
  const firstTask = page.locator('text=品質驗證測試任務 1').first();
  assert((await firstTask.count()) >= 1, 'first kanban task missing');
  await firstTask.click();
  await page.waitForTimeout(300);
  state = await readEditor();
  assert(state.chipCount === 1, 'clicking a task after entering insert-task mode should insert one task chip', state);

  const copiedText = await page.evaluate(async () => {
    const chip = document.querySelector('[data-record-task-mention="true"]');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(chip);
    selection.removeAllRanges();
    selection.addRange(range);
    return chip.textContent;
  });
  await page.keyboard.press('Control+C');
  const clipboardAfterCopy = await page.evaluate(async () => navigator.clipboard.readText());
  assert(
    clipboardAfterCopy.startsWith('@[') && clipboardAfterCopy.includes('](task:'),
    'copying a task chip should put a portable task token on the clipboard',
    { copiedText, clipboardAfterCopy },
  );

  await placeEditorCaret('end');
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(300);
  state = await readEditor();
  assert(state.chipCount === 2, 'pasting a copied task chip should create another chip', state);

  await page.evaluate(() => {
    const chip = document.querySelector('[data-record-task-mention="true"]');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(chip);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Control+X');
  await page.waitForTimeout(300);
  state = await readEditor();
  assert(state.chipCount === 1, 'cutting a selected task chip should remove it from the editor', state);
  const clipboardAfterCut = await page.evaluate(async () => navigator.clipboard.readText());
  assert(
    clipboardAfterCut.startsWith('@[') && clipboardAfterCut.includes('](task:'),
    'cutting a task chip should keep a portable task token on the clipboard',
    { clipboardAfterCut },
  );

  await placeEditorCaret('start');
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(300);
  state = await readEditor();
  assert(state.chipCount === 2, 'cut-paste should move the chip to the new cursor position', state);

  await page.evaluate(() => {
    const chip = document.querySelector('[data-record-task-mention="true"]');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(chip);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  state = await readEditor();
  assert(state.chipCount === 1, 'Backspace should delete a selected task chip', state);

  await page.screenshot({ path: 'output/playwright/dev-006-gmail-editor.png', fullPage: true });
  return {
    passed: true,
    editorText: state.text,
    remainingChips: state.chips,
    clipboardAfterCopy,
    clipboardAfterCut,
    screenshot: 'output/playwright/dev-006-gmail-editor.png',
  };
}
