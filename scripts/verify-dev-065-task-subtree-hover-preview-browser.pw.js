/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshots = {
    column1440: `output/playwright/dev-065-subtree-hover-${runId}-1440-column.png`,
    checklist1440: `output/playwright/dev-065-subtree-hover-${runId}-1440-checklist.png`,
    card1440: `output/playwright/dev-065-subtree-hover-${runId}-1440-card.png`,
    states1440: `output/playwright/dev-065-subtree-hover-${runId}-1440-states.png`,
    drag1440: `output/playwright/dev-065-subtree-hover-${runId}-1440-drag.png`,
    laptop1024: `output/playwright/dev-065-subtree-hover-${runId}-1024.png`,
    failure: `output/playwright/dev-065-subtree-hover-${runId}-failure.png`,
  };
  const result = { ok: false, cases: [], screenshots };
  const browserErrors = [];
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const workspace = {
    id: 'dev065-workspace',
    title: 'DEV-065 子樹預覽工作區',
    ownerId: account.id,
    members: [account.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{
      id: 'dev065-board',
      title: '子樹預覽驗證看板',
      dependencies: [],
      order: 1,
      createdAt: 1704067200000,
    }],
  };
  const baseNode = {
    workspaceId: workspace.id,
    boardId: 'dev065-board',
    status: 'todo',
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  };
  const nodes = {
    'dev065-column-a': { ...baseNode, id: 'dev065-column-a', parentId: null, title: '規劃中', nodeType: 'group', order: 0 },
    'dev065-column-b': { ...baseNode, id: 'dev065-column-b', parentId: null, title: '執行中', nodeType: 'group', order: 1 },
    'dev065-parent-card': { ...baseNode, id: 'dev065-parent-card', parentId: 'dev065-column-a', title: '父任務：網站改版', nodeType: 'task', order: 0 },
    'dev065-sibling-card': { ...baseNode, id: 'dev065-sibling-card', parentId: 'dev065-column-a', title: '兄弟任務：採購', nodeType: 'task', order: 1 },
    'dev065-child-parent': { ...baseNode, id: 'dev065-child-parent', parentId: 'dev065-parent-card', title: '子任務：前端整合', nodeType: 'task', order: 0 },
    'dev065-grandchild': { ...baseNode, id: 'dev065-grandchild', parentId: 'dev065-child-parent', title: '孫任務：互動驗證', nodeType: 'task', order: 0 },
    'dev065-child-leaf': { ...baseNode, id: 'dev065-child-leaf', parentId: 'dev065-parent-card', title: '子任務：文件整理', nodeType: 'task', order: 1 },
    'dev065-target-card': { ...baseNode, id: 'dev065-target-card', parentId: 'dev065-column-b', title: '目標任務', nodeType: 'task', order: 0 },
  };

  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) throw new Error(`${id}: ${JSON.stringify(details)}`);
  };
  const pointFor = async (locator, ratio = { x: 0.5, y: 0.5 }) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('target has no visible bounding box');
    return { x: box.x + box.width * ratio.x, y: box.y + box.height * ratio.y, box };
  };
  const visual = async (locator) => locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      color: style.color,
      cursor: style.cursor,
      borderColor: style.borderColor,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      sourceHovered: element.matches(':hover'),
      focusVisible: element.matches(':focus-visible'),
      isActiveElement: document.activeElement === element,
      selected: element.getAttribute('data-task-selected'),
      scopeKind: element.getAttribute('data-task-hover-scope-kind'),
      hasDescendants: element.getAttribute('data-task-hover-has-descendants'),
      pseudoBoxShadow: getComputedStyle(element, '::after').boxShadow,
    };
  });
  const hasGroupColor = value => /(?:129|130|131), (?:140|141|142), 248/.test(value);
  const noVisibleErrors = async () => page.evaluate(() => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const selectors = '.inline-error, [role="alert"]';
    const visibleErrors = Array.from(document.querySelectorAll(selectors))
      .filter(visible)
      .map(element => (element.textContent || '').trim())
      .filter(Boolean);
    const pageText = document.body.innerText;
    const runtimeText = ['Internal Server Error', 'Not Found', 'HTTP 500', '/api/']
      .filter(text => pageText.includes(text));
    return {
      visibleErrors,
      runtimeText,
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });
  const seed = async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, workspace, nodes }) => {
      localStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([workspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', workspace.id);
      localStorage.setItem('projed-last-board', 'dev065-board');
      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-task-workbench-panel:v1', JSON.stringify({ open: false, filtersOpen: false }));
    }, { account, workspace, nodes });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-kanban-column="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-task-id="dev065-grandchild"].kanban-checklist-item').waitFor({ state: 'visible', timeout: 15000 });
  };

  try {
    await seed();
    const column = page.locator('[data-task-hover-scope-kind="column"][data-task-hover-scope-source-id="dev065-column-a"]');
    const columnHeader = page.locator('[data-kanban-column-header="true"][data-task-id="dev065-column-a"]');
    const columnSubtreeScope = column.locator('[data-kanban-column-subtree-scope="true"]');
    const parentCard = page.locator('.kanban-task-card[data-task-id="dev065-parent-card"]');
    const parentCardPrimary = parentCard.locator('[data-task-card-primary="true"]');
    const cardSubtreeScope = parentCard.locator('[data-kanban-card-subtree-scope="true"]');
    const siblingCard = page.locator('.kanban-task-card[data-task-id="dev065-sibling-card"]');
    const childScope = page.locator('[data-task-hover-scope-kind="checklist"][data-task-hover-scope-source-id="dev065-child-parent"]');
    const childRow = page.locator('.kanban-checklist-item[data-task-id="dev065-child-parent"]');
    const childSubtreeScope = childScope.locator(':scope > [data-task-surface-subtree="true"]');
    const grandchildScope = page.locator('[data-task-hover-scope-kind="checklist"][data-task-hover-scope-source-id="dev065-grandchild"]');
    const grandchildRow = page.locator('.kanban-checklist-item[data-task-id="dev065-grandchild"]');

    const surfaceArchitecture = await parentCard.evaluate(scope => {
      const source = scope.querySelector(':scope > [data-task-surface-source="true"]');
      const subtree = scope.querySelector(':scope > [data-task-surface-subtree="true"]');
      return {
        scope: scope.getAttribute('data-task-surface-scope'),
        scopeOwnsHover: scope.hasAttribute('data-desktop-task-hover-preview'),
        scopeOwnsDrag: scope.hasAttribute('data-task-drag-surface'),
        sourceIsDirectChild: source?.parentElement === scope,
        subtreeIsDirectChild: subtree?.parentElement === scope,
        sourceOwnsHover: source?.getAttribute('data-desktop-task-hover-preview'),
        sourceOwnsDrag: source?.getAttribute('data-task-drag-surface'),
        sourceOwnsDrop: source?.getAttribute('data-desktop-drop-surface'),
      };
    });
    record('QA-065-014',
      surfaceArchitecture.scope === 'true'
        && !surfaceArchitecture.scopeOwnsHover
        && !surfaceArchitecture.scopeOwnsDrag
        && surfaceArchitecture.sourceIsDirectChild
        && surfaceArchitecture.subtreeIsDirectChild
        && surfaceArchitecture.sourceOwnsHover === 'true'
        && surfaceArchitecture.sourceOwnsDrag === 'true'
        && surfaceArchitecture.sourceOwnsDrop === 'true',
      { surfaceArchitecture });

    const columnBefore = await visual(column);
    const headerBefore = await visual(columnHeader);
    const columnSubtreeBefore = await visual(columnSubtreeScope);
    const headerPoint = await pointFor(columnHeader, { x: 0.45, y: 0.45 });
    await page.mouse.move(headerPoint.x, headerPoint.y);
    await page.waitForTimeout(120);
    const columnAfter = await visual(column);
    const headerAfter = await visual(columnHeader);
    const columnSubtreeAfter = await visual(columnSubtreeScope);
    const cardTintAfter = await visual(parentCardPrimary);
    const columnGeometryStable = Math.abs(columnBefore.rect.top - columnAfter.rect.top) <= 1
      && Math.abs(columnBefore.rect.height - columnAfter.rect.height) <= 1;
    record('QA-065-001',
      hasGroupColor(columnAfter.borderColor)
        && headerAfter.boxShadow.includes('inset')
        && hasGroupColor(columnSubtreeAfter.boxShadow)
        && (columnSubtreeAfter.boxShadow.match(/inset/g) || []).length === 1
        && hasGroupColor(columnSubtreeAfter.pseudoBoxShadow)
        && (columnSubtreeAfter.pseudoBoxShadow.match(/inset/g) || []).length === 1
        && headerAfter.color === headerBefore.color
        && headerAfter.cursor === headerBefore.cursor
        && columnGeometryStable,
      { columnBefore, columnAfter, headerBefore, headerAfter, columnSubtreeBefore, columnSubtreeAfter, cardTintAfter });
    await page.screenshot({ path: screenshots.column1440, fullPage: false });

    await page.mouse.move(1000, 700);
    await page.waitForTimeout(120);
    const childBefore = await visual(childScope);
    const childSubtreeBefore = await visual(childSubtreeScope);
    const grandchildBefore = await visual(grandchildRow);
    const childPoint = await pointFor(childRow, { x: 0.45, y: 0.5 });
    await page.mouse.move(childPoint.x, childPoint.y);
    await page.waitForTimeout(240);
    const childAfter = await visual(childScope);
    const childSubtreeAfter = await visual(childSubtreeScope);
    const childRowAfter = await visual(childRow);
    const grandchildTint = await visual(grandchildRow);
    record('QA-065-002',
      !childAfter.boxShadow.includes('inset')
        && hasGroupColor(childSubtreeAfter.boxShadow)
        && (childSubtreeAfter.boxShadow.match(/inset/g) || []).length === 1
        && childRowAfter.boxShadow.includes('inset')
        && childSubtreeAfter.rect.top >= childRowAfter.rect.bottom
        && childSubtreeAfter.rect.bottom >= grandchildTint.rect.bottom
        && grandchildTint.backgroundColor === grandchildBefore.backgroundColor
        && Math.abs(childBefore.rect.height - childAfter.rect.height) <= 1,
      { childBefore, childAfter, childSubtreeBefore, childSubtreeAfter, childRowAfter, grandchildBefore, grandchildTint });
    await page.screenshot({ path: screenshots.checklist1440, fullPage: false });

    const grandchildPoint = await pointFor(grandchildRow, { x: 0.55, y: 0.5 });
    await page.mouse.move(grandchildPoint.x, grandchildPoint.y);
    await page.waitForTimeout(120);
    const parentScopeOnLeaf = await visual(childScope);
    const leafScope = await visual(grandchildScope);
    const leafRow = await visual(grandchildRow);
    const cardOnLeaf = await visual(parentCard);
    const cardPrimaryOnLeaf = await visual(parentCardPrimary);
    record('QA-065-003',
      !parentScopeOnLeaf.boxShadow.includes('inset')
        && !leafScope.boxShadow.includes('inset')
        && leafRow.boxShadow.includes('inset')
        && !cardOnLeaf.boxShadow.includes('inset')
        && !cardPrimaryOnLeaf.boxShadow.includes('inset'),
      { parentScopeOnLeaf, leafScope, leafRow, cardOnLeaf, cardPrimaryOnLeaf });

    const parentBeforeHover = await visual(parentCard);
    const parentPrimaryBeforeHover = await visual(parentCardPrimary);
    const siblingBeforeHover = await visual(siblingCard);
    const childBeforeCardHover = await visual(childRow);
    const cardTitle = parentCard.locator('.kanban-task-title-row');
    const cardTitleBeforeHover = await visual(cardTitle);
    const cardPoint = await pointFor(cardTitle, { x: 0.55, y: 0.5 });
    await page.mouse.move(cardPoint.x, cardPoint.y);
    await page.waitForTimeout(120);
    const parentAfterHover = await visual(parentCard);
    const parentPrimaryAfterHover = await visual(parentCardPrimary);
    const cardTitleAfterHover = await visual(cardTitle);
    const cardSubtreeAfterHover = await visual(cardSubtreeScope);
    const siblingAfterHover = await visual(siblingCard);
    const childAfterCardHover = await visual(childRow);
    await page.screenshot({ path: screenshots.card1440, fullPage: false });
    record('QA-065-005',
      !parentAfterHover.boxShadow.includes('99, 102, 241')
        && !parentAfterHover.borderColor.includes('99, 102, 241')
        && parentPrimaryAfterHover.boxShadow.includes('99, 102, 241')
        && hasGroupColor(cardSubtreeAfterHover.boxShadow)
        && !siblingAfterHover.boxShadow.includes('inset')
        && !cardTitleAfterHover.boxShadow.includes('inset')
        && cardTitleAfterHover.color === cardTitleBeforeHover.color
        && cardTitleAfterHover.cursor === cardTitleBeforeHover.cursor
        && Math.abs(parentBeforeHover.rect.height - parentAfterHover.rect.height) <= 1
        && Math.abs(siblingBeforeHover.rect.top - siblingAfterHover.rect.top) <= 1,
      { parentBeforeHover, parentAfterHover, parentPrimaryBeforeHover, parentPrimaryAfterHover, cardTitleBeforeHover, cardTitleAfterHover, siblingBeforeHover, siblingAfterHover });

    record('QA-065-007',
      childRowAfter.boxShadow.includes('99, 102, 241')
        && hasGroupColor(childSubtreeAfter.boxShadow)
        && !parentAfterHover.boxShadow.includes('99, 102, 241')
        && !parentAfterHover.borderColor.includes('99, 102, 241')
        && parentPrimaryAfterHover.boxShadow.includes('99, 102, 241')
        && !cardTitleAfterHover.boxShadow.includes('inset')
        && grandchildTint.backgroundColor === grandchildBefore.backgroundColor
        && childAfterCardHover.backgroundColor === childBeforeCardHover.backgroundColor,
      {
        listSource: childRowAfter,
        listGroup: childSubtreeAfter,
        listDescendantBefore: grandchildBefore,
        listDescendantAfter: grandchildTint,
        cardSource: parentAfterHover,
        cardPrimaryDropSurface: parentPrimaryAfterHover,
        cardDescendantBefore: childBeforeCardHover,
        cardDescendantAfter: childAfterCardHover,
      });

    record('QA-065-009',
      (childSubtreeAfter.boxShadow.match(/inset/g) || []).length === 1
        && childSubtreeAfter.boxShadow.includes('0px 0px 0px 1px')
        && parentPrimaryAfterHover.boxShadow.includes('99, 102, 241')
        && !cardTitleAfterHover.boxShadow.includes('inset')
        && grandchildTint.backgroundColor === grandchildBefore.backgroundColor
        && childAfterCardHover.backgroundColor === childBeforeCardHover.backgroundColor,
      {
        checklistGroupBoxShadow: childSubtreeAfter.boxShadow,
        cardSourceBoxShadow: parentPrimaryAfterHover.boxShadow,
        cardTitleBoxShadow: cardTitleAfterHover.boxShadow,
        listDescendantBefore: grandchildBefore,
        listDescendantAfter: grandchildTint,
        cardDescendantBefore: childBeforeCardHover,
        cardDescendantAfter: childAfterCardHover,
      });

    record('QA-065-010',
      headerAfter.color === headerBefore.color
        && headerAfter.cursor === headerBefore.cursor
        && cardTitleAfterHover.color === cardTitleBeforeHover.color
        && cardTitleAfterHover.cursor === cardTitleBeforeHover.cursor,
      { headerBefore, headerAfter, cardTitleBeforeHover, cardTitleAfterHover });

    record('QA-065-012',
      await parentCard.getAttribute('data-desktop-task-hover-preview') === null
        && await cardTitle.getAttribute('data-desktop-task-hover-preview') === null
        && await parentCardPrimary.getAttribute('data-desktop-task-hover-preview') === 'true'
        && !parentAfterHover.boxShadow.includes('99, 102, 241')
        && !parentAfterHover.borderColor.includes('99, 102, 241')
        && parentPrimaryAfterHover.boxShadow.includes('99, 102, 241')
        && !cardTitleAfterHover.boxShadow.includes('inset'),
      {
        cardHoverMarker: await parentCard.getAttribute('data-desktop-task-hover-preview'),
        cardTitleHoverMarker: await cardTitle.getAttribute('data-desktop-task-hover-preview'),
        cardPrimaryHoverMarker: await parentCardPrimary.getAttribute('data-desktop-task-hover-preview'),
        cardSourceBoxShadow: parentAfterHover.boxShadow,
        cardSourceBorderColor: parentAfterHover.borderColor,
        cardTitleBoxShadow: cardTitleAfterHover.boxShadow,
        cardBackgroundBefore: parentBeforeHover.backgroundColor,
        cardBackgroundAfter: parentAfterHover.backgroundColor,
      });

    record('QA-065-011',
      await columnHeader.locator('h3').getAttribute('title') === null
        && await cardTitle.locator('h4').getAttribute('title') === null
        && await childRow.locator('.task-title-text').getAttribute('title') === null,
      {
        columnTitle: await columnHeader.locator('h3').getAttribute('title'),
        cardTitle: await cardTitle.locator('h4').getAttribute('title'),
        checklistTitle: await childRow.locator('.task-title-text').getAttribute('title'),
      });

    await page.mouse.move(childPoint.x, childPoint.y);
    await page.waitForTimeout(120);
    const cardOnChildHandoff = await visual(parentCard);
    const cardPrimaryOnChildHandoff = await visual(parentCardPrimary);
    const cardTitleOnChildHandoff = await visual(cardTitle);
    const cardSubtreeOnChildHandoff = await visual(cardSubtreeScope);
    const childSourceOnHandoff = await visual(childRow);
    const childGroupOnHandoff = await visual(childSubtreeScope);
    record('QA-065-008',
        !hasGroupColor(cardOnChildHandoff.borderColor)
        && !/\s2(?:\.0+)?px inset/.test(cardPrimaryOnChildHandoff.boxShadow)
        && !cardTitleOnChildHandoff.boxShadow.includes('99, 102, 241')
        && childSourceOnHandoff.boxShadow.includes('99, 102, 241')
        && hasGroupColor(childGroupOnHandoff.boxShadow),
      { cardOnChildHandoff, cardPrimaryOnChildHandoff, cardTitleOnChildHandoff, childSourceOnHandoff, childGroupOnHandoff });

    record('QA-065-013',
      hasGroupColor(cardSubtreeAfterHover.boxShadow)
        && (cardSubtreeAfterHover.boxShadow.match(/inset/g) || []).length === 1
        && cardSubtreeAfterHover.boxShadow.includes('0px 0px 0px 1px')
        && cardSubtreeAfterHover.rect.top > parentAfterHover.rect.top
        && cardSubtreeAfterHover.rect.bottom < parentAfterHover.rect.bottom
        && !cardSubtreeOnChildHandoff.boxShadow.includes('inset'),
      { cardSource: parentAfterHover, cardSubtaskGroup: cardSubtreeAfterHover, cardOnChildHandoff, cardSubtaskGroupOnChildHandoff: cardSubtreeOnChildHandoff });

    await page.mouse.move(1000, 700);
    await page.waitForTimeout(180);
    await parentCardPrimary.click();
    const selectedModal = page.locator('[data-task-details-modal="true"]');
    await selectedModal.waitFor({ state: 'visible', timeout: 5000 });
    await page.mouse.move(1000, 700);
    const selectedCardSource = await visual(parentCardPrimary);
    const selectedCardScope = await visual(parentCard);
    await selectedModal.getByRole('button', { name: '關閉任務詳情' }).click();

    await childRow.click();
    await selectedModal.waitFor({ state: 'visible', timeout: 5000 });
    await page.mouse.move(1000, 700);
    const selectedChecklistSource = await visual(childRow);
    await selectedModal.getByRole('button', { name: '關閉任務詳情' }).click();

    const siblingSource = siblingCard.locator(':scope > [data-task-surface-source="true"]');
    await page.keyboard.press('Tab');
    await siblingSource.focus();
    await page.waitForTimeout(180);
    const focusedCardSource = await visual(siblingSource);
    await page.keyboard.press('Tab');
    await grandchildRow.focus();
    await page.waitForTimeout(180);
    const focusedChecklistSource = await visual(grandchildRow);
    await page.screenshot({ path: screenshots.states1440, fullPage: false });
    record('QA-065-015',
      selectedCardSource.selected === 'true'
        && selectedCardSource.boxShadow.includes('99, 102, 241')
        && selectedCardScope.selected === null
        && selectedChecklistSource.selected === 'true'
        && selectedChecklistSource.boxShadow.includes('99, 102, 241')
        && focusedCardSource.focusVisible
        && focusedCardSource.isActiveElement
        && focusedCardSource.boxShadow.includes('99, 102, 241')
        && focusedChecklistSource.focusVisible
        && focusedChecklistSource.isActiveElement
        && focusedChecklistSource.boxShadow.includes('99, 102, 241'),
      { selectedCardSource, selectedCardScope, selectedChecklistSource, focusedCardSource, focusedChecklistSource });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    await parentCard.locator('[data-kanban-checklist-toggle="true"]').click();
    await grandchildRow.waitFor({ state: 'hidden', timeout: 5000 });
    const nodesBeforeDrag = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    const collapsedTitle = parentCard.locator('.kanban-task-title-row');
    const dragPoint = await pointFor(collapsedTitle, { x: 0.55, y: 0.5 });
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x + 16, dragPoint.y + 3, { steps: 5 });
    const overlay = page.locator('[data-kanban-drag-overlay="true"]');
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    const overlayEvidence = await overlay.evaluate(element => ({
      count: Number(element.getAttribute('data-task-drag-descendant-count')),
      text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
      summaryCount: element.querySelectorAll('[data-task-drag-scope-summary="true"]').length,
    }));
    const targetCardSource = page.locator('.kanban-task-card[data-task-id="dev065-target-card"] > [data-task-surface-source="true"]');
    const targetPoint = await pointFor(targetCardSource, { x: 0.55, y: 0.25 });
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
    const dropIndicator = page.locator('[data-desktop-drop-indicator="true"]');
    await dropIndicator.waitFor({ state: 'visible', timeout: 5000 });
    const dropIndicatorEvidence = await dropIndicator.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        target: element.getAttribute('data-desktop-drop-target'),
        surfaceKind: element.getAttribute('data-desktop-drop-surface-kind'),
        position: element.getAttribute('data-desktop-drop-position'),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    });
    const targetSourceEvidence = await visual(targetCardSource);
    await page.screenshot({ path: screenshots.drag1440, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    const nodesAfterDrag = await page.evaluate(() => localStorage.getItem('projed-local-test.nodes'));
    record('QA-065-004',
        overlayEvidence.count === 3
          && overlayEvidence.summaryCount === 1
          && overlayEvidence.text.includes('含 3 個子任務')
          && dropIndicatorEvidence.target === 'dev065-target-card'
          && dropIndicatorEvidence.surfaceKind === 'kanban-card'
          && dropIndicatorEvidence.position === 'before'
          && dropIndicatorEvidence.rect.top <= targetSourceEvidence.rect.top + 4
          && dropIndicatorEvidence.rect.bottom >= targetSourceEvidence.rect.top - 4
          && dropIndicatorEvidence.rect.left >= targetSourceEvidence.rect.left
          && dropIndicatorEvidence.rect.right <= targetSourceEvidence.rect.right
          && dropIndicatorEvidence.rect.width <= targetSourceEvidence.rect.width
          && dropIndicatorEvidence.rect.width >= 24
          && nodesBeforeDrag === nodesAfterDrag
          && await page.locator('[data-kanban-drag-overlay="true"]').count() === 0,
      { overlayEvidence, dropIndicatorEvidence, targetSourceEvidence });

    await parentCard.locator('[data-kanban-checklist-toggle="true"]').click();
    await grandchildRow.waitFor({ state: 'visible', timeout: 5000 });
    await grandchildRow.click();
    const modal = page.locator('[data-task-details-modal="true"]');
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    const modalTaskId = await modal.getAttribute('data-task-id');
    await modal.getByRole('button', { name: '關閉任務詳情' }).click();
    await childRow.click({ button: 'right' });
    const contextMenu = page.locator('[data-global-context-menu="true"]');
    await contextMenu.waitFor({ state: 'visible', timeout: 5000 });
    const contextKind = await contextMenu.getAttribute('data-global-context-menu-kind');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await parentCard.scrollIntoViewIfNeeded();
    const laptopPoint = await pointFor(childRow, { x: 0.5, y: 0.5 });
    await page.mouse.move(laptopPoint.x, laptopPoint.y);
    await page.waitForTimeout(120);
    const laptopScope = await visual(childScope);
    const laptopSubtree = await visual(childSubtreeScope);
    const errorSweep = await noVisibleErrors();
    await page.screenshot({ path: screenshots.laptop1024, fullPage: false });
    record('QA-065-006',
      modalTaskId === 'dev065-grandchild'
        && contextKind === 'task'
        && !laptopScope.boxShadow.includes('inset')
        && laptopSubtree.boxShadow.includes('inset')
        && errorSweep.visibleErrors.length === 0
        && errorSweep.runtimeText.length === 0
        && errorSweep.documentWidth <= errorSweep.viewport
        && errorSweep.bodyWidth <= errorSweep.viewport
        && browserErrors.length === 0,
      { modalTaskId, contextKind, laptopScope, laptopSubtree, errorSweep, browserErrors });

    result.ok = result.cases.every(item => item.ok);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: screenshots.failure, fullPage: false }).catch(() => undefined);
    throw new Error(JSON.stringify({
      ...result,
      error: error?.message || String(error),
      browserErrors,
    }, null, 2));
  } finally {
    await page.evaluate(() => localStorage.clear()).catch(() => undefined);
  }
}
