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
