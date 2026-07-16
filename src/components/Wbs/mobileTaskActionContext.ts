import React from 'react';
import type { TaskStatus } from '../../types';

export type MobileTaskAction = 'toggle-complete' | 'add-sibling' | 'add-child' | 'delete';
export type MobileTaskDropPosition = 'before' | 'after' | 'append';
export type MobileTaskDropTargetKind = 'task-anchor' | 'parent-group' | 'child-empty-lane';

export type MobileTaskActionState = {
  nodeId: string;
  title: string;
  status: TaskStatus;
  pointerX: number;
  pointerY: number;
  hoverAction: MobileTaskAction | null;
  hoverTargetId: string | null;
  hoverParentId: string | null;
  hoverTargetKind: MobileTaskDropTargetKind | null;
  dropPosition: MobileTaskDropPosition | null;
  dropIndicatorRect: { left: number; top: number; width: number } | null;
};

export type MobileTaskActionContextValue = {
  state: MobileTaskActionState | null;
  begin: (
    task: { id: string; title?: string; status?: TaskStatus },
    event: React.TouchEvent,
  ) => boolean;
  move: (event: React.TouchEvent) => void;
  end: (event: React.TouchEvent) => void;
  cancel: (event?: React.TouchEvent) => void;
  isActive: (nodeId?: string) => boolean;
};

export const MobileTaskActionContext = React.createContext<MobileTaskActionContextValue | null>(null);

export const isMobileTaskActionMode = () => {
  if (typeof window === 'undefined') return false;
  const isNarrowViewport = window.innerWidth <= 768;
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const hasTouchPoints = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  return isNarrowViewport && (hasCoarsePointer || hasTouchPoints);
};
