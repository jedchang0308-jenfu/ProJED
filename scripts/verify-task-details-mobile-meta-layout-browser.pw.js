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

  const visibleErrorPattern = /(HTTP\s+[45]\d\d|Not Found|Internal Server Error|Load failed|載入失敗|錯誤|失敗)/i;

  const assertNoVisibleErrors = async () => {
    const visibleErrors = await page.evaluate((patternSource) => {
      const pattern = new RegExp(patternSource, 'i');
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return Array.from(document.querySelectorAll('.inline-error, [role="alert"], body *'))
        .filter((element) => isVisible(element) && pattern.test(element.textContent || ''))
        .slice(0, 8)
        .map((element) => (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160));
    }, visibleErrorPattern.source);
    assert(visibleErrors.length === 0, 'mobile task details should not show visible runtime errors', { visibleErrors });
  };

  const assertNoHorizontalOverflow = async (selector, label) => {
    const metrics = await page.locator(selector).first().evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rectWidth: element.getBoundingClientRect().width,
    }));
    assert(
      metrics.scrollWidth <= metrics.clientWidth + 2,
      `${label} should not have horizontal overflow`,
      metrics
    );
  };

  const assertMobileMetaChildrenWithinBounds = async () => {
    const offenders = await page.locator('[data-task-details-mobile-meta="true"]').evaluate((root) => {
      const rootRect = root.getBoundingClientRect();
      const targets = [
        root,
        ...Array.from(root.querySelectorAll(
          '[data-task-details-mobile-meta-summary], [data-task-details-mobile-meta-controls], [data-task-details-mobile-schedule-controls], [data-task-details-meta-control-row], [data-task-assignment-picker], input, select, button'
        )),
      ];
      return targets
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            data: Array.from(element.attributes)
              .filter((attribute) => attribute.name.startsWith('data-'))
              .map((attribute) => `${attribute.name}=${attribute.value}`)
              .join(' '),
            display: style.display,
            visibility: style.visibility,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            rootLeft: rootRect.left,
            rootRight: rootRect.right,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((item) => item.display !== 'none' && item.visibility !== 'hidden' && item.width > 0)
        .filter((item) => item.left < rootRect.left - 2 || item.right > rootRect.right + 2 || item.scrollWidth > item.clientWidth + 2);
    });
    assert(offenders.length === 0, 'mobile meta controls should stay inside card bounds', { offenders });
  };

  const getVisibilityState = async (selector) => page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      innerWidth: window.innerWidth,
      className: element.getAttribute('class'),
      display: style.display,
      visibility: style.visibility,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
    };
  });

  const openAppWithDenseMobileFixture = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((account) => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__PROJED_QC__), null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(18);
    });
    await page.evaluate(() => {
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__PROJED_QC__), null, { timeout: 15000 });

    await page.evaluate(() => {
      window.__PROJED_QC__?.reset(18);

      const now = Date.now();
      const tags = [
        { id: 'mobile-qc-tag-1', workspaceId: 'local-test-workspace', name: '5555', color: 'green', order: 0, createdAt: now, updatedAt: now },
        { id: 'mobile-qc-tag-2', workspaceId: 'local-test-workspace', name: '66666666', color: 'lime', order: 1, createdAt: now, updatedAt: now },
      ];
      localStorage.setItem('projed-local-test.tags', JSON.stringify(tags));

      const memberRecords = [
        { userId: 'local-test-user', role: 'owner', createdAt: 1704067200000, updatedAt: 1704067200000 },
        { userId: 'local-test-pm', role: 'project_manager', createdAt: 1704067200000, updatedAt: 1704067200000 },
        { userId: 'local-test-admin', role: 'admin', createdAt: 1704067200000, updatedAt: 1704067200000 },
        { userId: 'local-test-member', role: 'member', createdAt: 1704067200000, updatedAt: 1704067200000 },
        { userId: 'local-test-viewer', role: 'viewer', createdAt: 1704067200000, updatedAt: 1704067200000 },
        { userId: 'local-test-analyst', role: 'member', createdAt: 1704067200000, updatedAt: 1704067200000 },
      ];
      localStorage.setItem('projed-local-test.boardMembers', JSON.stringify({
        'local-test-workspace:local-test-mobile-ui-board': memberRecords,
      }));

      const nodes = JSON.parse(localStorage.getItem('projed-local-test.nodes') || '{}');
      const task = nodes['qc-card-1'];
      if (task) {
        nodes['qc-card-1'] = {
          ...task,
          startDate: '2026-07-10',
          endDate: '2026-07-12',
          tagIds: tags.map((tag) => tag.id),
          assigneeId: 'local-test-user',
          assigneeIds: ['local-test-user', 'local-test-pm', 'local-test-admin', 'local-test-member', 'local-test-viewer'],
          collaboratorIds: ['local-test-analyst'],
          isDurationLocked: true,
          updatedAt: now,
        };
        localStorage.setItem('projed-local-test.nodes', JSON.stringify(nodes));
      }

      localStorage.setItem('projed-last-view', 'board');
      localStorage.setItem('projed-filters', JSON.stringify({
        statusFilters: {
          todo: true,
          in_progress: true,
          delayed: true,
          completed: true,
          unsure: true,
          onhold: true,
        },
        showDependencies: true,
        showStartDate: true,
        showTags: true,
        dueWithinDays: null,
        selectedAssigneeIds: [],
      }));
    });

    await page.goto('http://127.0.0.1:4000/', { waitUntil: 'networkidle' });
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
  };

  const openTaskDetails = async () => {
    const card = page.locator('.kanban-task-card[data-task-id="qc-card-1"]').first();
    await card.waitFor({ state: 'visible', timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    const title = card.locator('.task-title-text').first();
    if (await title.count()) {
      await title.click({ position: { x: 12, y: 8 } });
    } else {
      await card.click({ position: { x: 72, y: 20 } });
    }
    await page.locator('[data-task-details-modal="true"]').waitFor({ state: 'visible', timeout: 10000 });
  };

  let step = 'open-app';
  try {
    await openAppWithDenseMobileFixture();

    step = 'open-task-details';
    await openTaskDetails();
    const modal = page.locator('[data-task-details-modal="true"]');
    assert(await modal.isVisible(), 'task details modal should be visible');

    step = 'mobile-shared-controls-visible';
    const mobileMeta = page.locator('[data-task-details-mobile-meta="true"]');
    await mobileMeta.waitFor({ state: 'visible', timeout: 10000 });
    assert(await mobileMeta.locator('[data-task-details-mobile-meta-summary="true"]').count() === 0, 'mobile metadata should not render a separate collapse summary');
    const primaryRowLayout = await page.evaluate(() => {
      const status = document.querySelector('[data-task-details-assignment-row="true"] [data-task-details-meta-field="status"]');
      const assignment = document.querySelector('[data-task-details-assignment-row="true"] [data-task-details-meta-field="assignment"]');
      const statusRect = status?.getBoundingClientRect();
      const assignmentRect = assignment?.getBoundingClientRect();
      return {
        status: statusRect ? { top: statusRect.top, width: statusRect.width } : null,
        assignment: assignmentRect ? { top: assignmentRect.top, width: assignmentRect.width } : null,
      };
    });
    assert(primaryRowLayout.status && primaryRowLayout.assignment, 'status and assignment fields should both render in the primary row', primaryRowLayout);
    assert(Math.abs(primaryRowLayout.status.top - primaryRowLayout.assignment.top) <= 1, 'status and assignment fields should share one row', primaryRowLayout);
    assert(primaryRowLayout.status.width < primaryRowLayout.assignment.width, 'status should use less width than assignment', primaryRowLayout);
    const desktopDateState = await getVisibilityState('[data-task-details-date-grid="true"]');
    const desktopAssignmentState = await getVisibilityState('[data-task-details-assignment-row="true"]');
    assert(desktopDateState.visible, 'shared date grid should be directly visible on mobile', desktopDateState);
    assert(desktopAssignmentState.visible, 'shared assignment row should be directly visible on mobile', desktopAssignmentState);
    await page.locator('[data-task-record-timeline-actions="true"]').waitFor({ state: 'attached', timeout: 10000 });
    assert(
      !(await page.locator('[data-task-record-timeline-actions="true"]').isVisible()),
      'task record quick-add actions should be hidden on mobile'
    );
    await assertNoHorizontalOverflow('[data-task-details-dialog="true"]', 'mobile task details dialog');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta="true"]', 'shared mobile metadata surface');
    await assertNoVisibleErrors();

    step = 'mobile-shared-controls-interaction';
    await page.locator('[data-task-details-mobile-meta-controls="true"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('[data-task-details-mobile-schedule-controls="true"]').isVisible(), 'shared schedule controls should be visible on mobile');
    assert(await page.locator('[data-task-details-mobile-duration="true"]').isVisible(), 'shared duration control should be visible on mobile');
    assert(await page.locator('[data-task-details-mobile-meta-controls="true"] [data-task-assignment-picker="true"]').isVisible(), 'shared assignment picker should be visible on mobile');
    await page.locator('[data-task-details-mobile-meta-controls="true"] [data-task-assignment-picker="true"] button').first().click();
    const assignmentPanel = page.locator('[data-task-assignment-picker-panel="true"]').last();
    await assignmentPanel.waitFor({ state: 'visible', timeout: 5000 });
    const assignmentPanelText = await assignmentPanel.innerText();
    assert(assignmentPanelText.includes('主責'), 'assignment picker should keep primary section', { assignmentPanelText });
    assert(assignmentPanelText.includes('協作'), 'assignment picker should keep collaborator section', { assignmentPanelText });
    assert(
      !/(主責對成果|共同主責較多|可複選|清除主責|owner|project_manager|admin|member|viewer)/.test(assignmentPanelText),
      'assignment picker should remove non-essential helper and role text',
      { assignmentPanelText },
    );
    await assertNoHorizontalOverflow('[data-task-details-dialog="true"]', 'shared mobile task details dialog');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta="true"]', 'shared mobile metadata surface');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta-controls="true"]', 'shared mobile metadata controls');
    await assertNoHorizontalOverflow('[data-task-assignment-picker-panel="true"]', 'mobile assignment picker panel');
    await assertMobileMetaChildrenWithinBounds();
    await assertNoVisibleErrors();

    await page.screenshot({
      path: 'output/playwright/task-details-mobile-meta-layout.png',
      fullPage: true,
    });
  } catch (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
