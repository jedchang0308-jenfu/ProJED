/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      throw new Error(`${message}: ${JSON.stringify(details)}`);
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const workspace = {
    id: 'dev031-workspace',
    title: 'DEV-031 手機密度工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [
      { id: 'dev031-board', title: '手機密度驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 },
    ],
  };

  const createNodes = () => ({
    'dev031-col-a': {
      id: 'dev031-col-a',
      workspaceId: workspace.id,
      boardId: 'dev031-board',
      parentId: null,
      title: '待辦',
      status: 'todo',
      nodeType: 'group',
      order: 0,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev031-col-b': {
      id: 'dev031-col-b',
      workspaceId: workspace.id,
      boardId: 'dev031-board',
      parentId: null,
      title: '進行中',
      status: 'in_progress',
      nodeType: 'group',
      order: 1,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev031-task-a': {
      id: 'dev031-task-a',
      workspaceId: workspace.id,
      boardId: 'dev031-board',
      parentId: 'dev031-col-a',
      title: '手機任務詳情密度驗證',
      status: 'todo',
      nodeType: 'task',
      order: 0,
      startDate: '2026-07-10',
      endDate: '2026-07-14',
      isDurationLocked: false,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    'dev031-task-b': {
      id: 'dev031-task-b',
      workspaceId: workspace.id,
      boardId: 'dev031-board',
      parentId: 'dev031-col-a',
      title: '第二張手機任務卡',
      status: 'in_progress',
      nodeType: 'task',
      order: 1,
      endDate: '2026-07-15',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  });

  const setCoarsePointer = async () => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query.includes('pointer: coarse') || query.includes('hover: none')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          };
        }
        return nativeMatchMedia(query);
      };
    });
  };

  const openApp = async () => {
    await setCoarsePointer();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev031-board');
      localStorage.setItem('projed-last-view', 'board');
    }, { account, workspace, nodes: createNodes() });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  };

  const visibleCount = async (selector) => page.locator(selector).evaluateAll((items) => (
    items.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    }).length
  ));

  const assertNoVisibleErrors = async (label) => {
    const visibleErrors = await page.locator('[role="alert"], .inline-error').evaluateAll((items) => (
      items
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const text = element.textContent || '';
          return rect.width > 0 && rect.height > 0 && /error|failed|失敗|錯誤|not found|internal server/i.test(text);
        })
        .map((element) => element.textContent || '')
    ));
    assert(visibleErrors.length === 0, `${label} should have no visible runtime errors`, { visibleErrors });
  };

  const assertMainChromeDensity = async (label) => {
    const navHeight = await page.locator('.app-main-nav').evaluate((element) => element.getBoundingClientRect().height);
    assert(navHeight <= 36, `${label} main nav should use compact mobile density`, { navHeight });
  };

  const assertMobileNavRedundantInfoHidden = async (label) => {
    const brandNodeCount = await page.locator('[data-mobile-hidden-brand="true"]').count();
    const visibleShareButtons = await visibleCount('[data-board-share-open]');
    const visibleTaskWorkbenchEntries = await visibleCount('[data-mobile-task-workbench-nav-entry="true"]');
    assert(
      brandNodeCount === 0,
      `${label} should remove redundant brand copy from the main nav`,
      { brandNodeCount },
    );
    assert(visibleShareButtons === 0, `${label} should hide share info on mobile`, { visibleShareButtons });
    assert(
      visibleTaskWorkbenchEntries === 1,
      `${label} should expose mobile task workbench entry in the main nav`,
      { visibleTaskWorkbenchEntries },
    );
  };

  let step = 'open-app';
  try {
    await openApp();
    await assertMainChromeDensity('initial');
    await assertMobileNavRedundantInfoHidden('initial');

    step = 'mobile should not render mode switcher controls';
    const boardModeCount = await page.locator('[data-mode-switcher-value="board"]').count();
    const listModeCount = await page.locator('[data-mode-switcher-value="list"]').count();
    const mindMapModeCount = await page.locator('[data-mode-switcher-value="mindmap"]').count();
    const ganttModeCount = await page.locator('[data-mode-switcher-value="gantt"]').count();
    const calendarModeCount = await page.locator('[data-mode-switcher-value="calendar"]').count();
    const recordsModeCount = await page.locator('[data-mode-switcher-value="records"]').count();
    assert(
      boardModeCount + listModeCount + mindMapModeCount + ganttModeCount + calendarModeCount + recordsModeCount === 0,
      'mobile should hide all mode switcher entries',
      { boardModeCount, listModeCount, mindMapModeCount, ganttModeCount, calendarModeCount, recordsModeCount },
    );

    step = 'board density';
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    const boardColumnWidth = await page.locator('[data-kanban-column]').first().evaluate((element) => element.getBoundingClientRect().width);
    const boardCardPaddingTop = await page.locator('.kanban-task-card-body').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
    const boardVisibleCards = await visibleCount('.kanban-task-card[data-task-id]');
    assert(boardColumnWidth <= 256, 'board columns should be compact on mobile', { boardColumnWidth });
    assert(boardCardPaddingTop <= 3, 'board card vertical padding should be compact on mobile', { boardCardPaddingTop });
    assert(boardVisibleCards >= 1, 'board visible task density should keep cards visible', { boardVisibleCards });

    step = 'task details meta density';
    await page.locator('.kanban-task-card[data-task-id="dev031-task-a"]').click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const metaMetrics = await modal.evaluate((element) => {
      const meta = element.querySelector('[data-task-details-meta-section="true"]');
      const metaGrid = element.querySelector('[data-task-details-meta-grid="true"]');
      const dateGrid = element.querySelector('[data-task-details-date-grid="true"]');
      const controlRows = Array.from(element.querySelectorAll('[data-task-details-meta-control-row="true"]'));
      const tagTrigger = element.querySelector('[data-tag-picker-trigger="true"]');
      const controls = [
        ...controlRows.flatMap(row => Array.from(row.children)),
        ...(tagTrigger ? [tagTrigger] : []),
      ].filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const labels = Array.from(element.querySelectorAll('[data-task-details-meta-label-text="true"]'))
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      const metaRect = meta?.getBoundingClientRect();
      const controlRects = controls.map((item) => {
        const rect = item.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top, left: rect.left };
      });
      const labelRects = labels.map((item) => {
        const rect = item.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top, left: rect.left };
      });
      const maxControlHeight = controlRects.reduce((max, rect) => Math.max(max, rect.height), 0);
      const maxLabelHeight = labelRects.reduce((max, rect) => Math.max(max, rect.height), 0);
      return {
        metaHeight: metaRect?.height ?? 0,
        metaWidth: metaRect?.width ?? 0,
        controlCount: controls.length,
        labelCount: labels.length,
        maxControlHeight,
        maxLabelHeight,
        gridColumns: metaGrid ? getComputedStyle(metaGrid).gridTemplateColumns : '',
        dateGridColumns: dateGrid ? getComputedStyle(dateGrid).gridTemplateColumns : '',
        controlRects,
        labelRects,
        viewportWidth: window.innerWidth,
      };
    });
    assert(metaMetrics.controlCount >= 6, 'task details meta should expose all compact controls', metaMetrics);
    assert(metaMetrics.labelCount >= 5, 'task details meta should keep labels visible', metaMetrics);
    assert(metaMetrics.metaHeight <= 96, 'task details metadata stack should be compressed to roughly 30 percent height on mobile', metaMetrics);
    assert(metaMetrics.maxControlHeight <= 28, 'task details compact controls should stay below 28px on mobile', metaMetrics);
    assert(metaMetrics.maxLabelHeight <= 14, 'task details compact labels should stay dense on mobile', metaMetrics);
    assert(
      metaMetrics.gridColumns.split(' ').length >= 3 && metaMetrics.dateGridColumns.split(' ').length >= 3,
      'task details metadata should use compact multi-column mobile grids',
      metaMetrics,
    );
    await page.screenshot({ path: 'output/playwright/dev-031-task-details-mobile-density.png', fullPage: true });

    step = 'task details note add action density';
    const firstNoteCard = modal.locator('[data-task-detail-note-card="true"]').first();
    await firstNoteCard.scrollIntoViewIfNeeded();
    const noteActionMetrics = await firstNoteCard.evaluate((card) => {
      const notesSection = card.closest('[data-task-detail-notes-section="true"]');
      const notesGrid = card.closest('[data-task-detail-notes-grid="true"]');
      const header = card.querySelector('[data-task-detail-note-header="true"]');
      const titleInput = card.querySelector('[data-task-detail-note-title-input="true"]');
      const addButton = card.querySelector('[data-task-detail-note-add="true"]');
      const deleteButton = card.querySelector('[data-task-detail-note-delete="true"]');
      const toRect = (element) => {
        const rect = element?.getBoundingClientRect();
        return rect ? { top: rect.top, left: rect.left, right: rect.right, width: rect.width, height: rect.height } : null;
      };
      return {
        header: toRect(header),
        titleInput: toRect(titleInput),
        addButton: toRect(addButton),
        deleteButton: toRect(deleteButton),
        sectionDirectAddButtonCount: notesSection
          ? notesSection.querySelectorAll(':scope > [data-task-detail-note-add="true"]').length
          : -1,
        gridDirectAddButtonCount: notesGrid
          ? notesGrid.querySelectorAll(':scope > [data-task-detail-note-add="true"]').length
          : -1,
      };
    });
    assert(noteActionMetrics.addButton, 'task details should expose the add-note action', noteActionMetrics);
    assert(
      noteActionMetrics.addButton.width <= 34 && noteActionMetrics.addButton.height <= 34,
      'add-note action should use a compact icon button on mobile',
      noteActionMetrics,
    );
    assert(
      Math.abs(noteActionMetrics.addButton.top - noteActionMetrics.titleInput.top) <= 1 &&
        Math.abs(noteActionMetrics.addButton.top - noteActionMetrics.deleteButton.top) <= 1,
      'add-note action should share the note title row instead of occupying a standalone row',
      noteActionMetrics,
    );
    assert(
      noteActionMetrics.sectionDirectAddButtonCount === 0 && noteActionMetrics.gridDirectAddButtonCount === 0,
      'notes section should not render a standalone add-note toolbar row',
      noteActionMetrics,
    );
    await page.screenshot({ path: 'output/playwright/dev-031-task-details-mobile-note-actions.png', fullPage: true });

    const noteCountBeforeAdd = await modal.locator('[data-task-detail-note-card="true"]').count();
    await modal.locator('[data-task-detail-note-add="true"]').click();
    await page.waitForFunction((expectedCount) => (
      document.querySelectorAll('[data-task-details-modal="true"] [data-task-detail-note-card="true"]').length === expectedCount
    ), noteCountBeforeAdd + 1, { timeout: 10000 });
    const noteCountAfterAdd = await modal.locator('[data-task-detail-note-card="true"]').count();
    assert(noteCountAfterAdd === noteCountBeforeAdd + 1, 'compact add-note action should still add one note card', {
      noteCountBeforeAdd,
      noteCountAfterAdd,
    });
    await page.locator('[data-task-details-modal="true"] button[title="關閉"]').click();
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'hidden', timeout: 10000 });

    step = 'desktop nav removes brand and shows full board title';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.app-main-nav').waitFor({ state: 'visible', timeout: 15000 });
    const desktopBrandNodeCount = await page.locator('[data-mobile-hidden-brand="true"]').count();
    assert(desktopBrandNodeCount === 0, 'desktop nav should remove the redundant ProJED brand crumb', { desktopBrandNodeCount });
    const desktopTitle = page.locator('.app-board-title').first();
    await desktopTitle.waitFor({ state: 'visible', timeout: 15000 });
    const longBoardTitle = '看板名稱完整呈現驗證';
    await desktopTitle.evaluate((element, text) => {
      element.textContent = text;
    }, longBoardTitle);
    const titleMetrics = await desktopTitle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: element.textContent || '',
        width: rect.width,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    });
    assert(
      titleMetrics.text === longBoardTitle &&
        titleMetrics.whiteSpace === 'nowrap' &&
        titleMetrics.textOverflow !== 'ellipsis' &&
        titleMetrics.scrollWidth <= titleMetrics.clientWidth + 1,
      'desktop board title should render fully without truncation',
      titleMetrics,
    );

    await assertNoVisibleErrors(step);
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
