import React from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Archive, ArrowLeft, BookOpenText, CheckCircle2, LoaderCircle, Lock, MessageSquareText, MoreHorizontal, Send, Unlock, X } from 'lucide-react';
import { useWbsStore, type UpdateNodeDispatchResult } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import useRecordStore from '../store/useRecordStore';
import { TagPicker } from './Tags/TagPicker';
import TaskRecordTimeline from './Records/TaskRecordTimeline';
import type { TaskDetailNote, TaskNode, TaskStatus } from '../types';
import { useTaskPlacementPermissions } from '../hooks/useTaskPlacementPermissions';
import useBoardStore from '../store/useBoardStore';
import TaskAssignmentPicker from './TaskAssignmentPicker';
import { MANUAL_TASK_STATUSES, normalizeManualTaskStatus, TASK_STATUS_LABELS } from '../utils/taskStatus';
import { buildAncestorPath } from '../utils/taskHierarchy';
import { getTaskStatusFieldClass } from './ui/taskStatusStyles';
import TaskDetailNoteField from './TaskNotes/TaskDetailNoteField';
import { areTaskNoteRichContentsEqual } from '../utils/taskNoteRichContent';
import { toast } from '../store/useToastStore';
import { isPrimaryPointerActivation } from '../interactions/pointerActivation';
import TaskCollectionDialog from './TaskCollectionDialog';
import { nodeService, taskCollectionService } from '../services/dataBackend';
import useTaskCollectionStore from '../store/useTaskCollectionStore';
import {
  arePersistedValuesEqual,
  readbackToTerminalOutcome,
  settlePersistenceOperationOnce,
  type TaskPersistenceReadback,
  type TaskPersistenceTerminalOutcome,
} from '../utils/taskPersistenceConvergence';
import {
  clampTaskDetailsModalSize,
  getTaskDetailsModalDefaultSize,
  getTaskDetailsModalMaximumSize,
  getTaskDetailsModalMinimumSize,
  type TaskDetailsModalViewport,
} from './taskDetailsModalSizing';
import { TaskDetailsSubtaskSection } from './TaskDetailsSubtaskSection';
import { resolveTaskDetailsPersistenceDecision, TASK_DETAILS_NAVIGATE_EVENT } from './taskDetailsNavigation';

interface TaskDetailsModalProps {
  nodeId: string;
  /** Placement identity used to resolve target/source capabilities independently. */
  trackingReferenceId?: string;
  onClose: () => void;
  canGoBack?: boolean;
  onBack?: () => void;
  onNavigateToTask?: (taskId: string, trackingReferenceId?: string, placementId?: string) => void;
  onCreateChild?: (taskId: string) => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = MANUAL_TASK_STATUSES.map(value => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

const createNote = (index: number): TaskDetailNote => ({
  id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title: `備註 ${index}`,
  content: '',
});

const formatTaskDateForMobile = (value: string) => (
  value && dayjs(value).isValid() ? dayjs(value).format('YYYY/MM/DD') : ''
);

const SIZE_STORAGE_KEY = 'projed.taskDetailsModal.size.v4';

const getCurrentViewport = (): TaskDetailsModalViewport => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1120,
  height: typeof window !== 'undefined' ? window.innerHeight : 720,
});

const getDefaultModalSize = () => getTaskDetailsModalDefaultSize(getCurrentViewport());
const getMinimumModalSize = () => getTaskDetailsModalMinimumSize(getCurrentViewport());
const getMaximumModalSize = () => getTaskDetailsModalMaximumSize(getCurrentViewport());

const readSavedSize = () => {
  const defaultSize = getDefaultModalSize();

  if (typeof window === 'undefined') return defaultSize;

  try {
    const saved = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!saved) return defaultSize;

    const parsed = JSON.parse(saved);
    const savedWidth = Number(parsed.width);
    const savedHeight = Number(parsed.height);
    if (!Number.isFinite(savedWidth) || !Number.isFinite(savedHeight)) {
      return defaultSize;
    }

    return clampTaskDetailsModalSize(
      { width: savedWidth, height: savedHeight },
      getCurrentViewport(),
    );
  } catch {
    return defaultSize;
  }
};

const getDisplayedDetailNotes = (node: TaskNode | undefined): TaskDetailNote[] => (
  node?.detailNotes?.length
    ? node.detailNotes
    : [{ id: 'note_default', title: '備註', content: node?.description || '' }]
);

const areDetailNotesEqual = (left: TaskDetailNote[], right: TaskDetailNote[]) => (
  left.length === right.length
  && left.every((note, index) => (
    note.id === right[index]?.id
    && note.title === right[index]?.title
    && note.content === right[index]?.content
    && areTaskNoteRichContentsEqual(note.richContent, right[index]?.richContent)
  ))
);

const readbackTaskPersistence = async (
  sourceNode: TaskNode,
  requestUpdates: Partial<TaskNode>,
  persistedKeys: string[],
): Promise<TaskPersistenceReadback> => {
  if (!sourceNode.workspaceId || !sourceNode.boardId) return 'unavailable';

  try {
    const canonicalNodes = await nodeService.listByProject(sourceNode.workspaceId, sourceNode.boardId);
    const canonicalNode = canonicalNodes.find(item => item.id === sourceNode.id);
    if (!canonicalNode) return 'mismatch';

    return persistedKeys.every((key) => arePersistedValuesEqual(
      (canonicalNode as unknown as Record<string, unknown>)[key],
      (requestUpdates as Record<string, unknown>)[key],
    ))
      ? 'confirmed'
      : 'mismatch';
  } catch {
    return 'unavailable';
  }
};

const PINCH_CLOSE_MIN_DISTANCE_DELTA = 36;
const PINCH_CLOSE_MAX_DISTANCE_RATIO = 0.78;
const TASK_DETAILS_AUTOSAVE_DELAY_MS = 900;
const TASK_DETAILS_PERSISTENCE_DEADLINE_MS = 10_000;
const TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS = 5_000;

type TaskDetailsSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'unknown';

const getTouchDistance = (touches: React.TouchList) => {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return null;

  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

type TaskDetailsTransition =
  | { kind: 'close' }
  | { kind: 'back' }
  | { kind: 'navigate'; taskId: string; trackingReferenceId?: string; placementId?: string }
  | { kind: 'create-child'; parentId: string };

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  nodeId,
  trackingReferenceId,
  onClose,
  canGoBack = false,
  onBack,
  onNavigateToTask,
  onCreateChild,
}) => {
  const node = useWbsStore((state) => state.nodes[nodeId]);
  const nodes = useWbsStore((state) => state.nodes);
  const updateNode = useWbsStore((state) => state.updateNode);
  const dependencies = useWbsStore((state) => state.dependencies);
  const trackingReference = useWbsStore((state) => trackingReferenceId
    ? state.trackingReferences.find(reference => reference.id === trackingReferenceId && !reference.removedAt) || null
    : null);
  const getNodeLockStatus = useWbsStore((state) => state.getNodeLockStatus);
  const boardMembers = useMemberStore((state) => state.boardMembers);
  const membersLoading = useMemberStore((state) => state.loading);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const collectionTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const taskActionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const placementPermissions = useTaskPlacementPermissions(node, trackingReference);
  // The same details component is used for primary and tracking placements.
  // Canonical mutations are enabled only by source-board capabilities; target
  // placement membership contributes derived read/manage-reference access.
  const canEditTask = placementPermissions.canEditTask;
  const canAssignTask = placementPermissions.canAssignTask;
  const canCollectTask = placementPermissions.canCollectTask;
  const taskCollectionPending = useTaskCollectionStore(state => Boolean(node && state.pendingByTaskId[node.id]));
  const canPersistTask = canEditTask || canAssignTask;
  const pendingTitleEditNodeId = useBoardStore((state) => state.pendingTitleEditNodeId);
  const pendingTitleEditInitialValue = useBoardStore((state) => state.pendingTitleEditInitialValue);
  const setPendingTitleEditNodeId = useBoardStore((state) => state.setPendingTitleEditNodeId);
  const [size, setSize] = React.useState(readSavedSize);
  const [minimumModalSize, setMinimumModalSize] = React.useState(getMinimumModalSize);
  const [maximumModalSize, setMaximumModalSize] = React.useState(getMaximumModalSize);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [durationDraft, setDurationDraft] = React.useState<string | null>(null);
  const [titleValue, setTitleValue] = React.useState('');
  const [notes, setNotes] = React.useState<TaskDetailNote[]>([]);
  const [meetingDiscussion, setMeetingDiscussion] = React.useState('');
  const [isTaskKnowledgeOpen, setIsTaskKnowledgeOpen] = React.useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = React.useState(false);
  const [isTaskActionMenuOpen, setIsTaskActionMenuOpen] = React.useState(false);
  const isMeetingMode = useRecordStore((state) => state.isMeetingMode);
  const appendTaskDiscussionToMeetingDraft = useRecordStore((state) => state.appendTaskDiscussionToMeetingDraft);
  const skipNextNotesSave = React.useRef(true);
  const skipNextTitleBlurSave = React.useRef(false);
  const [saveState, setSaveState] = React.useState<TaskDetailsSaveState>('idle');
  const [isClosePending, setIsClosePending] = React.useState(false);
  const saveFeedbackTimerRef = React.useRef<number | null>(null);
  const titleAutosaveTimerRef = React.useRef<number | null>(null);
  const titleEditSequenceRef = React.useRef(0);
  const titleSaveAttemptRef = React.useRef<{ nodeId: string; value: string } | null>(null);
  const optimisticTitleRef = React.useRef<{ nodeId: string; value: string; version: number; settled: boolean } | null>(null);
  const pendingPersistCountRef = React.useRef(0);
  const pendingPersistOperationsRef = React.useRef(new Set<string>());
  const persistVersionRef = React.useRef(0);
  const latestPersistVersionByKeyRef = React.useRef<Record<string, number>>({});
  const failedUpdatesRef = React.useRef<Partial<TaskNode>>({});
  const failedUpdateVersionsRef = React.useRef<Record<string, number>>({});
  const unknownUpdatesRef = React.useRef<Partial<TaskNode>>({});
  const unknownUpdateVersionsRef = React.useRef<Record<string, number>>({});
  const persistenceOwnerNodeIdRef = React.useRef<string | undefined>(undefined);
  const pendingTransitionRef = React.useRef<TaskDetailsTransition | null>(null);
  const previousNodeIdRef = React.useRef<string | undefined>(undefined);
  const pinchCloseRef = React.useRef<{
    initialDistance: number;
    triggered: boolean;
  } | null>(null);
  const assigneeOptions = React.useMemo(
    () => boardMembers.map(member => ({
      id: member.userId,
      label: member.profile?.displayName || member.profile?.email || member.userId,
      role: member.role,
    })),
    [boardMembers]
  );
  const currentNodeId = node?.id;
  const currentNodeTitle = node?.title || '';
  const currentNodeStartDate = node?.startDate || '';
  const currentNodeEndDate = node?.endDate || '';
  const currentNodeDetailNotes = node?.detailNotes;
  const currentNodeDescription = node?.description || '';

  const clearSaveFeedbackTimer = React.useCallback(() => {
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
  }, []);

  const showSaveFeedback = React.useCallback(() => {
    clearSaveFeedbackTimer();
    setSaveState('saved');
  }, [clearSaveFeedbackTimer]);

  const markDraftDirty = React.useCallback(() => {
    clearSaveFeedbackTimer();
    if (pendingPersistCountRef.current === 0) setSaveState('idle');
  }, [clearSaveFeedbackTimer]);

  const runTransition = React.useCallback((transition: TaskDetailsTransition) => {
    setIsClosePending(false);
    if (transition.kind === 'close') {
      onClose();
    } else if (transition.kind === 'back') {
      onBack?.();
    } else if (transition.kind === 'create-child') {
      onCreateChild?.(transition.parentId);
    } else {
      onNavigateToTask?.(transition.taskId, transition.trackingReferenceId, transition.placementId);
    }
  }, [onBack, onClose, onCreateChild, onNavigateToTask]);

  const settlePersistence = React.useCallback((
    sourceNodeId: string,
    operationId: string,
    outcome: TaskPersistenceTerminalOutcome,
    requestUpdates: Partial<TaskNode>,
    requestVersion: number,
    persistedKeys: string[],
  ) => {
    if (persistenceOwnerNodeIdRef.current !== sourceNodeId) {
      pendingPersistOperationsRef.current.delete(operationId);
      return;
    }
    if (!settlePersistenceOperationOnce(pendingPersistOperationsRef.current, operationId)) return;
    pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1);
    if (
      optimisticTitleRef.current?.nodeId === sourceNodeId
      && optimisticTitleRef.current.version === requestVersion
    ) {
      optimisticTitleRef.current = { ...optimisticTitleRef.current, settled: true };
    }

    if (outcome === 'persisted') {
      persistedKeys.forEach((key) => {
        const failedVersion = failedUpdateVersionsRef.current[key];
        if (failedVersion !== undefined && failedVersion <= requestVersion) {
          delete failedUpdateVersionsRef.current[key];
          delete (failedUpdatesRef.current as Record<string, unknown>)[key];
        }
        const unknownVersion = unknownUpdateVersionsRef.current[key];
        if (unknownVersion !== undefined && unknownVersion <= requestVersion) {
          delete unknownUpdateVersionsRef.current[key];
          delete (unknownUpdatesRef.current as Record<string, unknown>)[key];
        }
      });
    } else {
      persistedKeys.forEach((key) => {
        if (latestPersistVersionByKeyRef.current[key] !== requestVersion) return;
        (failedUpdatesRef.current as Record<string, unknown>)[key] = (
          requestUpdates as Record<string, unknown>
        )[key];
        failedUpdateVersionsRef.current[key] = requestVersion;
        if (outcome === 'unknown') {
          (unknownUpdatesRef.current as Record<string, unknown>)[key] = (
            requestUpdates as Record<string, unknown>
          )[key];
          unknownUpdateVersionsRef.current[key] = requestVersion;
        } else {
          delete (unknownUpdatesRef.current as Record<string, unknown>)[key];
          delete unknownUpdateVersionsRef.current[key];
        }
      });
    }

    const hasFailedUpdates = Object.keys(failedUpdatesRef.current).length > 0;
    const persistenceDecision = resolveTaskDetailsPersistenceDecision({
      pendingCount: pendingPersistCountRef.current,
      hasFailedUpdates,
      hasPendingTransition: Boolean(pendingTransitionRef.current),
    });
    if (persistenceDecision === 'wait') return;

    if (persistenceDecision === 'stay') {
      clearSaveFeedbackTimer();
      setSaveState(Object.keys(unknownUpdatesRef.current).length > 0 ? 'unknown' : 'error');
      if (pendingTransitionRef.current) {
        pendingTransitionRef.current = null;
        setIsClosePending(false);
        toast.error(
          Object.keys(unknownUpdatesRef.current).length > 0 ? '儲存狀態未確認，請重試' : '儲存失敗，請重試',
          { duration: 1800 },
        );
      }
      return;
    }

    if (persistenceDecision === 'run' && pendingTransitionRef.current) {
      const transition = pendingTransitionRef.current;
      pendingTransitionRef.current = null;
      runTransition(transition);
      return;
    }

    showSaveFeedback();
  }, [clearSaveFeedbackTimer, runTransition, showSaveFeedback]);

  const recordRejectedPersistence = React.useCallback((
    requestUpdates: Partial<TaskNode>,
    persistedKeys: string[],
  ) => {
    const requestVersion = persistVersionRef.current + 1;
    persistVersionRef.current = requestVersion;
    persistedKeys.forEach((key) => {
      latestPersistVersionByKeyRef.current[key] = requestVersion;
      (failedUpdatesRef.current as Record<string, unknown>)[key] = (
        requestUpdates as Record<string, unknown>
      )[key];
      failedUpdateVersionsRef.current[key] = requestVersion;
    });
    clearSaveFeedbackTimer();
    setSaveState('error');
  }, [clearSaveFeedbackTimer]);

  const persistTaskUpdates = React.useCallback((
    updates: Partial<TaskNode>,
    options: { forcePersistence?: boolean; skipActivity?: boolean } = {},
  ) => {
    if (!currentNodeId || !node || !canPersistTask || Object.keys(updates).length === 0) return false;

    const requestUpdates: Partial<TaskNode> = {
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now(),
    };
    const persistedKeys = Object.keys(requestUpdates).filter((key) => key !== 'updatedAt');
    if (persistedKeys.length === 0) return false;

    const dispatchResult: UpdateNodeDispatchResult = updateNode(currentNodeId, requestUpdates, {
      forcePersistence: options.forcePersistence,
      skipActivity: options.skipActivity,
    });
    if (!dispatchResult.accepted) {
      if (dispatchResult.reason !== 'no_changes') {
        recordRejectedPersistence(requestUpdates, persistedKeys);
      }
      return false;
    }

    const requestVersion = persistVersionRef.current + 1;
    persistVersionRef.current = requestVersion;
    persistedKeys.forEach((key) => {
      latestPersistVersionByKeyRef.current[key] = requestVersion;
    });
    if (typeof requestUpdates.title === 'string') {
      optimisticTitleRef.current = {
        nodeId: currentNodeId,
        value: requestUpdates.title,
        version: requestVersion,
        settled: false,
      };
    }

    clearSaveFeedbackTimer();
    setSaveState('saving');
    pendingPersistOperationsRef.current.add(dispatchResult.operationId);
    pendingPersistCountRef.current += 1;

    let deadlineTimer: number | null = null;
    const finish = (outcome: TaskPersistenceTerminalOutcome) => {
      if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }
      settlePersistence(
        currentNodeId,
        dispatchResult.operationId,
        outcome,
        requestUpdates,
        requestVersion,
        persistedKeys,
      );
    };

    void dispatchResult.completion.then(
      (status) => finish(status === 'persisted' ? 'persisted' : 'failed'),
      () => finish('failed'),
    );

    deadlineTimer = window.setTimeout(() => {
      console.warn('[TaskDetails] Persistence deadline exceeded; running canonical readback', {
        operationId: dispatchResult.operationId,
        taskId: currentNodeId,
      });
      const readbackDeadline = new Promise<TaskPersistenceReadback>((resolve) => {
        window.setTimeout(() => resolve('unavailable'), TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS);
      });
      void Promise.race([
        readbackTaskPersistence(node, requestUpdates, persistedKeys),
        readbackDeadline,
      ]).then(
        (readback) => finish(readbackToTerminalOutcome(readback)),
        () => finish('unknown'),
      );
    }, TASK_DETAILS_PERSISTENCE_DEADLINE_MS);

    return true;
  }, [
    canPersistTask,
    clearSaveFeedbackTimer,
    currentNodeId,
    node,
    recordRejectedPersistence,
    settlePersistence,
    updateNode,
  ]);

  const savePendingTaskDetails = React.useCallback(() => {
    if (!node || !canEditTask) return false;

    const updates: Partial<TaskNode> = {};
    const trimmedTitle = titleValue.trim();
    if (!trimmedTitle) {
      setTitleValue(node.title || '');
    } else {
      if (trimmedTitle !== titleValue) setTitleValue(trimmedTitle);
      if (trimmedTitle !== node.title) updates.title = trimmedTitle;
    }

    const displayedNotes = getDisplayedDetailNotes(node);
    const nextDescription = notes[0]?.content || '';
    if (!areDetailNotesEqual(notes, displayedNotes) || nextDescription !== (node.description || '')) {
      updates.detailNotes = notes;
      updates.description = nextDescription;
    }

    if (Object.keys(updates).length > 0) {
      return persistTaskUpdates(updates);
    }
    return false;
  }, [canEditTask, node, notes, persistTaskUpdates, titleValue]);

  const retryFailedSave = React.useCallback(() => {
    if (pendingPersistCountRef.current > 0) return false;
    const failedUpdates = { ...failedUpdatesRef.current };
    if (Object.keys(failedUpdates).length === 0) return false;

    failedUpdatesRef.current = {};
    failedUpdateVersionsRef.current = {};
    unknownUpdatesRef.current = {};
    unknownUpdateVersionsRef.current = {};
    return persistTaskUpdates(failedUpdates, { forcePersistence: true, skipActivity: true });
  }, [persistTaskUpdates]);

  const handleSaveDetails = React.useCallback(() => {
    const didQueueDraft = savePendingTaskDetails();
    if (didQueueDraft || pendingPersistCountRef.current > 0) return;
    if (retryFailedSave()) return;
    showSaveFeedback();
  }, [retryFailedSave, savePendingTaskDetails, showSaveFeedback]);

  const requestTransition = React.useCallback((transition: TaskDetailsTransition) => {
    if (pendingTransitionRef.current || isClosePending) return;
    if (!canPersistTask) {
      runTransition(transition);
      return;
    }
    if (titleAutosaveTimerRef.current !== null) {
      window.clearTimeout(titleAutosaveTimerRef.current);
      titleAutosaveTimerRef.current = null;
    }

    pendingTransitionRef.current = transition;
    setIsClosePending(true);

    // A rejected write is an explicit recovery state.  Navigation must not
    // silently retry a failed draft; the user must press the visible Retry
    // control first, then request the transition again.
    if (Object.keys(failedUpdatesRef.current).length > 0) {
      pendingTransitionRef.current = null;
      setIsClosePending(false);
      const isUnknown = Object.keys(unknownUpdatesRef.current).length > 0;
      setSaveState(isUnknown ? 'unknown' : 'error');
      toast.error(isUnknown ? '儲存狀態未確認，請先重試' : '儲存失敗，請先重試', { duration: 1800 });
      return;
    }
    const didQueueDraft = savePendingTaskDetails();

    if (!didQueueDraft && pendingPersistCountRef.current === 0) {
      pendingTransitionRef.current = null;
      runTransition(transition);
    }
  }, [canPersistTask, isClosePending, runTransition, savePendingTaskDetails]);

  React.useEffect(() => {
    const handleDetailsNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; trackingReferenceId?: string; returnFocusPlacementId?: string }>).detail;
      if (!detail?.taskId) return;
      requestTransition({
        kind: 'navigate',
        taskId: detail.taskId,
        trackingReferenceId: detail.trackingReferenceId,
        placementId: detail.returnFocusPlacementId,
      });
    };
    document.addEventListener(TASK_DETAILS_NAVIGATE_EVENT, handleDetailsNavigate);
    return () => document.removeEventListener(TASK_DETAILS_NAVIGATE_EVENT, handleDetailsNavigate);
  }, [requestTransition]);

  const handleClose = React.useCallback(() => {
    requestTransition({ kind: 'close' });
  }, [requestTransition]);

  React.useEffect(() => {
    if (!isTaskActionMenuOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!taskActionMenuRef.current?.contains(event.target as Node)) setIsTaskActionMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside, true);
    return () => document.removeEventListener('pointerdown', closeFromOutside, true);
  }, [isTaskActionMenuOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('[data-task-details-title-input="true"]')) return;
      if (isTaskActionMenuOpen || (event.target instanceof Element && event.target.closest('[data-task-details-overflow-menu="true"], [data-task-details-overflow-trigger="true"]'))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setIsTaskActionMenuOpen(false);
        collectionTriggerRef.current?.focus();
        return;
      }
      const eventWithinCollectionDialog = event.target instanceof Element
        && Boolean(event.target.closest('[data-task-collection-dialog]'));
      // Let dnd-kit cancel an active keyboard drag before the modal owns Escape.
      // The sortable source exposes aria-pressed while the sensor is active;
      // keeping this event in the DnD layer prevents Escape from closing the
      // surrounding details surface.
      const hasActiveKeyboardTaskDrag = Boolean(document.querySelector(
        '[data-task-details-modal="true"] [data-task-surface-source="true"][aria-pressed="true"]',
      ));
      if (hasActiveKeyboardTaskDrag) return;
      const hasNestedOverlay = eventWithinCollectionDialog || Boolean(document.querySelector(
        '[data-tag-picker-panel], .global-dialog-content, [data-task-note-toolbar-popover="true"], [data-task-collection-dialog], [data-global-context-menu="true"]',
      ));
      if (hasNestedOverlay) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleClose, isTaskActionMenuOpen]);

  React.useEffect(() => () => {
    clearSaveFeedbackTimer();
    if (titleAutosaveTimerRef.current !== null) window.clearTimeout(titleAutosaveTimerRef.current);
  }, [clearSaveFeedbackTimer]);

  const handlePinchTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      pinchCloseRef.current = null;
      return;
    }

    const initialDistance = getTouchDistance(event.touches);
    pinchCloseRef.current = initialDistance === null
      ? null
      : { initialDistance, triggered: false };
  }, []);

  const handlePinchTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = pinchCloseRef.current;
    if (!gesture || gesture.triggered || event.touches.length !== 2) return;

    const currentDistance = getTouchDistance(event.touches);
    if (currentDistance === null) return;

    const distanceDelta = gesture.initialDistance - currentDistance;
    const distanceRatio = currentDistance / gesture.initialDistance;
    if (
      distanceDelta < PINCH_CLOSE_MIN_DISTANCE_DELTA
      || distanceRatio > PINCH_CLOSE_MAX_DISTANCE_RATIO
    ) return;

    gesture.triggered = true;
    handleClose();
  }, [handleClose]);

  const handlePinchTouchEnd = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchCloseRef.current = null;
  }, []);

  React.useEffect(() => {
    persistenceOwnerNodeIdRef.current = currentNodeId;
    if (previousNodeIdRef.current === currentNodeId) return;
    previousNodeIdRef.current = currentNodeId;
    pendingPersistOperationsRef.current.clear();
    pendingPersistCountRef.current = 0;
    optimisticTitleRef.current = null;
    failedUpdatesRef.current = {};
    failedUpdateVersionsRef.current = {};
    unknownUpdatesRef.current = {};
    unknownUpdateVersionsRef.current = {};
    pendingTransitionRef.current = null;
    setIsClosePending(false);
    setSaveState('idle');
    if (titleAutosaveTimerRef.current !== null) {
      window.clearTimeout(titleAutosaveTimerRef.current);
      titleAutosaveTimerRef.current = null;
    }
    titleEditSequenceRef.current += 1;
  }, [currentNodeId]);

  React.useEffect(() => {
    if (!currentNodeId) return;
    const optimisticTitle = optimisticTitleRef.current;
    if (optimisticTitle?.nodeId === currentNodeId) {
      if (!optimisticTitle.settled) {
        if (currentNodeTitle !== optimisticTitle.value) setTitleValue(optimisticTitle.value);
        return;
      }
      if (currentNodeTitle === optimisticTitle.value) {
        optimisticTitleRef.current = null;
      } else {
        setTitleValue((current) => {
          const isEditingTitle = document.activeElement === titleInputRef.current;
          const hasNewerLocalDraft = isEditingTitle
            && current.trim() !== currentNodeTitle
            && current.trim() !== optimisticTitle.value;
          return hasNewerLocalDraft ? current : optimisticTitle.value;
        });
        return;
      }
    }
    setTitleValue((current) => {
      const isEditingTitle = document.activeElement === titleInputRef.current;
      const hasLocalDraft = isEditingTitle && current.trim() !== currentNodeTitle;
      return hasLocalDraft ? current : currentNodeTitle;
    });
  }, [currentNodeId, currentNodeTitle]);

  React.useEffect(() => {
    if (!currentNodeId) return;
    setStartDate(currentNodeStartDate);
    setEndDate(currentNodeEndDate);
    setDurationDraft(null);
  }, [currentNodeEndDate, currentNodeId, currentNodeStartDate]);

  React.useEffect(() => {
    if (!currentNodeId) return;
    setNotes(
      currentNodeDetailNotes?.length
        ? currentNodeDetailNotes
        : [{ id: 'note_default', title: '備註', content: currentNodeDescription }]
    );
    skipNextNotesSave.current = true;
  }, [currentNodeDescription, currentNodeDetailNotes, currentNodeId]);

  React.useEffect(() => {
    setIsTaskKnowledgeOpen(false);
    setIsCollectionDialogOpen(false);
  }, [currentNodeId]);

  React.useEffect(() => {
    if (!node || !canEditTask) return;
    if (pendingTitleEditNodeId !== node.id) return;

    const initialValue = pendingTitleEditInitialValue;
    if (initialValue !== null) setTitleValue(initialValue);
    setPendingTitleEditNodeId(null);

    window.requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      if (initialValue !== null) {
        input.setSelectionRange(initialValue.length, initialValue.length);
        return;
      }
      input.select();
    });
  }, [
    canEditTask,
    node,
    pendingTitleEditInitialValue,
    pendingTitleEditNodeId,
    setPendingTitleEditNodeId,
  ]);

  React.useEffect(() => {
    const modal = modalRef.current;
    if (!modal || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      // 避免使用 entry.contentRect.width (content-box) 導致無限縮小迴圈
      // 改用 offsetWidth / offsetHeight 以取得包含 border 的正確大小
      const nextSize = {
        width: Math.round(modal.offsetWidth),
        height: Math.round(modal.offsetHeight),
      };
      setSize(nextSize);
      window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(nextSize));
    });

    observer.observe(modal);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const handleViewportResize = () => {
      const viewport = getCurrentViewport();
      const nextMinimum = getTaskDetailsModalMinimumSize(viewport);
      setMinimumModalSize(nextMinimum);
      setMaximumModalSize(getTaskDetailsModalMaximumSize(viewport));
      setSize((current) => clampTaskDetailsModalSize(current, viewport));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  React.useEffect(() => {
    if (!node) return;

    if (skipNextNotesSave.current) {
      skipNextNotesSave.current = false;
      return;
    }

    const displayedNotes = getDisplayedDetailNotes(node);
    const nextDescription = notes[0]?.content || '';
    if (areDetailNotesEqual(notes, displayedNotes) && nextDescription === (node.description || '')) return;

    const timer = window.setTimeout(() => {
      if (!canEditTask) return;
      persistTaskUpdates({
        detailNotes: notes,
        description: nextDescription,
      });
    }, TASK_DETAILS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [canEditTask, notes, node, persistTaskUpdates]);

  const ancestorPath = buildAncestorPath(node, nodes);

  if (!node) return null;

  const durationDays = (startDate && endDate && dayjs(startDate).isValid() && dayjs(endDate).isValid())
    ? dayjs(endDate).diff(dayjs(startDate), 'day')
    : '';
  const durationInputValue = durationDraft ?? (durationDays === '' ? '' : String(durationDays));

  const updateDate = (field: 'startDate' | 'endDate', value: string, preserveDurationDraft = false) => {
    if (!canEditTask) return;
    if (!preserveDurationDraft) setDurationDraft(null);
    const nextStart = field === 'startDate' ? value : startDate;
    const nextEnd = field === 'endDate' ? value : endDate;

    if (nextStart && nextEnd && nextStart > nextEnd) {
      window.alert('開始日期不能晚於結束日期。');
      return;
    }

    const updates = { [field]: value } as Partial<typeof node>;

    if (field === 'startDate') {
      setStartDate(value);
      if (node.isDurationLocked && durationDays !== '') {
        const newEndDate = dayjs(value).add(durationDays as number, 'day').format('YYYY-MM-DD');
        setEndDate(newEndDate);
        updates.endDate = newEndDate;
        
      }
    }
    
    if (field === 'endDate') {
      setEndDate(value);
    }
    persistTaskUpdates(updates);
  };

  const handleDateChange = (field: 'startDate' | 'endDate', event: React.ChangeEvent<HTMLInputElement>) => {
    // Chromium may emit a transient out-of-range value while navigating an
    // empty native date picker. Let the input constraints reject that value
    // without treating month navigation as a real date change.
    if (!event.currentTarget.validity.valid) {
      event.currentTarget.value = field === 'startDate' ? startDate : endDate;
      return;
    }
    updateDate(field, event.currentTarget.value);
  };

  const handleAssignmentChange = (primaryIds: string[], collaboratorIds: string[]) => {
    if (!canAssignTask) return;
    persistTaskUpdates({
      assigneeIds: primaryIds,
      collaboratorIds,
    });
  };

  const handleTitleChange = (value: string) => {
    if (!canEditTask) return;
    markDraftDirty();
    setTitleValue(value);
    if (titleAutosaveTimerRef.current !== null) window.clearTimeout(titleAutosaveTimerRef.current);
    const editSequence = titleEditSequenceRef.current + 1;
    titleEditSequenceRef.current = editSequence;

    const trimmed = value.trim();
    if (!trimmed || trimmed === node.title) {
      titleAutosaveTimerRef.current = null;
      return;
    }

    titleAutosaveTimerRef.current = window.setTimeout(() => {
      if (titleEditSequenceRef.current !== editSequence) return;
      titleAutosaveTimerRef.current = null;
      persistTaskUpdates({ title: trimmed });
      setTitleValue(trimmed);
    }, TASK_DETAILS_AUTOSAVE_DELAY_MS);
  };

  const saveTitle = () => {
    titleEditSequenceRef.current += 1;
    if (titleAutosaveTimerRef.current !== null) {
      window.clearTimeout(titleAutosaveTimerRef.current);
      titleAutosaveTimerRef.current = null;
    }
    if (skipNextTitleBlurSave.current) {
      skipNextTitleBlurSave.current = false;
      setTitleValue(node.title || '');
      return;
    }
    if (!canEditTask) {
      setTitleValue(node.title || '');
      return;
    }

    const trimmed = titleValue.trim();
    if (!trimmed) {
      setTitleValue(node.title || '');
      return;
    }
    if (currentNodeId && trimmed !== node.title) {
      const duplicateAttempt = titleSaveAttemptRef.current?.nodeId === currentNodeId
        && titleSaveAttemptRef.current.value === trimmed;
      if (!duplicateAttempt) {
        const attempt = { nodeId: currentNodeId, value: trimmed };
        titleSaveAttemptRef.current = attempt;
        void Promise.resolve().then(() => {
          if (titleSaveAttemptRef.current === attempt) titleSaveAttemptRef.current = null;
        });
        persistTaskUpdates({ title: trimmed });
      }
    }
    setTitleValue(trimmed);
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (titleAutosaveTimerRef.current !== null) {
        window.clearTimeout(titleAutosaveTimerRef.current);
        titleAutosaveTimerRef.current = null;
      }
      skipNextTitleBlurSave.current = true;
      setTitleValue(node.title || '');
      event.currentTarget.blur();
    }
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditTask) return;
    const strVal = e.target.value;
    setDurationDraft(strVal);
    if (strVal === '') return;
    const val = Number(strVal);
    if (!Number.isInteger(val) || val < 0) return;

    if (!startDate) {
      alert('防呆機制：請先設定開始日期，才能計算工期');
      setDurationDraft(null);
      return;
    }

    const nextEnd = dayjs(startDate).add(val, 'day').format('YYYY-MM-DD');

    updateDate('endDate', nextEnd, true);
  };

  const handleDurationBlur = () => {
    if (durationDraft === null) return;
    if (durationDraft === '') {
      setDurationDraft(null);
      return;
    }
    setDurationDraft(null);
  };

  const handleToggleDurationLock = () => {
    if (!canEditTask) return;
    persistTaskUpdates({ isDurationLocked: !node.isDurationLocked });
  };

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    if (!canEditTask) return;
    markDraftDirty();
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...updates } : note))
    );
  };

  const addNote = () => {
    if (!canEditTask) return;
    markDraftDirty();
    setNotes((current) => [...current, createNote(current.length + 1)]);
  };

  const deleteNote = (noteId: string) => {
    if (!canEditTask) return;
    const note = notes.find((item) => item.id === noteId);
    const noteLabel = note?.title?.trim() || '此備註欄';
    const isLastNote = notes.length <= 1;
    const confirmed = window.confirm(
      isLastNote
        ? `刪除「${noteLabel}」後會保留一個空白備註欄。確定刪除內容？`
        : `確定刪除「${noteLabel}」？`
    );
    if (!confirmed) return;

    markDraftDirty();
    setNotes((current) => {
      const nextNotes = current.filter((item) => item.id !== noteId);
      return nextNotes.length > 0 ? nextNotes : [createNote(1)];
    });
  };

  const handleAppendMeetingDiscussion = () => {
    if (!canEditTask) return;
    const didAppend = appendTaskDiscussionToMeetingDraft(node.id, node.title || node.id, meetingDiscussion);
    if (didAppend) setMeetingDiscussion('');
  };

  const { startLocked, endLocked } = getNodeLockStatus(node.id, dependencies);
  const currentStatus = normalizeManualTaskStatus(node.status);
  const isDueToday = currentStatus !== 'completed' && !!endDate && dayjs(endDate).isSame(dayjs(), 'day');
  const closeButtonTitle = saveState === 'error' || saveState === 'unknown'
    ? '重試確認儲存後關閉'
    : saveState === 'saving' || isClosePending
      ? '儲存完成後關閉'
      : canPersistTask
        ? '關閉（變更會自動儲存）'
      : '關閉';
  const taskDetailsHasLocalChanges = Boolean(
    canPersistTask
    && node
    && (
      titleValue.trim() !== (node.title || '').trim()
      || !areDetailNotesEqual(notes, getDisplayedDetailNotes(node))
      || saveState === 'saving'
      || saveState === 'error'
      || saveState === 'unknown'
    ),
  );

  return (
    <div
      data-task-details-modal="true"
      data-task-id={node.id}
      data-task-tracking-reference-id={trackingReferenceId}
      data-task-details-readonly={!canPersistTask ? 'true' : undefined}
      data-pwa-task-details-state={taskDetailsHasLocalChanges ? 'dirty' : 'safe'}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      data-task-details-pinch-close="true"
      onTouchStart={handlePinchTouchStart}
      onTouchMove={handlePinchTouchMove}
      onTouchEnd={handlePinchTouchEnd}
      onTouchCancel={() => { pinchCloseRef.current = null; }}
      onMouseDown={(event) => {
        // A real double-click on a task opens after the first click; its second
        // mousedown can then land on the newly mounted backdrop.  Do not treat
        // that continuation as an explicit backdrop-close gesture.
        if (event.detail > 1) return;
        if (event.target === event.currentTarget && isPrimaryPointerActivation(event)) handleClose();
      }}
    >
      <div
        ref={modalRef}
        data-task-details-dialog="true"
        className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        style={{
          width: size.width,
          height: size.height,
          minWidth: minimumModalSize.width,
          minHeight: minimumModalSize.height,
          maxWidth: maximumModalSize.width,
          maxHeight: maximumModalSize.height,
          resize: 'both',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start gap-2 px-5 py-3"
          data-task-details-header="true"
        >
          {canGoBack ? (
            <button
              type="button"
              onClick={() => requestTransition({ kind: 'back' })}
              disabled={isClosePending}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
              aria-label="返回上一個任務詳情"
              title="返回上一個任務詳情"
              data-task-details-back="true"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              {canEditTask ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={handleTitleKeyDown}
                  data-task-details-title-input="true"
                  aria-label="編輯任務名稱"
                  className="h-9 w-full min-w-0 border-0 bg-transparent px-0 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  title={node.title}
                />
              ) : (
                <p className="truncate text-sm font-semibold text-slate-900" title={node.title}>
                  {node.title}
                </p>
              )}
              {ancestorPath.length > 0 && (
                <nav
                  aria-label="任務完整位置"
                  data-task-details-parent-path="true"
                  className="flex min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap text-[11px] font-medium leading-4 text-slate-500"
                >
                  {ancestorPath.map((ancestor, index) => (
                    <React.Fragment key={ancestor.id}>
                      <span
                        data-task-details-parent-name="true"
                        className="min-w-0 max-w-[min(11rem,30vw)] truncate text-slate-600"
                        title={ancestor.title || '未命名任務'}
                      >
                        {ancestor.title || '未命名任務'}
                      </span>
                      {index < ancestorPath.length - 1 && (
                        <span className="shrink-0 text-slate-300" aria-hidden="true">
                          /
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              )}
            </div>
          </div>
          {canPersistTask ? (
            <div
              className="flex h-9 min-w-[7.5rem] shrink-0 items-center justify-end text-xs font-medium"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-task-details-save-status={saveState}
            >
              {saveState === 'saving' ? (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  儲存中…
                </span>
              ) : saveState === 'saved' ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  已儲存
                </span>
              ) : saveState === 'error' || saveState === 'unknown' ? (
                <button
                  type="button"
                  onClick={retryFailedSave}
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-100"
                  title={saveState === 'unknown' ? '重新讀取並重試未確認的變更' : '重新儲存未同步的變更'}
                  data-task-details-save-retry="true"
                >
                  <AlertCircle size={14} aria-hidden="true" />
                  {saveState === 'unknown' ? '狀態未確認，請重試' : '儲存失敗，請重試'}
                </button>
              ) : null}
            </div>
          ) : null}
          {canCollectTask && taskCollectionService.supported ? (
            <div ref={taskActionMenuRef} className="relative shrink-0" data-task-details-overflow-container="true">
              <button
                ref={collectionTriggerRef}
                type="button"
                onClick={() => setIsTaskActionMenuOpen(current => !current)}
                aria-expanded={isTaskActionMenuOpen}
                aria-haspopup="menu"
                aria-label="更多任務操作"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                data-task-details-overflow-trigger="true"
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
              {isTaskActionMenuOpen ? (
                <div
                  role="menu"
                  aria-label="任務操作"
                  data-task-details-overflow-menu="true"
                  className="absolute right-0 top-[calc(100%+0.35rem)] z-20 min-w-[9rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={taskCollectionPending}
                    onClick={() => { setIsTaskActionMenuOpen(false); setIsCollectionDialogOpen(true); }}
                    className="flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                    data-task-collection-open="true"
                  >
                    <Archive size={14} aria-hidden="true" />
                    <span>收藏任務</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="group relative shrink-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={isClosePending}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
              aria-label="關閉任務詳情"
              aria-describedby="task-details-close-description"
            >
              <X size={20} />
            </button>
            <span
              id="task-details-close-tooltip"
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              data-task-details-close-tooltip="true"
            >
              {closeButtonTitle}
            </span>
            <span id="task-details-close-description" className="sr-only">
              {closeButtonTitle}
            </span>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-auto px-4 py-4" data-task-details-scroll-surface="true">
          <section className="pb-2" data-task-details-meta-section="true">
            <div
              className="grid gap-y-3 lg:grid-cols-[5.5rem_23.5rem_minmax(0,1fr)] lg:items-end lg:gap-x-2 lg:gap-y-2"
              data-task-details-meta-grid="true"
            >
              <div
                className="rounded-lg border border-slate-200 bg-slate-50/80 shadow-sm md:border-0 md:bg-transparent md:shadow-none lg:col-span-full"
                data-task-details-mobile-meta="true"
              >
                <div
                  className="space-y-1.5 bg-white px-2 py-2 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start md:gap-x-3 md:gap-y-2 md:space-y-0 md:bg-transparent md:px-0 md:py-0 lg:grid lg:grid-cols-[5.5rem_23.5rem_minmax(0,1fr)] lg:items-end lg:gap-x-2 lg:gap-y-2"
                  data-task-details-mobile-meta-controls="true"
                >
              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-date-grid="true"
                data-task-details-schedule-row="true"
              >
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_auto] items-end gap-2 lg:col-start-2 lg:row-start-1"
                  data-task-details-schedule-controls="true"
                  data-task-details-mobile-schedule-controls="true"
                >
                  <span className="col-span-4 block text-xs font-medium text-slate-500" data-task-details-meta-label-text="true">
                    日期
                  </span>
                  <div className="contents">
                    <label
                      className="col-start-1 block min-w-0 text-xs font-medium text-slate-500"
                      data-task-details-meta-field="start"
                      data-task-details-meta-label="true"
                    >
                    <span className="hidden" data-task-details-meta-label-text="true">開始日期</span>
                    <div className="mt-1 flex items-center gap-2 lg:mt-0" data-task-details-meta-control-row="true">
                      <div className="relative min-w-0 flex-1 lg:w-[8rem] lg:flex-none">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => handleDateChange('startDate', event)}
                          max={!node.isDurationLocked ? (endDate || undefined) : undefined}
                          readOnly={!canEditTask || startLocked}
                          className={`h-8 w-full min-w-0 rounded-md px-2 text-sm text-transparent outline-none transition focus:ring-2 sm:text-slate-700 lg:w-[8rem] lg:flex-none ${
                            !canEditTask || startLocked
                              ? 'border border-dashed border-slate-300 bg-slate-50 sm:text-slate-500 pointer-events-none'
                              : 'border border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-2 right-5 flex items-center whitespace-nowrap text-[11px] font-normal text-slate-700 sm:hidden"
                          data-task-details-mobile-date-value="true"
                        >
                          {formatTaskDateForMobile(startDate)}
                        </span>
                      </div>
                      <span
                        className={`${startLocked ? 'inline-flex' : 'hidden'} h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${
                          startLocked
                            ? 'border-amber-200 bg-amber-50 text-amber-600'
                            : 'border-slate-200 bg-slate-50 text-slate-300'
                        }`}
                        title={startLocked ? '開始日期已有依賴關係鎖定' : '開始日期沒有依賴關係鎖定'}
                      >
                        {startLocked ? <Lock size={15} /> : <Unlock size={15} />}
                      </span>
                    </div>
                    </label>

                    <span
                      className="col-start-2 flex h-8 w-4 shrink-0 items-center justify-center text-sm font-semibold text-slate-300"
                      aria-hidden="true"
                      data-task-details-date-range-arrow="true"
                    >
                      →
                    </span>

                    <label
                      className="col-start-3 block min-w-0 text-xs font-medium text-slate-500"
                      data-task-details-meta-field="end"
                      data-task-details-meta-label="true"
                    >
                    <span className="hidden" data-task-details-meta-label-text="true">結束日期</span>
                    <div className="mt-1 flex items-center gap-2 lg:mt-0" data-task-details-meta-control-row="true">
                      <div className="relative min-w-0 flex-1 lg:w-[8rem] lg:flex-none">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(event) => handleDateChange('endDate', event)}
                          min={startDate || undefined}
                          readOnly={!canEditTask || endLocked || node.isDurationLocked}
                          className={`h-8 w-full min-w-0 rounded-md rounded-r-none border-r-0 px-2 text-sm text-transparent outline-none transition focus:ring-2 sm:text-slate-700 lg:w-[8rem] lg:flex-none ${
                            !canEditTask || endLocked || node.isDurationLocked
                              ? 'border border-dashed border-slate-300 bg-slate-50 sm:text-slate-500 pointer-events-none'
                              : isDueToday
                              ? 'border border-orange-300 bg-orange-50 sm:text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                              : 'border border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-2 right-5 flex items-center whitespace-nowrap text-[11px] font-normal text-slate-700 sm:hidden"
                          data-task-details-mobile-date-value="true"
                        >
                          {formatTaskDateForMobile(endDate)}
                        </span>
                      </div>
                      <span
                        className={`${endLocked ? 'inline-flex' : 'hidden'} h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600`}
                        title="結束日期已有依賴關係鎖定"
                      >
                        <Lock size={15} />
                      </span>
                    </div>
                  </label>
                  </div>
                  <span
                    className={`col-start-4 ml-0 inline-flex h-8 shrink-0 items-center overflow-hidden rounded-l-none rounded-r-md border ${
                      node.isDurationLocked
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                    title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '未鎖定工期：日期獨立計算'}
                    data-task-details-duration-inline="true"
                    data-task-details-mobile-duration="true"
                  >
                    <button
                      type="button"
                      onClick={handleToggleDurationLock}
                      disabled={!canEditTask}
                      className={`inline-flex h-full w-8 flex-shrink-0 items-center justify-center border-r transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-100 ${
                        node.isDurationLocked
                          ? 'border-amber-200 text-amber-600 hover:bg-amber-100'
                          : 'border-slate-200 text-slate-400 hover:bg-slate-100'
                      }`}
                      title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '非鎖定：日期獨立計算'}
                    >
                      {node.isDurationLocked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={durationInputValue}
                      onChange={handleDurationChange}
                      onBlur={handleDurationBlur}
                      placeholder="—"
                      disabled={!canEditTask || !node.isDurationLocked}
                      aria-label="工期天數"
                      className={`h-full w-16 border-0 bg-transparent px-1.5 text-sm text-center outline-none transition focus:ring-2 focus:ring-inset focus:ring-blue-100 ${
                        !node.isDurationLocked
                          ? 'text-slate-400'
                          : 'text-slate-700'
                      }`}
                    />
                  </span>
              </div>
              </div>

              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-assignment-row="true"
                data-task-details-primary-row="true"
              >
                <div className="min-w-0 lg:col-start-1 lg:row-start-1" data-task-details-meta-field="status">
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">狀態</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <select
                        value={currentStatus}
                        onChange={(event) => {
                          if (canEditTask) persistTaskUpdates({ status: event.target.value as TaskStatus });
                        }}
                        disabled={!canEditTask}
                        className={getTaskStatusFieldClass(currentStatus)}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>

                <div
                  className="min-w-0 lg:col-start-3 lg:row-start-1"
                  data-task-details-meta-field="assignment"
                >
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">主責／協作</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <TaskAssignmentPicker
                        node={node}
                        options={assigneeOptions}
                        membersLoading={membersLoading}
                        disabled={!canAssignTask}
                        fullSummary
                        onChange={handleAssignmentChange}
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-tags-row="true"
              >
                <div
                  className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-start-2"
                  data-task-details-meta-field="tags"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="shrink-0" data-task-details-meta-label-text="true">標籤</span>
                    <div className="min-w-0 flex-1" data-task-details-tag-picker-wrap="true">
                      <TagPicker
                        workspaceId={node.workspaceId}
                        selectedTagIds={node.tagIds || []}
                        onChange={(tagIds) => persistTaskUpdates({ tagIds })}
                        disabled={!canEditTask}
                        compact
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
              </div>
            </div>
          </section>

          {isMeetingMode ? (
            <section className="border-b border-slate-100 py-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageSquareText size={16} className="text-blue-500" />
                <span>本次會議</span>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <textarea
                  value={meetingDiscussion}
                  onChange={(event) => setMeetingDiscussion(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      handleAppendMeetingDiscussion();
                    }
                  }}
                  disabled={!canEditTask}
                  className="min-h-[88px] w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="輸入此任務剛剛討論的內容"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAppendMeetingDiscussion}
                    disabled={!canEditTask || !meetingDiscussion.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send size={13} />
                    加入紀錄
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="pt-2" data-task-detail-notes-section="true">
            <div className="grid gap-2" data-task-detail-notes-grid="true">
              {notes.map((note, noteIndex) => (
                <TaskDetailNoteField
                  key={note.id}
                  canEdit={canEditTask}
                  note={note}
                  noteIndex={noteIndex}
                  onAdd={addNote}
                  onDelete={() => deleteNote(note.id)}
                  onSave={handleSaveDetails}
                  onUpdate={updates => updateNote(note.id, updates)}
                />
              ))}
            </div>
          </section>

          <TaskDetailsSubtaskSection
            node={node}
            trackingReference={trackingReference}
            bodyRef={bodyRef}
            canCreateTask={placementPermissions.canCreateTask && !trackingReference}
            onCreateChild={parentId => requestTransition({ kind: 'create-child', parentId })}
            onOpenDetails={(taskId, targetTrackingReferenceId, placementId) => requestTransition({
              kind: 'navigate',
              taskId,
              trackingReferenceId: targetTrackingReferenceId,
              placementId,
            })}
          />

          <div className="flex justify-end pt-2" data-task-knowledge-trigger="true">
            <button
              type="button"
              onClick={() => setIsTaskKnowledgeOpen((current) => !current)}
              aria-expanded={isTaskKnowledgeOpen}
              aria-controls="task-knowledge-panel"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              data-task-knowledge-toggle="true"
            >
              <BookOpenText size={14} />
              <span>{isTaskKnowledgeOpen ? '收合歷史資訊' : '查看歷史資訊'}</span>
            </button>
          </div>
          {isTaskKnowledgeOpen ? (
            <div id="task-knowledge-panel" data-task-knowledge-panel="true">
              <TaskRecordTimeline nodeId={node.id} />
            </div>
          ) : null}
        </div>
      </div>
      {isCollectionDialogOpen ? <TaskCollectionDialog workspaceId={node.workspaceId} boardId={node.boardId} rootItemId={node.id} rootTitle={node.title} onClose={() => { setIsCollectionDialogOpen(false); window.requestAnimationFrame(() => (collectionTriggerRef.current || modalRef.current)?.focus()); }} onViewCollection={() => { if (canPersistTask) handleClose(); else onClose(); }} /> : null}
    </div>
  );
};
