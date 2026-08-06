/* eslint-disable */
async (page) => {
  const runId = Date.now();
  const screenshots = {
    desktop: `output/playwright/dev-063-kanban-hierarchy-${runId}-1440.png`,
    laptop: `output/playwright/dev-063-kanban-hierarchy-${runId}-1024.png`,
    mobile: `output/playwright/dev-063-kanban-hierarchy-${runId}-390.png`,
    failure: `output/playwright/dev-063-kanban-hierarchy-${runId}-failure.png`,
  };
  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };
  const result = { ok: false, cases: [], screenshots };
  const browserErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) throw new Error(`${id}: ${JSON.stringify(details)}`);
  };

  const switchToBoard = async () => {
    const trigger = page.locator('[data-mode-switcher-trigger="true"]');
    await trigger.waitFor({ state: 'visible', timeout: 15000 });
    await trigger.click();
    await page.locator('[data-mode-switcher-value="board"]').click();
    await page.locator('.kanban-task-card[data-task-id]').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const readHierarchyEvidence = async () => page.evaluate(() => {
    const visible = (element) => element instanceof HTMLElement && element.offsetParent !== null;
    const card = Array.from(document.querySelectorAll('.kanban-task-card[data-task-id]'))
      .find(element => visible(element) && visible(element.querySelector('.kanban-checklist-item[data-task-id]')));
    const section = card?.querySelector('[data-kanban-checklist-visual="inset-rail"]');
    const row = section?.querySelector('.kanban-checklist-item[data-task-id]');
    if (!(card instanceof HTMLElement) || !(section instanceof HTMLElement) || !(row instanceof HTMLElement)) {
      return { found: false };
    }

    const cardStyle = getComputedStyle(card);
    const sectionStyle = getComputedStyle(section);
    const rowStyle = getComputedStyle(row);
    const cardRect = card.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const visibleErrors = Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter(visible)
      .map(element => element.textContent?.trim())
      .filter(Boolean);

    return {
      found: true,
      card: {
        visual: card.getAttribute('data-kanban-card-visual'),
        level: card.getAttribute('data-task-hierarchy-level'),
        borderWidths: [cardStyle.borderTopWidth, cardStyle.borderRightWidth, cardStyle.borderBottomWidth, cardStyle.borderLeftWidth],
        boxShadow: cardStyle.boxShadow,
        backgroundColor: cardStyle.backgroundColor,
      },
      section: {
        visual: section.getAttribute('data-kanban-checklist-visual'),
        borderLeftWidth: sectionStyle.borderLeftWidth,
        backgroundColor: sectionStyle.backgroundColor,
        boxShadow: sectionStyle.boxShadow,
      },
      row: {
        visual: row.getAttribute('data-kanban-checklist-row-visual'),
        level: row.getAttribute('data-task-hierarchy-level'),
        borderWidths: [rowStyle.borderTopWidth, rowStyle.borderRightWidth, rowStyle.borderBottomWidth, rowStyle.borderLeftWidth],
        boxShadow: rowStyle.boxShadow,
      },
      geometry: {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        rowLeft: rowRect.left,
        rowRight: rowRect.right,
        leftInset: rowRect.left - cardRect.left,
      },
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleErrors,
    };
  });

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(account => {
      localStorage.setItem('projed-local-test.selected-account', account.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }));
    }, account);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.__PROJED_QC__?.reset(30));
    await page.reload({ waitUntil: 'networkidle' });
    await switchToBoard();

    const viewportEvidence = {};
    for (const viewport of [
      { key: 'desktop', width: 1440, height: 900, screenshot: screenshots.desktop },
      { key: 'laptop', width: 1024, height: 768, screenshot: screenshots.laptop },
      { key: 'mobile', width: 390, height: 844, screenshot: screenshots.mobile },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (viewport.key === 'mobile') {
        const mobileSidebar = page.locator('[data-mobile-sidebar-overlay="true"]');
        if (await mobileSidebar.isVisible() && await mobileSidebar.getAttribute('data-sidebar-panel') === 'expanded') {
          await page.locator('[data-main-sidebar-toggle="true"]').click();
          await mobileSidebar.waitFor({ state: 'hidden', timeout: 5000 });
        }
      }
      const card = page.locator('.kanban-task-card[data-task-id]').filter({
        has: page.locator('.kanban-checklist-item[data-task-id]'),
      }).first();
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      viewportEvidence[viewport.key] = await readHierarchyEvidence();
      await page.screenshot({ path: viewport.screenshot, fullPage: false });
    }

    const evidenceList = Object.values(viewportEvidence);
    record('QA-063-001', evidenceList.every(evidence => (
      evidence.found &&
      evidence.card.visual === 'framed-elevated' &&
      evidence.card.level === 'L2' &&
      evidence.card.borderWidths.every(width => parseFloat(width) >= 1) &&
      evidence.card.boxShadow !== 'none'
    )), { viewportEvidence });
    record('QA-063-002', evidenceList.every(evidence => (
      evidence.section.visual === 'inset-rail' &&
      parseFloat(evidence.section.borderLeftWidth) >= 2 &&
      evidence.row.visual === 'flat-unlined' &&
      evidence.row.level === 'L3+' &&
      evidence.row.borderWidths.every(width => parseFloat(width) === 0) &&
      evidence.row.boxShadow === 'none'
    )), { viewportEvidence });
    record('QA-063-003', evidenceList.every(evidence => (
      evidence.geometry.leftInset >= 8 &&
      evidence.geometry.rowRight <= evidence.geometry.cardRight
    )), { viewportEvidence });
    record('QA-063-004', evidenceList.every(evidence => (
      evidence.documentWidth <= evidence.viewport &&
      evidence.bodyWidth <= evidence.viewport &&
      evidence.visibleErrors.length === 0
    )) && browserErrors.length === 0, { viewportEvidence, browserErrors });

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
    await page.evaluate(() => window.__PROJED_QC__?.reset(30)).catch(() => undefined);
  }
}
