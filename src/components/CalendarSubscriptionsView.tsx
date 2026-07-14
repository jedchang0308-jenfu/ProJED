import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  CirclePause,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { isLocalTestBackend, isSupabaseBackend } from '../services/dataBackend';
import {
  calendarSubscriptionService,
  type CalendarSubscription,
  type CalendarBoardRef,
  type CalendarWorkspaceRef,
  type CalendarWorkspaceMember,
} from '../services/supabase/calendarSubscriptionService';
import type {
  CalendarSubscriptionAssigneeFilter,
  CalendarSubscriptionFilters,
  CalendarSubscriptionScopeType,
} from '../services/supabase/database.types';
import { toast } from '../store/useToastStore';
import CalendarSubscriptionBuilderPreview, {
  type CalendarSubscriptionBuilderAssigneeOption,
  type CalendarSubscriptionBuilderPayload,
  type CalendarSubscriptionBuilderValidation,
} from './CalendarSubscriptionBuilderPreview';

const ADMIN_ROLES = new Set(['owner', 'admin', 'project_manager']);

const emptyFilters = (
  workspaceId?: string,
  boardId?: string
): CalendarSubscriptionFilters => ({
  workspace_ids: workspaceId ? [workspaceId] : [],
  ...(workspaceId && boardId ? { scope_type: 'board' as const, project_ids: [boardId] } : { scope_type: 'workspace' as const }),
  assignee: { type: 'me' },
  date_types: ['due_date'],
});

const getScopeType = (filters: CalendarSubscriptionFilters): CalendarSubscriptionScopeType =>
  filters.scope_type ?? 'workspace';

const uniq = <T extends string>(items: T[]) => Array.from(new Set(items.filter(Boolean)));
type CalendarBoardOption = {
  id: string;
  storageId?: string;
  workspaceId: string;
  storageWorkspaceId?: string;
  boardTitle: string;
  workspaceTitle: string;
  path: string;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '尚未讀取';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getMemberLabel = (member: CalendarWorkspaceMember) =>
  member.displayName || member.email || member.userId.slice(0, 8);

type AssigneeSelection = {
  userIds: string[];
  includeUnassigned: boolean;
};

const getAssigneeSelection = (
  assignee: CalendarSubscriptionAssigneeFilter | undefined,
  currentUserId?: string
): AssigneeSelection => {
  const normalizedAssignee = assignee ?? { type: 'me' as const };
  if (normalizedAssignee.type === 'selected') {
    return {
      userIds: Array.from(new Set(normalizedAssignee.user_ids.filter(Boolean))),
      includeUnassigned: Boolean(normalizedAssignee.include_unassigned),
    };
  }

  if (normalizedAssignee.type === 'user') {
    return {
      userIds: normalizedAssignee.user_id ? [normalizedAssignee.user_id] : [],
      includeUnassigned: false,
    };
  }

  return {
    userIds: currentUserId ? [currentUserId] : [],
    includeUnassigned: false,
  };
};

const describeAssigneeFilter = (
  assignee: CalendarSubscriptionAssigneeFilter | undefined,
  memberNameById: Map<string, string>,
  currentUserId?: string
) => {
  const selection = getAssigneeSelection(assignee, currentUserId);
  const labels = [
    ...selection.userIds.map((userId) => memberNameById.get(userId) ?? userId.slice(0, 8)),
    ...(selection.includeUnassigned ? ['未指派'] : []),
  ];
  return labels.length > 0 ? labels.join('、') : '未指定';
};

const describeSourceFilter = (
  filters: CalendarSubscriptionFilters,
  workspaceNameById: Map<string, string>,
  boardPathById: Map<string, string>
) => {
  if (filters.version === 3 && filters.board_filters) {
    const includedBoards = Object.entries(filters.board_filters)
      .filter(([, snapshot]) => snapshot.included)
      .map(([boardId]) => boardPathById.get(boardId) ?? boardId.slice(0, 8));
    return `逐看板設定｜${includedBoards.length > 0 ? includedBoards.join('、') : '未包含看板'}`;
  }

  const scopeType = getScopeType(filters);
  const workspaces = filters.workspace_ids
    .map((workspaceId) => workspaceNameById.get(workspaceId) ?? workspaceId.slice(0, 8))
    .join('、');

  if (scopeType === 'board') {
    const boardId = filters.project_ids?.[0];
    return `看板｜${boardId ? boardPathById.get(boardId) ?? boardId.slice(0, 8) : '未指定看板'}`;
  }

  if (scopeType === 'custom') {
    const boards = (filters.project_ids ?? [])
      .map((boardId) => boardPathById.get(boardId) ?? boardId.slice(0, 8));
    return `自訂範圍｜${boards.length > 0 ? boards.join('、') : workspaces || '未指定範圍'}`;
  }

  return `工作區全部看板｜${workspaces || '未指定工作區'}`;
};

const describeConditionFilters = (
  filters: CalendarSubscriptionFilters,
  memberNameById: Map<string, string>,
  currentUserId?: string,
) => {
  const dateTypes = (filters.date_types ?? [])
    .map((type) => type === 'start_date' ? '開始日' : '到期日')
    .join('、');
  if (filters.version === 3 && filters.board_filters) {
    return '每張看板獨立任務條件與事件日期';
  }

  const assignee = describeAssigneeFilter(filters.assignee, memberNameById, currentUserId);
  return `負責人：${assignee}｜日期：${dateTypes || '未指定'}`;
};

type CalendarSubscriptionSubmitBarProps = {
  name: string;
  nameInputId: string;
  namePlaceholder: string;
  disabled: boolean;
  isEditing?: boolean;
  isSaving?: boolean;
  blockedReason?: string;
  onNameChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
};

const CalendarSubscriptionSubmitBar: React.FC<CalendarSubscriptionSubmitBarProps> = ({
  name,
  nameInputId,
  namePlaceholder,
  disabled,
  isEditing = false,
  isSaving = false,
  blockedReason,
  onNameChange,
  onSubmit,
  onCancel,
}) => (
  <div className="mb-3" data-calendar-subscription-action-bar="true">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label className="min-w-0 text-xs font-bold text-slate-500" htmlFor={nameInputId}>
        訂閱名稱
        <input
          id={nameInputId}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="mt-1 h-11 w-full border border-slate-200 px-3 text-sm font-normal text-slate-800 outline-none focus:border-primary"
          placeholder={namePlaceholder}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || isSaving}
          aria-describedby={blockedReason ? 'calendar-subscription-submit-status' : undefined}
          className="inline-flex h-11 min-w-20 items-center justify-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 sm:min-w-56"
          data-calendar-subscription-submit="true"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
          <span className="hidden sm:inline">{isEditing ? '儲存訂閱變更' : '建立訂閱並複製連結'}</span>
          <span className="sm:hidden">{isEditing ? '儲存' : '建立'}</span>
        </button>
        {isEditing && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
        ) : null}
      </div>
    </div>
    {blockedReason ? (
      <div id="calendar-subscription-submit-status" className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600" data-calendar-subscription-save-block-reason="true">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
        <span>{blockedReason}</span>
      </div>
    ) : null}
  </div>
);

const CalendarSubscriptionsView: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const workspaces = useBoardStore((state) => state.workspaces);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const activeBoardId = useBoardStore((state) => state.activeBoardId);
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces]
  );
  const activeBoard = useMemo(
    () => activeWorkspace?.boards.find((board) => board.id === activeBoardId),
    [activeBoardId, activeWorkspace]
  );
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [workspaceRefs, setWorkspaceRefs] = useState<CalendarWorkspaceRef[]>([]);
  const [boardRefs, setBoardRefs] = useState<CalendarBoardRef[]>([]);
  const [members, setMembers] = useState<CalendarWorkspaceMember[]>([]);
  const [generatedUrls, setGeneratedUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('我的工作行事曆');
  const [filters, setFilters] = useState<CalendarSubscriptionFilters>(() =>
    emptyFilters(activeWorkspace?.id, activeBoard?.id)
  );
  const [builderPayload, setBuilderPayload] = useState<CalendarSubscriptionBuilderPayload | null>(null);
  const [builderValidation, setBuilderValidation] = useState<CalendarSubscriptionBuilderValidation>({
    isComplete: false,
    loading: true,
    failedBoardIds: [],
    includedBoardCount: 0,
    missingDateTypeBoardIds: [],
  });
  const [builderRevision, setBuilderRevision] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'builder'>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const boardOptions = useMemo<CalendarBoardOption[]>(() => {
    const map = new Map<string, CalendarBoardOption>();
    const representedStorageIds = new Set<string>();
    workspaces.forEach((workspace) => {
      workspace.boards.forEach((board) => {
        const boardRef = boardRefs.find((candidate) => candidate.appBoardId === board.id);
        const option = {
          id: board.id,
          storageId: boardRef?.id,
          workspaceId: workspace.id,
          storageWorkspaceId: boardRef?.workspaceId,
          boardTitle: board.title,
          workspaceTitle: workspace.title,
          path: `${workspace.title} / ${board.title}`,
        };
        map.set(boardRef?.id ?? board.id, option);
        if (boardRef) representedStorageIds.add(boardRef.id);
      });
    });
    boardRefs.forEach((board) => {
      if (representedStorageIds.has(board.id)) return;
      const option = {
        id: board.appBoardId || board.id,
        storageId: board.id,
        workspaceId: board.appWorkspaceId,
        storageWorkspaceId: board.workspaceId,
        boardTitle: board.name,
        workspaceTitle: board.workspaceName,
        path: board.path,
      };
      map.set(board.id, option);
    });
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path, 'zh-TW'));
  }, [boardRefs, workspaces]);

  const effectiveMemberWorkspaceIds = useMemo(
    () => uniq(boardOptions.flatMap((board) => [board.workspaceId, board.storageWorkspaceId ?? ''])),
    [boardOptions]
  );
  const selectedWorkspaceKey = effectiveMemberWorkspaceIds.join(',');

  const manageableWorkspaceIds = useMemo(() => {
    if (!user) return [];
    const ids = new Set<string>();
    members
      .filter((member) => member.userId === user.uid && ADMIN_ROLES.has(member.role))
      .forEach((member) => {
        ids.add(member.workspaceId);
        const ref = workspaceRefs.find((workspace) => workspace.id === member.workspaceId);
        if (ref?.appWorkspaceId) ids.add(ref.appWorkspaceId);
      });
    return Array.from(ids);
  }, [members, user, workspaceRefs]);

  const calendarAssigneeOptions = useMemo<CalendarSubscriptionBuilderAssigneeOption[]>(() => {
    const byUserId = new Map<string, { member: CalendarWorkspaceMember; workspaceIds: Set<string> }>();
    members.forEach((member) => {
      const current = byUserId.get(member.userId) ?? { member, workspaceIds: new Set<string>() };
      current.workspaceIds.add(member.workspaceId);
      const ref = workspaceRefs.find((workspace) => workspace.id === member.workspaceId);
      if (ref?.appWorkspaceId) current.workspaceIds.add(ref.appWorkspaceId);
      if (!current.member.displayName && member.displayName) current.member = member;
      byUserId.set(member.userId, current);
    });
    if (user && !byUserId.has(user.uid)) {
      byUserId.set(user.uid, {
        member: {
          userId: user.uid,
          workspaceId: activeWorkspace?.id ?? '',
          role: 'member',
          displayName: user.displayName ?? null,
          email: user.email ?? null,
        },
        workspaceIds: new Set(effectiveMemberWorkspaceIds),
      });
    }
    return Array.from(byUserId.values())
      .map(({ member, workspaceIds }) => ({
        id: member.userId,
        label: getMemberLabel(member),
        workspaceIds: Array.from(workspaceIds),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'));
  }, [activeWorkspace?.id, effectiveMemberWorkspaceIds, members, user, workspaceRefs]);

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    workspaces.forEach((workspace) => {
      map.set(workspace.id, workspace.title);
    });
    workspaceRefs.forEach((workspace) => {
      map.set(workspace.id, workspace.name);
      map.set(workspace.appWorkspaceId, workspace.name);
    });
    subscriptions.forEach((subscription) => {
      subscription.filters.workspace_ids.forEach((workspaceId) => {
        if (!map.has(workspaceId)) map.set(workspaceId, workspaceId.slice(0, 8));
      });
    });
    return map;
  }, [subscriptions, workspaceRefs, workspaces]);

  const boardPathById = useMemo(() => {
    const map = new Map<string, string>();
    workspaces.forEach((workspace) => {
      workspace.boards.forEach((board) => {
        map.set(board.id, `${workspace.title} / ${board.title}`);
      });
    });
    boardRefs.forEach((board) => {
      map.set(board.id, board.path);
      map.set(board.appBoardId, board.path);
    });
    subscriptions.forEach((subscription) => {
      (subscription.filters.project_ids ?? []).forEach((boardId) => {
        if (!map.has(boardId)) map.set(boardId, boardId.slice(0, 8));
      });
    });
    return map;
  }, [boardRefs, subscriptions, workspaces]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => map.set(member.userId, getMemberLabel(member)));
    if (user) map.set(user.uid, user.displayName || user.email || '我');
    return map;
  }, [members, user]);

  const loadSubscriptions = async () => {
    if (!isSupabaseBackend) return;
    setIsLoading(true);
    try {
      const [nextSubscriptions, nextWorkspaceRefs, nextBoardRefs] = await Promise.all([
        calendarSubscriptionService.list(),
        calendarSubscriptionService.listWorkspaceRefs(),
        calendarSubscriptionService.listBoardRefs(),
      ]);
      setSubscriptions(nextSubscriptions);
      setWorkspaceRefs(nextWorkspaceRefs);
      setBoardRefs(nextBoardRefs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '讀取訂閱失敗');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  useEffect(() => {
    if (editingId) return;
    setFilters((current) => {
      if (current.workspace_ids.length > 0 || (current.project_ids?.length ?? 0) > 0) return current;
      return emptyFilters(activeWorkspace?.id, activeBoard?.id);
    });
  }, [activeBoard?.id, activeWorkspace?.id, editingId]);

  useEffect(() => {
    if (!isSupabaseBackend || effectiveMemberWorkspaceIds.length === 0) {
      setMembers([]);
      return;
    }

    let cancelled = false;
    setMembers([]);
    calendarSubscriptionService.listWorkspaceMembers(effectiveMemberWorkspaceIds)
      .then((nextMembers) => {
        if (!cancelled) setMembers(nextMembers);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : '讀取成員失敗'));
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceKey, effectiveMemberWorkspaceIds]);

  const resetForm = () => {
    setName('我的工作行事曆');
    setFilters(emptyFilters(activeWorkspace?.id, activeBoard?.id));
    setBuilderPayload(null);
    setBuilderValidation({
      isComplete: false,
      loading: true,
      failedBoardIds: [],
      includedBoardCount: 0,
      missingDateTypeBoardIds: [],
    });
    setBuilderRevision((current) => current + 1);
    setEditingId(null);
  };

  const switchView = (mode: 'list' | 'builder') => {
    setViewMode(mode);
    requestAnimationFrame(() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const startNewSubscription = () => {
    resetForm();
    switchView('builder');
  };

  const closeBuilder = () => {
    resetForm();
    switchView('list');
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('已複製訂閱連結');
  };

  const validate = () => {
    if (!user) return '請先登入';
    if (!name.trim()) return '請輸入訂閱名稱';
    if (!builderPayload) return '訂閱條件尚未就緒';
    if (builderPayload.workspace_ids.length === 0) return '至少需要一個工作區';
    if (builderPayload.project_ids.length === 0) return '至少需要一個看板';
    if (builderValidation.loading) return '正在讀取預覽資料，請稍候';
    if (builderValidation.failedBoardIds.length > 0) return '部分看板預覽讀取失敗，請重試後再儲存';
    if (builderValidation.includedBoardCount === 0) return '請至少包含一張看板';
    if (builderValidation.missingDateTypeBoardIds.length > 0) return '每張已納入看板都需要至少一種事件日期';
    if (!builderValidation.isComplete) return '訂閱條件尚未完整';
    return null;
  };

  const buildSubmissionFilters = (): CalendarSubscriptionFilters => builderPayload ?? filters;

  const submit = async () => {
    const error = validate();
    if (error || !user) {
      if (error) toast.warning(error);
      return;
    }

    setIsSaving(true);
    try {
      const submissionFilters = buildSubmissionFilters();
      if (editingId) {
        const updated = await calendarSubscriptionService.update(editingId, { name, filters: submissionFilters });
        setSubscriptions((current) => current.map((item) => item.id === updated.id ? updated : item));
        toast.success('訂閱條件已更新');
      } else {
        const created = await calendarSubscriptionService.create({ name, filters: submissionFilters }, user.uid);
        setSubscriptions((current) => [created.subscription, ...current]);
        setGeneratedUrls((current) => ({ ...current, [created.subscription.id]: created.feedUrl }));
        await copyText(created.feedUrl);
      }
      resetForm();
      switchView('list');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : '儲存訂閱失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const editSubscription = (subscription: CalendarSubscription) => {
    const displayWorkspaceIds = subscription.filters.workspace_ids.map((workspaceId) =>
      workspaceRefs.find((workspace) => workspace.id === workspaceId)?.appWorkspaceId ?? workspaceId
    );
    const displayProjectIds = (subscription.filters.project_ids ?? []).map((projectId) =>
      boardRefs.find((board) => board.id === projectId)?.appBoardId ?? projectId
    );
    const displayBoardFilters = subscription.filters.board_filters
      ? Object.fromEntries(Object.entries(subscription.filters.board_filters).map(([projectId, snapshot]) => [
        boardRefs.find((board) => board.id === projectId)?.appBoardId ?? projectId,
        snapshot,
      ]))
      : undefined;
    const displayBoardOverrides = subscription.filters.board_overrides
      ? Object.fromEntries(Object.entries(subscription.filters.board_overrides).map(([projectId, override]) => [
        boardRefs.find((board) => board.id === projectId)?.appBoardId ?? projectId,
        override,
      ]))
      : undefined;
    setEditingId(subscription.id);
    setName(subscription.name);
    setFilters({
      ...subscription.filters,
      scope_type: getScopeType(subscription.filters),
      workspace_ids: displayWorkspaceIds,
      ...(displayProjectIds.length > 0 ? { project_ids: displayProjectIds } : {}),
      ...(displayBoardFilters ? { board_filters: displayBoardFilters } : {}),
      ...(displayBoardOverrides ? { board_overrides: displayBoardOverrides } : {}),
    });
    setBuilderRevision((current) => current + 1);
    switchView('builder');
  };

  const setSubscriptionActive = async (subscription: CalendarSubscription, isActive: boolean) => {
    try {
      if (isActive) await calendarSubscriptionService.enable(subscription.id);
      else await calendarSubscriptionService.disable(subscription.id);
      setSubscriptions((current) => current.map((item) =>
        item.id === subscription.id ? { ...item, isActive } : item
      ));
      toast.success(isActive ? '訂閱已啟用' : '訂閱已停用');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新訂閱狀態失敗');
    }
  };

  const regenerateToken = async (subscription: CalendarSubscription) => {
    try {
      const feedUrl = await calendarSubscriptionService.regenerateToken(subscription.id);
      setGeneratedUrls((current) => ({ ...current, [subscription.id]: feedUrl }));
      await copyText(feedUrl);
      toast.success('新訂閱連結已產生，舊連結已失效');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重新產生連結失敗');
    }
  };

  const submitBlockedReason = !name.trim()
    ? '請先輸入訂閱名稱。'
    : builderValidation.loading
      ? '正在讀取所有看板的預覽資料，完成後才能建立訂閱。'
      : builderValidation.failedBoardIds.length > 0
        ? '部分看板預覽讀取失敗，請重新整理後再建立訂閱。'
        : builderValidation.includedBoardCount === 0
          ? '請至少納入一張看板。'
          : builderValidation.missingDateTypeBoardIds.length > 0
            ? `有 ${builderValidation.missingDateTypeBoardIds.length} 張已納入看板尚未選擇事件日期。`
            : !builderValidation.isComplete
              ? '訂閱條件尚未完整。'
              : undefined;

  if (!isSupabaseBackend) {
    return (
      <div className="h-full overflow-auto bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {isLocalTestBackend && (
            <section
              className="border border-slate-200 bg-white p-4"
              data-calendar-subscription-local-preview="true"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                  <CalendarPlus size={16} className="text-primary" />
                  建立訂閱
                </div>
                <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">本機預覽</span>
              </div>

              <CalendarSubscriptionSubmitBar
                name={name}
                nameInputId="local-calendar-subscription-name"
                namePlaceholder="例如：我的跨看板任務"
                disabled
                blockedReason="目前只能預覽；請到已連接 Supabase 的環境建立訂閱。"
                onNameChange={setName}
              />

              <CalendarSubscriptionBuilderPreview
                boards={boardOptions}
                allowAllAssignees
                resetKey={`local:${builderRevision}`}
                onPayloadChange={setBuilderPayload}
                onValidationChange={setBuilderValidation}
              />

              <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600" data-calendar-subscription-snapshot-summary="true">
                已納入 {builderValidation.includedBoardCount} / {builderPayload?.project_ids.length ?? boardOptions.length} 張看板
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">行事曆訂閱</h2>
            <p className="mt-1 text-sm text-slate-500">
              建立只讀連結；外部行事曆會定期抓取符合各看板條件的任務。
            </p>
          </div>
          {viewMode === 'list' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadSubscriptions()}
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                aria-label="重新整理訂閱"
                title="重新整理訂閱"
              >
                <RefreshCw size={15} className={isLoading ? 'animate-spin' : undefined} />
              </button>
              <button
                type="button"
                onClick={startNewSubscription}
                className="inline-flex h-9 items-center justify-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover"
                data-calendar-subscription-create-new="true"
              >
                <CalendarPlus size={15} />
                新增訂閱
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={closeBuilder}
              className="inline-flex h-9 items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            >
              <ArrowLeft size={15} />
              回到我的訂閱
            </button>
          )}
        </header>

        {viewMode === 'builder' ? (
          <section className="border border-slate-200 bg-white" data-calendar-subscription-view-mode="builder">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
              <SlidersHorizontal size={16} className="text-primary" />
              {editingId ? '修改訂閱' : '建立新訂閱'}
            </div>

            <div className="p-4">
              <CalendarSubscriptionSubmitBar
                name={name}
                nameInputId="calendar-subscription-name"
                namePlaceholder="例如：我的兩家公司任務"
                disabled={Boolean(submitBlockedReason)}
                isEditing={Boolean(editingId)}
                isSaving={isSaving}
                blockedReason={submitBlockedReason}
                onNameChange={setName}
                onSubmit={() => void submit()}
                onCancel={editingId ? closeBuilder : undefined}
              />

              <CalendarSubscriptionBuilderPreview
                boards={boardOptions}
                currentUserId={user?.uid}
                assigneeOptions={calendarAssigneeOptions}
                manageableWorkspaceIds={manageableWorkspaceIds}
                initialFilters={filters}
                resetKey={`${editingId ?? 'new'}:${builderRevision}`}
                onPayloadChange={setBuilderPayload}
                onValidationChange={setBuilderValidation}
              />
            </div>
          </section>
        ) : (
          <section className="border border-slate-200 bg-white" data-calendar-subscription-view-mode="list">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Link2 size={16} className="text-primary" />
                  我的訂閱
                </div>
                {subscriptions.length > 0 ? (
                  <div className="mt-1 text-xs text-slate-400">
                    {subscriptions.length} 個訂閱，{subscriptions.filter((subscription) => subscription.isActive).length} 個啟用
                  </div>
                ) : null}
              </div>
              {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
            </div>

            {subscriptions.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <div className="text-sm font-bold text-slate-700">尚未建立訂閱</div>
                <button
                  type="button"
                  onClick={startNewSubscription}
                  className="mt-3 inline-flex h-9 items-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover"
                >
                  <CalendarPlus size={15} />
                  建立第一個訂閱
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {subscriptions.map((subscription) => {
                  const generatedUrl = generatedUrls[subscription.id];
                  return (
                    <article key={subscription.id} className="px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-bold text-slate-900">{subscription.name}</span>
                          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                            subscription.isActive ? 'text-emerald-700' : 'text-slate-400'
                          }`}>
                            {subscription.isActive ? <CheckCircle2 size={13} /> : <CirclePause size={13} />}
                            {subscription.isActive ? '啟用' : '停用'}
                          </span>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {generatedUrl && (
                            <button
                              onClick={() => void copyText(generatedUrl)}
                              className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Copy size={13} />
                              複製
                            </button>
                          )}
                          <button
                            onClick={() => editSubscription(subscription)}
                            className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil size={13} />
                            修改
                          </button>
                          <button
                            onClick={() => void regenerateToken(subscription)}
                            className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <KeyRound size={13} />
                            重生連結
                          </button>
                          <button
                            onClick={() => void setSubscriptionActive(subscription, !subscription.isActive)}
                            className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Power size={13} />
                            {subscription.isActive ? '停用' : '啟用'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-600 lg:grid-cols-2">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-700">來源：</span>
                          <span className="break-words">
                            {describeSourceFilter(subscription.filters, workspaceNameById, boardPathById)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-700">條件：</span>
                          <span className="break-words">
                            {describeConditionFilters(subscription.filters, memberNameById, user?.uid)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 text-xs text-slate-400">
                        最後同步：{formatDateTime(subscription.lastAccessedAt)}
                      </div>
                      {generatedUrl && (
                        <div className="mt-2 flex min-w-0 items-center gap-2 bg-slate-50 px-2 py-2 text-xs text-slate-600">
                          <KeyRound size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate">{generatedUrl}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default CalendarSubscriptionsView;
