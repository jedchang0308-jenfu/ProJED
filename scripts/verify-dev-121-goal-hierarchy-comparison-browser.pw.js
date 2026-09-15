/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-121-goal-hierarchy-comparison';
  const result = {
    devId: 'DEV-121',
    status: 'FAIL',
    sourceRevision: 'working-tree',
    environment: 'local-test / Chromium',
    route: '/',
    actors: [{ id: 'dev121-owner', role: 'owner' }, { id: 'dev121-viewer', role: 'viewer' }],
    fixtureIds: [],
    viewports: [{ width: 1440, height: 900 }, { width: 1298, height: 698 }, { width: 814, height: 698 }],
    cases: [],
    screenshots: [],
    browserErrors: [],
    httpFailures: [],
    cleanup: { runtime: 'matching pre-existing localhost:4000', action: 'reused; not stopped' },
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false },
  };
  const failures = [];
  const dialogs = [];
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !/favicon\.ico/.test(response.url())) result.httpFailures.push({ status: response.status(), url: response.url() });
  });
  page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });

  const owner = { id: 'dev121-owner', uid: 'dev121-owner', email: 'dev121-owner@projed.local', displayName: 'DEV-121 Owner' };
  const viewer = { id: 'dev121-viewer', uid: 'dev121-viewer', email: 'dev121-viewer@projed.local', displayName: 'DEV-121 Viewer' };
  const workspace = {
    id: 'dev121-workspace', title: 'DEV-121 hierarchy workspace', ownerId: owner.id, members: [owner.id], order: 1, createdAt: 1704067200000,
    boards: [{ id: 'dev121-board', title: 'OKR 樹狀對照驗證看板', dependencies: [], order: 1, createdAt: 1704067200000 }],
  };
  const task = (id, title, order, parentId = null, extra = {}) => ({
    id, workspaceId: workspace.id, boardId: 'dev121-board', parentId, title, status: 'todo', nodeType: 'task', order,
    description: `${title} 的任務目的`, startDate: '2026-09-02', endDate: '2026-09-04',
    assigneeId: owner.id, assigneeIds: [owner.id], collaboratorIds: [], isArchived: false, ...extra,
  });
  const nodes = {
    'dev121-root-a': task('dev121-root-a', 'Root A｜年度產品交付目標', 0, null, { status: 'in_progress', description: 'Root A 群組任務目的，涵蓋下層執行範圍。' }),
    'dev121-a1': task('dev121-a1', 'A1｜市場與需求拆解', 0, 'dev121-root-a', { description: '' }),
    'dev121-a1a': task('dev121-a1a', 'A1-A｜研究長任務名稱仍可追蹤', 0, 'dev121-a1', { description: '', title: 'A1-A｜研究長任務名稱仍可追蹤' }),
    'dev121-a1a1': task('dev121-a1a1', 'A1-A-1｜第四層執行檢查', 0, 'dev121-a1a', { description: '', title: 'A1-A-1｜第四層執行檢查' }),
    'dev121-a1b': task('dev121-a1b', 'A1-B｜同層最後分支', 1, 'dev121-a1', { description: '' }),
    'dev121-a2': task('dev121-a2', 'A2｜交付與驗收屏障', 1, 'dev121-root-a', { description: 'A2 自有任務目的，驗證 parent owner 不延伸越過 barrier。' }),
    'dev121-root-b': task('dev121-root-b', 'Root B｜客戶成功與營運群組', 1, null, { description: 'Root B 群組任務目的。' }),
    'dev121-b1': task('dev121-b1', 'B1｜營運子任務', 0, 'dev121-root-b', { description: '' }),
  };
  result.fixtureIds = Object.keys(nodes);
  const meetingRecord = {
    id: 'dev121-meeting', type: 'meeting', workspaceId: workspace.id, boardId: 'dev121-board', title: 'DEV-121 對照會議',
    content: '## 任務討論\n- 09:00 @[Root A｜年度產品交付目標](task:dev121-root-a)：確認群組範圍',
    status: 'published', visibility: 'project', occurredAt: 1704067200000,
    taskLinks: [{ nodeId: 'dev121-root-a', role: 'decision' }],
    metadata: { meetingTaskQuickNotes: { schemaVersion: 1, entries: [{ id: 'dev121-note', taskId: 'dev121-root-a', text: '確認群組範圍', occurredAt: 1704067200000, anchor: { lineIndex: 1, sourceToken: '09:00|dev121-root-a' } }] } },
  };

  const seed = async (width = 1440, height = 900, account = owner, currentWorkspace = workspace, currentNodes = nodes, records = [meetingRecord]) => {
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ account, currentWorkspace, currentNodes, records }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify(account));
      localStorage.setItem('projed-local-test.workspaces', JSON.stringify([currentWorkspace]));
      localStorage.setItem('projed-local-test.nodes', JSON.stringify(currentNodes));
      localStorage.setItem('projed-local-test.dependencies', JSON.stringify([]));
      localStorage.setItem('projed-local-test.tags', JSON.stringify([]));
      localStorage.setItem('projed-local-test.activityEvents', JSON.stringify([]));
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({ [`${currentWorkspace.id}:dev121-board`]: [{ userId: account.id, role: account.id === currentWorkspace.ownerId ? 'owner' : 'viewer', profile: { id: account.id, email: account.email, displayName: account.displayName } }] }));
      localStorage.setItem('projed-local-test.knowledgeRecords', JSON.stringify(records));
      localStorage.setItem('projed-local-test.seeded.v1', 'true');
      localStorage.setItem('projed-local-test.seeded.size', '12');
      localStorage.setItem('projed-last-ws', currentWorkspace.id);
      localStorage.setItem('projed-last-board', 'dev121-board');
      localStorage.setItem('projed-last-view', 'goal');
    }, { account, currentWorkspace, currentNodes, records });
    await page.reload({ waitUntil: 'networkidle' });
    const fixed = page.getByRole('button', { name: /使用固定測試環境/ });
    if (await fixed.count() && await fixed.isVisible().catch(() => false)) { await fixed.click({ force: true }); await page.waitForTimeout(250); }
    await page.locator('[data-goal-view="true"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-goal-task-table="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  try {
    await seed(1440, 900);
    const goal = page.locator('[data-goal-view="true"]');
    const table = page.locator('[data-goal-task-table="true"]');
    const rows = goal.locator('[data-goal-task-row]');
    record('B01-normal-entry-and-order', await rows.count() === result.fixtureIds.length && await table.locator('thead').count() === 1 && await goal.locator('[data-goal-hierarchy-guides]').count() === result.fixtureIds.length, { rowCount: await rows.count(), guideCount: await goal.locator('[data-goal-hierarchy-guides]').count() });
    const structure = await goal.evaluate(root => {
      const row = root.querySelector('[data-goal-task-row-id="dev121-a1a1"]');
      const guides = row?.querySelectorAll('[data-goal-hierarchy-guide-kind]') || [];
      const disclosure = root.querySelector('[data-goal-task-row-id="dev121-a1"] button[data-goal-collapse-toggle]');
      const visibleGuides = Array.from(root.querySelectorAll('[data-goal-hierarchy-guide-kind]'))
        .filter(item => getComputedStyle(item).visibility !== 'hidden');
      const visibleGuideRects = visibleGuides.map(item => item.getBoundingClientRect());
      const maxGuideRight = visibleGuideRects.length ? Math.max(...visibleGuideRects.map(rect => rect.right)) : null;
      const minGuideLeft = visibleGuideRects.length ? Math.min(...visibleGuideRects.map(rect => rect.left)) : null;
      const disclosureRect = disclosure?.getBoundingClientRect() || null;
      const rootRows = Array.from(root.querySelectorAll('[data-goal-task-row]')).filter(item => item.getAttribute('data-goal-level') === '0');
      const rootBoundary = rootRows[1]?.querySelector('th') ? getComputedStyle(rootRows[1].querySelector('th')).borderTopWidth : null;
      const verticalKinds = new Set(['continuation', 'incoming-vertical', 'child-stem']);
      const railRects = visibleGuides
        .filter(item => verticalKinds.has(item.getAttribute('data-goal-hierarchy-guide-kind')))
        .map(item => {
          const rect = item.getBoundingClientRect();
          return { owner: item.getAttribute('data-goal-hierarchy-guide-owner') || 'missing', left: Math.round(rect.left), top: rect.top, bottom: rect.bottom };
        })
        .reduce((groups, rect) => groups.set(`${rect.owner}:${rect.left}`, [...(groups.get(`${rect.owner}:${rect.left}`) || []), rect]), new Map());
      const maxRailGap = Array.from(railRects.values()).reduce((maxGap, rects) => {
        const sorted = rects.sort((left, right) => left.top - right.top);
        return Math.max(maxGap, ...sorted.slice(1).map((rect, index) => Math.max(0, rect.top - sorted[index].bottom)));
      }, 0);
      const railGapDetails = Array.from(railRects.entries()).map(([ownerAndLeft, rects]) => {
        const sorted = rects.sort((first, second) => first.top - second.top);
        return { ownerAndLeft, rects: sorted, gaps: sorted.slice(1).map((rect, index) => rect.top - sorted[index].bottom) };
      });
      const verticalWidths = visibleGuides.filter(item => verticalKinds.has(item.getAttribute('data-goal-hierarchy-guide-kind'))).map(item => item.getBoundingClientRect().width);
      const branchWidths = visibleGuides.filter(item => item.getAttribute('data-goal-hierarchy-guide-kind') === 'incoming-branch').map(item => item.getBoundingClientRect().width);
      const endpointCount = visibleGuides.filter(item => item.getAttribute('data-goal-hierarchy-guide-kind') === 'endpoint').length;
      const branchTitleDistances = Array.from(root.querySelectorAll('[data-goal-task-row]')).map(row => {
        const branch = row.querySelector('[data-goal-hierarchy-guide-kind="incoming-branch"], [data-goal-hierarchy-guide-kind="root-branch"]');
        const title = row.querySelector('.task-title-text');
        if (!branch || !title) return null;
        return Math.abs(title.getBoundingClientRect().left - branch.getBoundingClientRect().right);
      }).filter(distance => distance !== null);
      const rootRow = root.querySelector('[data-goal-task-row-id="dev121-root-a"] .goal-task-hierarchy-row');
      const childRow = root.querySelector('[data-goal-task-row-id="dev121-a1"] .goal-task-hierarchy-row');
      const rootPadding = rootRow ? Number.parseFloat(getComputedStyle(rootRow).paddingLeft) : null;
      const childPadding = childRow ? Number.parseFloat(getComputedStyle(childRow).paddingLeft) : null;
      return {
        deepGuideCount: guides.length,
        guideKinds: Array.from(guides).map(item => item.getAttribute('data-goal-hierarchy-guide-kind')),
        continuationOwners: Array.from(guides).filter(item => item.getAttribute('data-goal-hierarchy-guide-kind') === 'continuation').map(item => item.getAttribute('data-goal-hierarchy-guide-owner')),
        rootBoundary,
        lastSibling: row?.getAttribute('data-goal-hierarchy-last-sibling'),
        disclosureLeft: disclosureRect?.left ?? null,
        disclosureRight: disclosureRect?.right ?? null,
        minGuideLeft,
        maxGuideRight,
        disclosureGuideGap: disclosureRect && minGuideLeft !== null ? minGuideLeft - disclosureRect.right : null,
        maxRailGap,
        railGapDetails,
        verticalWidths,
        branchWidths,
        endpointCount,
        maxBranchTitleDistance: branchTitleDistances.length ? Math.max(...branchTitleDistances) : null,
        depthStep: rootPadding !== null && childPadding !== null ? childPadding - rootPadding : null,
      };
    });
    record('B02-owned-tree-guides-and-root-boundary', structure.deepGuideCount === 4 && structure.guideKinds.filter(kind => kind === 'continuation').length === 2 && structure.guideKinds.includes('incoming-vertical') && structure.guideKinds.includes('incoming-branch') && structure.endpointCount === 0 && JSON.stringify(structure.continuationOwners) === JSON.stringify(['dev121-root-a', 'dev121-a1']) && structure.rootBoundary === '2px', structure);
    const geometryOk = structure.verticalWidths.every(width => Math.abs(width - 1) <= 0.1) && structure.branchWidths.every(width => Math.abs(width - 12) <= 0.1) && structure.endpointCount === 0 && structure.depthStep !== null && Math.abs(structure.depthStep - 8) <= 0.1 && structure.maxBranchTitleDistance !== null && structure.maxBranchTitleDistance <= 0.5;
    record('V02-compact-owned-connector-geometry', geometryOk, structure);
    const continuityOk = structure.disclosureGuideGap !== null && structure.disclosureGuideGap >= -0.1 && structure.maxRailGap <= 1.1;
    record('V09-owned-connector-continuity-and-disclosure-separation', continuityOk, structure);
    const toneProbe = await goal.evaluate(root => {
      const normal = root.querySelector('[data-goal-hierarchy-guide-kind="incoming-branch"][data-goal-hierarchy-guide-active="false"]');
      if (!normal) return { backgroundColor: '', borderRadius: '' };
      const styles = getComputedStyle(normal);
      return { backgroundColor: styles.backgroundColor, borderRadius: styles.borderRadius };
    });
    record('V13-soft-connector-tone-and-rounded-joins', toneProbe.backgroundColor.includes('0.42') && toneProbe.borderRadius === '999px', toneProbe);
    const rowBorderProbe = await goal.evaluate(root => {
      const rows = Array.from(root.querySelectorAll('[data-goal-task-row]'));
      const cells = rows.flatMap(row => Array.from(row.children));
      const bottomBorders = cells
        .map(cell => ({ taskId: cell.closest('[data-goal-task-row]')?.getAttribute('data-goal-task-row-id') || '', width: getComputedStyle(cell).borderBottomWidth, style: getComputedStyle(cell).borderBottomStyle }))
        .filter(cell => cell.width !== '0px' && cell.style !== 'none');
      const rootRows = rows.filter(row => row.getAttribute('data-goal-level') === '0');
      return { rowCount: rows.length, bottomBorders, rootBoundary: rootRows[1]?.querySelector('th') ? getComputedStyle(rootRows[1].querySelector('th')).borderTopWidth : null };
    });
    record('V10-no-inter-task-gridlines', rowBorderProbe.bottomBorders.length === 0 && rowBorderProbe.rootBoundary === '2px', rowBorderProbe);
    const endpointProbe = await goal.evaluate(root => {
      const rows = Array.from(root.querySelectorAll('[data-goal-task-row]'));
      const probes = rows.map(row => {
        const rowRect = row.getBoundingClientRect();
        const branch = row.querySelector('[data-goal-hierarchy-guide-kind="incoming-branch"], [data-goal-hierarchy-guide-kind="root-branch"]');
        const incoming = row.querySelector('[data-goal-hierarchy-guide-kind="incoming-vertical"]');
        const branchRect = branch?.getBoundingClientRect() || null;
        const incomingRect = incoming?.getBoundingClientRect() || null;
        return {
          id: row.getAttribute('data-goal-task-row-id'),
          level: Number(row.getAttribute('data-goal-level')),
          last: row.getAttribute('data-goal-hierarchy-last-sibling') === 'true',
          rowCenter: rowRect.top + rowRect.height / 2,
          rowBottom: rowRect.bottom,
          branchCenter: branchRect ? branchRect.top + branchRect.height / 2 : null,
          incomingBottom: incomingRect?.bottom ?? null,
        };
      });
      const rootIncomingCount = probes.filter(probe => probe.level === 0 && probe.incomingBottom !== null).length;
      const ownerlessGuideCount = Array.from(root.querySelectorAll('[data-goal-hierarchy-guide-kind]')).filter(guide => !guide.getAttribute('data-goal-hierarchy-guide-owner')).length;
      return { probes, rootIncomingCount, ownerlessGuideCount };
    });
    const branchesAlign = endpointProbe.probes.every(probe => probe.branchCenter !== null && Math.abs(probe.branchCenter - probe.rowCenter) <= 1);
    const siblingTermination = endpointProbe.probes.filter(probe => probe.level > 0).every(probe => probe.incomingBottom !== null && Math.abs(probe.incomingBottom - (probe.last ? probe.rowCenter : probe.rowBottom)) <= 1.1);
    record('V11-row-branches-and-last-sibling-termination', branchesAlign && siblingTermination && endpointProbe.rootIncomingCount === 0 && endpointProbe.ownerlessGuideCount === 0, endpointProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/V01-dev121-tree-normal-1440x900.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V01-dev121-tree-normal-1440x900.png`);

    const rootToggle = goal.locator('[data-goal-task-row-id="dev121-root-a"] [data-goal-collapse-toggle]').first();
    await rootToggle.click();
    const collapsedRootCount = await rows.count();
    const collapsedRootLabel = await goal.locator('[data-goal-task-row-id="dev121-root-a"] [data-goal-descendant-count]').getAttribute('aria-label');
    record('B03-collapse-root-shows-total-count', collapsedRootCount === 3 && collapsedRootLabel === '已收合 5 個下層任務' && await goal.locator('[data-goal-task-row-id="dev121-a1"]').count() === 0, { collapsedRootCount, collapsedRootLabel });
    await rootToggle.click();
    record('B03-expand-restores-rows-and-hides-count', await rows.count() === result.fixtureIds.length && await goal.locator('[data-goal-descendant-count]').count() === 0, { rowCount: await rows.count(), countNodes: await goal.locator('[data-goal-descendant-count]').count() });

    const midToggle = goal.locator('[data-goal-task-row-id="dev121-a1"] [data-goal-collapse-toggle]').first();
    await midToggle.click();
    record('B04-collapse-middle-count', await rows.count() === 5 && await goal.locator('[data-goal-task-row-id="dev121-a1"] [data-goal-descendant-count]').getAttribute('aria-label') === '已收合 3 個下層任務', { rowCount: await rows.count() });
    await midToggle.click();

    const rowSpanProbe = await goal.evaluate(root => {
      const owner = root.querySelector('[data-goal-description-owner="true"]');
      const childDescriptionCells = Array.from(root.querySelectorAll('[data-goal-task-row-id="dev121-a1"] [data-goal-column="description"], [data-goal-task-row-id="dev121-a1a"] [data-goal-column="description"]'));
      const childOwn = root.querySelector('[data-goal-task-row-id="dev121-a2"] [data-goal-description-owner="true"]');
      return { ownerSpan: owner?.getAttribute('rowspan'), childCoveredDomCount: childDescriptionCells.length, childOwnText: childOwn?.textContent?.trim() || '' };
    });
    record('B05-native-rowspan-owner-and-barrier', rowSpanProbe.ownerSpan === '5' && rowSpanProbe.childCoveredDomCount === 0 && rowSpanProbe.childOwnText.includes('A2 自有任務目的'), rowSpanProbe);

    const descriptionOwnerCell = goal.locator('[data-goal-description-owner="true"]').first();
    await descriptionOwnerCell.hover();
    await page.waitForTimeout(180);
    const descriptionReverseProbe = await goal.evaluate(root => {
      const owner = root.querySelector('[data-goal-description-owner="true"]');
      const activeRow = root.querySelector('[data-goal-hierarchy-scope="parent"]');
      return {
        ownerTaskId: owner?.getAttribute('data-goal-owner') || '',
        contentScope: owner?.getAttribute('data-goal-content-scope') || '',
        activeTaskId: activeRow?.getAttribute('data-goal-task-row-id') || '',
      };
    });
    const meetingOwnerCell = goal.locator('[data-goal-meeting-owner="true"]').first();
    await meetingOwnerCell.hover();
    await page.waitForTimeout(180);
    const meetingReverseProbe = await goal.evaluate(root => {
      const owner = root.querySelector('[data-goal-meeting-owner="true"]');
      const activeRow = root.querySelector('[data-goal-hierarchy-scope="parent"]');
      return {
        ownerTaskId: owner?.getAttribute('data-goal-owner') || '',
        contentScope: owner?.getAttribute('data-goal-content-scope') || '',
        activeTaskId: activeRow?.getAttribute('data-goal-task-row-id') || '',
      };
    });
    const reverseContentLocationOk = descriptionReverseProbe.ownerTaskId === 'dev121-root-a'
      && descriptionReverseProbe.contentScope === 'active'
      && descriptionReverseProbe.activeTaskId === 'dev121-root-a'
      && meetingReverseProbe.ownerTaskId === 'dev121-root-a'
      && meetingReverseProbe.contentScope === 'active'
      && meetingReverseProbe.activeTaskId === 'dev121-root-a';
    record('B11-reverse-content-location-resolves-to-owner-task', reverseContentLocationOk, {
      description: descriptionReverseProbe,
      meeting: meetingReverseProbe,
    });

    const allColumnProbe = {};
    for (const column of ['task', 'owner', 'status', 'start-date', 'end-date', 'duration']) {
      await page.mouse.move(1000, 20);
      await page.waitForTimeout(40);
      const target = column === 'task'
        ? goal.locator('[data-goal-task-row-id="dev121-a1a1"] [data-goal-task-cell]').first()
        : goal.locator(`[data-goal-task-row-id="dev121-a1a1"] [data-goal-column="${column}"]`).first();
      await target.hover();
      await page.waitForTimeout(80);
      allColumnProbe[column] = await goal.locator('[data-goal-hierarchy-scope="parent"][data-goal-task-row-id="dev121-a1a1"]').count() === 1;
    }
    record('B12-all-goal-columns-resolve-to-owning-task', Object.values(allColumnProbe).every(Boolean), allColumnProbe);

    const a1TaskCell = goal.locator('[data-goal-task-row-id="dev121-a1"] [data-goal-task-cell]');
    await a1TaskCell.hover();
    await page.waitForTimeout(180);
    const guideProbe = await goal.evaluate(root => {
      const row = root.querySelector('[data-goal-task-row-id="dev121-a1"]');
      const task = row?.querySelector('[data-goal-task-cell]');
      const planning = row?.querySelector('[data-goal-planning-control]');
      const content = root.querySelector('[data-goal-description-owner="true"]');
      const activeSegments = Array.from(root.querySelectorAll('[data-goal-hierarchy-guide-active="true"]')).map(segment => ({
        rowId: segment.closest('[data-goal-task-row]')?.getAttribute('data-goal-task-row-id') || '',
        owner: segment.getAttribute('data-goal-hierarchy-guide-owner') || '',
        kind: segment.getAttribute('data-goal-hierarchy-guide-kind') || '',
        width: getComputedStyle(segment).width,
        height: getComputedStyle(segment).height,
      }));
      const scopeRows = Array.from(root.querySelectorAll('[data-goal-hierarchy-scope]')).map(scopeRow => ({
        id: scopeRow.getAttribute('data-goal-task-row-id'),
        scope: scopeRow.getAttribute('data-goal-hierarchy-scope'),
      }));
      const rootOwnedActiveContinuations = activeSegments.filter(segment => segment.owner === 'dev121-root-a' && segment.kind === 'continuation').length;
      return {
        task: task ? getComputedStyle(task).backgroundColor : '',
        planning: planning ? getComputedStyle(planning).backgroundColor : '',
        content: content ? getComputedStyle(content).backgroundColor : '',
        contentScope: content?.getAttribute('data-goal-content-scope') || '',
        activeSegments,
        scopeRows,
        rootOwnedActiveContinuations,
      };
    });
    const b06Ok = guideProbe.task.includes('199, 210, 254')
      && guideProbe.planning.includes('199, 210, 254')
      && guideProbe.content.includes('248, 250, 252')
      && guideProbe.contentScope === ''
      && guideProbe.scopeRows.some(item => item.id === 'dev121-a1' && item.scope === 'parent');
    record('B06-reading-guide-preserves-rowspan-owner-boundary', b06Ok, guideProbe);
    const activeScopeTintOk = guideProbe.task === 'rgba(199, 210, 254, 0.94)'
      && guideProbe.planning === 'rgba(199, 210, 254, 0.94)'
      && guideProbe.content.includes('248, 250, 252')
      && guideProbe.contentScope === '';
    record('V15-active-descendant-does-not-tint-ancestor-rowspan-owner', activeScopeTintOk, {
      task: guideProbe.task,
      planning: guideProbe.planning,
      content: guideProbe.content,
      contentScope: guideProbe.contentScope,
    });
    const allowedActiveOwners = new Set(['dev121-a1', 'dev121-a1a', 'dev121-a1a1', 'dev121-a1b']);
    const scopeById = new Map(guideProbe.scopeRows.map(item => [item.id, item.scope]));
    const ownIncomingRelationActive = guideProbe.activeSegments.some(segment =>
      segment.rowId === 'dev121-a1'
      && segment.owner === 'dev121-root-a'
      && (segment.kind === 'incoming-vertical' || segment.kind === 'incoming-branch')
    );
    const ownIncomingStrokeOk = guideProbe.activeSegments
      .filter(segment => segment.rowId === 'dev121-a1' && segment.owner === 'dev121-root-a')
      .every(segment => segment.kind === 'incoming-vertical' ? Number.parseFloat(segment.width) >= 2 : Number.parseFloat(segment.height) >= 2);
    record('V14-active-task-incoming-relation-is-highlighted-and-thickened', ownIncomingRelationActive && ownIncomingStrokeOk, {
      ownIncomingRelationActive,
      ownIncomingStrokeOk,
      activeSegments: guideProbe.activeSegments,
    });
    const isAllowedSelfIncoming = segment =>
      segment.rowId === 'dev121-a1'
      && segment.owner === 'dev121-root-a'
      && (segment.kind === 'incoming-vertical' || segment.kind === 'incoming-branch');
    const activeOwnershipOk = guideProbe.activeSegments.length > 0
      && ownIncomingRelationActive
      && ownIncomingStrokeOk
      && guideProbe.activeSegments.every(segment => isAllowedSelfIncoming(segment) || allowedActiveOwners.has(segment.owner))
      && guideProbe.rootOwnedActiveContinuations === 0
      && scopeById.get('dev121-a1') === 'parent'
      && ['dev121-a1a', 'dev121-a1a1', 'dev121-a1b'].every(id => scopeById.get(id) === 'descendant')
      && !scopeById.has('dev121-a2')
      && !scopeById.has('dev121-root-a');
    record('V12-subtree-relationship-ownership', activeOwnershipOk, guideProbe);
    await page.mouse.move(1000, 20);
    await goal.locator('[data-goal-task-row-id="dev121-root-a"] [data-goal-task-cell]').hover();
    await page.waitForTimeout(180);
    const activeOwnerTintProbe = await goal.evaluate(root => {
      const row = root.querySelector('[data-goal-task-row-id="dev121-root-a"]');
      const content = row?.querySelector('[data-goal-description-owner="true"]');
      return {
        content: content ? getComputedStyle(content).backgroundColor : '',
        contentScope: content?.getAttribute('data-goal-content-scope') || '',
      };
    });
    const activeOwnerTintOk = activeOwnerTintProbe.content === 'rgba(199, 210, 254, 0.94)'
      && activeOwnerTintProbe.contentScope === 'active';
    record('V16-active-owner-rowspan-content-is-tinted', activeOwnerTintOk, activeOwnerTintProbe);
    await a1TaskCell.hover();
    await page.waitForTimeout(180);
    const reverseFocusProbe = await goal.evaluate(root => ({
      descriptionOwner: root.querySelector('[data-goal-description-owner="true"]')?.getAttribute('data-goal-owner') || '',
      meetingOwner: root.querySelector('[data-goal-meeting-owner="true"]')?.getAttribute('data-goal-owner') || '',
      activeTask: root.querySelector('[data-goal-hierarchy-scope="parent"]')?.getAttribute('data-goal-task-row-id') || '',
    }));
    record('V17-content-owner-targets-remain-real-task', reverseFocusProbe.descriptionOwner === 'dev121-root-a'
      && reverseFocusProbe.meetingOwner === 'dev121-root-a'
      && reverseFocusProbe.activeTask === 'dev121-a1', reverseFocusProbe);
    await page.screenshot({ path: `${OUTPUT_DIR}/V06-dev121-owned-subtree-hover-1440x900.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V06-dev121-owned-subtree-hover-1440x900.png`);
    await page.mouse.move(1000, 20);
    const a1Identity = goal.locator('[data-goal-task-row-id="dev121-a1"] .goal-task-hierarchy-row');
    await a1Identity.focus();
    const keyboardScopeProbe = await goal.evaluate(root => ({
      parentScope: root.querySelector('[data-goal-task-row-id="dev121-a1"]')?.getAttribute('data-goal-hierarchy-scope') || null,
      descendantScopes: ['dev121-a1a', 'dev121-a1a1', 'dev121-a1b'].map(id => root.querySelector(`[data-goal-task-row-id="${id}"]`)?.getAttribute('data-goal-hierarchy-scope') || null),
      activeGuideCount: root.querySelectorAll('[data-goal-hierarchy-guide-active="true"]').length,
    }));
    record('A02-keyboard-focus-keeps-owned-subtree', keyboardScopeProbe.parentScope === 'parent' && keyboardScopeProbe.descendantScopes.every(scope => scope === 'descendant') && keyboardScopeProbe.activeGuideCount > 0, keyboardScopeProbe);
    await goal.locator('[data-goal-task-row-id="dev121-a2"] [data-goal-planning-control="status"] select').focus();
    const guideNode = goal.locator('[data-goal-task-row-id="dev121-a1a1"] [data-goal-hierarchy-guides]').first();
    record('B07-guide-layer-cannot-capture-events', await guideNode.getAttribute('aria-hidden') === 'true' && await guideNode.evaluate(element => getComputedStyle(element).pointerEvents === 'none'), {});

    const groupSurface = await goal.evaluate(root => ({
      spanning: root.querySelector('[data-goal-group-span="true"]') ? getComputedStyle(root.querySelector('[data-goal-group-span="true"]')).boxShadow : '',
      single: root.querySelector('[data-goal-task-row-id="dev121-a2"] [data-goal-description-owner="true"]')?.getAttribute('data-goal-group-span') || null,
      tableCount: root.querySelectorAll('table').length,
      scrollOwner: getComputedStyle(root).overflowX,
    }));
    record('V02-group-surface-and-single-table-owner', groupSurface.spanning.includes('203, 213, 225') && groupSurface.single === null && groupSurface.tableCount === 1 && groupSurface.scrollOwner === 'auto', groupSurface);
    await page.screenshot({ path: `${OUTPUT_DIR}/V02-dev121-rowspan-group-surface-1440x900.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V02-dev121-rowspan-group-surface-1440x900.png`);

    await seed(814, 698);
    const compact = page.locator('[data-goal-view="true"]');
    const scrollProbe = await compact.evaluate(root => {
      const tableElement = root.querySelector('[data-goal-task-table="true"]');
      const taskHeader = root.querySelector('#goal-column-task');
      const taskCell = root.querySelector('[data-goal-task-row] th[scope="row"]');
      if (!tableElement || !taskHeader || !taskCell) return null;
      const before = { header: taskHeader.getBoundingClientRect().left, cell: taskCell.getBoundingClientRect().left, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
      root.scrollLeft = Math.min(160, Math.max(0, root.scrollWidth - root.clientWidth));
      const after = { header: taskHeader.getBoundingClientRect().left, cell: taskCell.getBoundingClientRect().left, scrollLeft: root.scrollLeft };
      return { before, after, headerDelta: after.header - before.header, cellDelta: after.cell - before.cell };
    });
    record('V03-single-x-scroll-freezes-task-column', Boolean(scrollProbe) && scrollProbe.before.scrollWidth > scrollProbe.before.clientWidth && Math.abs(scrollProbe.headerDelta) <= 1 && Math.abs(scrollProbe.cellDelta) <= 1, scrollProbe || {});
    await compact.screenshot({ path: `${OUTPUT_DIR}/V03-dev121-frozen-task-814x698.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V03-dev121-frozen-task-814x698.png`);
    await compact.evaluate(root => { root.scrollLeft = root.scrollWidth - root.clientWidth; });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.waitForTimeout(150);
    const zoomProbe = await compact.evaluate(root => ({
      tableCount: root.querySelectorAll('table').length,
      taskVisible: Boolean(root.querySelector('[data-goal-task-cell]')?.getBoundingClientRect().width),
      guideVisible: Array.from(root.querySelectorAll('[data-goal-hierarchy-guides]')).every(element => element.getBoundingClientRect().height > 0),
      descendantXScrollOwners: Array.from(root.querySelectorAll('*')).filter(element => { const style = getComputedStyle(element); return (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth; }).length,
      rootOverflowX: getComputedStyle(root).overflowX,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
    }));
    record('V04-2x-zoom-keeps-tree-and-one-scroll-owner', zoomProbe.tableCount === 1 && zoomProbe.taskVisible && zoomProbe.guideVisible && zoomProbe.rootOverflowX === 'auto' && zoomProbe.descendantXScrollOwners === 0 && zoomProbe.rootScrollWidth >= zoomProbe.rootClientWidth, zoomProbe);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });

    const readOnlyWorkspace = { ...workspace, id: 'dev121-readonly-workspace', title: 'DEV-121 read-only', ownerId: owner.id, members: [viewer.id] };
    const readOnlyNodes = Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, { ...node, workspaceId: readOnlyWorkspace.id, boardId: 'dev121-board', assigneeId: viewer.id, assigneeIds: [viewer.id] }]));
    await seed(1298, 698, viewer, readOnlyWorkspace, readOnlyNodes, []);
    const readOnlyGoal = page.locator('[data-goal-view="true"]');
    const readOnlyProbe = await readOnlyGoal.evaluate(root => ({
      rowCount: root.querySelectorAll('[data-goal-task-row]').length,
      statusDisabled: root.querySelector('[data-goal-planning-control="status"] select')?.hasAttribute('disabled') || false,
      treeCount: root.querySelectorAll('[data-goal-hierarchy-guides]').length,
      errorCount: root.querySelectorAll('[role="alert"], .inline-error').length,
    }));
    record('A01-viewer-keeps-hierarchy-readable-without-mutation', readOnlyProbe.rowCount === result.fixtureIds.length && readOnlyProbe.statusDisabled && readOnlyProbe.treeCount === result.fixtureIds.length && readOnlyProbe.errorCount === 0, readOnlyProbe);
    await readOnlyGoal.screenshot({ path: `${OUTPUT_DIR}/V05-dev121-viewer-1298x698.png` });
    result.screenshots.push(`${OUTPUT_DIR}/V05-dev121-viewer-1298x698.png`);

    record('G01-no-browser-or-http-errors', result.browserErrors.length === 0 && result.httpFailures.length === 0, { browserErrors: result.browserErrors, httpFailures: result.httpFailures });
    record('G02-no-unexpected-visible-error', await page.locator('[role="alert"], .inline-error').count() === 0 && dialogs.length === 0, { dialogs });
  } catch (error) {
    failures.push('HARNESS');
    result.cases.push({ id: 'HARNESS', ok: false, details: { message: error?.message || String(error), stack: error?.stack || null } });
  }

  result.status = failures.length ? 'FAIL' : 'PASS';
  result.failures = failures;
  result.dialogs = dialogs;
  result.generatedAt = new Date().toISOString();
  await page.evaluate(({ result, outputDir }) => {
    window.__DEV121_ARTIFACT = result;
    sessionStorage.setItem('__DEV121_ARTIFACT', JSON.stringify(result));
    window.__DEV121_RESULT = result;
    window.__DEV121_OUTPUT_DIR = outputDir;
  }, { result, outputDir: OUTPUT_DIR });
  console.log(`DEV121_ARTIFACT=${JSON.stringify(result)}`);
  if (failures.length) throw new Error(`DEV-121 browser verification failed: ${failures.join(', ')}`);
  return result;
}
