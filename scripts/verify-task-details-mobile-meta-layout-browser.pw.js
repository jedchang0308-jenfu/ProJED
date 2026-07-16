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
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
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

    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
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

    step = 'mobile-summary-collapsed';
    const mobileMeta = page.locator('[data-task-details-mobile-meta="true"]');
    await mobileMeta.waitFor({ state: 'visible', timeout: 10000 });
    assert(!(await mobileMeta.evaluate((element) => element.hasAttribute('open'))), 'mobile meta should be collapsed by default');
    const desktopDateState = await getVisibilityState('[data-task-details-date-grid="true"]');
    const desktopAssignmentState = await getVisibilityState('[data-task-details-assignment-row="true"]');
    assert(!desktopDateState.visible, 'desktop date grid should be hidden on mobile', desktopDateState);
    assert(!desktopAssignmentState.visible, 'desktop assignment row should be hidden on mobile', desktopAssignmentState);
    await page.locator('[data-task-record-timeline-actions="true"]').waitFor({ state: 'attached', timeout: 10000 });
    assert(
      !(await page.locator('[data-task-record-timeline-actions="true"]').isVisible()),
      'task record quick-add actions should be hidden on mobile'
    );
    const summaryText = await page.locator('[data-task-details-mobile-meta-summary="true"]').innerText();
    assert(!summaryText.includes('任務屬性'), 'summary should not show the removed task attributes label', { summaryText });
    assert(summaryText.includes('狀態'), 'summary should include status', { summaryText });
    assert(summaryText.includes('標籤 2'), 'summary should include tag count', { summaryText });
    assert(summaryText.includes('主責 5 人'), 'summary should include primary assignee count', { summaryText });
    await assertNoHorizontalOverflow('[data-task-details-dialog="true"]', 'mobile task details dialog');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta="true"]', 'mobile collapsed meta card');
    await assertNoVisibleErrors();

    step = 'mobile-expanded-controls';
    await page.locator('[data-task-details-mobile-meta-summary="true"]').click();
    await page.locator('[data-task-details-mobile-meta-controls="true"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await mobileMeta.evaluate((element) => element.hasAttribute('open')), 'mobile meta should open after tapping summary');
    assert(await page.locator('[data-task-details-mobile-schedule-controls="true"]').isVisible(), 'mobile schedule controls should be visible after expanding');
    assert(await page.locator('[data-task-details-mobile-duration="true"]').isVisible(), 'mobile duration block should be visible after expanding');
    assert(await page.locator('[data-task-details-mobile-meta-controls="true"] [data-task-assignment-picker="true"]').isVisible(), 'mobile assignment picker should be visible after expanding');
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
    await assertNoHorizontalOverflow('[data-task-details-dialog="true"]', 'expanded mobile task details dialog');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta="true"]', 'expanded mobile meta card');
    await assertNoHorizontalOverflow('[data-task-details-mobile-meta-controls="true"]', 'expanded mobile controls');
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
