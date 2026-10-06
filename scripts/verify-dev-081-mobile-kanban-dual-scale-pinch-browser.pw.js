/* eslint-disable */
async (page) => {
  const results = [];
  const diagnostics = [];
  const networkFailures = [];
  const screenshotBase = `output/playwright/dev-081-mobile-kanban-dual-scale-pinch-${Date.now()}`;
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`);
  });

  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 }); } catch (_) {}
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const forceTouch = new URLSearchParams(window.location.search).get('dev081Touch') === '1';
      if (query.includes('pointer: coarse') || query.includes('hover: none')) {
        return { matches: forceTouch, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false };
      }
      return nativeMatchMedia(query);
    };
  });

  page.setDefaultTimeout(9000);
  page.setDefaultNavigationTimeout(20000);

  const openApp = async (viewport, touch = true) => {
    await page.setViewportSize(viewport);
    const touchParam = touch ? '?dev081Touch=1' : '';
    await page.goto(`http://localhost:4000/${touchParam}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const fixedLogin = page.getByRole('button', { name: /使用固定測試環境/ }).first();
    if (await fixedLogin.isVisible().catch(() => false)) {
      await fixedLogin.click();
      await page.waitForTimeout(700);
    }
    const query = touch ? '?qcReset=1&qcSize=96&dev081Touch=1' : '?qcReset=1&qcSize=96';
    await page.goto(`http://localhost:4000/${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.locator('[data-mobile-pan-surface="board"]').waitFor({ state: 'visible', timeout: 15000 });
    const emulationCdp = await page.context().newCDPSession(page);
    await emulationCdp.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
    await emulationCdp.detach().catch(() => undefined);
    await page.waitForTimeout(250);
  };

  const readGeometry = () => page.evaluate(() => {
    const board = document.querySelector('[data-mobile-pan-surface="board"]');
    const column = board?.querySelector('[data-kanban-column="true"]');
    const l1 = board?.querySelector('[data-kanban-column-header] [data-task-title-slot="true"]');
    const l2 = board?.querySelector('[data-task-hierarchy-level="L2"] [data-task-title-slot="true"]');
    const l3 = board?.querySelector('[data-task-hierarchy-level="L3+"] [data-task-title-slot="true"]');
    const date = board?.querySelector('[data-task-date-badge="true"]');
    const tag = board?.querySelector('[data-kanban-tag-front="true"]');
    const rect = (item) => item ? item.getBoundingClientRect().toJSON() : null;
    const style = (item) => item ? getComputedStyle(item) : null;
    const checklistRows = Array.from(board?.querySelectorAll('.kanban-checklist-item') || []);
    const checklistDepth = (item) => style(item)?.getPropertyValue('--kanban-checklist-depth').trim();
    const depth1Row = checklistRows.find((item) => checklistDepth(item) === '1');
    const hierarchyCard = depth1Row?.closest('.kanban-task-card');
    const sameCardRows = Array.from(hierarchyCard?.querySelectorAll('.kanban-checklist-item') || []);
    const checklistRowAtDepth = (depth) => sameCardRows.find((item) => checklistDepth(item) === String(depth));
    const checklistGeometry = (depth) => {
      const row = checklistRowAtDepth(depth);
      const title = row?.querySelector('[data-task-title-slot="true"]');
      return {
        found: Boolean(row && title),
        paddingLeft: Number.parseFloat(style(row)?.paddingLeft || '0'),
        titleLeft: rect(title)?.left || 0,
      };
    };
    const depth0 = checklistGeometry(0);
    const depth1 = checklistGeometry(1);
    return {
      viewSize: board?.getAttribute('data-kanban-view-size') || null,
      pinchState: board?.getAttribute('data-kanban-pinch-state') || null,
      mobileMarker: board?.getAttribute('data-kanban-mobile-surface') || null,
      toggleCount: document.querySelectorAll('[data-kanban-size-toggle="true"]').length,
      columnWidth: rect(column)?.width || 0,
      l1Font: Number.parseFloat(style(l1)?.fontSize || '0'),
      l2Font: Number.parseFloat(style(l2)?.fontSize || '0'),
      l3Font: Number.parseFloat(style(l3)?.fontSize || '0'),
      dateFont: Number.parseFloat(style(date)?.fontSize || '0'),
      tagFont: Number.parseFloat(style(tag)?.fontSize || '0'),
      metaToken: board ? getComputedStyle(board).getPropertyValue('--kanban-meta-size').trim() : null,
      dateClass: date?.className || null,
      bodyPinch: document.body.hasAttribute('data-kanban-pinch-active'),
      modalCount: document.querySelectorAll('[data-task-details-modal="true"]').length,
      actionRailCount: document.querySelectorAll('[data-mobile-task-action-rail="true"]').length,
      hierarchy: {
        depth0,
        depth1,
        paddingDelta: depth1.paddingLeft - depth0.paddingLeft,
        titleLeftDelta: depth1.titleLeft - depth0.titleLeft,
      },
      pinchDebug: (window.__projedMobilePanDebug || []).slice(-12),
    };
  });

  const assertHierarchy = (geometry, expectedBase, expectedIndent) => {
    const hierarchy = geometry.hierarchy;
    const tolerance = 0.6;
    assert(hierarchy.depth0.found && hierarchy.depth1.found, 'fixture must expose two checklist depths', hierarchy);
    assert(Math.abs(hierarchy.depth0.paddingLeft - expectedBase) <= tolerance, 'depth 0 base inset should match the active scale', { hierarchy, expectedBase });
    assert(Math.abs(hierarchy.paddingDelta - expectedIndent) <= tolerance, 'each child depth should add the active hierarchy indent', { hierarchy, expectedIndent });
    assert(Math.abs(hierarchy.titleLeftDelta - expectedIndent) <= tolerance, 'child title should be visibly offset from its parent', { hierarchy, expectedIndent });
  };

  const firstBoardPoint = async (ratioX = 0.5, ratioY = 0.25) => {
    const box = await page.locator('[data-mobile-pan-surface="board"]').boundingBox();
    assert(Boolean(box), 'board surface must be visible');
    return { x: Math.round(box.x + box.width * ratioX), y: Math.round(box.y + box.height * ratioY) };
  };

  const pinch = async ({ out }) => {
    const center = await firstBoardPoint(0.55, 0.28);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.waitForTimeout(120);
    const initial = 46;
    const final = out ? 92 : 20;
    const points = (distance) => [
      { x: center.x - distance / 2, y: center.y, radiusX: 4, radiusY: 4, force: 1, id: 1 },
      { x: center.x + distance / 2, y: center.y, radiusX: 4, radiusY: 4, force: 1, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(initial) });
    await page.waitForTimeout(40);
    for (let step = 1; step <= 5; step += 1) {
      const distance = initial + ((final - initial) * step) / 5;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => undefined);
    await page.waitForTimeout(260);
  };

  const pinchWithThirdFinger = async () => {
    const center = await firstBoardPoint(0.55, 0.28);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.waitForTimeout(120);
    const points = (distance, includeThird = false) => {
      const base = [
        { x: center.x - distance / 2, y: center.y, radiusX: 4, radiusY: 4, force: 1, id: 1 },
        { x: center.x + distance / 2, y: center.y, radiusX: 4, radiusY: 4, force: 1, id: 2 },
      ];
      if (includeThird) base.push({ x: center.x, y: center.y + 50, radiusX: 4, radiusY: 4, force: 1, id: 3 });
      return base;
    };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(46) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(46, true) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(92, true) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => undefined);
    await page.waitForTimeout(220);
  };

  const runCase = async (id, scenario, operation) => {
    try {
      const details = await operation();
      results.push({ id, scenario, result: 'PASS', details });
    } catch (error) {
      const screenshotPath = `${screenshotBase}-${id}-FAIL.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      results.push({ id, scenario, result: 'FAIL', error: error.message, screenshotPath });
    }
  };

  await runCase('QA-081-R01', 'mobile compact default exposes one scoped toggle', async () => {
    await openApp({ width: 390, height: 844 }, true);
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'compact', 'default view should be compact', geometry);
    assert(geometry.toggleCount === 1, 'mobile board should expose exactly one size toggle', geometry);
    assertHierarchy(geometry, 4, 5);
    return geometry;
  });

  await runCase('QA-081-R02', 'toolbar switches to the 2.5x large reflow', async () => {
    const toggle = page.locator('[data-kanban-size-toggle="true"]');
    await toggle.click();
    await page.waitForTimeout(260);
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'large', 'toolbar should switch to large', geometry);
    assert(geometry.columnWidth >= 620, 'large column width should be approximately 630px', geometry);
    assert(geometry.l1Font >= 34 && geometry.l2Font >= 34 && geometry.l3Font >= 29 && geometry.dateFont >= 20, 'large text/meta should be 2–3x compact', geometry);
    assertHierarchy(geometry, 10, 5);
    return geometry;
  });

  await runCase('QA-081-R03', 'toolbar returns to compact without touching app shell', async () => {
    await page.locator('[data-kanban-size-toggle="true"]').click();
    await page.waitForTimeout(260);
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'compact', 'toolbar should return to compact', geometry);
    assert(geometry.l1Font < 20 && geometry.l3Font < 20, 'compact title sizes should stay small', geometry);
    return geometry;
  });

  await runCase('QA-081-R04', 'pinch out commits compact to large once', async () => {
    await openApp({ width: 844, height: 390 }, true);
    await pinch({ out: true });
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'large', 'pinch out should commit large', geometry);
    assert(geometry.bodyPinch === false && geometry.pinchState === 'idle', 'pinch should release all guards', geometry);
    return geometry;
  });

  await runCase('QA-081-R05', 'pinch in commits large to compact once', async () => {
    await pinch({ out: false });
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'compact', 'pinch in should commit compact', geometry);
    return geometry;
  });

  await runCase('QA-081-R06', 'third finger cancels candidate and preserves current mode', async () => {
    await pinchWithThirdFinger();
    const geometry = await readGeometry();
    assert(geometry.viewSize === 'compact', 'third finger should not switch mode', geometry);
    assert(geometry.bodyPinch === false && geometry.pinchState === 'idle', 'third finger release should rearm', geometry);
    return geometry;
  });

  await runCase('QA-081-R07', 'multi-touch conflict with task action does not open modal or rail', async () => {
    const target = page.locator('[data-mobile-task-card-primary="true"]').first();
    const box = await target.boundingBox();
    assert(Boolean(box), 'task card primary surface should be visible');
    const point = { x: Math.round(box.x + box.width * 0.45), y: Math.round(box.y + box.height * 0.45) };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.waitForTimeout(120);
    const one = [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
    const two = [...one, { x: point.x + 22, y: point.y, radiusX: 4, radiusY: 4, force: 1, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: one });
    await page.waitForTimeout(620);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => undefined);
    await page.waitForTimeout(250);
    const geometry = await readGeometry();
    assert(geometry.modalCount === 0 && geometry.actionRailCount === 0, 'gesture conflict must not activate task UI', geometry);
    return geometry;
  });

  await runCase('QA-081-R08', 'touch mobile landscape remains board-only and anchored', async () => {
    await openApp({ width: 844, height: 390 }, true);
    const geometry = await readGeometry();
    assert(geometry.toggleCount === 1 && geometry.viewSize === 'compact', 'landscape touch board should expose compact toggle', geometry);
    await pinch({ out: true });
    const large = await readGeometry();
    assert(large.viewSize === 'large' && large.columnWidth >= 620, 'landscape pinch should use same large tokens', large);
    return large;
  });

  await runCase('QA-081-R09', 'desktop negative does not expose mobile size toggle', async () => {
    await openApp({ width: 1024, height: 768 }, false);
    const geometry = await readGeometry();
    assert(geometry.toggleCount === 0, 'desktop should not expose mobile size toggle', geometry);
    assert(geometry.viewSize === 'compact', 'desktop effective board size must remain compact', geometry);
    return geometry;
  });

  await runCase('QA-081-R10', 'desktop keeps the shared parent-child hierarchy indentation', async () => {
    const geometry = await readGeometry();
    assertHierarchy(geometry, 4, 6);
    return geometry;
  });

  const final = {
    verifier: 'DEV-081 mobile kanban dual scale pinch browser',
    result: results.every((item) => item.result === 'PASS') ? 'PASS' : 'FAIL',
    results,
    diagnostics,
    networkFailures,
    viewports: ['390x844 touch', '844x390 touch', '1024x768 desktop'],
    constraints: { uiOnly: true, noStoreMutation: true, noLocalStorageMutation: true, noDomDispatch: true },
  };
  await page.screenshot({ path: `${screenshotBase}-final.png`, fullPage: false }).catch(() => undefined);
  await page.evaluate((artifact) => { window.__DEV081_ARTIFACT = artifact; }, final);
  if (final.result !== 'PASS') throw new Error(JSON.stringify(final));
  return final;
}
