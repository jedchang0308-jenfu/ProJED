import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const overlay = read('src/components/MindMap/MindMapRelationshipOverlay.tsx');
const interaction = read('src/components/MindMap/MindMapRelationshipInteractionLayer.tsx');
const geometry = read('src/components/MindMap/mindMapGeometry.ts');
const commands = read('src/components/MindMap/mindMapRelationshipCommands.ts');
const view = read('src/components/MindMap/MindMapView.tsx');
const overlayPaths = read('src/components/MindMap/mindMapOverlayPaths.ts');
const spec = read('ai-doc/specs/SPEC-085-mindmap-relationship-direction-joysticks.md');
const qa = read('ai-doc/qa/QA-DEV-085-mindmap-relationship-direction-joysticks.md');

const results = [
  {
    id: 'REL-085-001',
    label: 'selected relationship renders exactly the two directional control arms without a center guide contract',
    ok: overlay.includes('data-mindmap-note-relationship-direction-arm="from"') &&
      overlay.includes('data-mindmap-note-relationship-direction-arm="to"') &&
      !overlay.includes('data-mindmap-note-relationship-control-guide'),
  },
  {
    id: 'REL-085-002',
    label: 'interaction layer exposes two accessible direction joystick handles',
    ok: interaction.includes('data-mindmap-note-relationship-direction-joystick="from"') &&
      interaction.includes('data-mindmap-note-relationship-direction-joystick="to"') &&
      interaction.includes('aria-label="調整關聯線起點方向"') &&
      interaction.includes('aria-label="調整關聯線終點方向"'),
  },
  {
    id: 'REL-085-003',
    label: 'joystick hit targets stay screen-sized and dispatch the existing two control handles',
    ok: interaction.includes("hitHeight(28)") &&
      interaction.includes("startRelationshipPointerDrag(event, path.id, 'control-1')") &&
      interaction.includes("startRelationshipPointerDrag(event, path.id, 'control-2')") &&
      interaction.includes("data-mindmap-note-relationship-coordinate-space=\"map-local\""),
  },
  {
    id: 'REL-085-004',
    label: 'pure command accepts a complete fallback pair so first drag preserves the opposite control point',
    ok: commands.includes('fallbackControlPoints?: readonly [MindMapRelationshipPoint, MindMapRelationshipPoint]') &&
      commands.includes('options?.fallbackControlPoints') &&
      commands.includes("handle === 'control-1' ? point : current[0]") &&
      commands.includes("handle === 'control-2' ? point : current[1]"),
  },
  {
    id: 'REL-085-005',
    label: 'view snapshots both rendered control points at pointer-down and passes them into the pure update command',
    ok: view.includes('fallbackControlPoints: readonly [MindMapRelationshipPoint, MindMapRelationshipPoint]') &&
      view.includes('const relationshipPath = relationshipPaths.find(path => path.id === relationshipId);') &&
      view.includes('fallbackControlPoints: [') &&
      view.includes('fallbackControlPoints: relationshipPointerDrag.fallbackControlPoints'),
  },
  {
    id: 'REL-085-006',
    label: 'primary pointer guard and drag rollback snapshot remain enforced',
    ok: view.includes('if (!isPrimaryPointerActivation(event)) return;') &&
      view.includes('initialRelationship: cloneMindMapRelationship(initialRelationship)') &&
      view.includes('const initialRelationship = relationshipPointerDrag.initialRelationship;'),
  },
  {
    id: 'REL-085-007',
    label: 'authoritative spec and QA cover XMind parity, zoom, persistence, noise, visible errors and pointer isolation',
    ok: spec.includes('https://xmind.com/user-guide/relationship-new') &&
      spec.includes('AC-085-010') &&
      spec.includes('Compatible correction') &&
      spec.includes('多畫的一條線') &&
      qa.includes('FMEA') &&
      qa.includes('Visible Error Hard Gate') &&
      qa.includes('middle／right') &&
      qa.includes('reload'),
  },
  {
    id: 'REL-085-008',
    label: 'relationship body exposes a 44px screen-stable curved hit window without changing the visible stroke',
    ok: interaction.includes('const RELATIONSHIP_LINE_HIT_WINDOW_PX = 44;') &&
      interaction.includes('hitHeight(RELATIONSHIP_LINE_HIT_WINDOW_PX)') &&
      interaction.includes('data-mindmap-note-relationship-hit-window-screen-px={RELATIONSHIP_LINE_HIT_WINDOW_PX}') &&
      interaction.includes('data-mindmap-note-relationship-hit-window-alignment="centerline"') &&
      interaction.includes('data-mindmap-note-relationship-curve-click-target') &&
      interaction.includes('const centerSegment = curveSegments[Math.floor(curveSegments.length / 2)]') &&
      !interaction.includes('z-[44] -translate-x-1/2 -translate-y-1/2') &&
      !interaction.includes('z-[42] -translate-x-1/2 -translate-y-1/2') &&
      !interaction.includes('selectRelationshipFromEvent') &&
      geometry.includes('const midpointT = (sampleTs[index] + sampleTs[index + 1]) / 2;') &&
      geometry.includes('const midpoint = getCubicPoint(p0, p1, p2, p3, midpointT);') &&
      geometry.includes('const tangent = getCubicTangent(p0, p1, p2, p3, midpointT);') &&
      spec.includes('44 CSS px') &&
      spec.includes('中心線必須與可見關聯線重合') &&
      qa.includes('QA-085-B09') &&
      qa.includes('18px'),
  },
  {
    id: 'REL-085-009',
    label: 'both relationship endpoints independently use their node branch outer edge while preserving vertical anchors',
    ok: geometry.includes("const fromX = fromDirection === 'right' ? fromRect.right : fromRect.left;") &&
      geometry.includes("const toX = toDirection === 'right' ? toRect.right : toRect.left;") &&
      geometry.includes("fromDirection === 'right' ? fromX + curveOffset : fromX - curveOffset") &&
      geometry.includes("toDirection === 'right' ? toX + curveOffset : toX - curveOffset") &&
      geometry.includes('fromRect.top + fromRect.height * clampRatio(fromAnchor.yRatio)') &&
      geometry.includes('toRect.top + toRect.height * clampRatio(toAnchor.yRatio)') &&
      overlayPaths.includes('getNodeSide(relationship.fromId)') &&
      overlayPaths.includes('getNodeSide(relationship.toId)') &&
      view.includes('getNodeSide(fromId)') &&
      spec.includes('AC-085-012') &&
      qa.includes('QA-085-B10'),
  },
];

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
