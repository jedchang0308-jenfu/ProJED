import type { MindMapDirection } from './MindMapNode';
import type { SideOverrides } from './mindMapTree';

const getSideStorageKey = (boardId: string) => `projed.mindmap.rootSides.${boardId}`;

export const loadSideOverrides = (boardId: string): SideOverrides => {
  if (!boardId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getSideStorageKey(boardId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SideOverrides;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, MindMapDirection] => entry[1] === 'left' || entry[1] === 'right'),
    );
  } catch {
    return {};
  }
};

export const saveSideOverrides = (boardId: string, overrides: SideOverrides) => {
  if (!boardId || typeof window === 'undefined') return;
  window.localStorage.setItem(getSideStorageKey(boardId), JSON.stringify(overrides));
};
