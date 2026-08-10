/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const waitForApp = async () => {
    await page.locator('[data-layout-region="topbar"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-main-sidebar-toggle="true"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const ensurePanelsOpen = async () => {
    const isNarrowViewport = await page.evaluate(() => window.matchMedia('(max-width: 767px)').matches);
    if (!isNarrowViewport && await page.locator('[data-layout-region="workspace-sidebar"]').count() === 0) {
      await page.locator('[data-main-sidebar-toggle="true"]').click();
    }
    if (await page.locator('[data-task-workbench-panel="true"]').count() === 0) {
      await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
    }
    if (!isNarrowViewport) {
      await page.locator('[data-layout-region="workspace-sidebar"]').waitFor({ state: 'visible', timeout: 10000 });
    }
    await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  const dragHandle = async (selector, deltaX) => {
    const handle = page.locator(selector);
    await handle.waitFor({ state: 'visible', timeout: 10000 });
    const box = await handle.boundingBox();
    assert(Boolean(box), 'resize handle should have a bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height - 8, Math.max(8, box.height / 2));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + deltaX, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.getByRole('button', { name: '使用固定測試環境' }).count()) {
    await page.getByRole('button', { name: '使用固定測試環境' }).click();
  }
  await waitForApp();

  const ownerId = 'local-test-user';
  const ownerSidebarKey = `projed-workspace-sidebar-width:v1:account:${ownerId}`;
  const ownerWorkbenchKey = `projed-task-workbench-panel:v2:account:${ownerId}`;
  const ownerUiPreferencesKey = `projed-ui-preferences:v1:account:${ownerId}`;
  const adminWorkbenchKey = 'projed-task-workbench-panel:v2:account:local-test-admin';
  const adminUiPreferencesKey = 'projed-ui-preferences:v1:account:local-test-admin';
  await page.evaluate(({ ownerSidebarKey, ownerWorkbenchKey, ownerUiPreferencesKey, adminWorkbenchKey, adminUiPreferencesKey }) => {
    localStorage.removeItem(ownerSidebarKey);
    localStorage.removeItem(ownerWorkbenchKey);
    localStorage.removeItem(ownerUiPreferencesKey);
    localStorage.removeItem(adminWorkbenchKey);
    localStorage.removeItem(adminUiPreferencesKey);
  }, { ownerSidebarKey, ownerWorkbenchKey, ownerUiPreferencesKey, adminWorkbenchKey, adminUiPreferencesKey });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensurePanelsOpen();

  const sidebar = page.locator('[data-layout-region="workspace-sidebar"]');
  const workbench = page.locator('[data-task-workbench-panel="true"]');
  const sidebarBefore = await sidebar.boundingBox();
  const workbenchBefore = await workbench.boundingBox();
  assert(Boolean(sidebarBefore) && Boolean(workbenchBefore), 'both navigation panels should render', { sidebarBefore, workbenchBefore });

  await page.locator('[data-main-sidebar-toggle="true"]').hover();
  assert(
    await sidebar.getAttribute('data-panel-previewed') === 'workspace-sidebar',
    'workspace toggle should preview the workspace sidebar',
  );
 assert(
    await page.locator('[data-panel-preview-subtree="workspace-sidebar"]').count() === 1
      && (await page.locator('[data-panel-preview-subtree="workspace-sidebar"]').getAttribute('class') || '').includes('ring-2'),
    'workspace preview should frame the full panel with a thin subtree line',
 );
 assert(
   await page.locator('[data-panel-preview-source="workspace-sidebar"]').count() === 1
     && (await page.locator('[data-panel-preview-source="workspace-sidebar"]').getAttribute('class') || '').includes('ring-2'),
   'workspace preview should use a strong source-title line',
 );
  const workspaceTitleClass = await page.locator('[data-sidebar-title="true"]').getAttribute('class') || '';
  assert(!workspaceTitleClass.includes('rounded-md') && !workspaceTitleClass.includes('border'), 'workspace title should not have a nested rounded frame');
  const workspaceScrollClass = await page.locator('[data-sidebar-workspace-list="true"]').getAttribute('class') || '';
  assert(workspaceScrollClass.includes('scrollbar-subtle'), 'workspace sidebar should use the subtle vertical scrollbar');
  const sidebarUtilityButtons = await page.locator('[data-sidebar-records-button="true"], [data-sidebar-settings-button="true"]').evaluateAll(elements => elements.map(element => ({
    text: element.textContent?.trim() || '',
    iconCount: element.querySelectorAll('svg').length,
    className: element.className,
  })));
  assert(
    sidebarUtilityButtons.length === 2
      && sidebarUtilityButtons.every(button => button.iconCount === 0 && button.className.includes('px-3')),
    'records and settings sidebar entries should use text-only buttons without icon spacing',
    { sidebarUtilityButtons },
  );
 await page.screenshot({ path: 'output/playwright/resizable-navigation-panels-workspace-preview.png', fullPage: true });
 await page.locator('[data-mobile-task-workbench-nav-entry="true"]').hover();
 assert(
   await workbench.getAttribute('data-panel-previewed') === 'task-workbench',
   'task workbench toggle should preview the task workbench',
 );
 assert(
    await page.locator('[data-panel-preview-subtree="task-workbench"]').count() === 1
      && (await page.locator('[data-panel-preview-subtree="task-workbench"]').getAttribute('class') || '').includes('ring-2'),
    'task workbench preview should frame the full panel with a thin subtree line',
 );
 assert(
   await page.locator('[data-panel-preview-source="task-workbench"]').count() === 1
     && (await page.locator('[data-panel-preview-source="task-workbench"]').getAttribute('class') || '').includes('ring-2'),
   'task workbench preview should use a strong source-title line',
 );
  const taskWorkbenchTitleClass = await page.locator('[data-task-command-center-title="true"]').getAttribute('class') || '';
  assert(!taskWorkbenchTitleClass.includes('rounded-md') && !taskWorkbenchTitleClass.includes('border'), 'task workbench title should not have a nested rounded frame');
  const workbenchLanes = page.locator('[data-task-workbench-unclassified-section="true"], [data-task-workbench-placed-board-lane="true"]');
  const workbenchLaneClasses = await workbenchLanes.evaluateAll(elements => elements.map(element => element.className));
  const workbenchScrollAreas = page.locator('[data-task-workbench-unclassified-list="true"], [data-task-workbench-all-tasks-list="true"]');
  const workbenchScrollClasses = await workbenchScrollAreas.evaluateAll(elements => elements.map(element => element.className));
  assert(
    workbenchLaneClasses.length === 2
      && workbenchLaneClasses.every(className => className.includes('min-h-0') && className.includes('flex-1') && className.includes('basis-0') && className.includes('flex-col') && className.includes('overflow-hidden'))
      && workbenchScrollClasses.length === 2
      && workbenchScrollClasses.every(className => className.includes('scrollbar-subtle') && className.includes('min-h-0') && className.includes('flex-1') && className.includes('overflow-y-auto') && className.includes('overscroll-contain')),
    'task workbench should keep fixed headers above two independent subtle vertical scroll areas',
    { workbenchLaneClasses, workbenchScrollClasses },
  );
  const workbenchLaneBoxes = await workbenchLanes.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) };
  }));
  assert(
    workbenchLaneBoxes.length === 2
      && workbenchLaneBoxes.every(box => box.height > 0)
      && Math.abs(workbenchLaneBoxes[0].height - workbenchLaneBoxes[1].height) <= 2
      && workbenchLaneBoxes[0].bottom <= workbenchLaneBoxes[1].top + 1,
    'unplaced and placed lanes should split the available workbench height evenly without overlap',
    { workbenchLaneBoxes },
  );
  const workbenchLaneFlow = await workbenchLanes.evaluateAll(elements => elements.map(element => {
    const header = element.querySelector('[data-task-workbench-section-header="unplaced"], [data-task-workbench-section-header="all-tasks"]');
    const firstTask = element.querySelector('[data-task-workbench-task-card="true"]');
    const headerBox = header?.getBoundingClientRect();
    const taskBox = firstTask?.getBoundingClientRect();
    return {
      headerBottom: headerBox ? Math.round(headerBox.bottom) : null,
      firstTaskTop: taskBox ? Math.round(taskBox.top) : null,
      headerZIndex: header ? getComputedStyle(header).zIndex : null,
      headerPosition: header ? getComputedStyle(header).position : null,
    };
  }));
  assert(
    workbenchLaneFlow.length === 2
      && workbenchLaneFlow.every(flow => flow.headerBottom !== null && (flow.firstTaskTop === null || flow.firstTaskTop >= flow.headerBottom)),
    'task rows should start below their lane header instead of being covered by the header frame',
    { workbenchLaneFlow },
  );
  const taskContentClass = await page.locator('[data-task-workbench-task-content="true"]').first().getAttribute('class') || '';
  assert(taskContentClass.includes('gap-3'), 'task title and date badge should use the increased 50 percent horizontal gap');
  const hierarchyRowPadding = await page.locator('[data-task-workbench-hierarchy-row="true"]').evaluateAll(elements => (
    elements.map(element => Math.round(parseFloat(getComputedStyle(element).paddingLeft) * 10) / 10)
  ));
  assert(
    hierarchyRowPadding.length > 0 && new Set(hierarchyRowPadding).size === 1,
    'hierarchy task rows should align to one shared left edge regardless of depth',
    { hierarchyRowPadding },
  );
  const sectionHeaderClasses = await page.locator('[data-task-workbench-section-header="unplaced"], [data-task-workbench-section-header="all-tasks"]').evaluateAll(elements => elements.map(element => element.className));
  assert(
    sectionHeaderClasses.length === 2
      && sectionHeaderClasses.every(className => className.includes('box-border') && className.includes('w-[104px]') && className.includes('mb-px') && className.includes('rounded-md') && className.includes('border-slate-600') && className.includes('bg-slate-700') && className.includes('text-white') && !className.includes('mb-2') && !className.includes('bg-slate-200') && !className.includes('border-b')),
    'task workbench section headers should use shared dark blocks with white text',
    { sectionHeaderClasses },
  );
  const sectionHeaderWidths = await page.locator('[data-task-workbench-section-header="unplaced"], [data-task-workbench-section-header="all-tasks"]').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)));
  assert(sectionHeaderWidths.length === 2 && sectionHeaderWidths[0] === 104 && sectionHeaderWidths[0] === sectionHeaderWidths[1], 'task workbench section header frames should use the fixed five-character width', { sectionHeaderWidths });
  const unplacedHeaderHeight = await page.locator('[data-task-workbench-section-header="unplaced"]').evaluate(element => Math.round(element.getBoundingClientRect().height));
  const modalCreateButtonHeight = await page.locator('[data-task-workbench-unclassified-modal-add="true"]').evaluate(element => Math.round(element.getBoundingClientRect().height));
  const modalCreateButtonLabel = await page.locator('[data-task-workbench-unclassified-modal-add="true"]').innerText();
  assert(
    unplacedHeaderHeight === modalCreateButtonHeight && modalCreateButtonLabel.trim() === '新增任務',
    'unplaced modal add button should match the section header height and use the full 新增任務 label',
    { unplacedHeaderHeight, modalCreateButtonHeight, modalCreateButtonLabel },
  );
  const sectionHeaderMargins = await page.locator('[data-task-workbench-section-header="unplaced"], [data-task-workbench-section-header="all-tasks"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).marginBottom));
  assert(sectionHeaderMargins.length === 2 && sectionHeaderMargins.every(margin => margin === '1px'), 'section headers should keep the same 1px gap as task rows', { sectionHeaderMargins });
  const unclassifiedOrder = await page.locator('[data-task-workbench-unclassified-section="true"]').evaluate(section => {
    const header = section.querySelector('[data-task-workbench-section-header="unplaced"]');
    const modalButton = section.querySelector('[data-task-workbench-unclassified-modal-add="true"]');
    const sectionBox = section.getBoundingClientRect();
    const headerBox = header?.getBoundingClientRect();
    return Boolean(
      header
        && modalButton
        && headerBox
        && (header.compareDocumentPosition(modalButton) & Node.DOCUMENT_POSITION_FOLLOWING)
        && headerBox.top >= sectionBox.top + 7,
    );
  });
  assert(unclassifiedOrder, 'the unplaced header should appear above its single modal-based new-task entry with enough breathing room to clarify task destination');
  const unclassifiedDensity = await page.locator('[data-task-workbench-unclassified-section="true"]').evaluate(section => {
    const modalButton = section.querySelector('[data-task-workbench-unclassified-modal-add="true"]');
    const firstTask = section.ownerDocument.querySelector('[data-task-workbench-unplaced-compact-row="true"], [data-task-workbench-hierarchy-row="true"]');
    return {
      modalButtonHeight: modalButton?.getBoundingClientRect().height ?? null,
      firstTaskHeight: firstTask?.getBoundingClientRect().height ?? null,
    };
  });
  assert(
    unclassifiedDensity.modalButtonHeight !== null
      && unclassifiedDensity.firstTaskHeight !== null
      && unclassifiedDensity.modalButtonHeight === 32,
    'modal-based new-task entry should keep the same compact height as the unplaced section header',
    { unclassifiedDensity },
  );
  assert(await page.locator('[data-task-workbench-unclassified-input="true"]').count() === 0, 'inline unplaced task input should be removed');
  assert(await page.locator('[data-task-workbench-unclassified-add="true"]').count() === 0, 'inline unplaced plus action should be removed');
  const modalCreateButton = page.locator('[data-task-workbench-unclassified-modal-add="true"]');
  assert(await modalCreateButton.count() === 1, 'unplaced lane should expose a modal-based task creation button');
  await modalCreateButton.click();
  const createdTaskModal = page.locator('[data-task-details-modal="true"]');
  await createdTaskModal.waitFor({ state: 'visible', timeout: 10000 });
  const createdTaskId = await createdTaskModal.getAttribute('data-task-id');
  const createdTaskTitleInput = createdTaskModal.locator('[data-task-details-title-input="true"]');
  assert(
    Boolean(createdTaskId)
      && await createdTaskTitleInput.inputValue() === '新任務'
      && await createdTaskTitleInput.evaluate(element => document.activeElement === element),
    'modal-based unplaced task creation should open the task dialog with the new title ready to edit',
    { createdTaskId, title: await createdTaskTitleInput.inputValue() },
  );
  const createdTaskPlacement = await page.evaluate(taskId => {
    const tasks = JSON.parse(localStorage.getItem('projed-task-workbench-unplaced-tasks:v1') || '[]');
    return taskId ? tasks.find(task => task.id === taskId) || null : null;
  }, createdTaskId);
  assert(
    createdTaskPlacement?.boardId === '__task_workbench_unplaced__' && createdTaskPlacement?.parentId === null,
    'modal-based task creation should place the new task in the unplaced lane',
    { createdTaskId, createdTaskPlacement },
  );
  await createdTaskModal.locator('button[title="關閉"]').click();
  await createdTaskModal.waitFor({ state: 'detached', timeout: 10000 });
 await page.screenshot({ path: 'output/playwright/resizable-navigation-panels-task-workbench-preview.png', fullPage: true });

  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await workbench.waitFor({ state: 'detached', timeout: 10000 });
  assert(
    await page.locator('[data-task-workbench-panel="true"]').count() === 0,
    'global task workbench toggle should close the panel when it is open',
  );
  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await page.locator('[data-task-workbench-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
  assert(
    await page.locator('[data-task-workbench-panel="true"]').count() === 1,
    'global task workbench toggle should reopen the panel after closing',
  );

  await page.setViewportSize({ width: 640, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensurePanelsOpen();
  const mobileWorkbench = page.locator('[data-task-workbench-panel="true"]');
  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await mobileWorkbench.waitFor({ state: 'detached', timeout: 10000 });
  assert(
    await page.locator('[data-task-workbench-panel="true"]').count() === 0,
    'global task workbench toggle should close the mobile panel',
  );
  await page.locator('[data-mobile-task-workbench-nav-entry="true"]').click();
  await mobileWorkbench.waitFor({ state: 'visible', timeout: 10000 });
  assert(
    await page.locator('[data-task-workbench-panel="true"]').count() === 1,
    'global task workbench toggle should reopen the mobile panel',
  );
  assert(
    await page.locator('[data-panel-previewed="workspace-sidebar"], [data-panel-previewed="task-workbench"], [data-panel-preview-subtree], [data-panel-preview-source]').count() === 0,
    'mobile panels should not show desktop hover preview frames',
  );
  const mobileWorkbenchBox = await mobileWorkbench.boundingBox();
  const mobileWorkbenchStyle = await mobileWorkbench.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      className: element.getAttribute('class') || '',
      position: style.position,
      top: style.top,
      bottom: style.bottom,
      dataOverlay: element.getAttribute('data-mobile-task-workbench-overlay'),
      dataInline: element.getAttribute('data-task-workbench-inline'),
    };
  });
  const mobileWorkbenchNavEntry = page.locator('[data-mobile-task-workbench-nav-entry="true"]');
  const mobileWorkbenchNavBox = await mobileWorkbenchNavEntry.boundingBox();
  assert(
    mobileWorkbenchBox
      && mobileWorkbenchBox.y > 0
      && mobileWorkbenchBox.y < 60
      && mobileWorkbenchStyle.position === 'fixed'
      && mobileWorkbenchStyle.dataOverlay === 'true'
      && !mobileWorkbenchStyle.dataInline,
    'mobile TaskWorkbench should use a fixed drawer below the topbar without reserving inline layout space',
    { mobileWorkbenchBox, mobileWorkbenchStyle },
  );
  assert(
    mobileWorkbenchNavBox && mobileWorkbenchNavBox.y <= 4 && mobileWorkbenchNavBox.height > 0,
    'mobile task workbench opening button should remain accessible above the drawer',
    { mobileWorkbenchNavBox, mobileWorkbenchBox },
  );
  const mobileSidebar = page.locator('[data-mobile-sidebar-overlay="true"]');
  await page.locator('[data-main-sidebar-toggle="true"]').click();
  await mobileSidebar.waitFor({ state: 'visible', timeout: 10000 });
  await mobileWorkbench.waitFor({ state: 'detached', timeout: 10000 });
  assert(
    await page.locator('[data-mobile-sidebar-overlay="true"]').count() === 1
      && await page.locator('[data-mobile-task-workbench-overlay="true"]').count() === 0,
    'opening the mobile workspace drawer should replace the task workbench drawer',
  );
  await mobileWorkbenchNavEntry.click();
  await mobileWorkbench.waitFor({ state: 'visible', timeout: 10000 });
  await mobileSidebar.waitFor({ state: 'detached', timeout: 10000 });
  assert(
    await page.locator('[data-mobile-task-workbench-overlay="true"]').count() === 1
      && await page.locator('[data-mobile-sidebar-overlay="true"]').count() === 0,
    'opening the mobile task workbench should replace the workspace drawer',
  );
  await page.screenshot({ path: 'output/playwright/resizable-navigation-panels-mobile-no-preview.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensurePanelsOpen();

  await dragHandle('[data-sidebar-resize-handle="true"]', -1000);
  await dragHandle('[data-task-workbench-resize-handle="true"]', -1000);
  const sidebarAtMinimum = await sidebar.boundingBox();
  const workbenchAtMinimum = await workbench.boundingBox();
  assert(Math.abs(sidebarAtMinimum.width - 154) <= 8, 'workspace sidebar should honor the reduced minimum width', { sidebarAtMinimum });
  assert(Math.abs(workbenchAtMinimum.width - 182) <= 8, 'task workbench should honor the reduced minimum width', { workbenchAtMinimum });

  await page.evaluate(({ ownerSidebarKey, ownerWorkbenchKey, ownerUiPreferencesKey }) => {
    localStorage.removeItem(ownerSidebarKey);
    localStorage.removeItem(ownerWorkbenchKey);
    localStorage.removeItem(ownerUiPreferencesKey);
  }, { ownerSidebarKey, ownerWorkbenchKey, ownerUiPreferencesKey });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensurePanelsOpen();

  await dragHandle('[data-sidebar-resize-handle="true"]', 120);
  await dragHandle('[data-task-workbench-resize-handle="true"]', 120);
  const sidebarAfterDrag = await sidebar.boundingBox();
  const workbenchAfterDrag = await workbench.boundingBox();
  assert(sidebarAfterDrag.width > sidebarBefore.width + 80, 'workspace sidebar should grow after dragging right', { sidebarBefore, sidebarAfterDrag });
  assert(workbenchAfterDrag.width > workbenchBefore.width + 80, 'task workbench should grow after dragging right', { workbenchBefore, workbenchAfterDrag });

  const storedAfterDrag = await page.evaluate(({ ownerSidebarKey, ownerWorkbenchKey }) => ({
    sidebar: Number(localStorage.getItem(ownerSidebarKey)),
    workbench: JSON.parse(localStorage.getItem(ownerWorkbenchKey) || '{}').width,
  }), { ownerSidebarKey, ownerWorkbenchKey });
  assert(Math.abs(storedAfterDrag.sidebar - sidebarAfterDrag.width) <= 8, 'workspace sidebar width should persist to owner key', { storedAfterDrag, sidebarAfterDrag });
  assert(Math.abs(storedAfterDrag.workbench - workbenchAfterDrag.width) <= 8, 'task workbench width should persist to owner key', { storedAfterDrag, workbenchAfterDrag });

  await page.reload({ waitUntil: 'networkidle' });
  await waitForApp();
  await ensurePanelsOpen();
  const sidebarAfterReload = await page.locator('[data-layout-region="workspace-sidebar"]').boundingBox();
  const workbenchAfterReload = await page.locator('[data-task-workbench-panel="true"]').boundingBox();
  assert(Math.abs(sidebarAfterReload.width - storedAfterDrag.sidebar) <= 8, 'workspace sidebar width should restore after reload', { storedAfterDrag, sidebarAfterReload });
  assert(Math.abs(workbenchAfterReload.width - storedAfterDrag.workbench) <= 8, 'task workbench width should restore after reload', { storedAfterDrag, workbenchAfterReload });

  await page.evaluate(({ adminWorkbenchKey }) => {
    localStorage.setItem(adminWorkbenchKey, JSON.stringify({
      open: true,
      filtersOpen: false,
      showContainersInAllTasks: false,
      width: 410,
      openPreferenceVersion: 1,
    }));
  }, { adminWorkbenchKey });
  await page.getByRole('button', { name: '登出' }).click();
  await page.getByRole('button', { name: /本機測試管理員/ }).click();
  await page.getByRole('button', { name: /使用固定測試環境/ }).click();
  await waitForApp();
  await ensurePanelsOpen();
  const adminSidebar = await page.locator('[data-layout-region="workspace-sidebar"]').boundingBox();
  const adminWorkbench = await page.locator('[data-task-workbench-panel="true"]').boundingBox();
  assert(Math.abs(adminSidebar.width - 288) <= 8, 'another account should use its own workspace sidebar width', { adminSidebar });
  assert(Math.abs(adminWorkbench.width - 410) <= 8, 'another account should use its own task workbench width', { adminWorkbench });

  const visibleErrors = await page.locator('[role="alert"]:visible').allTextContents();
  const bodyText = await page.locator('body').innerText();
  assert(visibleErrors.length === 0, 'no visible alert errors should remain', { visibleErrors });
  assert(!/HTTP\s+[45]\d\d|Not Found|Internal Server Error|\/api\//i.test(bodyText), 'no visible runtime error text should remain');

  await page.screenshot({ path: 'output/playwright/resizable-navigation-panels.png', fullPage: true });
  return {
    passed: true,
    owner: { before: { sidebar: sidebarBefore.width, workbench: workbenchBefore.width }, afterDrag: storedAfterDrag },
    ownerAfterReload: { sidebar: sidebarAfterReload.width, workbench: workbenchAfterReload.width },
    admin: { sidebar: adminSidebar.width, workbench: adminWorkbench.width },
    screenshot: 'output/playwright/resizable-navigation-panels.png',
  };
}
