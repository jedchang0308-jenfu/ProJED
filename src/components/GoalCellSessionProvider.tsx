import React from 'react';
import { useMemberStore } from '../store/useMemberStore';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore, type UpdateNodeDispatchResult } from '../store/useWbsStore';
import type { TaskDetailNote, TaskNode } from '../types';
import {
  areTaskNoteRichContentsEqual,
  buildTaskPurposeUpdates,
  getTaskPurposeNote,
} from '../utils/taskNoteRichContent';

type GoalCellSessionStatus = 'idle' | 'editing' | 'saving' | 'error' | 'unknown';

export type GoalCellSession = Readonly<{
  status: GoalCellSessionStatus;
  cellKey?: string;
  taskId?: string;
  boardId?: string;
  workspaceId?: string;
  originalNote?: TaskDetailNote;
  draftNote?: TaskDetailNote;
  submittedNote?: TaskDetailNote;
  error?: string;
  sourceVisible: boolean;
  attemptId?: string;
}>;

type GoalCellSessionContextValue = Readonly<{
  session: GoalCellSession;
  beginEditing: (node: TaskNode) => void;
  updateDraft: (updates: Pick<TaskDetailNote, 'content' | 'richContent'>) => void;
  commit: (intent: 'enter' | 'blur' | 'save') => void;
  cancel: () => void;
  retry: () => void;
  discard: () => void;
  setSourceVisible: (taskId: string, visible: boolean) => void;
  isCellActive: (taskId: string, column: 'description' | 'meeting') => boolean;
  getDescriptionAnchor: (taskId: string, fallback: string | null | undefined) => string | null | undefined;
}>;

const IDLE_SESSION: GoalCellSession = { status: 'idle', sourceVisible: false };
const SESSION_TIMEOUT_MS = 10_000;

const makeCellKey = (taskId: string) => `description:${taskId}`;

const areNotesEqual = (left: TaskDetailNote, right: TaskDetailNote) => (
  left.id === right.id
  && left.title === right.title
  && left.content === right.content
  && areTaskNoteRichContentsEqual(left.richContent, right.richContent)
);

const canEditCanonicalTask = (node: TaskNode): boolean => {
  const memberState = useMemberStore.getState();
  const access = memberState.currentBoardAccess;
  if (memberState.loading || !access || access.boardId !== node.boardId) return false;
  return access.capabilities.includes('edit_task');
};

const formatSaveError = (error: unknown) => (
  error instanceof Error && error.message ? error.message : '任務目的儲存失敗。'
);

export const GoalCellSessionContext = React.createContext<GoalCellSessionContextValue | null>(null);

export const useGoalCellSession = (): GoalCellSessionContextValue => {
  const context = React.useContext(GoalCellSessionContext);
  if (!context) throw new Error('useGoalCellSession must be used inside GoalCellSessionProvider');
  return context;
};

export const GoalCellSessionProvider: React.FC<React.PropsWithChildren<{ accountId: string | null }>> = ({ accountId, children }) => {
  const [session, setSession] = React.useState<GoalCellSession>(IDLE_SESSION);
  const sessionRef = React.useRef(session);
  const attemptRef = React.useRef<{ id: string; timer: number | null } | null>(null);
  const attemptSequenceRef = React.useRef(0);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    if (accountId) return;
    const attempt = attemptRef.current;
    if (attempt && attempt.timer !== null) window.clearTimeout(attempt.timer);
    attemptRef.current = null;
    setSession(IDLE_SESSION);
  }, [accountId]);

  const clearAttempt = React.useCallback(() => {
    const attempt = attemptRef.current;
    if (attempt && attempt.timer !== null) window.clearTimeout(attempt.timer);
    attemptRef.current = null;
  }, []);

  const settleAsError = React.useCallback((attemptId: string, error: unknown) => {
    const current = sessionRef.current;
    if (current.attemptId !== attemptId || !attemptRef.current || attemptRef.current.id !== attemptId) return;
    clearAttempt();
    setSession({
      ...current,
      status: 'error',
      error: formatSaveError(error),
      submittedNote: current.draftNote,
    });
  }, [clearAttempt]);

  const settleAsSaved = React.useCallback((attemptId: string) => {
    const current = sessionRef.current;
    if (current.attemptId !== attemptId || !attemptRef.current || attemptRef.current.id !== attemptId) return;
    clearAttempt();
    setSession(IDLE_SESSION);
  }, [clearAttempt]);

  const dispatchAttempt = React.useCallback((
    current: GoalCellSession,
    draftNote: TaskDetailNote,
    forcePersistence = false,
  ) => {
    if (!accountId || !current.taskId || !current.boardId || !current.workspaceId) return;
    const latestNode = useWbsStore.getState().nodes[current.taskId];
    if (!latestNode || latestNode.isArchived || latestNode.boardId !== current.boardId || latestNode.workspaceId !== current.workspaceId) {
      setSession({ ...current, status: 'error', error: '來源任務已離開目前看板，尚未確認保存。', submittedNote: draftNote });
      return;
    }
    if (!canEditCanonicalTask(latestNode)) {
      setSession({ ...current, status: 'error', error: '目前沒有編輯此任務的權限，草稿仍保留。', submittedNote: draftNote });
      return;
    }

    const latestOriginalNote = getTaskPurposeNote(latestNode);
    const comparisonNote = current.status === 'error' && current.submittedNote
      ? current.submittedNote
      : current.originalNote;
    if (!comparisonNote || !areNotesEqual(latestOriginalNote, comparisonNote)) {
      setSession({ ...current, status: 'error', error: '任務目的已被其他變更更新，請複製或捨棄後重新編輯。', submittedNote: draftNote });
      return;
    }

    const updates = buildTaskPurposeUpdates(latestNode, draftNote);
    const attemptId = `${current.taskId}:${Date.now().toString(36)}:${++attemptSequenceRef.current}`;
    const savingSession: GoalCellSession = {
      ...current,
      status: 'saving',
      draftNote,
      submittedNote: draftNote,
      error: undefined,
      attemptId,
    };
    attemptRef.current = { id: attemptId, timer: null };
    sessionRef.current = savingSession;
    setSession(savingSession);

    const onPersistSuccess = () => settleAsSaved(attemptId);
    const onPersistError = (error: unknown) => settleAsError(attemptId, error);
    const dispatchResult: UpdateNodeDispatchResult = useWbsStore.getState().updateNode(
      current.taskId,
      updates,
      {
        forcePersistence,
        skipActivity: forcePersistence,
        onPersistSuccess,
        onPersistError,
      },
    );

    if (!dispatchResult.accepted) {
      clearAttempt();
      setSession({
        ...current,
        status: 'error',
        error: dispatchResult.reason === 'no_changes'
          ? '本機沒有可保存的差異，請重新確認目前內容。'
          : '來源任務不存在，尚未確認保存。',
        submittedNote: draftNote,
      });
      return;
    }

    setSession(currentState => currentState.attemptId === attemptId ? currentState : savingSession);
    attemptRef.current.timer = window.setTimeout(() => {
      const latest = sessionRef.current;
      if (latest.attemptId !== attemptId || !attemptRef.current || attemptRef.current.id !== attemptId) return;
      setSession({
        ...latest,
        status: 'unknown',
        error: '儲存仍在處理中，結果尚未確認。',
      });
    }, SESSION_TIMEOUT_MS);

    void dispatchResult.completion.then(
      outcome => {
        if (outcome === 'persisted') {
          settleAsSaved(attemptId);
        } else {
          settleAsError(attemptId, new Error('任務目的儲存失敗。'));
        }
      },
      error => {
        const currentState = sessionRef.current;
        if (currentState.attemptId === attemptId && attemptRef.current?.id === attemptId) {
          setSession({ ...currentState, status: 'unknown', error: '儲存結果未確認，請稍後再試。' });
        } else {
          console.error('[GoalCellSession] persistence completion rejected after callback:', error);
        }
      },
    );
  }, [accountId, clearAttempt, settleAsError, settleAsSaved]);

  const beginEditing = React.useCallback((node: TaskNode) => {
    const current = sessionRef.current;
    if (current.status !== 'idle' || !accountId || !canEditCanonicalTask(node)) return;
    const note = getTaskPurposeNote(node);
    setSession({
      status: 'editing',
      cellKey: makeCellKey(node.id),
      taskId: node.id,
      boardId: node.boardId,
      workspaceId: node.workspaceId,
      originalNote: note,
      draftNote: note,
      sourceVisible: true,
    });
  }, [accountId]);

  const updateDraft = React.useCallback((updates: Pick<TaskDetailNote, 'content' | 'richContent'>) => {
    const current = sessionRef.current;
    if (!current.taskId || !current.draftNote || current.status !== 'editing') return;
    const nextDraft = { ...current.draftNote, ...updates };
    setSession({ ...current, draftNote: nextDraft, error: undefined });
  }, []);

  const commit = React.useCallback((intent: 'enter' | 'blur' | 'save') => {
    void intent;
    const current = sessionRef.current;
    if (current.status !== 'editing' || !current.draftNote || !current.originalNote) return;
    if (areNotesEqual(current.originalNote, current.draftNote)) {
      setSession(IDLE_SESSION);
      return;
    }
    dispatchAttempt(current, current.draftNote);
  }, [dispatchAttempt]);

  const cancel = React.useCallback(() => {
    const current = sessionRef.current;
    if (current.status === 'editing') {
      clearAttempt();
      setSession(IDLE_SESSION);
    }
  }, [clearAttempt]);

  const retry = React.useCallback(() => {
    const current = sessionRef.current;
    if (current.status !== 'error' || !current.draftNote) return;
    dispatchAttempt({ ...current, status: 'error', error: undefined }, current.draftNote, true);
  }, [dispatchAttempt]);

  const discard = React.useCallback(() => {
    const current = sessionRef.current;
    if (current.status === 'saving' || current.status === 'unknown') return;
    clearAttempt();
    setSession(IDLE_SESSION);
  }, [clearAttempt]);

  const setSourceVisible = React.useCallback((taskId: string, visible: boolean) => {
    const current = sessionRef.current;
    if (current.taskId !== taskId || current.status === 'idle' || current.sourceVisible === visible) return;
    setSession({ ...current, sourceVisible: visible });
  }, []);

  const isCellActive = React.useCallback((taskId: string, column: 'description' | 'meeting') => (
    session.taskId === taskId
    && column === 'description'
    && session.status !== 'idle'
  ), [session]);

  const getDescriptionAnchor = React.useCallback((taskId: string, fallback: string | null | undefined) => {
    if (session.taskId !== taskId || session.status === 'idle' || !session.originalNote?.content) return fallback;
    return session.originalNote.content;
  }, [session]);

  const value = React.useMemo<GoalCellSessionContextValue>(() => ({
    session,
    beginEditing,
    updateDraft,
    commit,
    cancel,
    retry,
    discard,
    setSourceVisible,
    isCellActive,
    getDescriptionAnchor,
  }), [beginEditing, cancel, commit, discard, getDescriptionAnchor, isCellActive, retry, session, setSourceVisible, updateDraft]);

  return (
    <GoalCellSessionContext.Provider value={value}>
      <span
        className="sr-only"
        aria-hidden="true"
        data-goal-edit-session-marker="true"
        data-goal-edit-session-state={session.status === 'idle' ? undefined : session.status}
      />
      {children}
    </GoalCellSessionContext.Provider>
  );
};

export const GoalCellRecoveryNotice: React.FC = () => {
  const { session, retry, discard } = useGoalCellSession();
  const currentView = useBoardStore(state => state.currentView);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const node = useWbsStore(state => session.taskId ? state.nodes[session.taskId] : undefined);
  const [copied, setCopied] = React.useState(false);
  const sourceVisible = session.sourceVisible
    && currentView === 'goal'
    && activeBoardId === session.boardId
    && Boolean(node && !node.isArchived);
  const needsNotice = session.status !== 'idle' && !sourceVisible;

  React.useEffect(() => setCopied(false), [session.attemptId, session.status]);

  if (!needsNotice) return null;

  const copyDraft = () => {
    if (!session.draftNote?.content) return;
    void navigator.clipboard?.writeText(session.draftNote.content).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <div
      className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 px-1 py-2 text-xs text-amber-800 sm:mx-5"
      role={session.status === 'error' || session.status === 'unknown' ? 'alert' : 'status'}
      data-goal-edit-recovery="true"
    >
      <span>「{node?.title || session.taskId || '任務目的'}」的編輯狀態仍保留，請返回原看板與內容格。</span>
      {session.status === 'error' ? <button type="button" onClick={retry} className="font-semibold underline">重試</button> : null}
      {session.status !== 'saving' && session.status !== 'unknown' ? <button type="button" onClick={discard} className="font-semibold underline">捨棄草稿</button> : null}
      {session.draftNote?.content ? <button type="button" onClick={copyDraft} className="font-semibold underline">{copied ? '已複製' : '複製內容'}</button> : null}
    </div>
  );
};

export type { GoalCellSessionStatus };
