interface MindMapKeyboardEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

type MindMapKeyboardAction =
  | { type: 'toggle-relationship-tool' }
  | { type: 'deactivate-relationship-mode' }
  | { type: 'remove-selected-relationship' }
  | { type: 'edit-selected-relationship-label' }
  | { type: 'select-vertical'; direction: 'up' | 'down' }
  | { type: 'select-parent' }
  | { type: 'select-first-child' }
  | { type: 'create-sibling' }
  | { type: 'create-child' }
  | { type: 'rename-selected'; initialTitle?: string }
  | { type: 'archive-selected-node' };

interface MindMapKeyboardState {
  isEditingText: boolean;
  isEditingNode: boolean;
  hasSelectedNode: boolean;
  hasSelectedRelationship: boolean;
  hasRelationshipMode: boolean;
}

export const isMindMapTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
};

export const isMindMapDeleteKey = (event: MindMapKeyboardEventLike) =>
  event.key === 'Delete' || event.key === 'Backspace';

export const isMindMapSpaceKey = (event: MindMapKeyboardEventLike) =>
  event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space';

export const isMindMapRelationshipLabelEditKey = (event: MindMapKeyboardEventLike) =>
  isMindMapSpaceKey(event) || event.key === 'Enter' || event.key === 'F2';

export const isMindMapRelationshipToolToggleKey = (event: MindMapKeyboardEventLike) =>
  Boolean((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r');

export const hasMindMapShortcutModifier = (event: MindMapKeyboardEventLike) =>
  Boolean(event.ctrlKey || event.metaKey || event.altKey);

export const isMindMapPlainTextEditKey = (event: MindMapKeyboardEventLike) =>
  event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;

export const getMindMapKeyboardAction = (
  event: MindMapKeyboardEventLike,
  state: MindMapKeyboardState,
): MindMapKeyboardAction | null => {
  if (state.isEditingText || state.isEditingNode) return null;
  if (isMindMapRelationshipToolToggleKey(event)) return { type: 'toggle-relationship-tool' };
  if (hasMindMapShortcutModifier(event)) return null;

  if (event.key === 'Escape') {
    return state.hasRelationshipMode ? { type: 'deactivate-relationship-mode' } : null;
  }
  if (isMindMapDeleteKey(event) && state.hasSelectedRelationship) return { type: 'remove-selected-relationship' };
  if (isMindMapSpaceKey(event) && state.hasSelectedRelationship) return { type: 'edit-selected-relationship-label' };
  if (event.key === 'ArrowUp' && state.hasSelectedNode) return { type: 'select-vertical', direction: 'up' };
  if (event.key === 'ArrowDown' && state.hasSelectedNode) return { type: 'select-vertical', direction: 'down' };
  if (event.key === 'ArrowLeft' && state.hasSelectedNode) return { type: 'select-parent' };
  if (event.key === 'ArrowRight' && state.hasSelectedNode) return { type: 'select-first-child' };
  if (event.key === 'Enter') return { type: 'create-sibling' };
  if (event.key === 'Tab') return { type: 'create-child' };
  if (event.key === 'F2' && state.hasSelectedNode) return { type: 'rename-selected' };
  if (isMindMapDeleteKey(event) && state.hasSelectedNode) return { type: 'archive-selected-node' };
  if (isMindMapPlainTextEditKey(event) && state.hasSelectedNode) return { type: 'rename-selected', initialTitle: event.key };
  return null;
};
