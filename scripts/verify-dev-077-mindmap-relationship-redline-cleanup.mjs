import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const overlay = read('src/components/MindMap/MindMapRelationshipOverlay.tsx');
const interaction = read('src/components/MindMap/MindMapRelationshipInteractionLayer.tsx');
const view = read('src/components/MindMap/MindMapView.tsx');

const results = [
  {
    id: 'REL-077-001',
    label: 'relationship overlay keeps the selected endpoint circles',
    ok: overlay.includes('data-mindmap-note-relationship-svg-endpoint="from"') &&
      overlay.includes('data-mindmap-note-relationship-svg-endpoint="to"'),
  },
  {
    id: 'REL-077-002',
    label: 'relationship overlay removes the redlined control arms and guide',
    ok: !overlay.includes('data-mindmap-note-relationship-control-guide') &&
      !overlay.includes('data-mindmap-note-relationship-control-arm=') &&
      !overlay.includes('data-mindmap-note-relationship-svg-control-point='),
  },
  {
    id: 'REL-077-003',
    label: 'relationship interaction layer keeps endpoint drag affordances',
    ok: interaction.includes('data-mindmap-note-relationship-endpoint="from"') &&
      interaction.includes('data-mindmap-note-relationship-endpoint="to"'),
  },
  {
    id: 'REL-077-004',
    label: 'relationship interaction layer removes visible control-point and arm elements',
    ok: !interaction.includes('data-mindmap-note-relationship-control-point') &&
      !interaction.includes('data-mindmap-note-relationship-screen-control-point') &&
      !interaction.includes('data-mindmap-note-relationship-screen-control-arm') &&
      !interaction.includes('data-mindmap-note-relationship-control-arm-overlay'),
  },
  {
    id: 'REL-077-005',
    label: 'relationship path and label interaction remain available',
    ok: interaction.includes('data-mindmap-note-relationship-click-target') &&
      interaction.includes('data-mindmap-note-relationship-line-click-target') &&
      interaction.includes('data-mindmap-note-relationship-curve-click-target') &&
      interaction.includes('data-mindmap-note-relationship-label-input'),
  },
  {
    id: 'REL-077-006',
    label: 'view no longer passes the removed control-arm visual adapter',
    ok: !view.includes('getLocalLineSegmentStyle={getLocalLineSegmentStyle}') &&
      !view.includes('getLocalLineSegmentStyle,\n'),
  },
];

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
