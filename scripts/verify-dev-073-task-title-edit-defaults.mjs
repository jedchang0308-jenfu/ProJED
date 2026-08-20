import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const profiles = read('src/interactions/task/profiles.ts');
const mindMapView = read('src/components/MindMap/MindMapView.tsx');
const mindMapNode = read('src/components/MindMap/MindMapNode.tsx');
const mindMapKeyboard = read('src/components/MindMap/mindMapKeyboard.ts');
const mindMapGeometry = read('src/components/MindMap/mindMapGeometry.ts');

assert.ok(profiles.includes("'task.post-create': 'task.open-details-for-naming'"), 'non-mindmap modes must retain the shared details naming action');
assert.equal((mindMapView.match(/openDetailsForNaming/g) || []).length, 0, 'mindmap post-create paths must not expose a naming exception');
assert.ok(mindMapView.includes('createTask(plan.parentId, plan.order, DEFAULT_MINDMAP_TASK_TITLE)'), 'mindmap keyboard creation must use the mindmap post-create adapter');
assert.ok(mindMapView.includes('setInlineTitleEditNodeId(node.id)'), 'mindmap post-create must request inline title edit');
assert.ok(mindMapNode.includes('data-mindmap-inline-title-input="true"'), 'mindmap post-create must expose an inline title input');
assert.ok(mindMapNode.includes('data-mindmap-quick-title-input="true"'), 'mindmap post-create must expose XMind-like quick naming');
assert.ok(mindMapNode.includes('data-mindmap-quick-title-layout-anchor="true"') && mindMapNode.includes('absolute inset-0') && mindMapNode.includes('h-full w-full'), 'mindmap quick-title must overlay the original title slot without changing node dimensions');
assert.ok(mindMapNode.includes('data-mindmap-toggle-parent-id={node.id}'), 'mindmap collapse control must identify the parent task outside the node bar');
assert.ok(mindMapNode.includes('data-mindmap-toggle-hover-target={node.id}') && mindMapNode.includes('data-mindmap-toggle-hover-hitbox'), 'mindmap collapse control must expose a relationship-line hover target');
assert.ok(mindMapNode.includes('isExpanded ? <Minus') && mindMapNode.includes(': <Plus'), 'mindmap collapse control must use XMind-style minus/plus states');
assert.ok(mindMapNode.includes('left: \'calc(0px - var(--mindmap-node-gap))\'') && mindMapNode.includes('left: \'100%\''), 'mindmap collapse control must be positioned in the relationship gap');
assert.ok(mindMapNode.includes('opacity-0') && mindMapNode.includes('group-hover:opacity-100') && mindMapNode.includes('group-focus-within:opacity-100'), 'mindmap collapse control must be hidden by default and revealed by relationship hover or keyboard focus');
assert.ok(mindMapNode.includes('onTitleEditCommit'), 'mindmap inline title edit must use the host commit adapter');
assert.ok(mindMapNode.includes('autoFocusTitleInput?: boolean;') && mindMapNode.includes('if (!autoFocusTitleInput) return;'), 'mindmap pointer quick naming must stay armed without moving focus into the native input');
assert.ok(mindMapNode.includes('onTitleEditDelete?: (nodeId: string) => void;') && mindMapNode.includes('onTitleEditDelete?.(node.id)'), 'quick naming Delete must use a node-scoped task delete adapter before native text editing');
assert.ok(mindMapNode.includes('event.key === \'Delete\' || event.key === \'Backspace\'') && mindMapNode.includes('setTitleDraft(event.key)'), 'XMind quick naming must route task deletion and first-character replacement from the focused node');
assert.ok(mindMapNode.includes("event.key === 'Enter'") && mindMapNode.includes('commitTitleEdit();'), 'quick naming Enter must commit without creating a task');
assert.ok(mindMapNode.includes("continueTitleEdit('child')"), 'quick naming Tab must continue with a child');
assert.ok(mindMapNode.includes('event.nativeEvent.isComposing'), 'quick naming must not consume IME composition Enter');
assert.ok(mindMapKeyboard.includes('isMindMapQuickTitleEditingTarget'), 'mindmap keyboard routing must identify the quick naming input');
assert.ok(mindMapKeyboard.includes('isMindMapForwardDeleteKey'), 'mindmap keyboard routing must distinguish task Delete from text Backspace');
assert.ok(mindMapKeyboard.includes('state.isQuickTitleEditing'), 'quick naming Delete must be handled as a task command');
assert.ok(mindMapView.includes('isQuickTitleEditing: isMindMapQuickTitleEditingTarget(event.target)'), 'mindmap host must pass quick naming context to keyboard routing');
assert.ok(mindMapView.includes('continueInlineTitleEdit'), 'mindmap host must commit the current title before continuing creation');
assert.ok(mindMapView.includes("intent === 'child'"), 'mindmap host must route quick naming continuation intent');
assert.ok(mindMapNode.includes("interactionBinding.dispatch('pointer.primary')"), 'mindmap single click must use the shared selection action');
assert.ok(mindMapNode.includes("'task.select': () => isCoarsePointer ? onSelect(node.id) : onPointerPrimary(node.id)"), 'fine-pointer selection must delegate the mindmap quick-title difference to the host');
assert.ok(mindMapView.includes('handleNodePointerPrimary'), 'mindmap host must own pointer-primary quick naming');
assert.ok(mindMapView.includes('MINDMAP_POINTER_QUICK_TITLE_DELAY_MS'), 'mindmap pointer quick naming must preserve the double-click window');
assert.ok(mindMapView.includes('setInlineTitleEditNodeId(nodeId)'), 'mindmap fine-pointer primary must enter quick naming');
assert.ok(mindMapView.includes('onTitleEditDelete={archiveNode}') && mindMapView.includes('async (nodeId?: string)'), 'mindmap host must route quick naming Delete to the selected node, not only current focus state');
assert.ok(mindMapView.includes('inlineTitleEditFocusNodeId') && mindMapView.includes('autoFocusTitleInput={inlineTitleEditFocusNodeId === node.id}'), 'mindmap host must separate quick naming readiness from native input focus');
assert.ok(mindMapNode.includes("interactionBinding.dispatch('pointer.double')"), 'mindmap double click must remain an explicit details entry');
assert.ok(mindMapView.includes('onToggleExpanded={toggleNodeExpansion}'), 'mindmap host must retain the shared expansion command');
assert.ok(mindMapGeometry.includes('const trunkX = (fromX + toX) / 2;'), 'mindmap bracket connector trunk must align with the relationship toggle midpoint');

for (const file of [
  'src/components/BoardView.tsx',
  'src/components/Wbs/WbsListView.tsx',
  'src/components/GlobalContextMenu.tsx',
  'src/components/SharedTaskSidebar.tsx',
  'src/components/TaskWorkbenchPanel.tsx',
  'src/components/Wbs/taskDrag/taskDragCommit.ts',
]) {
  assert.ok(read(file).includes('prepareNewTaskNaming'), `${file} must retain the shared post-create naming entry`);
}

console.log(JSON.stringify({
  status: 'PASS',
  postCreate: 'mindmap -> XMind-like quick naming; other modules -> details title edit',
  mindmapPointerPrimary: 'fine pointer -> select + quick naming; coarse pointer -> select-only',
  mindmapDoubleClick: 'open task details',
  mindmapKeyboardCreate: 'direct typing; Enter commits without creating; Tab child without exit',
}, null, 2));
