/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
    }
  };

  const readStepState = async () => page.evaluate(() => {
    const read = (stage) => {
      const element = document.querySelector(`[data-meeting-workflow-step="${stage}"]`);
      return {
        exists: Boolean(element),
        state: element?.getAttribute('data-meeting-workflow-step-state') || null,
        ariaCurrent: element?.getAttribute('aria-current') || null,
        disabled: element?.hasAttribute('disabled') ?? null,
        text: element?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    };

    return {
      import: read('project_import'),
      capture: read('capture'),
      ai: read('ai_suggestion'),
      review: read('review'),
      published: read('published'),
      visibleAlerts: Array.from(document.querySelectorAll('[role="alert"], .inline-error'))
        .map(element => element.textContent?.trim())
        .filter(Boolean),
    };
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:4173/?qcReset=1', { waitUntil: 'networkidle' });

  const fixedTestLogin = page.locator('button', { hasText: '使用固定測試環境' }).first();
  if (await fixedTestLogin.count()) {
    await fixedTestLogin.click();
  }

  const meetingButton = page.locator('nav button[title*="新增會議記錄"]').first();
  await meetingButton.waitFor({ state: 'visible', timeout: 15000 });
  await meetingButton.click();

  await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-meeting-workflow-step="capture"]').waitFor({ state: 'visible', timeout: 10000 });

  const initialStates = await readStepState();
  assert(initialStates.capture.state === 'current', 'new meeting starts in capture state', initialStates);
  assert(initialStates.published.state === 'locked', 'new empty meeting keeps publish locked', initialStates);

  const editor = page.locator('aside [contenteditable="true"][aria-placeholder*="記錄討論"]').first();
  await editor.waitFor({ state: 'visible', timeout: 10000 });
  const initialEditorText = await editor.innerText();
  assert(
    initialEditorText.includes('1. 本次會議總結') &&
      initialEditorText.includes('2. 任務討論與結論') &&
      initialEditorText.includes('3. 臨時動議&其他'),
    'new meeting editor should start with the three meeting sections',
    { initialEditorText },
  );
  await editor.click();
  await page.keyboard.type('這是一段會議速記，使用者還在與 AI 協作整理。');

  await page.waitForFunction(() => {
    const publish = document.querySelector('[data-meeting-workflow-step="published"]');
    return publish?.getAttribute('data-meeting-workflow-step-state') === 'available';
  });

  const typedStates = await readStepState();
  assert(typedStates.capture.state === 'current', 'typing content should keep capture as the current step', typedStates);
  assert(typedStates.capture.ariaCurrent === 'step', 'capture should remain aria-current after typing', typedStates);
  assert(typedStates.ai.state === 'optional' && typedStates.ai.disabled === false, 'AI整理 should be optional and enabled after typing', typedStates);
  assert(typedStates.review.state === 'locked', 'review should stay locked until AI draft exists', typedStates);
  assert(typedStates.published.state === 'available' && typedStates.published.disabled === false, 'publish should be available after typing', typedStates);
  assert(typedStates.published.ariaCurrent !== 'step', 'publish must not become aria-current just because content exists', typedStates);
  assert(typedStates.visibleAlerts.length === 0, 'typing in record editor should not show visible errors', typedStates);

  await page.screenshot({
    path: 'output/playwright/record-workflow-no-auto-publish-step.png',
    fullPage: true,
  });

  return {
    passed: true,
    states: typedStates,
    screenshot: 'output/playwright/record-workflow-no-auto-publish-step.png',
  };
}
