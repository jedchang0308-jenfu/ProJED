import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEFT_MOUSE_PAN_THRESHOLD_PX,
  createLeftMousePanState,
  getLeftMousePanUpdate,
} from '../src/components/MindMap/mindMapPan';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks: string[] = [];
const check = (label: string, callback: () => void) => {
  callback();
  checks.push(label);
};

check('left pan threshold is fixed at 6px', () => {
  assert.equal(LEFT_MOUSE_PAN_THRESHOLD_PX, 6);
});

check('movement below the threshold remains armed', () => {
  const pan = createLeftMousePanState(7, 100, 80, 400, 300);
  assert.deepEqual(getLeftMousePanUpdate(pan, 105.99, 80), {
    active: false,
    scrollLeft: 394.01,
    scrollTop: 300,
  });
});

check('either axis activates at the threshold', () => {
  const horizontal = createLeftMousePanState(7, 100, 80, 400, 300);
  const vertical = createLeftMousePanState(8, 100, 80, 400, 300);
  assert.equal(getLeftMousePanUpdate(horizontal, 94, 80).active, true);
  assert.equal(getLeftMousePanUpdate(vertical, 100, 86).active, true);
});

check('direct pan follows the pointer with exact two-axis scroll deltas', () => {
  const pan = createLeftMousePanState(9, 220, 160, 500, 420);
  assert.deepEqual(getLeftMousePanUpdate(pan, 100, 80), {
    active: true,
    scrollLeft: 620,
    scrollTop: 500,
  });
});

check('an active session stays active when the pointer returns inside the threshold', () => {
  const pan = createLeftMousePanState(10, 220, 160, 500, 420);
  pan.active = true;
  assert.equal(getLeftMousePanUpdate(pan, 221, 161).active, true);
});

const view = read('src/components/MindMap/MindMapView.tsx');
const shell = read('src/components/MindMap/MindMapCanvasShell.tsx');
const panSource = read('src/components/MindMap/mindMapPan.ts');
const css = read('src/index.css');
const packageJson = read('package.json');
const spec074 = read('ai-doc/specs/SPEC-074-mindmap-single-scene-coordinate-system.md');

check('canvas shell exposes left-pan state and pointer ownership markers', () => {
  assert.match(shell, /onPointerDown=\{onPointerDown\}/);
  assert.match(shell, /data-mindmap-left-pan="true"/);
  assert.match(shell, /data-mindmap-left-pan-state="idle"/);
  assert.match(shell, /data-mindmap-scroll-owner="true"/);
});

check('view restricts left pan to primary mouse and active blank-canvas ownership', () => {
  assert.match(view, /event\.button !== 0/);
  assert.match(view, /event\.pointerType !== 'mouse'/);
  assert.match(view, /isLeftMousePanBlockedTarget\(event\.target\)/);
  assert.match(view, /relationshipToolActive/);
  assert.match(view, /relationshipPointerDrag/);
  assert.match(view, /isMindMapNativeScrollbarPointer/);
});

check('active pan updates only viewport scroll and suppresses the resulting click', () => {
  assert.match(view, /surface\.scrollLeft = update\.scrollLeft/);
  assert.match(view, /surface\.scrollTop = update\.scrollTop/);
  assert.match(view, /surface\.addEventListener\('click', handleClickCapture, true\)/);
  assert.match(view, /if \(!suppressNextClick\) return/);
});

check('node, center, relationship and semantic controls are blocked targets', () => {
  for (const marker of [
    '[data-mindmap-node]',
    '[data-mindmap-center]',
    '[data-mindmap-toggle-hover-target]',
    '[data-mindmap-note-relationship-endpoint]',
    '[data-mindmap-note-relationship-control-point]',
    '[data-mindmap-note-relationship-style-panel]',
    '[contenteditable="true"]',
    '[role="button"]',
  ]) assert.ok(panSource.includes(marker), `missing blocked marker ${marker}`);
});

check('grab and grabbing feedback has explicit body cleanup ownership', () => {
  assert.match(css, /\[data-mindmap-left-pan="true"\]/);
  assert.match(css, /cursor: grab/);
  assert.match(css, /body\[data-mindmap-left-pan-active="true"\]/);
  assert.match(panSource, /document\.body\.removeAttribute\('data-mindmap-left-pan-active'\)/);
});

check('DEV-074 authority explicitly keeps left pan on viewport scroll without geometry dirty', () => {
  assert.match(spec074, /DEV-076 left-mouse canvas pan/);
  assert.match(spec074, /DEV-076 left pan 與 scroll 只改 viewport scroll/);
});

check('package scripts expose static and rendered DEV-076 gates', () => {
  assert.match(packageJson, /verify:dev-076-mindmap-left-mouse-pan/);
  assert.match(packageJson, /verify:dev-076-mindmap-left-mouse-pan-browser/);
});

console.log(`DEV-076 static/pure verification PASS (${checks.length}/${checks.length})`);
for (const label of checks) console.log(`PASS ${label}`);
