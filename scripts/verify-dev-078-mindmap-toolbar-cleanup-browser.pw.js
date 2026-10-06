/* eslint-disable */
async (page) => {
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
  const errors = { console: [], page: [], requests: [] };
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', error => errors.page.push(String(error)));
  page.on('requestfailed', request => errors.requests.push(`${request.method()} ${request.url()}`));

  const selectViewMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };
  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const visibleError = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'TypeError', 'ReferenceError', 'Unhandled Runtime Error']
      .find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show a visible runtime error`, { visibleError });
  };
  const toolbarSnapshot = async () => page.locator('[data-mindmap-view] .app-compact-toolbar').first().evaluate(element => ({
    text: element.textContent || '',
    createButtonCount: element.querySelectorAll('[data-mindmap-create-root]').length,
    hintCount: Array.from(element.querySelectorAll('*')).filter(child => child.textContent?.includes('Enter 新增同階，Tab 新增子任務，Delete 刪除')).length,
    relationshipToolCount: element.querySelectorAll('[data-mindmap-note-relationship-tool]').length,
    zoomControlsCount: element.querySelectorAll('[data-mindmap-zoom-controls]').length,
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    localStorage.setItem('projed-local-test.selected-account', account.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(account));
    Object.keys(localStorage)
      .filter(key => key.startsWith('projed.mindmap.'))
      .forEach(key => localStorage.removeItem(key));
  }, account);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await selectViewMode('mindmap');
  await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
  const desktop = await toolbarSnapshot();
  assert(desktop.createButtonCount === 0, 'desktop mind map toolbar should not render 新增任務', desktop);
  assert(desktop.hintCount === 0 && !desktop.text.includes('Enter 新增同階，Tab 新增子任務，Delete 刪除'), 'desktop toolbar should not render the removed keyboard hint', desktop);
  assert(desktop.relationshipToolCount === 1 && desktop.zoomControlsCount === 1, 'desktop toolbar should keep relationship and zoom controls', desktop);
  await assertNoVisibleErrors('DEV-078 desktop');
  await page.screenshot({ path: 'output/playwright/dev-078-mindmap-toolbar-cleanup/desktop.png', fullPage: true });

  // Enter still creates a root when no node is selected, proving the removed button was only a shortcut.
  await page.locator('[data-mindmap-view]').focus();
  await page.keyboard.press('Enter');
  const quickTitle = page.locator('[data-mindmap-quick-title-input="true"]');
  await quickTitle.waitFor({ state: 'visible', timeout: 10000 });
  const rootTitle = `DEV078 keyboard root ${Date.now().toString(36)}`;
  await quickTitle.fill(rootTitle);
  await quickTitle.press('Enter');
  await page.locator(`[data-mindmap-node-title="${rootTitle}"]`).waitFor({ state: 'visible', timeout: 10000 });
  await assertNoVisibleErrors('DEV-078 keyboard regression');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(250);
  const laptop = await toolbarSnapshot();
  assert(laptop.createButtonCount === 0 && laptop.hintCount === 0, 'laptop toolbar should keep both removed elements absent', laptop);
  await assertNoVisibleErrors('DEV-078 laptop');
  await page.screenshot({ path: 'output/playwright/dev-078-mindmap-toolbar-cleanup/laptop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => ({
    width: window.innerWidth,
    mindMapVisible: Array.from(document.querySelectorAll('[data-mindmap-view]')).some(element => element instanceof HTMLElement && element.offsetParent !== null),
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    createButtonCount: document.querySelectorAll('[data-mindmap-create-root]').length,
    hintCount: Array.from(document.querySelectorAll('*')).filter(element => element.textContent?.includes('Enter 新增同階，Tab 新增子任務，Delete 刪除')).length,
  }));
  assert(mobile.createButtonCount === 0 && mobile.hintCount === 0, 'mobile boundary should not reintroduce removed toolbar elements', mobile);
  assert(mobile.documentOverflow <= 2, 'mobile boundary should not introduce document overflow', mobile);
  await assertNoVisibleErrors('DEV-078 mobile');
  await page.screenshot({ path: 'output/playwright/dev-078-mindmap-toolbar-cleanup/mobile.png', fullPage: true });
  assert(errors.console.length === 0 && errors.page.length === 0 && errors.requests.length === 0, 'browser should have no console/page/network errors', errors);

  await page.evaluate((artifact) => { window.__DEV078_ARTIFACT = artifact; }, {
    ok: true,
    desktop,
    laptop,
    mobile,
    keyboard: { enterRoot: true, tabChild: 'source contract retained' },
    errors,
  });
}
