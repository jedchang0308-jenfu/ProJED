import type { MindMapDirection } from './MindMapNode';
import type { SideOverrides } from './mindMapTree';

export const getSideStorageKey = (boardId: string) => `projed.mindmap.rootSides.${boardId}`;

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

/** Command-boundary write with exact readback; throws before success can be announced. */
export const persistSideOverridesWithReadback = async (
  boardId: string,
  overrides: SideOverrides,
) => {
  if (!boardId || typeof window === 'undefined') throw new Error('無法存取心智圖側向設定。');
  const serialized = JSON.stringify(overrides);
  window.localStorage.setItem(getSideStorageKey(boardId), serialized);
  const readback = window.localStorage.getItem(getSideStorageKey(boardId));
  if (readback !== serialized) throw new Error('心智圖側向設定寫入後驗證失敗。');
};
