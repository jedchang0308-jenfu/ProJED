/* eslint-disable */
async (page) => {
  const outputPath = 'output/playwright/goal-empty-location-754x698.png';
  const owner = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: '本機測試擁有者',
  };
  const workspace = {
    id: 'goal-empty-workspace',
    title: 'Goal empty location workspace',
    ownerId: owner.id,
    members: [owner.id],
    order: 1,
    createdAt: 1704067200000,
    boards: [{ id: 'goal-empty-board', title: 'Goal empty location board', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const task = (id, title, order, parentId = null, extra = {}) => ({
    id,
    workspaceId: workspace.id,
    boardId: 'goal-empty-board',
    parentId,
    title,
    status: 'todo',
    nodeType: 'task',
    order,
    description: '',
    startDate: '',
    endDate: '',
    assigneeId: owner.id,
    assigneeIds: [owner.id],
    collaboratorIds: [],
    isArchived: false,
    ...extra,
  });
  const nodes = {
    'goal-empty-root': task('goal-empty-root', '有目的任務', 0, null, { description: '用來保留任務目的欄位的內容。' }),
    'goal-empty-target': task('goal-empty-target', '目的與會議皆空白任務', 1),
    'goal-empty-child': task('goal-empty-child', '空白任務子項', 0, 'goal-empty-target'),
    'goal-empty-content-child': task('goal-empty-content-child', '有內容的子任務', 1, 'goal-empty-target', { description: '子任務目的內容。' }),
  };
  const records = [{
    id: 'goal-empty-meeting',
    type: 'meeting',
    workspaceId: workspace.id,
    boardId: 'goal-empty-board',
    title: 'Goal empty location meeting',
    content: '## 任務討論\n- 09:00 @[有目的任務](task:goal-empty-root)：保留會議欄位\n- 09:30 @[有內容的子任務](task:goal-empty-content-child)：子任務會議欄位',
    status: 'published',
    visibility: 'project',
    occurredAt: 1704067200000,
    taskLinks: [
      { nodeId: 'goal-empty-root', role: 'decision' },
      { nodeId: 'goal-empty-content-child', role: 'decision' },
    ],
    metadata: {
      meetingTaskQuickNotes: {
        schemaVersion: 1,
        entries: [{
          id: 'goal-empty-note',
          taskId: 'goal-empty-root',
          text: '保留會議欄位',
          occurredAt: 1704067200000,
          anchor: { lineIndex: 1, sourceToken: '09:00|goal-empty-root' },
        }, {
          id: 'goal-empty-child-note',
          taskId: 'goal-empty-content-child',
          text: '子任務會議欄位',
          occurredAt: 1704067200000,
          anchor: { lineIndex: 2, sourceToken: '09:30|goal-empty-content-child' },
        }],
      },
    },
  }];

  const result = {
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    route: '/',
    viewport: { width: 754, height: 698 },
    runtime: { port: 4000, reused: true, cleaned: false },
  };

  page.on('console', message => {
    if (message.type() === 'error') result.consoleError = message.text();
  });
  page.on('pageerror', error => { result.pageError = error.message; });
  page.on('response', response => {
    if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) {
      result.httpFailure = { status: response.status(), url: response.url() };
    }
  });

  await page.setViewportSize(result.viewport);
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(registrations.map(registration => registration.unregister()));
  });
  await page.evaluate(({ owner: currentOwner, workspace: currentWorkspace, nodes: currentNodes, records: currentRecords }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('projed-local-test.selected-account', currentOwner.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(currentOwner));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([currentWorkspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(currentNodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
    localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
      [`${currentWorkspace.id}:goal-empty-board`]: [{
        userId: currentOwner.id,
        role: 'owner',
        profile: { id: currentOwner.id, email: currentOwner.email, displayName: currentOwner.displayName },
      }],
    }));
    localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(currentRecords));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', currentWorkspace.id);
    localStorage.setItem('projed-last-board', 'goal-empty-board');
    localStorage.setItem('projed-last-view', 'goal');
  }, { owner, workspace, nodes, records });
  await page.reload({ waitUntil: 'networkidle' });

  const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
  if (await fixed.count() && await fixed.isVisible().catch(() => false)) await fixed.click({ force: true });
  await page.waitForTimeout(500);
  await page.evaluate(({ owner: currentOwner, workspace: currentWorkspace, nodes: currentNodes, records: currentRecords }) => {
    localStorage.setItem('projed-local-test.selected-account', currentOwner.id);
    localStorage.setItem('projed-local-test.session', JSON.stringify(currentOwner));
    localStorage.setItem('projed-local-test.workspaces', JSON.stringify([currentWorkspace]));
    localStorage.setItem('projed-local-test.nodes', JSON.stringify(currentNodes));
    localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
    localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
    localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
    localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
      [`${currentWorkspace.id}:goal-empty-board`]: [{
        userId: currentOwner.id,
        role: 'owner',
        profile: { id: currentOwner.id, email: currentOwner.email, displayName: currentOwner.displayName },
      }],
    }));
    localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(currentRecords));
    localStorage.setItem('projed-local-test.seeded.v1', 'true');
    localStorage.setItem('projed-local-test.seeded.size', '12');
    localStorage.setItem('projed-last-ws', currentWorkspace.id);
    localStorage.setItem('projed-last-board', 'goal-empty-board');
    localStorage.setItem('projed-last-view', 'goal');
  }, { owner, workspace, nodes, records });
  await page.reload({ waitUntil: 'networkidle' });

  const goal = page.locator('[data-goal-view="true"]');
  await page.waitForTimeout(500);
  if (await goal.count() === 0) {
    result.authProbe = await page.evaluate(() => ({
      url: window.location.href,
      session: localStorage.getItem('projed-local-test.session'),
      selectedAccount: localStorage.getItem('projed-local-test.selected-account'),
      bodyText: document.body.innerText.slice(0, 500),
      buttons: Array.from(document.querySelectorAll('button')).map(button => ({ text: button.textContent?.trim(), disabled: button.disabled })),
    }));
    throw new Error(`Goal view did not mount after local-test login: ${JSON.stringify(result)}`);
  }
  await goal.waitFor({ state: 'visible', timeout: 15000 });
  const targetTaskCell = goal.locator('[data-goal-task-row-id="goal-empty-target"] [data-goal-task-cell]');
  await targetTaskCell.hover();
  await page.waitForTimeout(180);

  const probe = await goal.evaluate(root => {
    const row = root.querySelector('[data-goal-task-row-id="goal-empty-target"]');
    const description = row?.querySelector('[data-goal-column="description"]');
    const meeting = row?.querySelector('[data-goal-column="meeting"]');
    const childRow = root.querySelector('[data-goal-task-row-id="goal-empty-child"]');
    const childTaskCell = childRow?.querySelector('[data-goal-task-cell]');
    const childTaskTitle = childTaskCell?.querySelector('.task-title-text');
    const childDescription = childRow?.querySelector('[data-goal-column="description"]');
    const childMeeting = childRow?.querySelector('[data-goal-column="meeting"]');
    const contentChildRow = root.querySelector('[data-goal-task-row-id="goal-empty-content-child"]');
    const contentChildTaskCell = contentChildRow?.querySelector('[data-goal-task-cell]');
    const contentChildDescription = contentChildRow?.querySelector('[data-goal-column="description"]');
    const contentChildMeeting = contentChildRow?.querySelector('[data-goal-column="meeting"]');
    const style = element => element ? getComputedStyle(element) : null;
    return {
      rowScope: row?.getAttribute('data-goal-hierarchy-scope') || '',
      descriptionKind: description?.getAttribute('data-goal-cell-kind') || '',
      descriptionScope: description?.getAttribute('data-goal-content-scope') || '',
      descriptionBackground: style(description)?.backgroundColor || '',
      meetingKind: meeting?.getAttribute('data-goal-cell-kind') || '',
      meetingScope: meeting?.getAttribute('data-goal-content-scope') || '',
      meetingBackground: style(meeting)?.backgroundColor || '',
      descriptionText: description?.textContent?.trim() || '',
      meetingText: meeting?.textContent?.trim() || '',
      targetContentScrollOwnerCount: row?.querySelectorAll('[data-goal-content-scroll]').length || 0,
      childTaskBackground: style(childTaskCell)?.backgroundColor || '',
      childTaskMarker: style(childTaskCell)?.boxShadow || '',
      childTaskTitleWeight: style(childTaskTitle)?.fontWeight || '',
      childTaskTitleColor: style(childTaskTitle)?.color || '',
      childDescriptionScope: childDescription?.getAttribute('data-goal-content-scope') || '',
      childDescriptionBackground: style(childDescription)?.backgroundColor || '',
      childMeetingScope: childMeeting?.getAttribute('data-goal-content-scope') || '',
      childMeetingBackground: style(childMeeting)?.backgroundColor || '',
      childDescriptionText: childDescription?.textContent?.trim() || '',
      childMeetingText: childMeeting?.textContent?.trim() || '',
      contentChildTaskBackground: style(contentChildTaskCell)?.backgroundColor || '',
      contentChildTaskMarker: style(contentChildTaskCell)?.boxShadow || '',
      contentChildDescriptionScope: contentChildDescription?.getAttribute('data-goal-content-scope') || '',
      contentChildDescriptionBackground: style(contentChildDescription)?.backgroundColor || '',
      contentChildMeetingScope: contentChildMeeting?.getAttribute('data-goal-content-scope') || '',
      contentChildMeetingBackground: style(contentChildMeeting)?.backgroundColor || '',
      contentChildDescriptionText: contentChildDescription?.textContent?.trim() || '',
      contentChildMeetingText: contentChildMeeting?.textContent?.trim() || '',
      visibleAlerts: root.querySelectorAll('[role="alert"]:not([hidden])').length,
      xScrollOwners: Array.from(root.querySelectorAll('*')).filter(element => {
        const computed = getComputedStyle(element);
        return computed.overflowX === 'auto' || computed.overflowX === 'scroll';
      }).length,
    };
  });

  result.probe = probe;
  result.screenshot = outputPath;
  await page.screenshot({ path: outputPath });
  const expectedBackground = 'rgba(199, 210, 254, 0.94)';
  const expectedChildBackground = 'rgb(237, 248, 248)';
  const noTaskMarker = marker => marker === '' || marker === 'none';
  const passed = probe.rowScope === 'parent'
    && probe.descriptionKind === 'empty'
    && probe.descriptionScope === 'active'
    && probe.descriptionBackground === expectedBackground
    && probe.meetingKind === 'empty'
    && probe.meetingScope === 'active'
    && probe.meetingBackground === expectedBackground
    && probe.descriptionText === ''
    && probe.meetingText === ''
    && probe.targetContentScrollOwnerCount === 0
    && probe.childTaskBackground === expectedChildBackground
    && noTaskMarker(probe.childTaskMarker)
    && probe.childTaskTitleWeight === '500'
    && probe.childTaskTitleColor === 'oklch(0.279 0.041 260.031)'
    && probe.childDescriptionScope === 'descendant'
    && probe.childDescriptionBackground === expectedChildBackground
    && probe.childMeetingScope === 'descendant'
    && probe.childMeetingBackground === expectedChildBackground
    && probe.childDescriptionText === ''
    && probe.childMeetingText === ''
    && probe.contentChildDescriptionScope === 'descendant'
    && probe.contentChildTaskBackground === expectedChildBackground
    && noTaskMarker(probe.contentChildTaskMarker)
    && probe.contentChildDescriptionBackground === expectedChildBackground
    && probe.contentChildMeetingScope === 'descendant'
    && probe.contentChildMeetingBackground === expectedChildBackground
    && probe.contentChildDescriptionText === '子任務目的內容。'
    && probe.contentChildMeetingText.includes('子任務會議欄位')
    && probe.visibleAlerts === 0
    && !result.consoleError
    && !result.pageError
    && !result.httpFailure;
  if (!passed) throw new Error(`Goal empty-location browser verification failed: ${JSON.stringify(result)}`);
  result.status = 'PASS';
  return result;
}
