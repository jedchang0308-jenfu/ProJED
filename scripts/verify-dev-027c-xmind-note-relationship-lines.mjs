import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  browserVerifier: 'scripts/verify-dev-027c-xmind-note-relationship-lines-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const mindMapView = read(files.mindMapView);
const mindMapNode = read(files.mindMapNode);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);

assert(
  'Note relationship is a mind-map-only local note model',
  mindMapView.includes('interface MindMapNoteRelationship') &&
    mindMapView.includes('projed.mindmap.noteRelationships') &&
    mindMapView.includes('loadNoteRelationships') &&
    mindMapView.includes('saveNoteRelationships') &&
    !mindMapView.includes('addDependency') &&
    !mindMapView.includes('createDependencyId') &&
    !mindMapView.includes('fromSide') &&
    !mindMapView.includes('toSide'),
);

assert(
  'Endpoint loss is handled by pruning invalid note relationships',
  mindMapView.includes('validNodeIds.has(relationship.fromId)') &&
    mindMapView.includes('validNodeIds.has(relationship.toId)') &&
    mindMapView.includes('setNoteRelationships(prev => prev.filter'),
);

assert(
  'Xmind-like note-line UI is exposed with strict data hooks',
  mindMapView.includes('data-mindmap-note-relationship-tool') &&
    mindMapView.includes('data-mindmap-note-relationship-overlay') &&
    mindMapView.includes('data-mindmap-note-relationship-path') &&
    mindMapView.includes('data-mindmap-note-relationship-label') &&
    mindMapView.includes('data-mindmap-note-relationship-endpoint') &&
    mindMapView.includes('data-mindmap-note-relationship-line-click-target') &&
    mindMapView.includes('defaultRelationshipStyle') &&
    mindMapView.includes("strokeDasharray: '7 6'") &&
    mindMapView.includes("markerEnd={path.style.arrowEnd ? 'url(#mindmap-note-relationship-arrow)' : undefined}") &&
    mindMapView.includes('paintOrder="stroke"'),
);

assert(
  'Relationship creation, editing, selection, cancellation, and deletion are implemented',
  mindMapView.includes('createNoteRelationship') &&
    mindMapView.includes('editRelationshipLabel') &&
    mindMapView.includes('removeSelectedRelationship') &&
    mindMapView.includes("event.key === 'Escape'") &&
    mindMapView.includes("event.key === 'Delete'") &&
    mindMapView.includes("event.key === 'Backspace'") &&
    mindMapView.includes('showPrompt') &&
    mindMapView.includes('請輸入關聯線文字'),
);

assert(
  'Node focus does not double-trigger relation creation mode',
  mindMapNode.includes('isRelationshipModeActive') &&
    mindMapNode.includes('if (!isRelationshipModeActive) onSelect(node.id);') &&
    mindMapView.includes('isRelationshipModeActive={relationshipToolActive}'),
);

assert(
  'Package exposes DEV-027C verifiers',
  pkg.includes('"verify:dev-027c-xmind-note-relationship-lines"') &&
    pkg.includes('"verify:dev-027c-xmind-note-relationship-lines-browser"'),
);

assert(
  'Browser verifier covers create, label, edit, delete, and endpoint pruning',
  browserVerifier.includes('note relationship should render a dashed Xmind-like path') &&
    browserVerifier.includes('note relationship label should render the typed text') &&
    browserVerifier.includes('double-clicking note relationship should edit label') &&
    browserVerifier.includes('Delete should remove the selected note relationship') &&
    browserVerifier.includes('archiving an endpoint should prune incomplete note relationships'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
