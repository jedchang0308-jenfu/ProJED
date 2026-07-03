export const MINDMAP_NODE_ATTRIBUTE = 'data-mindmap-node';
export const MINDMAP_NODE_DIRECTION_ATTRIBUTE = 'data-mindmap-node-direction';
export const MINDMAP_NODE_LEVEL_ATTRIBUTE = 'data-mindmap-node-level';
export const MINDMAP_PARENT_ATTRIBUTE = 'data-mindmap-parent-id';

export const MINDMAP_NODE_SELECTOR = `[${MINDMAP_NODE_ATTRIBUTE}]`;
export const MINDMAP_CENTER_SELECTOR = '[data-mindmap-center]';
export const MINDMAP_CONTENT_BOUNDS_SELECTOR = `${MINDMAP_NODE_SELECTOR}, ${MINDMAP_CENTER_SELECTOR}`;

export const getMindMapNodeSelector = (nodeId: string) =>
  `[${MINDMAP_NODE_ATTRIBUTE}="${nodeId}"]`;

export const getMindMapNodeElement = (root: ParentNode | null | undefined, nodeId: string) =>
  root?.querySelector<HTMLElement>(getMindMapNodeSelector(nodeId)) ?? null;

export const getMindMapCenterElement = (root: ParentNode | null | undefined) =>
  root?.querySelector<HTMLElement>(MINDMAP_CENTER_SELECTOR) ?? null;

export const getMindMapNodeId = (element: HTMLElement) =>
  element.getAttribute(MINDMAP_NODE_ATTRIBUTE);

const MINDMAP_RELATIONSHIP_INTERACTION_SELECTOR = [
  '[data-mindmap-note-relationship-click-target]',
  '[data-mindmap-note-relationship-line-click-target]',
  '[data-mindmap-note-relationship-curve-click-target]',
  '[data-mindmap-note-relationship-endpoint]',
  '[data-mindmap-note-relationship-control-point]',
  '[data-mindmap-note-relationship-style-panel]',
].join(',');

export const isMindMapRelationshipInteractionElement = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest(MINDMAP_RELATIONSHIP_INTERACTION_SELECTOR));
