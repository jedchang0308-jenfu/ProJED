/**
 * KanbanChecklist — Board adapter for the shared L3+ task checklist tree.
 * Board-only dependency and record-capture state stays at the host boundary;
 * row content, placement projection and interaction binding live in the shared tree.
 */
import React from 'react';
import useRecordStore from '../../store/useRecordStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import type { TaskNode } from '../../types';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { TaskChecklistTree } from './TaskChecklistTree';

interface KanbanChecklistProps {
  parentId: string;
  depth?: number;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  ancestorIds?: string[];
  ancestorPlacementIds?: string[];
  parentPlacementId?: string;
  trackingReference?: TaskTrackingReference;
  filterProjection?: TaskFilterResultProjection | null;
}

export const KanbanChecklist: React.FC<KanbanChecklistProps> = (props) => {
  const dependencyContext = React.useContext(KanbanDependencyContext);
  const dependencySelection = dependencyContext?.dependencySelection || null;
  const isRecordCaptureMode = useRecordStore(state => state.isTaskSelectionMode);
  const recordDraft = useRecordStore(state => state.draft);
  const insertRecordTaskMention = useRecordStore(state => state.insertTaskMentionAtCursor);
  const showTags = useBoardStore(state => state.showTags);
  const selectedTaskId = useBoardStore(state => state.selectedTaskId);

  const hostAdapter = React.useMemo(() => ({
    surfaceId: 'board.checklist-row' as const,
    interactionMode: dependencySelection
      ? 'dependency-selection' as const
      : isRecordCaptureMode
        ? 'record-capture' as const
        : 'default' as const,
    dependencySelection,
    onDependencySelect: (taskId: string, side: 'start' | 'end', title: string) => {
      dependencyContext?.handleKanbanDependencySelect(taskId, side, title);
    },
    isRecordSelected: (taskId: string) => Boolean(recordDraft?.taskLinks.some(link => link.nodeId === taskId)),
    onRecordCapture: (taskId: string, title: string) => insertRecordTaskMention(taskId, title),
    showTags,
    selectedTaskId,
  }), [dependencyContext, dependencySelection, insertRecordTaskMention, isRecordCaptureMode, recordDraft, selectedTaskId, showTags]);

  return <TaskChecklistTree {...props} hostAdapter={hostAdapter} />;
};

export default KanbanChecklist;
