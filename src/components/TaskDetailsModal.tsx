import React from 'react';
import dayjs from 'dayjs';
import { AlertCircle, CheckCircle2, LoaderCircle, Lock, X } from 'lucide-react';
import { useWbsStore, type UpdateNodeDispatchResult } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import useRecordStore from '../store/useRecordStore';
import { TagPicker } from './Tags/TagPicker';
import type { TaskDetailNote, TaskNode, TaskNoteCompareAndSetResult, TaskNotePersistenceSnapshot, TaskStatus } from '../types';
import { useTaskPlacementPermissions } from '../hooks/useTaskPlacementPermissions';
import useBoardStore from '../store/useBoardStore';
import TaskAssignmentPicker from './TaskAssignmentPicker';
import { MANUAL_TASK_STATUSES, normalizeManualTaskStatus, TASK_STATUS_LABELS } from '../utils/taskStatus';
import { buildAncestorPath } from '../utils/taskHierarchy';
import { isPrimaryPlacementId, PRIMARY_PLACEMENT_PREFIX, primaryPlacementId } from '../features/taskTracking/model';
import { getTaskStatusFieldClass } from './ui/taskStatusStyles';
import TaskDetailNoteField from './TaskNotes/TaskDetailNoteField';
import {
  areTaskNoteRichContentsEqual,
  getTaskDetailNotesWithCanonicalPurpose,
  TASK_PURPOSE_NOTE_ID,
} from '../utils/taskNoteRichContent';
import { toast } from '../store/useToastStore';
import { isPrimaryPointerActivation } from '../interactions/pointerActivation';
import { isSupabaseBackend, nodeService } from '../services/dataBackend';
import { isTaskWorkbenchUnplacedTask, readTaskWorkbenchUnplacedTasks } from '../features/taskWorkbench/placement';
import { supabaseTaskWorkbenchUnplacedService } from '../services/supabase/taskWorkbenchUnplacedService';
import {
  arePersistedValuesEqual,
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
import { TaskDetailsSubtaskSection, type TaskMapAncestor } from './TaskDetailsSubtaskSection';
import { resolveTaskDetailsPersistenceDecision, TASK_DETAILS_ACTION_EVENT, TASK_DETAILS_NAVIGATE_EVENT } from './taskDetailsNavigation';
import { useTaskMeetingQuickNotes } from '../hooks/useTaskMeetingQuickNotes';
import TaskMeetingQuickNoteSection from './TaskNotes/TaskMeetingQuickNoteSection';
import { useMeetingRecordAvailability } from '../utils/meetingRecordAvailability';
import useAuthStore from '../store/useAuthStore';
import { areTaskNoteSnapshotsEqual, taskNoteSnapshotFromNode } from '../utils/taskNotePersistence';
import { clearConfirmedTaskDetailsLocalDrafts, discardTaskDetailsLocalDraft,
  loadTaskDetailsLocalDraft, saveTaskDetailsLocalDraft, type TaskDetailsLocalDraft } from '../services/taskDetailsLocalDraft';
import {
  TASK_DETAILS_DRAFT_KEYS,
  classifyTaskDetailsReadback,
  isTaskDetailsDateDraftValid,
  taskDetailsDraftConflicts,
  taskDetailsFieldEqual,
  taskDetailsFieldsFromNode,
  type TaskDetailsDraftKey,
  type TaskDetailsFields,
} from './taskDetailsDraft';

interface TaskDetailsModalProps {
  nodeId: string;
  /** Placement identity used to resolve target/source capabilities independently. */
  trackingReferenceId?: string;
  onClose: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onNavigateToTask?: (taskId: string, trackingReferenceId?: string, placementId?: string) => void;
  onCreateChild?: (taskId: string) => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = MANUAL_TASK_STATUSES.map(value => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

const createNote = (index: number): TaskDetailNote => ({
  id: index === 1 ? 'note_default' : `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title: index === 1 ? '任務目的' : '備註',
  content: '',
});

const formatTaskDateForDisplay = (value: string) => {
  const date = dayjs(value);
  if (!value || !date.isValid()) return '年/月/日';
  return date.format(date.year() === dayjs().year() ? 'MM/DD' : 'YYYY/MM/DD');
};

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
  accountId: string | null,
): Promise<TaskPersistenceReadback> => {
  if (!sourceNode.workspaceId || !sourceNode.boardId) return 'unavailable';

  try {
    const canonicalNode = await readCanonicalTask(sourceNode, accountId);
    if (!canonicalNode || canonicalNode.isArchived) return 'mismatch';

    const fields = taskDetailsFieldsFromNode(canonicalNode);
    return persistedKeys.every((key) => TASK_DETAILS_DRAFT_KEYS.includes(key as TaskDetailsDraftKey)
      ? taskDetailsFieldEqual(key as TaskDetailsDraftKey, fields[key as TaskDetailsDraftKey], (requestUpdates as Record<string, unknown>)[key])
      : arePersistedValuesEqual(
        (canonicalNode as unknown as Record<string, unknown>)[key],
        (requestUpdates as Record<string, unknown>)[key],
      ))
      ? 'confirmed'
      : 'mismatch';
  } catch {
    return 'unavailable';
  }
};

const readCanonicalTask = async (sourceNode: TaskNode, accountId: string | null): Promise<TaskNode | undefined> => {
  if (isTaskWorkbenchUnplacedTask(sourceNode)) {
    // Unplaced tasks deliberately support durable local fallback; never run
    // the loader here because it also migrates local tasks to the provider.
    const local = readTaskWorkbenchUnplacedTasks(accountId).find(item => item.id === sourceNode.id);
    if (local || !isSupabaseBackend || !accountId) return local;
    return (await supabaseTaskWorkbenchUnplacedService.list()).find(item => item.id === sourceNode.id);
  }
  return (await nodeService.listByProject(sourceNode.workspaceId, sourceNode.boardId)).find(item => item.id === sourceNode.id);
};

const PINCH_CLOSE_MIN_DISTANCE_DELTA = 36;
const PINCH_CLOSE_MAX_DISTANCE_RATIO = 0.78;
const TASK_DETAILS_PERSISTENCE_DEADLINE_MS = 10_000;
const TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS = 5_000;

type TaskDetailsSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'unknown';

class TaskNoteWriteUnknownError extends Error {}

const withTaskNoteWriteDeadline = (
  operation: Promise<TaskNoteCompareAndSetResult>,
  node: TaskNode,
  expected: TaskNotePersistenceSnapshot,
  submitted: TaskNotePersistenceSnapshot,
  accountId: string | null,
  isCurrent: () => boolean,
): Promise<TaskNoteCompareAndSetResult> => {
  let deadlineTimer: number | undefined;
  let readbackTimer: number | undefined;
  const deadline = new Promise<TaskNoteCompareAndSetResult>((resolve, reject) => {
    deadlineTimer = window.setTimeout(() => {
      if (!isCurrent()) { reject(new TaskNoteWriteUnknownError()); return; }
      void Promise.race([
        readCanonicalTask(node, accountId),
        new Promise<never>((_, rejectReadback) => {
          readbackTimer = window.setTimeout(() => rejectReadback(new TaskNoteWriteUnknownError()), TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS);
        }),
      ]).then(latest => {
        if (!latest || latest.isArchived) throw new TaskNoteWriteUnknownError();
        const snapshot = taskNoteSnapshotFromNode(latest);
        if (areTaskNoteSnapshotsEqual(snapshot, submitted)) resolve({ status: 'persisted', snapshot });
        else if (!areTaskNoteSnapshotsEqual(snapshot, expected)) resolve({ status: 'conflict', snapshot });
        else reject(new Error('Task note write was not confirmed.'));
      }).catch(() => reject(new TaskNoteWriteUnknownError()));
    }, TASK_DETAILS_PERSISTENCE_DEADLINE_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
    if (readbackTimer !== undefined) window.clearTimeout(readbackTimer);
  });
};

const getTouchDistance = (touches: React.TouchList) => {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return null;

  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

type TaskDetailsTransition =
  | { kind: 'close' }
  | { kind: 'back' }
  | { kind: 'forward' }
  | { kind: 'action'; run: () => void }
  | { kind: 'navigate'; taskId: string; trackingReferenceId?: string; placementId?: string }
  | { kind: 'create-child'; parentId: string };

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  nodeId,
  trackingReferenceId,
  onClose,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  onNavigateToTask,
  onCreateChild,
}) => {
  const liveNode = useWbsStore((state) => state.nodes[nodeId]);
  const lastNodeRef = React.useRef(liveNode);
  if (liveNode) lastNodeRef.current = liveNode;
  const node = liveNode ?? lastNodeRef.current;
  React.useEffect(() => {
    if (import.meta.env.MODE !== 'test') return;
    const testWindow = window as Window & { __DEV098_TASK_DETAIL_STORE__?: typeof useWbsStore };
    testWindow.__DEV098_TASK_DETAIL_STORE__ = useWbsStore;
    return () => {
      if (testWindow.__DEV098_TASK_DETAIL_STORE__ === useWbsStore) {
        delete testWindow.__DEV098_TASK_DETAIL_STORE__;
      }
    };
  }, []);
  const currentNodeTitle = node?.title || '';
  const currentNodeDetailNotes = node?.detailNotes;
  const currentNodeDescription = node?.description || '';
  const canonicalNotes = React.useMemo(() => getTaskDetailNotesWithCanonicalPurpose({
    detailNotes: currentNodeDetailNotes,
    description: currentNodeDescription,
    title: currentNodeTitle,
  }), [currentNodeDetailNotes, currentNodeDescription, currentNodeTitle]);
  const canonicalNoteSnapshot = React.useMemo<TaskNotePersistenceSnapshot>(() => taskNoteSnapshotFromNode({
    detailNotes: currentNodeDetailNotes,
    description: node?.description,
    updatedAt: node?.updatedAt,
  }), [currentNodeDetailNotes, node?.description, node?.updatedAt]);
  const currentAccountId = useAuthStore((state) => state.user?.uid ?? null);
  const sessionOwnerRef = React.useRef({
    accountId: currentAccountId,
    workspaceId: node?.workspaceId,
    boardId: node?.boardId,
  });
  const nodes = useWbsStore((state) => state.nodes);
  const trackingReferences = useWbsStore((state) => state.trackingReferences);
  const updateNode = useWbsStore((state) => state.updateNode);
  const commitTaskNotes = useWbsStore((state) => state.commitTaskNotes);
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
  const placementPermissions = useTaskPlacementPermissions(node, trackingReference);
  // The same details component is used for primary and tracking placements.
  // Canonical mutations are enabled only by source-board capabilities; target
  // placement membership contributes derived read/manage-reference access.
  const placementAvailable = Boolean(liveNode && !liveNode.isArchived && (!trackingReferenceId || trackingReference));
  const canEditTask = placementPermissions.canEditTask && placementAvailable;
  const canAssignTask = placementPermissions.canAssignTask && placementAvailable;
  const canPersistTask = canEditTask || canAssignTask;
  const pendingTitleEditNodeId = useBoardStore((state) => state.pendingTitleEditNodeId);
  const pendingTitleEditInitialValue = useBoardStore((state) => state.pendingTitleEditInitialValue);
  const setPendingTitleEditNodeId = useBoardStore((state) => state.setPendingTitleEditNodeId);
  const [size, setSize] = React.useState(readSavedSize);
  const [minimumModalSize, setMinimumModalSize] = React.useState(getMinimumModalSize);
  const [maximumModalSize, setMaximumModalSize] = React.useState(getMaximumModalSize);
  const [durationDraft, setDurationDraft] = React.useState<string | null>(null);
  const [fieldEdit, setFieldEdit] = React.useState(() => ({
    baseline: taskDetailsFieldsFromNode(node),
    draft: {} as Partial<TaskDetailsFields>,
  }));
  const fieldEditRef = React.useRef(fieldEdit);
  const draftNode = {
    ...node,
    ...fieldEdit.draft,
    ...('assigneeIds' in fieldEdit.draft ? { assigneeId: fieldEdit.draft.assigneeIds?.[0] } : {}),
  } as TaskNode;
  const { title: titleValue, startDate = '', endDate = '' } = taskDetailsFieldsFromNode(draftNode);
  const [noteEdit, setNoteEdit] = React.useState(() => ({
    ownerNodeId: nodeId,
    source: canonicalNotes,
    baseline: canonicalNotes,
    baselineSnapshot: canonicalNoteSnapshot,
    draft: null as TaskDetailNote[] | null,
    editorRevision: 0,
  }));
  const noteEditRef = React.useRef(noteEdit);
  const pendingNoteWriteRef = React.useRef<{
    operationId: string;
    submittedNotes: TaskDetailNote[];
    submittedSnapshot: TaskNotePersistenceSnapshot;
  } | null>(null);
  const [pendingNoteWriteSnapshot, setPendingNoteWriteSnapshot] = React.useState<TaskNotePersistenceSnapshot | null>(null);
  const noteEditOwnsCurrentNode = noteEdit.ownerNodeId === nodeId;
  const notes = noteEditOwnsCurrentNode ? (noteEdit.draft ?? noteEdit.source) : canonicalNotes;
  const pendingNoteWriteMatchesCanonical = Boolean(
    pendingNoteWriteSnapshot
    && areTaskNoteSnapshotsEqual(pendingNoteWriteSnapshot, canonicalNoteSnapshot)
  );
  const [purposeEditorReset, setPurposeEditorReset] = React.useState(0);
  const [meetingDiscussion, setMeetingDiscussion] = React.useState('');
  const [meetingDiscussionError, setMeetingDiscussionError] = React.useState<string | null>(null);
  const isMeetingMode = useRecordStore((state) => state.isMeetingMode);
  const activeMeetingBoardId = useBoardStore((state) => state.activeBoardId);
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
  const appendTaskDiscussionToMeetingDraft = useRecordStore((state) => state.appendTaskDiscussionToMeetingDraft);
  const meetingQuickNotes = useTaskMeetingQuickNotes(node, activeMeetingBoardId);
  const [saveState, setSaveState] = React.useState<TaskDetailsSaveState>('idle');
  const [isClosePending, setIsClosePending] = React.useState(false);
  const saveFeedbackTimerRef = React.useRef<number | null>(null);
  const composingRef = React.useRef(false);
  const [isComposing, setIsComposing] = React.useState(false);
  const compositionFlushPendingRef = React.useRef(false);
  const deferredIntentRef = React.useRef<TaskDetailsTransition | 'save' | 'retry' | null>(null);
  const intentTimerRef = React.useRef<number | null>(null);
  const resumeIntentRef = React.useRef<() => void>(() => {});
  const batchDispatchingRef = React.useRef(false);
  const [fieldConflict, setFieldConflict] = React.useState(false);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
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
  const blockedTransitionRef = React.useRef<TaskDetailsTransition | null>(null);
  const notesConflict = Boolean(
    noteEditOwnsCurrentNode && noteEdit.draft
    && !areTaskNoteSnapshotsEqual(noteEdit.baselineSnapshot, canonicalNoteSnapshot)
    && !pendingNoteWriteMatchesCanonical
    && !(failedUpdatesRef.current.detailNotes && areTaskNoteSnapshotsEqual({
      detailNotes: failedUpdatesRef.current.detailNotes,
      description: failedUpdatesRef.current.description ?? null,
    }, canonicalNoteSnapshot))
  );
  const ownsLiveTask = React.useCallback(() => {
    const owner = sessionOwnerRef.current;
    const current = useWbsStore.getState().nodes[nodeId];
    return useAuthStore.getState().user?.uid === (owner.accountId ?? undefined)
      && Boolean(current && !current.isArchived && current.workspaceId === owner.workspaceId && current.boardId === owner.boardId)
      && (!trackingReferenceId || useWbsStore.getState().trackingReferences.some(reference => reference.id === trackingReferenceId && !reference.removedAt));
  }, [nodeId, trackingReferenceId]);
  const [localDraftReady, setLocalDraftReady] = React.useState(false);
  const [localDraftStatus, setLocalDraftStatus] = React.useState<'saving' | 'local' | 'failed' | null>(null);
  const localWriterRef = React.useRef(`task-details-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const localRestoredRef = React.useRef<TaskDetailsLocalDraft | null>(null);
  const localDraftQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const localDraftWriteRef = React.useRef(0);
  const localDraftScope = React.useMemo(() => {
    const owner = sessionOwnerRef.current;
    return owner.accountId && owner.workspaceId && owner.boardId
      ? { accountId: owner.accountId, workspaceId: owner.workspaceId, boardId: owner.boardId, taskId: nodeId } : null;
  }, [nodeId]);
  React.useEffect(() => {
    if (!localDraftScope || !canPersistTask || localDraftReady) return;
    let disposed = false;
    void loadTaskDetailsLocalDraft(localDraftScope, taskDetailsFieldsFromNode(node), canonicalNoteSnapshot).then(saved => {
      if (disposed || !ownsLiveTask()) return;
      // Never replace typing that began while IndexedDB was opening.
      if (saved && Object.keys(fieldEditRef.current.draft).length === 0 && !noteEditRef.current.draft) {
        localRestoredRef.current = saved;
        fieldEditRef.current = saved.fields;
        setFieldEdit(saved.fields);
        noteEditRef.current = { ...noteEditRef.current, draft: saved.notes.draft,
          baseline: saved.notes.baseline.detailNotes, baselineSnapshot: saved.notes.baseline,
          editorRevision: noteEditRef.current.editorRevision + 1 };
        setNoteEdit(noteEditRef.current);
        // The cached task might be optimistic or stale after a restart. Use
        // the existing canonical readback before any recovered edit is sent.
        failedUpdatesRef.current = saved.submitted;
        unknownUpdatesRef.current = saved.submitted;
        setSaveState('unknown');
        setLocalDraftStatus('local');
      }
      setLocalDraftReady(true);
    }, () => { if (!disposed) { setLocalDraftStatus('failed'); setLocalDraftReady(true); } });
    return () => { disposed = true; };
  }, [canPersistTask, canonicalNoteSnapshot, localDraftReady, localDraftScope, node, ownsLiveTask]);
  React.useEffect(() => {
    if (!localDraftReady || !localDraftScope || !ownsLiveTask()) return;
    const hasDraft = Object.keys(fieldEdit.draft).length > 0 || Boolean(noteEdit.draft);
    if (!hasDraft) {
      if (saveState === 'saved') localDraftQueueRef.current = localDraftQueueRef.current.catch(() => undefined)
        .then(() => clearConfirmedTaskDetailsLocalDrafts(localDraftScope, taskDetailsFieldsFromNode(node), canonicalNoteSnapshot));
      return;
    }
    const request = ++localDraftWriteRef.current;
    const submitted: Partial<TaskNode> = { ...fieldEdit.draft,
      ...(noteEdit.draft ? { detailNotes: noteEdit.draft, description: noteEdit.draft[0]?.content ?? '' } : {}),
      ...failedUpdatesRef.current, ...unknownUpdatesRef.current };
    const snapshot: TaskDetailsLocalDraft = { ...localDraftScope, key: localWriterRef.current,
      schemaVersion: 1, savedAt: Date.now(), fields: fieldEdit,
      notes: { baseline: noteEdit.baselineSnapshot, draft: noteEdit.draft },
      unknown: saveState === 'saving' || saveState === 'unknown', submitted };
    setLocalDraftStatus('saving');
    localDraftQueueRef.current = localDraftQueueRef.current.catch(() => undefined)
      .then(() => saveTaskDetailsLocalDraft(snapshot)).then(() => {
        if (request === localDraftWriteRef.current && ownsLiveTask()) setLocalDraftStatus('local');
      }, () => { if (request === localDraftWriteRef.current && ownsLiveTask()) setLocalDraftStatus('failed'); });
  }, [canonicalNoteSnapshot, fieldEdit, localDraftReady, localDraftScope, node, noteEdit, ownsLiveTask, saveState]);
  React.useEffect(() => {
    if (localDraftStatus !== 'saving' && localDraftStatus !== 'failed') return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [localDraftStatus]);
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
    if (pendingPersistCountRef.current === 0 && Object.keys(failedUpdatesRef.current).length === 0) setSaveState('idle');
  }, [clearSaveFeedbackTimer]);

  const updateFieldDraft = React.useCallback((updates: Partial<TaskDetailsFields>) => {
    if (pendingPersistCountRef.current > 0 || isDiscarding) return;
    const latest = useWbsStore.getState().nodes[nodeId];
    if (!latest) return;
    const current = fieldEditRef.current;
    const baseline = { ...current.baseline };
    const draft = { ...current.draft };
    const canonical = taskDetailsFieldsFromNode(latest);
    for (const key of Object.keys(updates) as TaskDetailsDraftKey[]) {
      if (!Object.prototype.hasOwnProperty.call(draft, key)) {
        (baseline as Record<string, unknown>)[key] = canonical[key];
      }
      if (taskDetailsFieldEqual(key, updates[key], baseline[key]) && !(key in failedUpdatesRef.current)) delete draft[key];
      else (draft as Record<string, unknown>)[key] = updates[key];
    }
    const next = { baseline, draft };
    fieldEditRef.current = next;
    setFieldEdit(next);
    setFieldConflict(false);
    markDraftDirty();
  }, [isDiscarding, markDraftDirty, nodeId]);

  const updateNoteEditState = React.useCallback((
    update: (current: typeof noteEdit) => typeof noteEdit,
  ) => {
    const next = update(noteEditRef.current);
    noteEditRef.current = next;
    setNoteEdit(next);
    return next;
  }, []);

  React.useLayoutEffect(() => {
    updateNoteEditState(current => {
      if (current.ownerNodeId !== nodeId) {
        return {
          ownerNodeId: nodeId,
          source: canonicalNotes,
          baseline: canonicalNotes,
          baselineSnapshot: canonicalNoteSnapshot,
          draft: null,
          editorRevision: current.editorRevision + 1,
        };
      }
      if (current.source === canonicalNotes) return current;
      const changed = !areDetailNotesEqual(current.source, canonicalNotes);
      return {
        ...current,
        source: canonicalNotes,
        baseline: current.draft ? current.baseline : canonicalNotes,
        baselineSnapshot: current.draft ? current.baselineSnapshot : canonicalNoteSnapshot,
        editorRevision: current.editorRevision + (changed && !current.draft ? 1 : 0),
      };
    });
  }, [canonicalNotes, canonicalNoteSnapshot, nodeId, updateNoteEditState]);

  const runTransition = React.useCallback((transition: TaskDetailsTransition) => {
    blockedTransitionRef.current = null;
    setIsClosePending(false);
    if (transition.kind === 'close') {
      onClose();
    } else if (transition.kind === 'back') {
      onBack?.();
    } else if (transition.kind === 'forward') {
      onForward?.();
    } else if (transition.kind === 'create-child') {
      onCreateChild?.(transition.parentId);
    } else if (transition.kind === 'action') {
      transition.run();
    } else {
      onNavigateToTask?.(transition.taskId, transition.trackingReferenceId, transition.placementId);
    }
  }, [onBack, onClose, onCreateChild, onForward, onNavigateToTask]);

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
    if (!ownsLiveTask()) {
      if (settlePersistenceOperationOnce(pendingPersistOperationsRef.current, operationId)) {
        pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1);
      }
      blockedTransitionRef.current = pendingTransitionRef.current;
      pendingTransitionRef.current = null;
      setIsClosePending(false);
      setSaveState('error');
      return;
    }
    if (!settlePersistenceOperationOnce(pendingPersistOperationsRef.current, operationId)) return;
    pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1);

    if (outcome === 'persisted') {
      const current = fieldEditRef.current;
      const baseline = { ...current.baseline };
      const draft = { ...current.draft };
      for (const key of persistedKeys as TaskDetailsDraftKey[]) {
        if (!TASK_DETAILS_DRAFT_KEYS.includes(key) || latestPersistVersionByKeyRef.current[key] !== requestVersion) continue;
        const value = (requestUpdates as Record<string, unknown>)[key];
        (baseline as Record<string, unknown>)[key] = value;
        if (taskDetailsFieldEqual(key, draft[key], value)) delete draft[key];
      }
      fieldEditRef.current = { baseline, draft };
      setFieldEdit(fieldEditRef.current);
      if (requestUpdates.detailNotes && latestPersistVersionByKeyRef.current.detailNotes === requestVersion) {
        const submitted = requestUpdates.detailNotes;
        const snapshot: TaskNotePersistenceSnapshot = {
          detailNotes: submitted,
          description: requestUpdates.description ?? null,
        };
        updateNoteEditState(currentNotes => ({
          ...currentNotes,
          source: submitted,
          baseline: submitted,
          baselineSnapshot: snapshot,
          draft: currentNotes.draft && !areDetailNotesEqual(currentNotes.draft, submitted) ? currentNotes.draft : null,
        }));
      }
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

    if (batchDispatchingRef.current) return;

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
        blockedTransitionRef.current = pendingTransitionRef.current;
        pendingTransitionRef.current = null;
        setIsClosePending(false);
      }
      return;
    }

    if (persistenceDecision === 'run' && pendingTransitionRef.current) {
      if (Object.keys(fieldEditRef.current.draft).length > 0 || noteEditRef.current.draft) {
        pendingTransitionRef.current = null;
        setIsClosePending(false);
        setSaveState('idle');
        return;
      }
      const transition = pendingTransitionRef.current;
      pendingTransitionRef.current = null;
      runTransition(transition);
      return;
    }

    if (Object.keys(fieldEditRef.current.draft).length > 0 || noteEditRef.current.draft) setSaveState('idle');
    else showSaveFeedback();
  }, [clearSaveFeedbackTimer, ownsLiveTask, runTransition, showSaveFeedback, updateNoteEditState]);

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

    let dispatchResult: UpdateNodeDispatchResult;
    try {
      dispatchResult = updateNode(currentNodeId, requestUpdates, {
        forcePersistence: true,
        skipActivity: options.skipActivity,
      });
    } catch {
      recordRejectedPersistence(requestUpdates, persistedKeys);
      return false;
    }
    if (!dispatchResult.accepted) {
      // Equality in the optimistic store is not a durable acknowledgement.
      recordRejectedPersistence(requestUpdates, persistedKeys);
      return false;
    }

    const requestVersion = persistVersionRef.current + 1;
    persistVersionRef.current = requestVersion;
    persistedKeys.forEach((key) => {
      latestPersistVersionByKeyRef.current[key] = requestVersion;
    });

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
      if (!ownsLiveTask()) { finish('unknown'); return; }
      console.warn('[TaskDetails] Persistence deadline exceeded; running canonical readback', {
        operationId: dispatchResult.operationId,
        taskId: currentNodeId,
      });
      const readbackDeadline = new Promise<TaskPersistenceReadback>((resolve) => {
        window.setTimeout(() => resolve('unavailable'), TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS);
      });
      void Promise.race([
        readbackTaskPersistence(node, requestUpdates, persistedKeys, sessionOwnerRef.current.accountId),
        readbackDeadline,
      ]).then(
        // A mismatch may be a mixed commit or a newer remote value. Keep it
        // uncertain until retry classifies each key against its baseline.
        (readback) => finish(readback === 'confirmed' ? 'persisted' : 'unknown'),
        () => finish('unknown'),
      );
    }, TASK_DETAILS_PERSISTENCE_DEADLINE_MS);

    return true;
  }, [
    canPersistTask,
    clearSaveFeedbackTimer,
    currentNodeId,
    node,
    ownsLiveTask,
    recordRejectedPersistence,
    settlePersistence,
    updateNode,
  ]);

  const getLatestNotes = React.useCallback(() => {
    const latest = useWbsStore.getState().nodes[nodeId];
    return latest ? getTaskDetailNotesWithCanonicalPurpose(latest) : null;
  }, [nodeId]);

  const getLatestNoteSnapshot = React.useCallback(() => {
    const latest = useWbsStore.getState().nodes[nodeId];
    return latest ? taskNoteSnapshotFromNode(latest) : null;
  }, [nodeId]);

  const canSaveNoteDraft = React.useCallback(() => {
    const current = noteEditRef.current;
    if (!current.draft) return true;
    const latest = getLatestNoteSnapshot();
    return latest !== null && (areTaskNoteSnapshotsEqual(current.baselineSnapshot, latest)
      || Boolean(pendingNoteWriteRef.current && areTaskNoteSnapshotsEqual(pendingNoteWriteRef.current.submittedSnapshot, latest))
      || Boolean(failedUpdatesRef.current.detailNotes && areTaskNoteSnapshotsEqual({
        detailNotes: failedUpdatesRef.current.detailNotes,
        description: failedUpdatesRef.current.description ?? null,
      }, latest)));
  }, [getLatestNoteSnapshot]);

  const persistNoteDraft = React.useCallback((
    updates: Pick<TaskNode, 'detailNotes' | 'description'>,
  ) => {
    if (!currentNodeId || !node || !canEditTask || pendingNoteWriteRef.current || !canSaveNoteDraft()) return false;
    const submittedNotes = updates.detailNotes ?? noteEditRef.current.draft ?? noteEditRef.current.source;
    const submittedSnapshot: TaskNotePersistenceSnapshot = {
      detailNotes: submittedNotes,
      description: updates.description ?? submittedNotes[0]?.content ?? null,
    };
    const expectedSnapshot = noteEditRef.current.baselineSnapshot;
    const latestSnapshot = getLatestNoteSnapshot();
    if (!latestSnapshot || (!areTaskNoteSnapshotsEqual(expectedSnapshot, latestSnapshot)
      && !areTaskNoteSnapshotsEqual(submittedSnapshot, latestSnapshot))) return false;

    const operationId = `task-note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const requestVersion = persistVersionRef.current + 1;
    persistVersionRef.current = requestVersion;
    const persistedKeys = ['detailNotes', 'description'];
    persistedKeys.forEach(key => { latestPersistVersionByKeyRef.current[key] = requestVersion; });
    const requestUpdates: Partial<TaskNode> = {
      detailNotes: submittedSnapshot.detailNotes,
      description: submittedSnapshot.description ?? undefined,
    };

    pendingNoteWriteRef.current = { operationId, submittedNotes, submittedSnapshot };
    setPendingNoteWriteSnapshot(submittedSnapshot);
    pendingPersistOperationsRef.current.add(operationId);
    pendingPersistCountRef.current += 1;
    clearSaveFeedbackTimer();
    setSaveState('saving');

    void withTaskNoteWriteDeadline(
      commitTaskNotes(currentNodeId, expectedSnapshot, submittedSnapshot),
      node,
      expectedSnapshot,
      submittedSnapshot,
      sessionOwnerRef.current.accountId,
      ownsLiveTask,
    ).then(result => {
      if (persistenceOwnerNodeIdRef.current !== currentNodeId || !ownsLiveTask()) {
        pendingNoteWriteRef.current = null;
        setPendingNoteWriteSnapshot(null);
        settlePersistence(currentNodeId, operationId, 'unknown', requestUpdates, requestVersion, persistedKeys);
        return;
      }
      const currentSnapshot = getLatestNoteSnapshot();
      if (currentSnapshot && (areTaskNoteSnapshotsEqual(currentSnapshot, expectedSnapshot)
        || areTaskNoteSnapshotsEqual(currentSnapshot, submittedSnapshot))) {
        useWbsStore.setState(state => ({ nodes: {
          ...state.nodes,
          [currentNodeId]: { ...state.nodes[currentNodeId], detailNotes: result.snapshot.detailNotes, description: result.snapshot.description ?? undefined },
        } }));
      }

      if (result.status === 'conflict') {
        const latestNotes = getTaskDetailNotesWithCanonicalPurpose({
          detailNotes: result.snapshot.detailNotes,
          description: result.snapshot.description ?? '',
          title: useWbsStore.getState().nodes[currentNodeId]?.title || currentNodeTitle,
        });
        updateNoteEditState(current => ({
          ...current,
          source: latestNotes,
          draft: current.draft ?? submittedNotes,
          editorRevision: current.editorRevision + 1,
        }));
        pendingNoteWriteRef.current = null;
        setPendingNoteWriteSnapshot(null);
        if (settlePersistenceOperationOnce(pendingPersistOperationsRef.current, operationId)) {
          pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1);
        }
        blockedTransitionRef.current = pendingTransitionRef.current;
        pendingTransitionRef.current = null;
        setIsClosePending(false);
        setSaveState(pendingPersistCountRef.current > 0 ? 'saving'
          : Object.keys(unknownUpdatesRef.current).length > 0 ? 'unknown'
            : Object.keys(failedUpdatesRef.current).length > 0 ? 'error' : 'idle');
        return;
      }

      const persistedNotes = getTaskDetailNotesWithCanonicalPurpose({
        detailNotes: result.snapshot.detailNotes,
        description: result.snapshot.description ?? '',
        title: useWbsStore.getState().nodes[currentNodeId]?.title || currentNodeTitle,
      });
      const currentEdit = noteEditRef.current;
      const newerDraft = currentEdit.draft && !areDetailNotesEqual(currentEdit.draft, submittedNotes)
        ? currentEdit.draft
        : null;
      updateNoteEditState(current => ({
        ...current,
        source: persistedNotes,
        baseline: persistedNotes,
        baselineSnapshot: result.snapshot,
        draft: newerDraft,
        editorRevision: current.editorRevision + (areDetailNotesEqual(submittedNotes, persistedNotes) ? 0 : 1),
      }));
      pendingNoteWriteRef.current = null;
      setPendingNoteWriteSnapshot(null);
      settlePersistence(
        currentNodeId,
        operationId,
        'persisted',
        requestUpdates,
        requestVersion,
        persistedKeys,
      );
    }, (error: unknown) => {
      if (persistenceOwnerNodeIdRef.current !== currentNodeId || !ownsLiveTask()) {
        settlePersistence(currentNodeId, operationId, 'unknown', requestUpdates, requestVersion, persistedKeys);
        return;
      }
      pendingNoteWriteRef.current = null;
      setPendingNoteWriteSnapshot(null);
      updateNoteEditState(current => ({
        ...current,
        draft: current.draft ?? submittedNotes,
      }));
      settlePersistence(
        currentNodeId,
        operationId,
        error instanceof TaskNoteWriteUnknownError ? 'unknown' : 'failed',
        requestUpdates,
        requestVersion,
        persistedKeys,
      );
    });
    return true;
  }, [
    canEditTask,
    canSaveNoteDraft,
    clearSaveFeedbackTimer,
    commitTaskNotes,
    currentNodeId,
    currentNodeTitle,
    getLatestNoteSnapshot,
    node,
    ownsLiveTask,
    settlePersistence,
    updateNoteEditState,
  ]);

  const validateDraft = React.useCallback((canonicalOverride?: TaskNode) => {
    const latest = canonicalOverride ?? useWbsStore.getState().nodes[nodeId];
    const current = fieldEditRef.current;
    const keys = Object.keys(current.draft) as TaskDetailsDraftKey[];
    const hasNotes = Boolean(noteEditRef.current.draft);
    if (keys.length === 0 && !hasNotes) return true;
    if (!latest || !ownsLiveTask()) {
      toast.error('任務或存取身分已變更，草稿已保留，可捨棄後離開。');
      return false;
    }
    if (keys.some(key => key === 'assigneeIds' || key === 'collaboratorIds' ? !canAssignTask : !canEditTask)
      || (hasNotes && !canEditTask)) {
      toast.error('目前沒有儲存這些變更的權限，草稿已保留。');
      return false;
    }
    if ('title' in current.draft && !current.draft.title?.trim()) {
      toast.error('請輸入任務名稱。');
      titleInputRef.current?.focus();
      return false;
    }
    const conflicts = taskDetailsDraftConflicts(current.draft, current.baseline, taskDetailsFieldsFromNode(latest));
    if (conflicts.length > 0) {
      setFieldConflict(true);
      return false;
    }
    if (!canSaveNoteDraft()) {
      return false;
    }
    if (canonicalOverride && hasNotes) {
      const latestNotes = taskNoteSnapshotFromNode(canonicalOverride);
      const failedNotes = failedUpdatesRef.current.detailNotes;
      if (!areTaskNoteSnapshotsEqual(noteEditRef.current.baselineSnapshot, latestNotes)
        && !(failedNotes && areTaskNoteSnapshotsEqual({
          detailNotes: failedNotes,
          description: failedUpdatesRef.current.description ?? null,
        }, latestNotes))) return false;
    }
    if (!isTaskDetailsDateDraftValid(current.draft, taskDetailsFieldsFromNode(latest))) {
      toast.error('日期已變更，請確認開始、結束日期與固定工期。');
      return false;
    }
    const locks = getNodeLockStatus(nodeId, useWbsStore.getState().dependencies);
    if (('startDate' in current.draft && locks.startLocked) || ('endDate' in current.draft && locks.endLocked)) {
      toast.error('日期已由相依關係鎖定，草稿已保留。');
      return false;
    }
    return true;
  }, [canAssignTask, canEditTask, canSaveNoteDraft, getNodeLockStatus, nodeId, ownsLiveTask]);

  const savePendingTaskDetails = React.useCallback((onlyFailed = false, retryKeys?: Set<string>, canonicalOverride?: TaskNode) => {
    if (!validateDraft(canonicalOverride)) return 'blocked' as const;
    const current = fieldEditRef.current;
    const updates = Object.fromEntries(Object.entries(current.draft).filter(([key]) => (
      !onlyFailed || (retryKeys ? retryKeys.has(key) : Object.prototype.hasOwnProperty.call(failedUpdatesRef.current, key))
    ))) as Partial<TaskDetailsFields>;
    if (typeof updates.title === 'string') {
      updates.title = updates.title.trim();
      if (taskDetailsFieldEqual('title', updates.title, current.baseline.title) && !('title' in failedUpdatesRef.current)) {
        delete updates.title;
      }
      const next = { ...current, draft: { ...current.draft } };
      if ('title' in updates) next.draft.title = updates.title;
      else if (!onlyFailed) delete next.draft.title;
      fieldEditRef.current = next;
      setFieldEdit(next);
    }
    const submittedNotes = noteEditRef.current.draft;
    const saveNotes = submittedNotes && (!onlyFailed || (retryKeys ? retryKeys.has('detailNotes') : 'detailNotes' in failedUpdatesRef.current));
    batchDispatchingRef.current = true;
    let didQueue = false;
    try {
      if (saveNotes && isTaskWorkbenchUnplacedTask(useWbsStore.getState().nodes[nodeId])) {
        // Both unplaced persistence paths write the entire task. One combined
        // write avoids an older notes write overwriting the metadata batch.
        didQueue = persistTaskUpdates({
          ...updates,
          detailNotes: submittedNotes,
          description: submittedNotes[0]?.content || '',
        }, { skipActivity: onlyFailed });
      } else {
        if (Object.keys(updates).length > 0) didQueue = persistTaskUpdates(updates, { skipActivity: onlyFailed }) || didQueue;
        if (saveNotes) didQueue = persistNoteDraft({
          detailNotes: submittedNotes,
          description: submittedNotes[0]?.content || '',
        }) || didQueue;
      }
    } finally {
      batchDispatchingRef.current = false;
    }
    if (Object.keys(failedUpdatesRef.current).length > 0 && pendingPersistCountRef.current === 0) return 'blocked' as const;
    return didQueue ? 'queued' as const : 'clean' as const;
  }, [nodeId, persistNoteDraft, persistTaskUpdates, validateDraft]);

  const retryFailedSave = React.useCallback(() => {
    if (composingRef.current || compositionFlushPendingRef.current) {
      deferredIntentRef.current = 'retry';
      return;
    }
    if (pendingPersistCountRef.current > 0 || isDiscarding || !validateDraft()) return;
    if (Object.keys(failedUpdatesRef.current).length === 0) return;
    const retryKeys = new Set(Object.keys(failedUpdatesRef.current));
    const unknown = { ...unknownUpdatesRef.current };
    if (Object.keys(unknown).length > 0 && node) {
      // Resolve an uncertain provider write before deciding whether it is safe to resend.
      setIsClosePending(true);
      const fieldsAtReadStart = taskDetailsFieldsFromNode(useWbsStore.getState().nodes[nodeId]);
      let timer: number | undefined;
      void Promise.race([
        readCanonicalTask(node, sessionOwnerRef.current.accountId),
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(() => reject(new Error('readback unavailable')), TASK_DETAILS_PERSISTENCE_READBACK_DEADLINE_MS);
        }),
      ]).finally(() => { if (timer !== undefined) window.clearTimeout(timer); }).then(readback => {
        if (!ownsLiveTask()) {
          setIsClosePending(false);
          return;
        }
        setIsClosePending(false);
        if (!readback || readback.isArchived || readback.workspaceId !== node.workspaceId || readback.boardId !== node.boardId) {
          setFieldConflict(true);
          return;
        }
        const classification = classifyTaskDetailsReadback(unknown, fieldEditRef.current.baseline, taskDetailsFieldsFromNode(readback));
        const confirmedKeys: string[] = [...classification.confirmed];
        let noteConflict = false;
        if (unknown.detailNotes) {
          const submittedSnapshot: TaskNotePersistenceSnapshot = {
            detailNotes: unknown.detailNotes,
            description: unknown.description ?? null,
          };
          const readbackSnapshot = taskNoteSnapshotFromNode(readback);
          if (areTaskNoteSnapshotsEqual(submittedSnapshot, readbackSnapshot)) {
            confirmedKeys.push('detailNotes', 'description');
          } else if (!areTaskNoteSnapshotsEqual(noteEditRef.current.baselineSnapshot, readbackSnapshot)) {
            noteConflict = true;
          }
        }
        useWbsStore.setState(state => {
          const latest = state.nodes[nodeId];
          if (!latest || !ownsLiveTask()) return {};
          const fields = taskDetailsFieldsFromNode(latest);
          const readbackFields = taskDetailsFieldsFromNode(readback);
          const patch: Partial<TaskNode> = {};
          for (const key of TASK_DETAILS_DRAFT_KEYS) {
            if (Object.prototype.hasOwnProperty.call(unknown, key)
              && taskDetailsFieldEqual(key, fields[key], (unknown as Record<string, unknown>)[key])) {
              (patch as Record<string, unknown>)[key] = readbackFields[key];
            }
          }
          if (['startDate', 'endDate', 'isDurationLocked'].some(key => key in fieldEditRef.current.draft)) {
            for (const key of ['startDate', 'endDate', 'isDurationLocked'] as const) {
              if (!(key in fieldEditRef.current.draft) && taskDetailsFieldEqual(key, fields[key], fieldsAtReadStart[key])) {
                (patch as Record<string, unknown>)[key] = readbackFields[key];
              }
            }
          }
          if ('assigneeIds' in patch) patch.assigneeId = patch.assigneeIds?.[0];
          if (unknown.detailNotes && (areTaskNoteSnapshotsEqual(taskNoteSnapshotFromNode(latest), {
            detailNotes: unknown.detailNotes,
            description: unknown.description ?? null,
          }) || areTaskNoteSnapshotsEqual(taskNoteSnapshotFromNode(latest), noteEditRef.current.baselineSnapshot))) {
            patch.detailNotes = readback.detailNotes;
            patch.description = readback.description;
          }
          return { nodes: { ...state.nodes, [nodeId]: { ...latest, ...patch } } };
        });
        if (confirmedKeys.length > 0) {
          const confirmed = Object.fromEntries(confirmedKeys.map(key => [key, (unknown as Record<string, unknown>)[key]])) as Partial<TaskNode>;
          const operationId = `task-details-readback-${Date.now()}`;
          const version = ++persistVersionRef.current;
          confirmedKeys.forEach(key => { latestPersistVersionByKeyRef.current[key] = version; });
          pendingPersistOperationsRef.current.add(operationId);
          pendingPersistCountRef.current += 1;
          settlePersistence(node.id, operationId, 'persisted', confirmed, version, confirmedKeys);
        }
        if (classification.conflicts.length > 0 || noteConflict) {
          setFieldConflict(classification.conflicts.length > 0);
          return;
        }
        savePendingTaskDetails(true, retryKeys, readback);
      }, () => { setIsClosePending(false); });
      return;
    }
    savePendingTaskDetails(true);
  }, [isDiscarding, node, nodeId, ownsLiveTask, savePendingTaskDetails, settlePersistence, validateDraft]);

  const handleSaveDetails = React.useCallback(() => {
    if (composingRef.current || compositionFlushPendingRef.current) {
      deferredIntentRef.current = 'save';
      return;
    }
    if (pendingPersistCountRef.current > 0 || isDiscarding || isClosePending) return;
    if (Object.keys(failedUpdatesRef.current).length > 0) {
      return;
    }
    if (savePendingTaskDetails() === 'clean') showSaveFeedback();
  }, [isClosePending, isDiscarding, savePendingTaskDetails, showSaveFeedback]);

  const requestTransition = React.useCallback((transition: TaskDetailsTransition) => {
    if (pendingTransitionRef.current || isClosePending || isDiscarding) return;
    if (composingRef.current || compositionFlushPendingRef.current) {
      deferredIntentRef.current = transition;
      return;
    }
    blockedTransitionRef.current = transition;
    if (meetingDiscussion.trim() && !window.confirm('會議討論尚未加入會議紀錄。離開會捨棄這段內容，確定繼續？')) {
      blockedTransitionRef.current = null;
      return;
    }
    if (!validateDraft()) {
      return;
    }

    pendingTransitionRef.current = transition;
    setIsClosePending(true);
    if (pendingPersistCountRef.current > 0) return;

    // A rejected write is an explicit recovery state.  Navigation must not
    // silently retry a failed draft; the user must press the visible Retry
    // control first, then request the transition again.
    if (Object.keys(failedUpdatesRef.current).length > 0) {
      pendingTransitionRef.current = null;
      setIsClosePending(false);
      const isUnknown = Object.keys(unknownUpdatesRef.current).length > 0;
      setSaveState(isUnknown ? 'unknown' : 'error');
      return;
    }
    const draftResult = savePendingTaskDetails();
    if (draftResult === 'blocked') {
      pendingTransitionRef.current = null;
      setIsClosePending(false);
      return;
    }

    if (draftResult === 'clean' && pendingPersistCountRef.current === 0) {
      pendingTransitionRef.current = null;
      runTransition(transition);
    }
  }, [isClosePending, isDiscarding, meetingDiscussion, runTransition, savePendingTaskDetails, validateDraft]);

  resumeIntentRef.current = () => {
    const intent = deferredIntentRef.current;
    deferredIntentRef.current = null;
    if (intent === 'save') handleSaveDetails();
    else if (intent === 'retry') retryFailedSave();
    else if (intent) requestTransition(intent);
  };

  const handleCompositionEnd = React.useCallback(() => {
    composingRef.current = false;
    compositionFlushPendingRef.current = true;
    if (intentTimerRef.current !== null) window.clearTimeout(intentTimerRef.current);
    intentTimerRef.current = window.setTimeout(() => {
      // Capture runs before Lexical's composition handler. Give that handler's
      // queued DOM reconciliation and React update a full turn before saving.
      intentTimerRef.current = window.setTimeout(() => {
        intentTimerRef.current = null;
        compositionFlushPendingRef.current = false;
        setIsComposing(false);
        resumeIntentRef.current();
      }, 0);
    }, 0);
  }, []);

  React.useLayoutEffect(() => {
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
    const handleDetailsAction = (event: Event) => {
      const run = (event as CustomEvent<{ run?: () => void }>).detail?.run;
      if (typeof run === 'function') requestTransition({ kind: 'action', run });
    };
    document.addEventListener(TASK_DETAILS_ACTION_EVENT, handleDetailsAction);
    return () => {
      document.removeEventListener(TASK_DETAILS_NAVIGATE_EVENT, handleDetailsNavigate);
      document.removeEventListener(TASK_DETAILS_ACTION_EVENT, handleDetailsAction);
    };
  }, [requestTransition]);

  const handleClose = React.useCallback(() => {
    requestTransition({ kind: 'close' });
  }, [requestTransition]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing || composingRef.current || event.keyCode === 229) return;
      if (event.target instanceof Element && event.target.closest('[data-task-details-title-input="true"]')) return;
      // Let dnd-kit cancel an active keyboard drag before the modal owns Escape.
      // The sortable source exposes aria-pressed while the sensor is active;
      // keeping this event in the DnD layer prevents Escape from closing the
      // surrounding details surface.
      const hasActiveKeyboardTaskDrag = Boolean(document.querySelector(
        '[data-task-details-modal="true"] [data-task-surface-source="true"][aria-pressed="true"]',
      ));
      if (hasActiveKeyboardTaskDrag) return;
      const hasNestedOverlay = Boolean(document.querySelector(
        '[data-tag-picker-panel], .global-dialog-content, [data-task-note-toolbar-popover="true"], [data-global-context-menu="true"]',
      ));
      if (hasNestedOverlay) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleClose]);

  React.useEffect(() => () => {
    clearSaveFeedbackTimer();
    if (intentTimerRef.current !== null) window.clearTimeout(intentTimerRef.current);
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

  // GlobalContextMenu mounts a separate editing session for each task ID.
  React.useLayoutEffect(() => {
    persistenceOwnerNodeIdRef.current = currentNodeId;
    return () => { persistenceOwnerNodeIdRef.current = undefined; };
  }, [currentNodeId]);

  React.useEffect(() => {
    if (!node || !canEditTask) return;
    if (pendingTitleEditNodeId !== node.id) return;

    const initialValue = pendingTitleEditInitialValue;
    if (initialValue !== null) updateFieldDraft({ title: initialValue });
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
    updateFieldDraft,
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

  const ancestorPath = React.useMemo<TaskMapAncestor[]>(() => {
    if (!node) return [];
    if (!trackingReference) {
      return buildAncestorPath(node, nodes).map(task => ({ task, placementId: primaryPlacementId(task.id) }));
    }

    const path: TaskMapAncestor[] = [];
    const visited = new Set([trackingReference.id]);
    const references = new Map(trackingReferences
      .filter(reference => !reference.removedAt && reference.boardId === trackingReference.boardId)
      .map(reference => [reference.id, reference]));
    let placementId = trackingReference.parentPlacementId;
    while (placementId && !visited.has(placementId)) {
      visited.add(placementId);
      const reference = references.get(placementId);
      const taskId = isPrimaryPlacementId(placementId)
        ? placementId.slice(PRIMARY_PLACEMENT_PREFIX.length)
        : reference?.taskId;
      const task = taskId ? nodes[taskId] : undefined;
      if (!task || task.isArchived || (!reference && task.boardId !== trackingReference.boardId)) break;
      path.push({ task, placementId, trackingReferenceId: reference?.id });
      placementId = reference
        ? reference.parentPlacementId
        : task.parentId ? primaryPlacementId(task.parentId) : null;
    }
    return path.reverse();
  }, [node, nodes, trackingReference, trackingReferences]);

  if (!node || currentAccountId !== sessionOwnerRef.current.accountId) return null;

  const taskMapPlacementId = trackingReference?.id || primaryPlacementId(node.id);
  const navigateToAncestor = (ancestor: TaskMapAncestor) => {
    requestTransition({
      kind: 'navigate',
      taskId: ancestor.task.id,
      trackingReferenceId: ancestor.trackingReferenceId,
      placementId: taskMapPlacementId,
    });
  };

  const durationDays = (startDate && endDate && dayjs(startDate).isValid() && dayjs(endDate).isValid())
    ? dayjs(endDate).diff(dayjs(startDate), 'day')
    : '';
  const durationInputValue = durationDraft ?? (durationDays === '' ? '' : String(durationDays));

  const updateDate = (field: 'startDate' | 'endDate', value: string, preserveDurationDraft = false) => {
    if (!canEditTask || pendingPersistCountRef.current > 0 || isClosePending || isDiscarding) return;
    if (!preserveDurationDraft) setDurationDraft(null);
    const nextStart = field === 'startDate' ? value : startDate;
    const shiftedEnd = field === 'startDate' && draftNode.isDurationLocked && durationDays !== '' && value
      ? dayjs(value).add(durationDays as number, 'day').format('YYYY-MM-DD')
      : null;
    const nextEnd = field === 'endDate' ? value : shiftedEnd ?? endDate;

    if (nextStart && nextEnd && nextStart > nextEnd) {
      window.alert('開始日期不能晚於結束日期。');
      return;
    }

    const updates = { [field]: value } as Partial<typeof node>;

    if (shiftedEnd) updates.endDate = shiftedEnd;
    
    updateFieldDraft(updates);
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
    if (!canAssignTask || isClosePending || isDiscarding) return;
    updateFieldDraft({
      assigneeIds: primaryIds,
      collaboratorIds,
    });
  };

  const handleTitleChange = (value: string) => {
    if (!canEditTask || isClosePending || isDiscarding) return;
    updateFieldDraft({ title: value });
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || composingRef.current || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditTask || pendingPersistCountRef.current > 0 || isClosePending || isDiscarding) return;
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
    if (!canEditTask || isClosePending || isDiscarding) return;
    if (!draftNode.isDurationLocked && (!startDate || !dayjs(startDate).isValid())) {
      window.alert('防呆機制：請先設定開始日期，再固定工期。');
      return;
    }
    updateFieldDraft({ isDurationLocked: !draftNode.isDurationLocked });
  };

  const editNotes = (update: (current: TaskDetailNote[]) => TaskDetailNote[]) => {
    if (!canEditTask || isClosePending || pendingPersistCountRef.current > 0 || isDiscarding) return;
    markDraftDirty();
    updateNoteEditState(current => {
      const next = update(current.draft ?? current.source);
      return { ...current, draft: areDetailNotesEqual(next, current.source) ? null : next };
    });
  };

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    editNotes(current => current.map(note => note.id === noteId ? { ...note, ...updates } : note));
  };

  const addNote = () => {
    editNotes(current => [...current, createNote(current.length + 1)]);
  };

  const deleteNote = (noteId: string) => {
    if (!canEditTask || isClosePending) return;
    const note = notes.find((item) => item.id === noteId);
    const noteLabel = note?.title?.trim() || '此備註欄';
    const isPurpose = noteId === TASK_PURPOSE_NOTE_ID;
    const confirmed = window.confirm(
      isPurpose
        ? `確定清空「${noteLabel}」的內容？`
        : `確定刪除「${noteLabel}」？`
    );
    if (!confirmed) return;

    if (isPurpose) setPurposeEditorReset(current => current + 1);
    editNotes(current => isPurpose
      ? current.map(item => item.id === noteId ? createNote(1) : item)
      : current.filter(item => item.id !== noteId));
  };

  const loadLatestNotes = () => {
    if (pendingPersistCountRef.current > 0) return;
    const latest = getLatestNotes();
    const latestSnapshot = getLatestNoteSnapshot();
    if (!latest || !latestSnapshot || !window.confirm('載入最新備註會捨棄這個視窗裡的備註草稿。確定繼續？')) return;
    for (const key of ['detailNotes', 'description'] as const) {
      delete failedUpdatesRef.current[key];
      delete failedUpdateVersionsRef.current[key];
      delete unknownUpdatesRef.current[key];
      delete unknownUpdateVersionsRef.current[key];
    }
    updateNoteEditState(current => ({
      ownerNodeId: current.ownerNodeId,
      source: latest,
      baseline: latest,
      baselineSnapshot: latestSnapshot,
      draft: null,
      editorRevision: current.editorRevision + 1,
    }));
    setSaveState(Object.keys(unknownUpdatesRef.current).length > 0 ? 'unknown'
      : Object.keys(failedUpdatesRef.current).length > 0 ? 'error' : 'idle');
  };

  const handleAppendMeetingDiscussion = () => {
    if (!canEditTask || pendingPersistCountRef.current > 0 || isClosePending || isDiscarding || composingRef.current) return;
    if (!meetingQuickNotes.composerAvailable) {
      setMeetingDiscussionError(meetingQuickNotes.availabilityMessage || '目前任務無法載入會議紀錄。');
      return;
    }
    const submissionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `quick_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = appendTaskDiscussionToMeetingDraft({
      taskId: node.id,
      taskTitle: node.title || node.id,
      taskBoardId: node.boardId,
      text: meetingDiscussion,
      submissionId,
      occurredAt: Date.now(),
    });
    if (result.status === 'appended' || result.status === 'noop') {
      setMeetingDiscussion('');
      setMeetingDiscussionError(null);
      return;
    }
    const messages: Record<typeof result.reason, string> = {
      'not-meeting': '目前不在會議模式。',
      'invalid-input': '請輸入補記內容。',
      'invalid-metadata': '補記資料無法辨識，請先儲存或復原草稿。',
      'invalid-task': '目前任務無法加入補記。',
      'unsupported-task-owner': '請先將任務放入目前會議的看板，再新增會議紀錄。',
      'meeting-board-mismatch': '此任務屬於其他看板；請在原看板的會議中新增紀錄。',
    };
    setMeetingDiscussionError(messages[result.reason]);
  };

  const discardDraft = () => {
    if (pendingPersistCountRef.current > 0 || isClosePending || isDiscarding || composingRef.current || compositionFlushPendingRef.current) return;
    const hasUnknown = Object.keys(unknownUpdatesRef.current).length > 0;
    if (!window.confirm(hasUnknown
      ? '確定捨棄本機草稿？未確認的變更可能已儲存，重新開啟時會載入最新資料。'
      : '確定捨棄這個視窗中的未儲存草稿？已成功儲存的欄位會保留。')) return;
    setIsDiscarding(true);
    localDraftWriteRef.current += 1;
    const restored = localRestoredRef.current;
    localDraftQueueRef.current = localDraftQueueRef.current.catch(() => undefined)
      .then(() => discardTaskDetailsLocalDraft(localWriterRef.current))
      .then(() => restored ? discardTaskDetailsLocalDraft(restored.key, restored.savedAt) : undefined);
    localRestoredRef.current = null;
    setLocalDraftStatus(null);
    try {
      let restoredStatus = false;
      if (ownsLiveTask()) {
        useWbsStore.setState(state => {
          const latest = state.nodes[nodeId];
          if (!latest) return {};
          const canonical = taskDetailsFieldsFromNode(latest);
          const patch: Partial<TaskNode> = {};
          for (const key of TASK_DETAILS_DRAFT_KEYS) {
            if (Object.prototype.hasOwnProperty.call(failedUpdatesRef.current, key)
              && taskDetailsFieldEqual(key, canonical[key], (failedUpdatesRef.current as Record<string, unknown>)[key])) {
              (patch as Record<string, unknown>)[key] = fieldEditRef.current.baseline[key];
            }
          }
          if ('assigneeIds' in patch) patch.assigneeId = patch.assigneeIds?.[0];
          restoredStatus = 'status' in patch;
          const failedNotes = failedUpdatesRef.current.detailNotes;
          if (failedNotes && areTaskNoteSnapshotsEqual(taskNoteSnapshotFromNode(latest), {
            detailNotes: failedNotes,
            description: failedUpdatesRef.current.description ?? null,
          })) {
            patch.detailNotes = noteEditRef.current.baselineSnapshot.detailNotes;
            patch.description = noteEditRef.current.baselineSnapshot.description ?? undefined;
          }
          // Only undo our still-matching optimistic fields. Never replace a
          // node, resurrect a deleted task, or rewrite another session's data.
          return Object.keys(patch).length > 0 ? { nodes: { ...state.nodes, [nodeId]: { ...latest, ...patch } } } : {};
        });
        if (restoredStatus) useWbsStore.getState().recalculateAncestorStatus(nodeId);
      }
      const latest = useWbsStore.getState().nodes[nodeId] ?? node;
      fieldEditRef.current = { baseline: taskDetailsFieldsFromNode(latest), draft: {} };
      setFieldEdit(fieldEditRef.current);
      const latestNotes = getTaskDetailNotesWithCanonicalPurpose(latest);
      updateNoteEditState(current => ({
        ...current,
        source: latestNotes,
        baseline: latestNotes,
        baselineSnapshot: taskNoteSnapshotFromNode(latest),
        draft: null,
        editorRevision: current.editorRevision + 1,
      }));
      failedUpdatesRef.current = {};
      failedUpdateVersionsRef.current = {};
      unknownUpdatesRef.current = {};
      unknownUpdateVersionsRef.current = {};
      setFieldConflict(false);
      setMeetingDiscussion('');
      setMeetingDiscussionError(null);
      setDurationDraft(null);
      setSaveState('idle');
      const transition = blockedTransitionRef.current;
      blockedTransitionRef.current = null;
      if (transition) runTransition(transition);
    } finally {
      setIsDiscarding(false);
    }
  };

  const { startLocked, endLocked } = getNodeLockStatus(node.id, dependencies);
  const submissionPending = saveState === 'saving' || isClosePending || isDiscarding;
  const isStartDateReadOnly = !canEditTask || startLocked || submissionPending;
  const isEndDateReadOnly = !canEditTask || endLocked || Boolean(draftNode.isDurationLocked) || submissionPending;
  const currentStatus = normalizeManualTaskStatus(draftNode.status);
  const isDueToday = currentStatus !== 'completed' && !!endDate && dayjs(endDate).isSame(dayjs(), 'day');
  const closeButtonTitle = saveState === 'error' || saveState === 'unknown'
    ? '重試確認儲存後關閉'
    : saveState === 'saving' || isClosePending
      ? '儲存完成後關閉'
      : canPersistTask
        ? '儲存變更並關閉'
      : '關閉';
  const taskDetailsHasLocalChanges = Boolean(
    Object.keys(fieldEdit.draft).length > 0
      || noteEdit.draft
      || meetingDiscussion.trim()
      || isComposing
      || saveState === 'saving'
      || saveState === 'error'
      || saveState === 'unknown'
  );
  const taskMapDependencies = !trackingReference || trackingReference.boardId === node.boardId
    ? dependencies.flatMap(dependency => {
      const { id, fromId, fromSide, toId, toSide } = dependency;
      if (fromId !== node.id && toId !== node.id) return [];
      const from = nodes[fromId];
      const to = nodes[toId];
      if (!from || !to || from.isArchived || to.isArchived || from.boardId !== node.boardId || to.boardId !== node.boardId) return [];
      const label = (task: TaskNode, side: 'start' | 'end') =>
        `${task.id === node.id ? '本任務' : task.title || '未命名任務'}・${side === 'start' ? '開始' : '結束'}`;
      return [{ id, from: label(from, fromSide), to: label(to, toSide) }];
    })
    : [];

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
      onCompositionStartCapture={() => {
        composingRef.current = true;
        setIsComposing(true);
        if (intentTimerRef.current !== null) window.clearTimeout(intentTimerRef.current);
      }}
      onCompositionEndCapture={handleCompositionEnd}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          handleSaveDetails();
        }
      }}
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
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-2 gap-y-1 px-4 pt-2 pb-0"
          data-task-details-header="true"
        >
          <div className="col-start-1 row-start-1 min-w-0" data-task-details-title-row="true">
            <div className="flex min-w-0 flex-col gap-0.5">
              {canEditTask ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  disabled={submissionPending}
                  data-task-details-title-input="true"
                  aria-label="編輯任務名稱"
                  className="h-9 w-full min-w-0 border-0 bg-transparent px-2 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-200"
                />
              ) : (
                <p className="truncate text-sm font-semibold text-slate-900">
                  {titleValue}
                </p>
              )}
            </div>
          </div>
          {canPersistTask || taskDetailsHasLocalChanges ? (
            <div
              className="col-start-2 row-start-1 flex h-9 min-w-[7.5rem] shrink-0 items-center justify-end text-xs font-medium"
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
                  {saveState === 'unknown' ? (localRestoredRef.current ? '本機草稿待確認，確認後同步' : '狀態未確認，請重試')
                    : localDraftStatus === 'local' ? '已存本機，同步失敗，請重試' : '儲存失敗，請重試'}
                </button>
              ) : taskDetailsHasLocalChanges ? <span className="text-slate-500" data-task-details-local-status={localDraftStatus}>
                {localDraftStatus === 'local' ? '已存本機，待儲存至雲端'
                  : localDraftStatus === 'failed' ? '本機保存失敗，請保留此頁' : '本機保存中…'}
              </span> : null}
              {taskDetailsHasLocalChanges && !submissionPending ? (
                <button type="button" onClick={() => { void discardDraft(); }} data-task-details-discard="true" className="ml-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
                  捨棄草稿
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="group relative col-start-3 row-start-1 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={isClosePending || isDiscarding}
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

        <div ref={bodyRef} className="flex-1 overflow-auto px-4 pt-0 pb-4" data-task-details-scroll-surface="true">
          <section className="pb-2" data-task-details-meta-section="true">
            <div
              className="grid gap-y-3 lg:grid-cols-[5.5rem_24rem_minmax(0,1fr)] lg:items-end lg:gap-x-3 lg:gap-y-2"
              data-task-details-meta-grid="true"
            >
              <div
                className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 lg:col-span-full"
                data-task-details-mobile-meta="true"
              >
                <div
                  className="space-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start md:gap-x-3 md:gap-y-2 md:space-y-0 lg:grid lg:grid-cols-[5.5rem_24rem_minmax(0,1fr)] lg:items-end lg:gap-x-3 lg:gap-y-2"
                  data-task-details-mobile-meta-controls="true"
                >
              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-date-grid="true"
                data-task-details-schedule-row="true"
              >
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_auto] items-end gap-2 lg:col-start-2 lg:row-start-1 lg:grid-cols-[8rem_2rem_8rem_auto] lg:gap-x-0 lg:gap-y-1"
                  data-task-details-schedule-controls="true"
                  data-task-details-mobile-schedule-controls="true"
                >
                  <span className="col-span-3 block text-xs font-medium text-slate-500" data-task-details-meta-label-text="true">
                    日期
                  </span>
                  <div className="col-start-4 flex min-w-0 items-end gap-1.5 text-xs font-medium text-slate-500">
                    <span data-task-details-meta-label-text="true">工期</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(draftNode.isDurationLocked)}
                      aria-label="固定工期"
                      disabled={!canEditTask || submissionPending}
                      onClick={handleToggleDurationLock}
                      title={draftNode.isDurationLocked
                        ? '固定工期：ON'
                        : startDate && dayjs(startDate).isValid()
                          ? '固定工期：OFF'
                          : '請先設定開始日期，再固定工期'}
                      className={`relative inline-flex h-5 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${draftNode.isDurationLocked ? 'bg-primary' : 'bg-slate-300'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute text-[8px] font-bold leading-none text-white ${draftNode.isDurationLocked ? 'left-1.5' : 'right-1.5'}`}
                      >
                        {draftNode.isDurationLocked ? 'ON' : 'OFF'}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`absolute left-0.5 top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${draftNode.isDurationLocked ? 'translate-x-7' : ''}`}
                      />
                    </button>
                  </div>
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
                          max={!draftNode.isDurationLocked ? (endDate || undefined) : undefined}
                          readOnly={isStartDateReadOnly}
                          className={`task-details-date-native-input h-8 w-full min-w-0 rounded-md px-2 text-sm text-transparent outline-none transition focus:ring-2 lg:w-[8rem] lg:flex-none ${
                            isStartDateReadOnly
                              ? 'border border-dashed border-slate-300 bg-slate-50 pointer-events-none'
                              : 'border border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-y-0 left-2 ${isStartDateReadOnly ? 'right-8' : 'right-5'} flex items-center whitespace-nowrap text-[11px] font-normal sm:text-sm ${isStartDateReadOnly ? 'text-slate-500' : 'text-slate-700'}`}
                          data-task-details-mobile-date-value="true"
                        >
                          {formatTaskDateForDisplay(startDate)}
                        </span>
                        {isStartDateReadOnly ? (
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400" role="img" aria-label="開始日期已鎖定">
                            <Lock size={14} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    </label>

                    <span
                      className="col-start-2 flex h-8 w-full shrink-0 items-center justify-center text-sm font-semibold text-slate-300"
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
                          readOnly={isEndDateReadOnly}
                          className={`task-details-date-native-input h-8 w-full min-w-0 rounded-md rounded-r-none border-r-0 px-2 text-sm text-transparent outline-none transition focus:ring-2 lg:w-[8rem] lg:flex-none ${
                            isEndDateReadOnly
                              ? 'border border-dashed border-slate-300 bg-slate-50 pointer-events-none'
                              : isDueToday
                              ? 'border border-orange-300 bg-orange-50 sm:text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                              : 'border border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-y-0 left-2 ${isEndDateReadOnly ? 'right-8' : 'right-5'} flex items-center whitespace-nowrap text-[11px] font-normal sm:text-sm ${isEndDateReadOnly ? 'text-slate-500' : 'text-slate-700'}`}
                          data-task-details-mobile-date-value="true"
                        >
                          {formatTaskDateForDisplay(endDate)}
                        </span>
                        {isEndDateReadOnly ? (
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400" role="img" aria-label="結束日期已鎖定">
                            <Lock size={14} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                  </div>
                  <span
                    className={`col-start-4 ml-0 inline-flex h-8 w-full min-w-0 shrink-0 items-center overflow-hidden rounded-l-none rounded-r-md border ${
                      draftNode.isDurationLocked
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-slate-200 bg-white'
                    }`}
                    title={draftNode.isDurationLocked ? '固定工期：自動推算結束日期' : '自動計算工期：日期獨立計算'}
                    data-task-details-duration-inline="true"
                    data-task-details-mobile-duration="true"
                  >
                    <input
                      type="number"
                      min="0"
                      value={durationInputValue}
                      onChange={handleDurationChange}
                      onBlur={handleDurationBlur}
                      placeholder="—"
                      disabled={!canEditTask || !draftNode.isDurationLocked || submissionPending}
                      aria-label="工期天數"
                      className={`h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 text-sm text-center outline-none transition focus:ring-2 focus:ring-inset focus:ring-blue-100 ${
                        !draftNode.isDurationLocked
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
                          if (canEditTask && !submissionPending) updateFieldDraft({ status: event.target.value as TaskStatus });
                        }}
                        disabled={!canEditTask || submissionPending}
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
                        node={draftNode}
                        options={assigneeOptions}
                        membersLoading={membersLoading}
                        disabled={!canAssignTask || submissionPending}
                        fullSummary
                        showIcon={false}
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
                        selectedTagIds={draftNode.tagIds || []}
                        onChange={(tagIds) => { if (canEditTask && !submissionPending) updateFieldDraft({ tagIds }); }}
                        disabled={!canEditTask || submissionPending}
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

          <section className="pt-2" data-task-detail-notes-section="true">
            {fieldConflict ? (
              <div role="alert" data-task-details-fields-conflict="true" className="mb-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                任務欄位已在其他地方更新。你的草稿仍保留；請複製要保留的內容後，使用「捨棄草稿」載入最新任務。
              </div>
            ) : null}
            {notesConflict ? (
              <div role="alert" data-task-details-notes-conflict="true" className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                <span>備註已在其他地方更新。請先複製要保留的草稿，再載入最新備註。</span>
                <button type="button" onClick={loadLatestNotes} disabled={saveState === 'saving'} className="font-medium underline">
                  載入最新備註
                </button>
              </div>
            ) : null}
            <div className="grid gap-2" data-task-detail-notes-grid="true">
              {notes.map((note, noteIndex) => (
                <TaskDetailNoteField
                  key={`${nodeId}:${note.id}:${noteEdit.editorRevision}:${note.id === TASK_PURPOSE_NOTE_ID ? purposeEditorReset : 0}`}
                  canEdit={canEditTask && !submissionPending}
                  accountId={currentAccountId}
                  taskId={node.id}
                  isDescription={note.id === 'note_default'}
                  note={note}
                  titleEditable={noteIndex > 0 || note.id !== 'note_default'}
                  onAdd={addNote}
                  onDelete={() => deleteNote(note.id)}
                  onSave={handleSaveDetails}
                  onUpdate={updates => updateNote(note.id, updates)}
                />
              ))}
            </div>
          </section>

          <TaskMeetingQuickNoteSection
            taskId={node.id}
            taskTitle={node.title || node.id}
            isMeetingMode={isMeetingMode && !isMeetingRecordUnavailable}
            composerAvailable={isMeetingMode && !isMeetingRecordUnavailable && meetingQuickNotes.composerAvailable}
            availabilityMessage={isMeetingMode && !isMeetingRecordUnavailable
              ? meetingQuickNotes.availabilityMessage
              : null}
            canEdit={canEditTask && !meetingQuickNotes.composerBlocked && !submissionPending}
            entries={meetingQuickNotes.entries}
            loading={meetingQuickNotes.loading}
            error={meetingQuickNotes.error}
            discussion={meetingDiscussion}
            appendError={meetingDiscussionError}
            onDiscussionChange={(value) => {
              if (submissionPending) return;
              setMeetingDiscussion(value);
              if (meetingDiscussionError) setMeetingDiscussionError(null);
            }}
            onAppend={handleAppendMeetingDiscussion}
            onRetry={() => { void meetingQuickNotes.refresh(); }}
          />

          <TaskDetailsSubtaskSection
            node={node}
            trackingReference={trackingReference}
            bodyRef={bodyRef}
            ancestorPath={ancestorPath}
            dateDependencies={taskMapDependencies}
            navigationPending={submissionPending}
            onNavigateToAncestor={onNavigateToTask ? navigateToAncestor : undefined}
            onBack={canGoBack ? () => requestTransition({ kind: 'back' }) : undefined}
            onForward={canGoForward ? () => requestTransition({ kind: 'forward' }) : undefined}
            canCreateTask={placementPermissions.canCreateTask && !trackingReference}
            onCreateChild={parentId => requestTransition({ kind: 'create-child', parentId })}
            onOpenDetails={(taskId, targetTrackingReferenceId, placementId) => requestTransition({
              kind: 'navigate',
              taskId,
              trackingReferenceId: targetTrackingReferenceId,
              placementId,
            })}
          />

        </div>
      </div>
    </div>
  );
};
