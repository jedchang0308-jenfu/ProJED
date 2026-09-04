import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clampMindMapScroll,
  clientToWorld,
  deriveMindMapSceneLayout,
  getAnchoredMindMapScroll,
  worldToClient,
  type MindMapViewportSnapshot,
} from '../src/components/MindMap/mindMapCoordinateSystem';
import { getMindMapSceneTransformStyle } from '../src/components/MindMap/mindMapLayoutStyle';

const root = resolve('.');
const outputRoot = resolve(root, 'output/playwright/dev-074-single-scene');
const baselineRoot = resolve(outputRoot, 'baseline');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const sourcePaths = [
  'src/components/MindMap/MindMapView.tsx',
  'src/components/MindMap/MindMapCanvasShell.tsx',
  'src/components/MindMap/mindMapLayoutStyle.ts',
  'src/components/MindMap/mindMapDomGeometry.ts',
  'src/components/MindMap/mindMapViewport.ts',
  'src/components/MindMap/mindMapZoom.ts',
  'src/components/MindMap/mindMapOverlayPaths.ts',
  'src/components/MindMap/mindMapDrag.ts',
  'src/components/MindMap/MindMapRelationshipOverlay.tsx',
  'src/components/MindMap/MindMapRelationshipInteractionLayer.tsx',
  'src/components/MindMap/MindMapDragPreviewLayer.tsx',
  'src/components/MindMap/mindMapCoordinateSystem.ts',
  'scripts/run-playwright-code.ps1',
  'scripts/verify-dev-074-mindmap-single-scene.ts',
  'scripts/verify-dev-074-mindmap-single-scene-browser.pw.js',
];

const near = (actual: number, expected: number, epsilon = 0.000001) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
};

const captureBaseline = () => {
  if (existsSync(resolve(baselineRoot, 'git-head.txt'))) {
    throw new Error(`DEV-074 baseline already exists: ${baselineRoot}`);
  }
  mkdirSync(baselineRoot, { recursive: true });
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  writeFileSync(resolve(baselineRoot, 'git-head.txt'), git(['rev-parse', 'HEAD']), 'utf8');
  writeFileSync(resolve(baselineRoot, 'git-status.txt'), git(['status', '--short']), 'utf8');
  writeFileSync(
    resolve(baselineRoot, 'git-diff.patch'),
    git(['diff', '--', ...sourcePaths]),
    'utf8',
  );
  writeFileSync(resolve(baselineRoot, 'touched-paths.json'), JSON.stringify(sourcePaths, null, 2), 'utf8');
  console.log(JSON.stringify({ baseline: 'captured', root: baselineRoot, head: git(['rev-parse', 'HEAD']).trim() }, null, 2));
};

const runPureCoordinateCases = () => {
  const viewport: MindMapViewportSnapshot = {
    left: 100,
    top: 50,
    scrollLeft: 320,
    scrollTop: 180,
    clientWidth: 1440,
    clientHeight: 900,
  };
  const scene = { width: 4000, height: 2600 };
  const point = { x: 1234.25, y: 678.75 };

  for (const scale of [0.25, 0.5, 0.75, 1, 2, 4]) {
    const layout = deriveMindMapSceneLayout(scene, { width: viewport.clientWidth, height: viewport.clientHeight }, scale);
    assert.ok(Number.isFinite(layout.stageWidth) && Number.isFinite(layout.stageHeight));
    assert.ok(layout.stageWidth >= viewport.clientWidth);
    assert.ok(layout.stageHeight >= viewport.clientHeight);
    const client = worldToClient(point, layout, viewport);
    const roundTrip = clientToWorld(client, layout, viewport);
    near(roundTrip.x, point.x, 0.000001);
    near(roundTrip.y, point.y, 0.000001);

    const anchored = getAnchoredMindMapScroll(point, client, layout, viewport);
    const clamped = clampMindMapScroll(anchored, layout, viewport);
    assert.ok(Number.isFinite(clamped.left) && Number.isFinite(clamped.top));
    assert.ok(clamped.left >= 0 && clamped.top >= 0);
  }

  const lowZoom = deriveMindMapSceneLayout({ width: 4000, height: 2600 }, { width: 1440, height: 900 }, 0.25);
  near(lowZoom.translateX, (2880 - 1000) / 2);
  near(lowZoom.translateY, (1800 - 650) / 2);
  const highZoom = deriveMindMapSceneLayout({ width: 4000, height: 2600 }, { width: 1440, height: 900 }, 2);
  near(highZoom.translateX, 0);
  near(highZoom.translateY, 0);

  const sceneStyle = getMindMapSceneTransformStyle(highZoom);
  assert.equal(sceneStyle.position, 'absolute');
  assert.equal(sceneStyle.left, 0);
  assert.equal(sceneStyle.top, 0);
  assert.equal(sceneStyle.width, undefined);
  assert.equal(sceneStyle.height, undefined);
  assert.equal(sceneStyle.minWidth, undefined);
  assert.equal(sceneStyle.minHeight, undefined);
};

const runStaticAuthorityCases = () => {
  const kernel = read('src/components/MindMap/mindMapCoordinateSystem.ts');
  assert.match(kernel, /deriveMindMapSceneLayout/);
  assert.match(kernel, /worldToClient/);
  assert.match(kernel, /clientToWorld/);
  assert.match(kernel, /getAnchoredMindMapScroll/);
  assert.match(kernel, /clampMindMapScroll/);

  const packageJson = read('package.json');
  assert.match(packageJson, /verify:dev-074-mindmap-single-scene/);
  assert.match(packageJson, /verify:dev-074-mindmap-single-scene-browser/);

  const artifactPath = resolve(outputRoot, 'geometry-evidence.json');
  if (existsSync(artifactPath)) {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8').replace(/^\uFEFF/, '')) as any;
    assert.equal(artifact.verifier, 'DEV-074');
    assert.equal(artifact.passed, true);
    assert.equal(artifact.contract, 'single-scene-coordinate-system');
    assert.equal(artifact.fixtureId, 'dev-074-v1');
    assert.equal(artifact.baselineRef, 'baseline/git-head.txt');
    assert.equal(artifact.persistedGeometryEqual, true);
    assert.deepEqual(
      (artifact.viewportResults || []).map((item: any) => item.viewport?.width).sort((a: number, b: number) => a - b),
      [390, 1024, 1440],
    );
    assert.deepEqual(
      (artifact.viewports || []).map((item: any) => item.width).sort((a: number, b: number) => a - b),
      [390, 1024, 1440],
    );
    for (const viewport of artifact.viewports || []) {
      assert.deepEqual(
        (viewport.zoomCases || []).map((item: any) => item.scale),
        viewport.width <= 640 ? [] : [1, 0.25, 0.5, 0.75, 1, 2, 4, 1],
      );
      assert.deepEqual(viewport.consoleErrors || [], []);
      assert.deepEqual(viewport.pageErrors || [], []);
      assert.deepEqual(viewport.visibleErrors || [], []);
      for (const zoomCase of viewport.zoomCases || []) {
        assert.ok(zoomCase.maxHierarchyEndpointDriftPx <= 3);
        assert.ok(zoomCase.maxRelationshipEndpointDriftPx <= 3);
        assert.equal(zoomCase.recomputeDelta, 0);
        assert.equal(zoomCase.scrollReachable, true);
      }
    }
  }
};

if (process.argv.includes('--capture-baseline')) captureBaseline();
runPureCoordinateCases();
runStaticAuthorityCases();
console.log(JSON.stringify({ ok: true, verifier: 'DEV-074', cases: 'pure-coordinate + static-authority' }, null, 2));
