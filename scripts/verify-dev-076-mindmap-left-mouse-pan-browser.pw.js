/* eslint-disable */
async (page) => {
  const outputDirectory = 'output/playwright/dev-076-mindmap-left-mouse-pan';
  const artifact = {
    schema: 'dev-076-v1',
    route: 'http://localhost:4000/',
    viewports: [],
    mobileBoundary: null,
    consoleErrors: [],
    pageErrors: [],
    networkErrors: [],
    visibleErrors: [],
  };
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  page.on('console', (message) => {
    if (message.type() === 'error') artifact.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => artifact.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) artifact.networkErrors.push(`${response.status()} ${response.url()}`);
  });

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED local QA',
    createdAt: 1704067200000,
  };

  const establishSession = async () => {
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((session) => {
      localStorage.setItem('projed-local-test.selected-account', session.id);
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: session.uid,
        email: session.email,
        displayName: session.displayName,
        createdAt: session.createdAt,
      }));
    }, account);
  };

  const ensureMindMap = async () => {
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    const mindMap = page.locator('[data-mindmap-view]');
    if (!(await mindMap.isVisible().catch(() => false))) {
      await page.locator('[data-mode-switcher-trigger="true"]').click();
      await page.locator('[data-mode-switcher-value="mindmap"]').click();
    }
    await mindMap.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-node]').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(350);
  };

  const collectVisibleErrors = async (label) => {
    const errors = await page.evaluate(() => {
      const selectorErrors = Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
        .map((element) => (element.textContent || '').trim())
        .filter(Boolean);
      const bodyText = document.body.innerText;
      const patterns = ['Internal Server Error', 'HTTP 4', 'HTTP 5', 'Not Found', 'TypeError', 'ReferenceError', 'Unhandled Runtime Error'];
      return [...selectorErrors, ...patterns.filter((pattern) => bodyText.includes(pattern))];
    });
    artifact.visibleErrors.push(...errors.map((error) => `${label}: ${error}`));
  };

  const findBlankPoint = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-left-pan="true"]');
    if (!(surface instanceof HTMLElement)) return null;
    const rect = surface.getBoundingClientRect();
    const blocked = [
      '[data-mindmap-node]',
      '[data-mindmap-center]',
      '[data-mindmap-toggle-hover-target]',
      '[data-mindmap-note-relationship-click-target]',
      '[data-mindmap-note-relationship-line-click-target]',
      '[data-mindmap-note-relationship-curve-click-target]',
      '[data-mindmap-note-relationship-endpoint]',
      '[data-mindmap-note-relationship-control-point]',
      'button', 'input', 'textarea', 'select', 'a', '[contenteditable="true"]', '[role="button"]',
    ].join(',');
    for (let y = rect.top + 150; y <= rect.bottom - 80; y += 42) {
      for (let x = rect.left + 180; x <= rect.right - 80; x += 48) {
        const target = document.elementFromPoint(x, y);
        if (!(target instanceof Element) || !surface.contains(target) || target.closest(blocked)) continue;
        return { x, y, tag: target.tagName, className: target.getAttribute('class') || '' };
      }
    }
    return null;
  });

  const getSnapshot = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-left-pan="true"]');
    const selected = document.querySelector('[data-mindmap-node][aria-selected="true"]');
    const connector = document.querySelector('[data-mindmap-connector-path]');
    const relationship = document.querySelector('[data-mindmap-note-relationship-path]');
    return surface instanceof HTMLElement ? {
      scrollLeft: surface.scrollLeft,
      scrollTop: surface.scrollTop,
      maxScrollLeft: surface.scrollWidth - surface.clientWidth,
      maxScrollTop: surface.scrollHeight - surface.clientHeight,
      state: surface.getAttribute('data-mindmap-left-pan-state'),
      selectedId: selected?.getAttribute('data-mindmap-node') || '',
      recomputeCount: Number(surface.getAttribute('data-mindmap-recompute-count') || 0),
      connectorD: connector?.getAttribute('d') || '',
      relationshipD: relationship?.getAttribute('d') || '',
      nodeStorage: localStorage.getItem('projed-local-test.nodes'),
      relationshipStorage: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key) => key && key.toLowerCase().includes('relationship'))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
      scrollOwners: document.querySelectorAll('[data-mindmap-scroll-owner="true"]').length,
      bodyPanActive: document.body.getAttribute('data-mindmap-left-pan-active') || '',
      bodyScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    } : null;
  });

  const selectFirstNode = async () => {
    const node = page.locator('[data-mindmap-node]').first();
    await node.click();
    await page.waitForTimeout(320);
    const quickTitle = page.locator('[data-mindmap-quick-title-input="true"]');
    if (await quickTitle.isVisible().catch(() => false)) await quickTitle.press('Escape');
    await page.waitForTimeout(80);
    const nodeId = await node.getAttribute('data-mindmap-node');
    assert(nodeId && await node.getAttribute('aria-selected') === 'true', 'fixture node should be selected before canvas pan', { nodeId });
    return nodeId;
  };

  const runViewport = async (name, width, height) => {
    await page.setViewportSize({ width, height });
    await page.reload({ waitUntil: 'networkidle' });
    await ensureMindMap();
    const surface = page.locator('[data-mindmap-left-pan="true"]');
    const selectedId = await selectFirstNode();
    const blank = await findBlankPoint();
    assert(blank, `${name} should expose a measurable blank canvas point`);
    const before = await getSnapshot();
    assert(before && before.scrollOwners === 1, `${name} should keep one mindmap scroll owner`, before || {});

    const pointerDx = before.maxScrollLeft - before.scrollLeft >= 140 ? -120 : 120;
    const pointerDy = before.maxScrollTop - before.scrollTop >= 100 ? -80 : 80;
    const expectedLeft = Math.max(0, Math.min(before.maxScrollLeft, before.scrollLeft - pointerDx));
    const expectedTop = Math.max(0, Math.min(before.maxScrollTop, before.scrollTop - pointerDy));

    await page.mouse.move(blank.x, blank.y);
    await page.mouse.down({ button: 'left' });
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'armed', `${name} blank pointerdown should arm canvas pan`);
    await page.mouse.move(blank.x + pointerDx, blank.y + pointerDy, { steps: 5 });
    const active = await page.evaluate(() => {
      const surface = document.querySelector('[data-mindmap-left-pan="true"]');
      return surface instanceof HTMLElement ? {
        state: surface.getAttribute('data-mindmap-left-pan-state'),
        cursor: getComputedStyle(surface).cursor,
        bodyActive: document.body.getAttribute('data-mindmap-left-pan-active'),
        scrollLeft: surface.scrollLeft,
        scrollTop: surface.scrollTop,
      } : null;
    });
    assert(active?.state === 'active' && active?.bodyActive === 'true', `${name} drag should enter active left-pan ownership`, active || {});
    assert(active?.cursor === 'grabbing', `${name} active canvas should render grabbing cursor`, active || {});
    await page.screenshot({ path: `${outputDirectory}/${name}-active-pan.png` });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(80);

    const after = await getSnapshot();
    assert(after, `${name} should expose post-pan metrics`);
    assert(Math.abs(after.scrollLeft - expectedLeft) <= 2, `${name} horizontal direct pan should follow the pointer`, { before, active, after, expectedLeft });
    assert(Math.abs(after.scrollTop - expectedTop) <= 2, `${name} vertical direct pan should follow the pointer`, { before, active, after, expectedTop });
    assert(after.state === 'idle' && after.bodyPanActive === '', `${name} pointerup should clear pan ownership`, after);
    assert(after.selectedId === selectedId, `${name} active canvas pan should preserve task selection`, { selectedId, after });
    assert(after.recomputeCount === before.recomputeCount, `${name} pure pan should not dirty world geometry`, { before, after });
    assert(after.connectorD === before.connectorD && after.relationshipD === before.relationshipD, `${name} pure pan should preserve world paths`, { before, after });
    assert(after.nodeStorage === before.nodeStorage && JSON.stringify(after.relationshipStorage) === JSON.stringify(before.relationshipStorage), `${name} pure pan should not write task or relationship data`, { before, after });
    assert(after.bodyScrollWidth <= width + 2, `${name} should not create document-level horizontal overflow`, after);

    const node = page.locator(`[data-mindmap-node="${selectedId}"]`);
    const nodeBox = await node.boundingBox();
    assert(nodeBox, `${name} selected node should remain measurable after pan`);
    const scrollBeforeNodePointer = await surface.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
    await page.mouse.down({ button: 'left' });
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'idle', `${name} task node pointerdown must not arm canvas pan`);
    await page.mouse.up({ button: 'left' });
    const scrollAfterNodePointer = await surface.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    assert(JSON.stringify(scrollBeforeNodePointer) === JSON.stringify(scrollAfterNodePointer), `${name} task node pointerdown must not move canvas`, { scrollBeforeNodePointer, scrollAfterNodePointer });

    const center = page.locator('[data-mindmap-center]');
    const centerBox = await center.boundingBox();
    const blockedTargets = ['task-node', 'center-topic'];
    assert(centerBox, `${name} center topic should remain measurable`);
    await page.mouse.move(centerBox.x + centerBox.width / 2, centerBox.y + centerBox.height / 2);
    await page.mouse.down({ button: 'left' });
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'idle', `${name} center topic pointerdown must not arm canvas pan`);
    await page.mouse.up({ button: 'left' });

    const toggle = page.locator('[data-mindmap-toggle]').first();
    if (await toggle.count()) {
      const togglePanState = await toggle.evaluate((element) => {
        element.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 76,
          pointerType: 'mouse',
        }));
        return document.querySelector('[data-mindmap-left-pan="true"]')?.getAttribute('data-mindmap-left-pan-state') || '';
      });
      assert(togglePanState === 'idle', `${name} collapse control pointerdown must not arm canvas pan`, { togglePanState });
      blockedTargets.push('collapse-toggle');
    }

    const relationshipTool = page.locator('[data-mindmap-note-relationship-tool]');
    if (await relationshipTool.isVisible().catch(() => false)) {
      await relationshipTool.click();
      const toolBlank = await findBlankPoint();
      assert(toolBlank, `${name} relationship mode should retain a measurable blank point`);
      await page.mouse.move(toolBlank.x, toolBlank.y);
      await page.mouse.down({ button: 'left' });
      assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'idle', `${name} relationship tool ownership must block blank canvas left pan`);
      await page.mouse.up({ button: 'left' });
      await relationshipTool.click();
      blockedTargets.push('relationship-tool-active');
    }

    await node.click();
    await page.waitForTimeout(320);
    const quickTitle = page.locator('[data-mindmap-quick-title-input="true"]');
    if (await quickTitle.isVisible().catch(() => false)) await quickTitle.press('Escape');
    const freshBlank = await findBlankPoint();
    assert(freshBlank, `${name} should expose a blank point for threshold click`);
    await page.mouse.move(freshBlank.x, freshBlank.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(freshBlank.x + 2, freshBlank.y + 1);
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'armed', `${name} sub-threshold movement should remain armed`);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(80);
    assert(await page.locator('[data-mindmap-node][aria-selected="true"]').count() === 0, `${name} sub-threshold blank click should keep the existing clear-selection behavior`);

    await page.mouse.move(freshBlank.x, freshBlank.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(freshBlank.x - 30, freshBlank.y - 20, { steps: 2 });
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'active', `${name} cancel fixture should become active`);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' })));
    await page.waitForTimeout(30);
    assert(await surface.getAttribute('data-mindmap-left-pan-state') === 'idle', `${name} pointercancel should restore idle state`);
    assert(await page.evaluate(() => document.body.hasAttribute('data-mindmap-left-pan-active')) === false, `${name} pointercancel should clear body cursor ownership`);
    await page.mouse.up({ button: 'left' });

    await collectVisibleErrors(name);
    await page.screenshot({ path: `${outputDirectory}/${name}-final.png` });
    artifact.viewports.push({
      name,
      width,
      height,
      blank,
      selectedId,
      pointerDelta: { x: pointerDx, y: pointerDy },
      expected: { scrollLeft: expectedLeft, scrollTop: expectedTop },
      before,
      active,
      after,
      blockedTargets,
      subThresholdClearedSelection: true,
      cancelCleanup: true,
      screenshots: [`${name}-active-pan.png`, `${name}-final.png`],
    });
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await establishSession();
  await page.reload({ waitUntil: 'networkidle' });
  await ensureMindMap();
  await runViewport('desktop-1440x900', 1440, 900);
  await runViewport('laptop-1024x768', 1024, 768);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(250);
  const mobileState = await page.evaluate(() => ({
    width: window.innerWidth,
    mindMapVisible: Array.from(document.querySelectorAll('[data-mindmap-view]')).some((element) => element instanceof HTMLElement && element.offsetParent !== null),
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert(mobileState.mindMapVisible === false, '390x844 should preserve the existing mobile mindmap boundary', mobileState);
  assert(mobileState.documentOverflow <= 2, '390x844 should not introduce document overflow', mobileState);
  await collectVisibleErrors('mobile-390x844');
  await page.screenshot({ path: `${outputDirectory}/mobile-390x844-boundary.png` });
  artifact.mobileBoundary = { ...mobileState, screenshot: 'mobile-390x844-boundary.png' };

  assert(artifact.consoleErrors.length === 0, 'DEV-076 should not emit console errors', artifact.consoleErrors);
  assert(artifact.pageErrors.length === 0, 'DEV-076 should not emit page errors', artifact.pageErrors);
  assert(artifact.networkErrors.length === 0, 'DEV-076 should not emit HTTP errors', artifact.networkErrors);
  assert(artifact.visibleErrors.length === 0, 'DEV-076 should not show visible runtime errors', artifact.visibleErrors);
  artifact.result = 'PASS';
  artifact.executedAt = new Date().toISOString();
  await page.evaluate((result) => { window.__DEV076_ARTIFACT = result; }, artifact);
  return artifact;
}
