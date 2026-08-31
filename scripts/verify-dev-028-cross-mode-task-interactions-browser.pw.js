/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const openApp = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
      // Seed a stale undersized value to verify the modal restores its protected desktop work area.
      localStorage.setItem('projed.taskDetailsModal.size.v4', JSON.stringify({ width: 560, height: 560 }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const switchMode = async (mode) => {
    await page.locator('[data-mode-switcher-trigger="true"]').click();
    await page.locator(`[data-mode-switcher-value="${mode}"]`).click();
    await page.waitForTimeout(250);
  };

  const closeDetails = async () => {
    await page.locator('[data-task-details-modal="true"] button[aria-label="關閉任務詳情"]').click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const closeDetailsWithEsc = async () => {
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await page.keyboard.press('Escape');
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });
  };

  const firstVisibleTask = async (selector) => {
    const locator = page.locator(selector).filter({ hasNot: page.locator('[data-task-title-input="true"]') }).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    return locator;
  };

  const clickTaskMainSurface = async (locator, position = { x: 80, y: 12 }) => {
    await locator.click({ position });
  };

  const assertClickOpensDetails = async ({ mode, selector, titleInputSelector, clickPosition }) => {
    await switchMode(mode);
    const task = await firstVisibleTask(selector);
    const taskId = await task.getAttribute('data-task-id');
    assert(Boolean(taskId), `${mode} task should expose data-task-id`);

    const clickDebug = await task.evaluate((element, position) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + position.x;
      const y = rect.top + position.y;
      const hit = document.elementFromPoint(x, y);
      return {
        taskId: element.getAttribute('data-task-id'),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        },
        click: { x: Math.round(x), y: Math.round(y) },
        hitTag: hit?.tagName || null,
        hitText: hit?.textContent?.trim().slice(0, 80) || '',
        hitTaskId: hit?.closest?.('[data-task-id]')?.getAttribute('data-task-id') || null,
        hitControl: Boolean(hit?.closest?.('[data-task-interaction-control="true"],[data-task-drag-handle="true"]')),
        workbenchPanel: document.querySelector('[data-task-workbench-panel]')?.getAttribute('data-task-workbench-panel') || null,
        recordSelectingBanner: document.body.textContent?.includes('選擇任務加入紀錄') || false,
      };
    }, clickPosition);

    await clickTaskMainSurface(task, clickPosition);
    const modal = page.locator('[data-task-details-modal="true"]');
    try {
      await modal.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      throw new Error(`${mode} click did not open TaskDetailsModal: ${JSON.stringify(clickDebug)}`);
    }
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, `${mode} single click should open TaskDetailsModal`, { taskId, modalTaskId });
    const detailTitleInput = modal.locator('[data-task-details-title-input="true"]');
    await detailTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await detailTitleInput.count() === 1, `${mode} details title input should be the editable title locus`);
    if (mode === 'board') {
      const dialogBox = await modal.locator('[data-task-details-dialog="true"]').boundingBox();
      const viewport = page.viewportSize();
      const dialogSizeGuard = await modal.locator('[data-task-details-dialog="true"]').evaluate((dialog) => {
        const style = getComputedStyle(dialog);
        return {
          minWidth: Number.parseFloat(style.minWidth),
          minHeight: Number.parseFloat(style.minHeight),
        };
      });
      assert(Boolean(dialogBox && viewport), 'board task details dialog should expose measurable desktop geometry');
      assert(
        dialogBox.width >= viewport.width * 0.7
          && dialogBox.width >= dialogSizeGuard.minWidth - 1
          && dialogBox.height >= dialogSizeGuard.minHeight - 1,
        'desktop task details dialog should open as a protected large work area',
        { dialogBox, dialogSizeGuard, viewport },
      );
      const metaGeometry = await modal.locator('[data-task-details-meta-grid="true"]').evaluate((grid) => {
        const fieldNames = ['status', 'assignment'];
        const fields = fieldNames.map((name) => {
          const candidates = Array.from(grid.querySelectorAll(`[data-task-details-meta-field="${name}"]`));
          const element = candidates.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          const rect = element?.getBoundingClientRect();
          const controlRect = element?.querySelector('[data-task-details-meta-control-row="true"]')?.getBoundingClientRect();
          return rect
            ? {
              name,
              top: controlRect?.top ?? rect.top,
              bottom: controlRect?.bottom ?? rect.bottom,
              left: rect.left,
              right: rect.right,
            }
            : null;
        }).filter(Boolean);
        const dateRange = grid.querySelector('[data-task-details-schedule-controls="true"]');
        const dateRangeRect = dateRange?.getBoundingClientRect();
        const dateRangeBaseline = dateRange?.querySelector('[data-task-details-meta-field="start"]');
        const dateRangeBaselineControl = dateRangeBaseline?.querySelector('[data-task-details-meta-control-row="true"]');
        const dateRangeBaselineRect = dateRangeBaselineControl?.getBoundingClientRect() || dateRangeBaseline?.getBoundingClientRect();
        const dateInputWidths = dateRange
          ? Array.from(dateRange.querySelectorAll('input[type="date"]'))
            .map((element) => Math.round(element.getBoundingClientRect().width))
          : [];
        const durationInput = dateRange?.querySelector('[data-task-details-duration-inline="true"] input[type="number"]');
        const durationInputWidth = durationInput
          ? Math.round(durationInput.getBoundingClientRect().width)
          : 0;
        const durationInputAppearance = durationInput
          ? getComputedStyle(durationInput).appearance
          : '';
        const endDateInput = dateRange?.querySelector('[data-task-details-meta-field="end"] input[type="date"]');
        const durationGroup = dateRange?.querySelector('[data-task-details-duration-inline="true"]');
        const endDateRect = endDateInput?.getBoundingClientRect();
        const durationGroupRect = durationGroup?.getBoundingClientRect();
        const arrow = dateRange?.querySelector('[data-task-details-date-range-arrow="true"]');
        const arrowRect = arrow?.getBoundingClientRect();
        const tagCandidates = Array.from(grid.querySelectorAll('[data-task-details-meta-field="tags"]'));
        const tags = tagCandidates.find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const tagsRect = tags?.getBoundingClientRect();
        const tagList = tags?.querySelector('[data-tag-picker-selected-tags="true"]');
        const tagListRect = tagList?.getBoundingClientRect();
        const visibleDateLabelCount = dateRange
          ? Array.from(dateRange.querySelectorAll('[data-task-details-meta-label-text="true"]'))
            .filter((element) => /開始日期|結束日期/.test(element.textContent || ''))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
            }).length
          : 0;
        return {
          fields,
          dateRange: dateRangeRect
            ? { top: dateRangeRect.top, bottom: dateRangeRect.bottom, left: dateRangeRect.left, right: dateRangeRect.right }
            : null,
          dateRangeBaseline: dateRangeBaselineRect
            ? { top: dateRangeBaselineRect.top, bottom: dateRangeBaselineRect.bottom, left: dateRangeBaselineRect.left, right: dateRangeBaselineRect.right }
            : null,
          dateInputWidths,
          durationInputWidth,
          durationInputAppearance,
          dateDurationJoined: Boolean(
            endDateRect
            && durationGroupRect
            && Math.abs(endDateRect.right - durationGroupRect.left) <= 1,
          ),
          tags: tagsRect
            ? { top: tagsRect.top, bottom: tagsRect.bottom, left: tagsRect.left, right: tagsRect.right }
            : null,
          tagsSingleLine: Boolean(tagListRect && tagList && tagList.scrollHeight <= tagList.clientHeight + 2),
          dateControlCount: dateRange?.querySelectorAll('[data-task-details-meta-control-row="true"]').length || 0,
          arrowVisible: Boolean(arrowRect && arrowRect.width > 0 && arrowRect.height > 0),
          visibleDateLabelCount,
          gridHeight: grid.getBoundingClientRect().height,
          hasHorizontalOverflow: grid.scrollWidth > grid.clientWidth + 1,
        };
      });
      const fieldsWithDateRange = [...metaGeometry.fields, metaGeometry.dateRangeBaseline].filter(Boolean);
      const fieldTops = fieldsWithDateRange.map(field => field.top);
      const fieldBottoms = fieldsWithDateRange.map(field => field.bottom);
      assert(
        metaGeometry.fields.length === 2
          && metaGeometry.dateRange
          && metaGeometry.dateRangeBaseline
          && metaGeometry.tags,
        'desktop task metadata should separate the tag row from the first-row controls',
        metaGeometry,
      );
      assert(
        Math.max(...fieldTops) - Math.min(...fieldTops) <= 2
          && Math.max(...fieldBottoms) - Math.min(...fieldBottoms) <= 2,
        'desktop task metadata fields should share one visual baseline',
        metaGeometry,
      );
      const statusField = metaGeometry.fields.find(field => field.name === 'status');
      const assignmentField = metaGeometry.fields.find(field => field.name === 'assignment');
      const dateRangeWidth = metaGeometry.dateRange.right - metaGeometry.dateRange.left;
      assert(
        Boolean(statusField && assignmentField)
          && statusField.right - statusField.left <= 120
          && assignmentField.right - assignmentField.left >= dateRangeWidth,
        'desktop metadata should keep status/date compact and give the remaining width to assignment',
        { metaGeometry, dateRangeWidth },
      );
      assert(
        metaGeometry.dateControlCount === 2
          && metaGeometry.dateInputWidths.length === 2
          && metaGeometry.dateInputWidths.every(width => width >= 120)
          && metaGeometry.durationInputWidth >= 64
          && metaGeometry.durationInputAppearance === 'textfield'
          && metaGeometry.dateDurationJoined
          && metaGeometry.arrowVisible
          && metaGeometry.visibleDateLabelCount === 0
          && metaGeometry.tags.top >= Math.max(...fieldBottoms)
          && metaGeometry.tags.right - metaGeometry.tags.left >= 700
          && metaGeometry.tagsSingleLine
          && metaGeometry.gridHeight <= 100
          && !metaGeometry.hasHorizontalOverflow,
        'desktop task metadata should keep the tag row horizontal without adding wrapping overflow',
        metaGeometry,
      );
      const durationEditor = modal.locator('[data-task-details-duration-inline="true"] input[type="number"]').first();
      if (await durationEditor.count() === 1 && !(await durationEditor.isDisabled())) {
        await durationEditor.fill('20');
        await durationEditor.press('End');
        await durationEditor.press('Backspace');
        assert(await durationEditor.inputValue() === '2', 'duration editor should allow deleting the final digit', {
          valueAfterOneDelete: await durationEditor.inputValue(),
        });
        await durationEditor.press('Backspace');
        assert(await durationEditor.inputValue() === '', 'duration editor should allow clearing the final remaining digit', {
          valueAfterClear: await durationEditor.inputValue(),
        });
        await durationEditor.fill('3');
        assert(await durationEditor.inputValue() === '3', 'duration editor should accept a new value after clearing', {
          valueAfterReentry: await durationEditor.inputValue(),
        });
        await durationEditor.blur();
      }
      await page.screenshot({ path: 'output/playwright/dev-028-task-details-large-board-1440.png', fullPage: false });
    }
    await closeDetails();

    const selectedCount = await page.locator(`[data-task-id="${taskId}"][data-task-selected="true"]`).count();
    assert(selectedCount === 0, `${mode} should clear selected task after closing details`, { taskId, selectedCount });
    await page.screenshot({ path: `output/playwright/dev-028-selection-clear-${mode}-1440.png`, fullPage: false });

    await page.keyboard.press('F2');
    await page.waitForTimeout(80);
    await page.keyboard.press('t');
    await page.waitForTimeout(80);
    const shortcutRenameInputs = await page.locator(`${titleInputSelector}, [data-mindmap-title-input]`).count();
    const shortcutModalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(shortcutRenameInputs === 0 && shortcutModalCount === 0, `${mode} F2/t should not start outer title rename`, {
      shortcutRenameInputs,
      shortcutModalCount,
    });

    const escapedTaskIdForMenu = taskId.replace(/"/g, '\\"');
    const menuTask = page.locator(`${selector}[data-task-id="${escapedTaskIdForMenu}"]`).first();
    await menuTask.click({ button: 'right', position: clickPosition });
    await page.locator('[data-global-context-menu="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const contextMenuSelectedCount = await page.locator(`[data-task-id="${taskId}"][data-task-selected="true"]`).count();
    assert(contextMenuSelectedCount >= 1, `${mode} context menu should preserve the target selection preview`, {
      taskId,
      contextMenuSelectedCount,
    });
    const renameMenuCount = await page.getByText('重新命名任務', { exact: true }).count();
    assert(renameMenuCount === 0, `${mode} context menu should not expose task rename`, { renameMenuCount });
    await page.keyboard.press('Escape');

    const escapedTaskId = taskId.replace(/"/g, '\\"');
    await clickTaskMainSurface(page.locator(`${selector}[data-task-id="${escapedTaskId}"]`).first(), clickPosition);
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await closeDetailsWithEsc();
    const escapedSelectedCount = await page.locator(`[data-task-id="${taskId}"][data-task-selected="true"]`).count();
    assert(escapedSelectedCount === 0, `${mode} Escape should clear selected task after closing details`, { taskId, escapedSelectedCount });
    const renameInputs = await page.locator(titleInputSelector).count();
    assert(renameInputs === 0, `${mode} title click should not enter rename input`, { renameInputs });
  };

  const assertMindMapSelectionDetailsContract = async () => {
    await switchMode('mindmap');
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    const node = page.locator('[data-mindmap-node]').first();
    await node.waitFor({ state: 'visible', timeout: 15000 });
    const taskId = await node.getAttribute('data-mindmap-node');
    await node.click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await page.waitForTimeout(250);
    assert(await modal.count() === 0, 'mindmap single click should select without opening TaskDetailsModal', { taskId });
    const singleClickSelected = await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count();
    assert(singleClickSelected === 1, 'mindmap single click should select the node', { taskId, singleClickSelected });
    await node.dblclick();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    assert(modalTaskId === taskId, 'mindmap double click should open TaskDetailsModal', { taskId, modalTaskId });
    const detailTitleInput = modal.locator('[data-task-details-title-input="true"]');
    await detailTitleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await detailTitleInput.count() === 1, 'mindmap details title input should be the editable title locus');
    await closeDetails();

    const selected = await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count();
    assert(selected === 0, 'mindmap should clear selected node after closing details', { taskId, selected });
    await page.keyboard.press('F2');
    await page.waitForTimeout(80);
    await page.keyboard.press('t');
    await page.waitForTimeout(80);
    const renameInputs = await page.locator('[data-mindmap-title-input]').count();
    const shortcutModalCount = await page.locator('[data-task-details-modal="true"]').count();
    assert(renameInputs === 0 && shortcutModalCount === 0, 'mindmap F2/t should not enter node rename input', { renameInputs, shortcutModalCount });

    const contextNode = page.locator(`[data-mindmap-node="${taskId}"]`).first();
    await contextNode.waitFor({ state: 'visible', timeout: 10000 });
    const contextBox = await contextNode.boundingBox();
    assert(Boolean(contextBox), 'mindmap context node should remain measurable after clearing selection');
    await page.mouse.click(contextBox.x + Math.min(24, contextBox.width / 2), contextBox.y + Math.min(16, contextBox.height / 2), { button: 'right' });
    await page.locator('[data-global-context-menu="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const contextMenuSelectedCount = await page.locator(`[data-mindmap-node="${taskId}"][aria-selected="true"]`).count();
    assert(contextMenuSelectedCount === 1, 'mindmap context menu should preserve the target selection preview', {
      taskId,
      contextMenuSelectedCount,
    });
    const renameMenuCount = await page.getByText('重新命名任務', { exact: true }).count();
    assert(renameMenuCount === 0, 'mindmap context menu should not expose task rename', { renameMenuCount });
    const openDetailsMenuCount = await page.locator('[data-task-action-id="task.open-details"]').count();
    assert(openDetailsMenuCount === 1, 'mindmap context menu should expose 開啟明細', { openDetailsMenuCount });
    await page.locator('[data-task-action-id="task.open-details"]').click();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    assert(await modal.getAttribute('data-task-id') === taskId, 'mindmap context menu 開啟明細 should open the target task', { taskId });
    await closeDetails();
    await page.keyboard.press('Escape');
    await page.locator('[data-global-context-menu="true"]').waitFor({ state: 'hidden', timeout: 10000 });

    const surface = page.locator('[data-mindmap-surface]').first();
    const canvas = page.locator('[data-mobile-pan-surface="mindmap"]').first();
    const surfaceBox = await surface.boundingBox();
    const canvasBox = await canvas.boundingBox();
    assert(Boolean(surfaceBox && canvasBox), 'mindmap surface should expose a clickable blank area');
    await page.mouse.click(canvasBox.x + 10, canvasBox.y + 10);
    const blankSelected = await page.locator('[data-mindmap-node][aria-selected="true"]').count();
    assert(blankSelected === 0, 'blank click should clear mindmap selection', { blankSelected });
    await page.keyboard.press('Escape');
    const escapedSelected = await page.locator('[data-mindmap-node][aria-selected="true"]').count();
    assert(escapedSelected === 0, 'Escape should keep mindmap selection cleared', { escapedSelected });
    await page.screenshot({ path: 'output/playwright/dev-028-selection-clear-mindmap-1440.png', fullPage: false });
  };

  let step = 'open-app';
  try {
    await openApp();

    step = 'list-click-details';
    await assertClickOpensDetails({
      mode: 'list',
      selector: '[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 90, y: 12 },
    });

    step = 'mindmap-selection-details-contract';
    await assertMindMapSelectionDetailsContract();

    step = 'board-click-details';
    await assertClickOpensDetails({
      mode: 'board',
      selector: '.kanban-task-card[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 90, y: 18 },
    });

    step = 'gantt-click-details';
    await assertClickOpensDetails({
      mode: 'gantt',
      selector: '[data-task-id]',
      titleInputSelector: '[data-task-title-input="true"]',
      clickPosition: { x: 120, y: 12 },
    });

    step = 'mobile-board-visibility';
    await switchMode('board');
    await page.setViewportSize({ width: 390, height: 844 });
    await firstVisibleTask('.kanban-task-card[data-task-id]');
    const hasVisibleCard = await page.evaluate(() => {
      const task = document.querySelector('.kanban-task-card[data-task-id]');
      const rect = task?.getBoundingClientRect();
      return rect ? rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 : false;
    });
    assert(hasVisibleCard, 'mobile board task card should remain reachable in the viewport');
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
