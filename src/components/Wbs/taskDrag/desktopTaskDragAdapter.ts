import type { CollisionDetection } from '@dnd-kit/core';
import type { TaskNode } from '../../../types';
import type { TaskDropDescriptor, PrimaryTaskMovePlan } from './taskDropIntent';

export type DesktopTaskDragSurfaceAdapter = {
  key: 'board' | 'goal';
  collisionDetection: CollisionDetection;
  captureSource: (input: {
    activeData: Record<string, unknown>;
    nodesRecord: Record<string, TaskNode>;
  }) => { kind: 'primary'; descriptor: TaskDropDescriptor; workspaceId: string; boardId: string } | { kind: 'board-special'; activeData: Record<string, unknown> } | null;
  measure: (input: {
    source: TaskDropDescriptor;
    pointer: { x: number; y: number } | null;
    nodesRecord: Record<string, TaskNode>;
    previous?: unknown;
  }) => { target: TaskDropDescriptor; plan?: PrimaryTaskMovePlan; indicatorRect?: unknown } | null;
};
