import {
  getAccountScopedStorageKey,
  readStorageJson,
  writeStorageJson,
} from '../../utils/accountScopedStorage';

export type KanbanViewSize = 'compact' | 'large';
export type KanbanPinchPhase = 'idle' | 'candidate' | 'committed' | 'wait-all-release';
export type KanbanViewAnchorKind = 'task' | 'column' | 'board-content';

export const KANBAN_LARGE_VIEW_ENABLED = true;
export const KANBAN_LARGE_SCALE = 2.5;
export const KANBAN_VIEW_SIZE_PREFS_KEY = 'projed-kanban-view-size:v1';
export const KANBAN_PINCH_OUT_RATIO = 1.15;
export const KANBAN_PINCH_IN_RATIO = 0.87;
export const KANBAN_PINCH_MIN_DISTANCE_DELTA_PX = 24;

export type KanbanViewSizeChangeOrigin =
  | { kind: 'pinch'; clientX: number; clientY: number; target: EventTarget | null }
  | { kind: 'toolbar' };

export interface KanbanViewAnchor {
  scopeKey: string | null;
  kind: KanbanViewAnchorKind;
  nodeId: string | null;
  columnId: string | null;
  normalizedX: number;
  normalizedY: number;
  clientX: number;
  clientY: number;
  boardContentX: number;
  columnContentY: number | null;
  boardScrollLeft: number;
  columnScrollTop: number;
}

export interface KanbanPinchDecisionInput {
  viewSize: KanbanViewSize;
  initialDistance: number;
  currentDistance: number;
  touchCount: number;
  alreadyCommitted: boolean;
}

export const normalizeKanbanViewSize = (value: unknown): KanbanViewSize =>
  value === 'large' ? 'large' : 'compact';

export const readKanbanViewSize = (accountId: string | null | undefined): KanbanViewSize => {
  const key = getAccountScopedStorageKey(KANBAN_VIEW_SIZE_PREFS_KEY, accountId);
  return normalizeKanbanViewSize(readStorageJson<unknown>(key));
};

export const writeKanbanViewSize = (
  accountId: string | null | undefined,
  value: KanbanViewSize,
): void => {
  const key = getAccountScopedStorageKey(KANBAN_VIEW_SIZE_PREFS_KEY, accountId);
  if (!key || !accountId) return;
  writeStorageJson(key, normalizeKanbanViewSize(value));
};

export const resolveKanbanPinchTarget = ({
  viewSize,
  initialDistance,
  currentDistance,
  touchCount,
  alreadyCommitted,
}: KanbanPinchDecisionInput): KanbanViewSize | null => {
  if (touchCount !== 2 || alreadyCommitted || !Number.isFinite(initialDistance)
    || !Number.isFinite(currentDistance) || initialDistance <= 0) return null;
  const ratio = currentDistance / initialDistance;
  const delta = currentDistance - initialDistance;
  if (viewSize === 'compact'
    && ratio >= KANBAN_PINCH_OUT_RATIO
    && delta >= KANBAN_PINCH_MIN_DISTANCE_DELTA_PX) return 'large';
  if (viewSize === 'large'
    && ratio <= KANBAN_PINCH_IN_RATIO
    && delta <= -KANBAN_PINCH_MIN_DISTANCE_DELTA_PX) return 'compact';
  return null;
};

export const getKanbanPinchDistance = (first: Touch, second: Touch): number =>
  Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
