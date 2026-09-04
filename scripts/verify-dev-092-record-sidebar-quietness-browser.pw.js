/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const browserErrors = [];
  const compactControlHeights = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('(pointer: coarse)') || query.includes('(max-width: 640px)')) {
        return {
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        };
      }
      return nativeMatchMedia(query);
    };
  });

  const openMeetingRecord = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto('http://localhost:4000/', { waitUntil: 'networkidle' });
    if (await page.locator('button', { hasText: '使用固定測試環境' }).count()) {
      await page.locator('button', { hasText: '使用固定測試環境' }).click();
    }
    const meetingEntry = page.locator('nav button', { hasText: '新增會議記錄' }).first();
    await meetingEntry.waitFor({ state: 'attached', timeout: 15000 });
    await page.evaluate(() => document.querySelector('nav button[title^="新增會議記錄"]')?.click());
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const assertQuietHeader = async (label) => {
    const title = page.locator('[data-record-sidebar-title]');
    const collapse = page.locator('[data-record-sidebar-collapse-toggle]');
    assert(await title.count() === 1, `${label}: record title should remain visible`);
    assert(await title.locator('svg').count() === 0, `${label}: decorative title icon should be removed`);
    assert(await page.locator('[data-record-sidebar-header] button[aria-label="紀錄功能說明"]').count() === 0, `${label}: help control should be removed`);
    assert(await page.getByText('AI選用', { exact: true }).count() === 0, `${label}: AI selection badge should be removed`);
    assert(await page.getByText('本機已保存，雲端已完成 checkpoint', { exact: true }).count() === 0, `${label}: completed checkpoint message should be removed`);
    assert(await page.getByText('本機已保存，等待雲端 checkpoint', { exact: true }).count() === 0, `${label}: pending checkpoint message should be removed`);
    assert(await page.getByText('雲端已保存', { exact: true }).count() === 0, `${label}: completed cloud-save message should be removed`);
    assert(await page.locator('[data-meeting-activity-source-toggle]').count() === 0, `${label}: AI synthesis task-change source row should be removed`);
    assert(await page.getByText('AI整理來源：任務變更', { exact: true }).count() === 0, `${label}: AI synthesis task-change source text should be removed`);
    assert(await page.getByText('會議流程', { exact: true }).count() === 0, `${label}: workflow heading should be removed`);
    assert(await page.getByText('速記、AI整理、校稿與發布在同一條流程上操作。', { exact: true }).count() === 0, `${label}: workflow helper text should be removed`);
    const titleInput = page.locator('[data-record-title-input]');
    assert(await titleInput.count() === 1, `${label}: record title input should remain available`);
    assert((await titleInput.inputValue()) === '會議紀錄', `${label}: default meeting title should not include a date suffix`, { title: await titleInput.inputValue() });
    const occurredAtInput = page.locator('[data-record-datetime-input="meeting-occurred-at"]');
    const occurredAtValue = await occurredAtInput.inputValue();
    assert(await occurredAtInput.getAttribute('type') === 'text', `${label}: meeting time should use a locale-independent text input`);
    assert(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(occurredAtValue), `${label}: meeting time should use YYYY/MM/DD HH:mm`, { occurredAtValue });
    assert(!/[上午下午]/.test(occurredAtValue), `${label}: meeting time should not display AM/PM text`, { occurredAtValue });
    const participantIconCount = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('label')).find(node => node.firstChild?.textContent?.trim() === '參與人員');
      return label?.querySelectorAll('svg').length ?? -1;
    });
    assert(participantIconCount === 0, `${label}: participant field should not show a decorative icon`, { participantIconCount });
    const workflowSteps = page.locator('[data-meeting-workflow-arrow-stepper] [data-meeting-workflow-step]');
    const workflowVisuals = await workflowSteps.evaluateAll(nodes => nodes.map(node => ({
      iconCount: node.querySelectorAll('svg').length,
      childCount: node.children.length,
    })));
    assert(workflowVisuals.length === 3, `${label}: meeting workflow should keep three visible stage actions`, { workflowVisuals });
    assert(workflowVisuals.every(item => item.iconCount === 0 && item.childCount === 1), `${label}: each meeting stage should only show its primary label`, { workflowVisuals });
    const workflowInteractivity = await workflowSteps.evaluateAll(nodes => nodes.map(node => ({
      stage: node.getAttribute('data-meeting-workflow-step'),
      enabled: !node.disabled,
      cursor: getComputedStyle(node).cursor,
      height: node.getBoundingClientRect().height,
    })));
    assert(workflowInteractivity.map(item => item.stage).join(',') === 'capture,ai_suggestion,published', `${label}: import and review steps should not be rendered in the meeting workflow`, { workflowInteractivity });
    assert(workflowInteractivity.every(item => item.height <= 40), `${label}: meeting workflow buttons should use the compact height`, { workflowInteractivity });
    assert(workflowInteractivity.every(item => item.enabled ? item.cursor === 'pointer' : item.cursor === 'not-allowed'), `${label}: only clickable meeting workflow stages should use the pointer cursor`, { workflowInteractivity });
    const contentHeaderGeometry = await page.evaluate(() => {
      const header = document.querySelector('[data-record-content-header]')?.getBoundingClientRect();
      const importControl = document.querySelector('[data-meeting-project-change-import-control]')?.getBoundingClientRect();
      const contentLabel = Array.from(document.querySelectorAll('[data-record-content-header] span')).find(node => node.textContent?.trim() === '內容')?.getBoundingClientRect();
      const importTrigger = document.querySelector('[data-meeting-import-trigger]');
      return header && importControl && contentLabel ? {
        headerTop: header.top,
        headerBottom: header.bottom,
        headerRight: header.right,
        importTop: importControl.top,
        importRight: importControl.right,
        contentTop: contentLabel.top,
        importTriggerLabel: importTrigger?.textContent?.trim() ?? null,
      } : null;
    });
    assert(contentHeaderGeometry?.importTriggerLabel === '匯入專案變化', `${label}: meeting import should expose one first-layer entry point`, contentHeaderGeometry);
    assert(contentHeaderGeometry && contentHeaderGeometry.importRight <= contentHeaderGeometry.headerRight + 1, `${label}: import controls should be right-aligned in the content header`, contentHeaderGeometry);
    assert(contentHeaderGeometry && Math.abs(contentHeaderGeometry.importTop - contentHeaderGeometry.contentTop) <= 1, `${label}: import controls should share the content label row`, contentHeaderGeometry);
    const compactControls = page.locator('[data-record-compact-controls]');
    const compactControlsHeight = await compactControls.boundingBox().then(box => box?.height ?? 0);
    compactControlHeights.push({ label, height: compactControlsHeight });
    assert(compactControlsHeight <= 44, `${label}: meeting visibility control should use the compact layout`, { compactControlsHeight });
    assert(await compactControls.getByText('分享範圍', { exact: true }).count() === 1, `${label}: compact meeting visibility label should remain discoverable`);
    const meetingActionLayout = await page.evaluate(() => {
      const row = document.querySelector('[data-record-meeting-actions]');
      const save = document.querySelector('[data-record-meeting-save-draft]');
      const visibility = document.querySelector('[data-record-visibility-control]');
      if (!row || !save || !visibility) return null;
      const rowRect = row.getBoundingClientRect();
      const saveRect = save.getBoundingClientRect();
      const visibilityRect = visibility.getBoundingClientRect();
      return {
        display: getComputedStyle(row).display,
        rowTop: rowRect.top,
        saveTop: saveRect.top,
        saveBottom: saveRect.bottom,
        visibilityTop: visibilityRect.top,
        visibilityBottom: visibilityRect.bottom,
        saveRight: saveRect.right,
        visibilityLeft: visibilityRect.left,
      };
    });
    assert(meetingActionLayout?.display === 'flex' && meetingActionLayout.saveTop < meetingActionLayout.visibilityBottom && meetingActionLayout.visibilityTop < meetingActionLayout.saveBottom && meetingActionLayout.saveRight <= meetingActionLayout.visibilityLeft + 1, `${label}: save and visibility controls should share one horizontal row`, meetingActionLayout);
    const meetingMetaGrid = page.locator('[data-record-meeting-meta-grid]');
    assert(await meetingMetaGrid.count() === 1, `${label}: meeting title and time should share one metadata row`);
    const meetingMetaGeometry = await meetingMetaGrid.locator(':scope > label').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right, width: rect.width };
    }));
    assert(meetingMetaGeometry.length === 2, `${label}: meeting metadata row should contain title and time fields`, { meetingMetaGeometry });
    assert(Math.abs(meetingMetaGeometry[0].top - meetingMetaGeometry[1].top) <= 1 && meetingMetaGeometry[0].right <= meetingMetaGeometry[1].left + 1, `${label}: meeting title and time should be arranged horizontally`, { meetingMetaGeometry });
    const contentLayout = await page.evaluate(() => {
      const editor = document.querySelector('[contenteditable="true"]');
      const contentLabel = editor?.closest('label');
      const controls = document.querySelector('[data-record-compact-controls]');
      if (!editor || !contentLabel || !controls) return null;
      const editorRect = editor.getBoundingClientRect();
      const contentLabelRect = contentLabel.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const editorStyle = getComputedStyle(editor);
      return {
        editorHeight: editorRect.height,
        editorBottom: editorRect.bottom,
        editorMinHeight: parseFloat(editorStyle.minHeight) || 0,
        editorFlex: editorStyle.flex,
        contentLabelHeight: contentLabelRect.height,
        contentLabelFlex: getComputedStyle(contentLabel).flex,
        controlsTop: controlsRect.top,
      };
    });
    assert(contentLayout && contentLayout.editorHeight + 1 >= contentLayout.editorMinHeight, `${label}: content editor should retain its minimum usable height`, contentLayout);
    assert(contentLayout && contentLayout.editorBottom <= contentLayout.controlsTop + 1, `${label}: content editor should end before the fixed bottom controls`, contentLayout);
    assert(contentLayout && contentLayout.editorFlex.startsWith('1 ') && contentLayout.contentLabelFlex.startsWith('1 '), `${label}: content editor should flex-fill the remaining composer space`, contentLayout);
    assert(await page.locator('[data-record-help-dialog]').count() === 0, `${label}: help modal should be removed`);
    assert(await collapse.count() === 1 && await collapse.getAttribute('aria-label') === '收合會議速記面板', `${label}: collapse control should use the shared accessible name`);
    assert(await collapse.getAttribute('data-record-sidebar-collapse-direction') === 'right', `${label}: collapse control should point toward the right`);
    const geometry = await page.evaluate(() => {
      const titleNode = document.querySelector('[data-record-sidebar-title]');
      const collapseNode = document.querySelector('[data-record-sidebar-collapse-toggle]');
      const closeNode = document.querySelector('[data-record-composer-close]');
      if (!titleNode || !collapseNode || !closeNode) return null;
      const titleRect = titleNode.getBoundingClientRect();
      const collapseRect = collapseNode.getBoundingClientRect();
      const closeRect = closeNode.getBoundingClientRect();
      return {
        titleLeft: titleRect.left,
        titleRight: titleRect.right,
        collapseLeft: collapseRect.left,
        collapseRight: collapseRect.right,
        closeLeft: closeRect.left,
      };
    });
    assert(geometry && geometry.collapseRight <= geometry.titleLeft + 1 && geometry.collapseRight < geometry.closeLeft, `${label}: collapse control should sit at the drawer's left edge before the title`, geometry);
  };

  const runViewport = async (viewport, label) => {
    await openMeetingRecord(viewport);
    await assertQuietHeader(label);
    await page.screenshot({
      path: `output/playwright/dev-092/record-sidebar-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
    const recoveryStatusText = await page.locator('[data-meeting-draft-recovery-status]').allTextContents();
    assert(!recoveryStatusText.some(text => text.includes('雲端已完成 checkpoint')), `${label}: completed checkpoint message should not be rendered`, { recoveryStatusText });
    assert(await page.locator('[data-record-composer-linked-tasks][data-record-linked-tasks-toggle]').count() === 0, `${label}: empty linked-task summary should be removed`);
    assert(await page.locator('[data-record-linked-tasks-empty-action]').count() === 0, `${label}: empty linked-task action should be removed`);
    assert(await page.locator('[data-record-status-summary]').count() === 0, `${label}: redundant status summary should stay removed`);

    await page.locator('[data-record-sidebar-collapse-toggle]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 10000 });
    const expand = page.locator('[data-record-sidebar-expand-toggle][aria-label="展開紀錄欄"]');
    assert(await expand.count() === 1 && await expand.getAttribute('data-record-sidebar-expand-direction') === 'left', `${label}: collapsed record panel should expose a left-pointing expand control`);
    await page.locator('[data-record-sidebar-expand-toggle]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
    await assertQuietHeader(`${label} after expand`);
    assert(browserErrors.length === 0, `${label}: browser should have no visible runtime errors`, { browserErrors });
    await page.locator('[data-record-composer-close]').click();
    const exitDialog = page.locator('.global-dialog-content');
    await exitDialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    const discard = page.getByRole('button', { name: /直接離開|不儲存，繼續/ });
    if (await discard.count()) await discard.first().click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  await runViewport({ width: 1440, height: 900 }, 'DEV-092 desktop 1440x900');
  await runViewport({ width: 390, height: 844 }, 'DEV-092 narrow 390x844');

  const overflow = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
  }));
  assert(overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1 && overflow.rootScrollWidth <= overflow.rootClientWidth + 1, 'DEV-092 final viewport should not have horizontal overflow', overflow);
  console.log(JSON.stringify({ viewports: ['1440x900', '390x844'], compactControlHeights, overflow, browserErrors }));
}
