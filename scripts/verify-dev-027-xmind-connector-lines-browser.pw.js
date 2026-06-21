/* eslint-disable */
async (page) => {
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(`${message}: ${JSON.stringify(details)}`);
      error.details = details;
      throw error;
    }
  };

  const account = {
    id: 'local-test-user',
    uid: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED 本機測試擁有者',
    createdAt: 1704067200000,
  };

  const openApp = async (viewport) => {
    await page.setViewportSize(viewport);
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
    const switcher = page.locator('nav button', { hasText: '心智圖' }).first();
    await switcher.waitFor({ state: 'visible', timeout: 15000 });
    await switcher.click();
    await page.locator('[data-mindmap-view]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-mindmap-connector-overlay]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(350);
  };

  const assertNoVisibleErrors = async (label) => {
    const bodyText = await page.locator('body').innerText();
    const errorPatterns = [
      'Internal Server Error',
      'HTTP 4',
      'HTTP 5',
      'Not Found',
      'TypeError',
      'ReferenceError',
      'Unhandled Runtime Error',
    ];
    const visibleError = errorPatterns.find(pattern => bodyText.includes(pattern));
    assert(!visibleError, `${label} should not show visible runtime errors`, { visibleError });
  };

  const collectGeometry = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-mindmap-surface]');
    const center = document.querySelector('[data-mindmap-center]');
    const surfaceRect = surface?.getBoundingClientRect();
    const centerRect = center?.getBoundingClientRect();
    const rectToJson = (rect) => rect ? {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    } : null;
    const nodes = Array.from(document.querySelectorAll('[data-mindmap-node]')).map((element) => ({
      id: element.getAttribute('data-mindmap-node'),
      title: element.getAttribute('data-mindmap-node-title'),
      level: Number(element.getAttribute('data-mindmap-node-level') || '0'),
      direction: element.getAttribute('data-mindmap-node-direction'),
      rect: rectToJson(element.getBoundingClientRect()),
    }));
    const nodeById = Object.fromEntries(nodes.map(node => [node.id, node]));
    const endpointDistance = (path, node, endpoint) => {
      if (!node?.rect || !surfaceRect) return Number.POSITIVE_INFINITY;
      const x = Number(path.getAttribute(endpoint === 'from' ? 'data-from-x' : 'data-to-x')) + surfaceRect.left;
      const y = Number(path.getAttribute(endpoint === 'from' ? 'data-from-y' : 'data-to-y')) + surfaceRect.top;
      const direction = path.getAttribute('data-direction');
      const expectedX = endpoint === 'from'
        ? (direction === 'right' ? node.rect.right : node.rect.left)
        : (direction === 'right' ? node.rect.left : node.rect.right);
      const clampedY = Math.min(Math.max(y, node.rect.top), node.rect.bottom);
      return Math.hypot(x - expectedX, y - clampedY);
    };
    const paths = Array.from(document.querySelectorAll('[data-mindmap-connector-path]')).map((path) => {
      const fromNodeId = path.getAttribute('data-from-node-id');
      const toNodeId = path.getAttribute('data-to-node-id');
      const fromNode = fromNodeId === 'center'
        ? { id: 'center', rect: rectToJson(centerRect) }
        : nodeById[fromNodeId];
      const toNode = nodeById[toNodeId];
      const fromDistance = endpointDistance(path, fromNode, 'from');
      const toDistance = endpointDistance(path, toNode, 'to');
      const length = path.getTotalLength();
      return {
        id: path.getAttribute('data-mindmap-connector-path'),
        fromNodeId,
        toNodeId,
        depth: Number(path.getAttribute('data-depth') || '0'),
        direction: path.getAttribute('data-direction'),
        fromDistance,
        toDistance,
        length,
      };
    });
    const nodeOverlaps = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i].rect;
        const b = nodes[j].rect;
        if (!a || !b) continue;
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = width * height;
        if (area > 0) nodeOverlaps.push({ a: nodes[i].title, b: nodes[j].title, area });
      }
    }
    return {
      surface: rectToJson(surfaceRect),
      center: rectToJson(centerRect),
      nodes,
      paths,
      nodeOverlaps,
    };
  });

  const waitForConnectorCoverage = async (label) => {
    await page.waitForFunction(() => {
      const nodeCount = document.querySelectorAll('[data-mindmap-node]').length;
      const pathCount = document.querySelectorAll('[data-mindmap-connector-path]').length;
      return nodeCount > 0 && pathCount >= nodeCount;
    }, null, { timeout: 10000 }).catch(async () => {
      const counts = await page.evaluate(() => ({
        nodeCount: document.querySelectorAll('[data-mindmap-node]').length,
        pathCount: document.querySelectorAll('[data-mindmap-connector-path]').length,
      }));
      throw new Error(`${label} connector coverage did not stabilize: ${JSON.stringify(counts)}`);
    });
  };

  const assertGeometry = (geometry, label) => {
    assert(geometry.nodes.length >= 8, `${label} should use a complex mind map fixture`, { nodeCount: geometry.nodes.length });
    assert(geometry.paths.length >= geometry.nodes.length, `${label} should render center/root and parent/child connector paths`, {
      nodeCount: geometry.nodes.length,
      pathCount: geometry.paths.length,
    });
    const badEndpoints = geometry.paths.filter(path => path.fromDistance > 6 || path.toDistance > 6);
    assert(badEndpoints.length === 0, `${label} should anchor connector endpoints within 6px of node edges`, { badEndpoints });
    const shortPaths = geometry.paths.filter(path => path.length <= 12);
    assert(shortPaths.length === 0, `${label} should not include orphan-length connector stubs`, { shortPaths });
    assert(geometry.nodeOverlaps.length === 0, `${label} should not have overlapping mind map nodes`, { overlaps: geometry.nodeOverlaps });
    const missingMetadata = geometry.paths.filter(path => !path.fromNodeId || !path.toNodeId || !path.direction || !path.depth);
    assert(missingMetadata.length === 0, `${label} connector paths should expose metadata`, { missingMetadata });
  };

  const evidence = {};

  await openApp({ width: 1440, height: 900 });
  await assertNoVisibleErrors('DEV-027A desktop connector verifier');
  await waitForConnectorCoverage('desktop');
  evidence.desktop = await collectGeometry();
  assertGeometry(evidence.desktop, 'desktop');
  await page.screenshot({ path: 'output/playwright/dev-027A-connector-desktop.png', fullPage: true });

  await openApp({ width: 1024, height: 768 });
  await assertNoVisibleErrors('DEV-027A laptop connector verifier');
  await waitForConnectorCoverage('laptop');
  evidence.laptop = await collectGeometry();
  assertGeometry(evidence.laptop, 'laptop');
  await page.screenshot({ path: 'output/playwright/dev-027A-connector-laptop.png', fullPage: true });

  await openApp({ width: 390, height: 844 });
  const sidebarBox = await page.locator('aside').first().boundingBox().catch(() => null);
  if (sidebarBox && sidebarBox.width > 120) {
    await page.locator('nav button').first().click();
    await page.waitForTimeout(250);
  }
  await waitForConnectorCoverage('mobile');
  await assertNoVisibleErrors('DEV-027A mobile connector verifier');
  evidence.mobile = await collectGeometry();
  assertGeometry(evidence.mobile, 'mobile');
  await page.screenshot({ path: 'output/playwright/dev-027A-connector-mobile.png', fullPage: true });

  return {
    passed: true,
    geometry: evidence,
    nodeCounts: {
      desktop: evidence.desktop.nodes.length,
      laptop: evidence.laptop.nodes.length,
      mobile: evidence.mobile.nodes.length,
    },
    pathCounts: {
      desktop: evidence.desktop.paths.length,
      laptop: evidence.laptop.paths.length,
      mobile: evidence.mobile.paths.length,
    },
    evidence: [
      'output/playwright/dev-027A-connector-desktop.png',
      'output/playwright/dev-027A-connector-laptop.png',
      'output/playwright/dev-027A-connector-mobile.png',
    ],
  };
}
