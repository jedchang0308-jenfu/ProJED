import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { isSupabaseBackend } from '../services/dataBackend';
import {
  calendarSubscriptionService,
  type CalendarSubscription,
  type CalendarBoardRef,
  type CalendarWorkspaceRef,
  type CalendarWorkspaceMember,
} from '../services/supabase/calendarSubscriptionService';
import type {
  CalendarSubscriptionAssigneeFilter,
  CalendarSubscriptionDateType,
  CalendarSubscriptionFilters,
  CalendarSubscriptionScopeType,
} from '../services/supabase/database.types';
import { toast } from '../store/useToastStore';
import { UNASSIGNED_ASSIGNEE_FILTER } from '../utils/taskFilters';
import CalendarSubscriptionBuilderPreview, {
  type CalendarSubscriptionBuilderPayload,
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
  workspaceId: string;
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
  assignee: CalendarSubscriptionAssigneeFilter,
  currentUserId?: string
): AssigneeSelection => {
  if (assignee.type === 'selected') {
    return {
      userIds: Array.from(new Set(assignee.user_ids.filter(Boolean))),
      includeUnassigned: Boolean(assignee.include_unassigned),
    };
  }

  if (assignee.type === 'user') {
    return {
      userIds: assignee.user_id ? [assignee.user_id] : [],
      includeUnassigned: false,
    };
  }

  return {
    userIds: currentUserId ? [currentUserId] : [],
    includeUnassigned: false,
  };
};

const toSelectedAssigneeFilter = (
  selection: AssigneeSelection
): CalendarSubscriptionAssigneeFilter => ({
  type: 'selected',
  user_ids: Array.from(new Set(selection.userIds.filter(Boolean))),
  include_unassigned: selection.includeUnassigned,
});

const describeAssigneeFilter = (
  assignee: CalendarSubscriptionAssigneeFilter,
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
  const assignee = describeAssigneeFilter(filters.assignee, memberNameById, currentUserId);
  const dateTypes = filters.date_types
    .map((type) => type === 'start_date' ? '開始日' : '到期日')
    .join('、');
  return `負責人：${assignee}｜日期：${dateTypes || '未指定'}`;
};

const describePreview = (
  filters: CalendarSubscriptionFilters,
  workspaceNameById: Map<string, string>,
  boardPathById: Map<string, string>,
  memberNameById: Map<string, string>,
  currentUserId?: string
) => {
  const source = describeSourceFilter(filters, workspaceNameById, boardPathById);
  const condition = describeConditionFilters(filters, memberNameById, currentUserId);
  return `這個訂閱會包含：${source} 中，${condition} 的任務。`;
};

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const scopeType = getScopeType(filters);
  const effectiveMemberWorkspaceIds = builderPayload?.workspace_ids.length
    ? builderPayload.workspace_ids
    : filters.workspace_ids;
  const selectedWorkspaceCount = new Set(effectiveMemberWorkspaceIds).size;
  const selectedWorkspaceKey = uniq(effectiveMemberWorkspaceIds).join(',');
  const assigneeSelection = useMemo(
    () => getAssigneeSelection(filters.assignee, user?.uid),
    [filters.assignee, user?.uid]
  );
  const selectedAssigneeSet = useMemo(() => {
    const values = [...assigneeSelection.userIds];
    if (assigneeSelection.includeUnassigned) values.push(UNASSIGNED_ASSIGNEE_FILTER);
    return new Set(values);
  }, [assigneeSelection]);
  const selectedAssigneeIdsForPreview = useMemo(
    () => Array.from(selectedAssigneeSet),
    [selectedAssigneeSet]
  );

  const currentUserAdminWorkspaceCount = useMemo(() => {
    if (!user) return 0;
    return new Set(
      members
        .filter((member) => member.userId === user.uid && ADMIN_ROLES.has(member.role))
        .map((member) => member.workspaceId)
    ).size;
  }, [members, user]);

  const loadedSelectedWorkspaceMemberCount = useMemo(() => {
    const selectedWorkspaceIds = new Set(effectiveMemberWorkspaceIds);
    return new Set(
      members
        .filter((member) => selectedWorkspaceIds.has(member.workspaceId))
        .map((member) => member.workspaceId)
    ).size;
  }, [effectiveMemberWorkspaceIds, members]);

  const hasLoadedSelectedWorkspaceMembers = selectedWorkspaceCount > 0
    && loadedSelectedWorkspaceMemberCount >= selectedWorkspaceCount;

  const canAssignOthers = selectedWorkspaceCount > 0 && currentUserAdminWorkspaceCount >= selectedWorkspaceCount;

  const assignableMembers = useMemo(() => {
    if (selectedWorkspaceCount === 0) return [];
    const byUserId = new Map<string, { member: CalendarWorkspaceMember; workspaceIds: Set<string> }>();
    members.forEach((member) => {
      const current = byUserId.get(member.userId) ?? { member, workspaceIds: new Set<string>() };
      current.workspaceIds.add(member.workspaceId);
      if (!current.member.displayName && member.displayName) current.member = member;
      byUserId.set(member.userId, current);
    });
    return Array.from(byUserId.values())
      .filter((entry) => entry.workspaceIds.size >= selectedWorkspaceCount)
      .map((entry) => entry.member)
      .sort((a, b) => getMemberLabel(a).localeCompare(getMemberLabel(b), 'zh-TW'));
  }, [members, selectedWorkspaceCount]);

  const boardOptions = useMemo<CalendarBoardOption[]>(() => {
    const map = new Map<string, CalendarBoardOption>();
    workspaces.forEach((workspace) => {
      workspace.boards.forEach((board) => {
        const option = {
          id: board.id,
          workspaceId: workspace.id,
          boardTitle: board.title,
          workspaceTitle: workspace.title,
          path: `${workspace.title} / ${board.title}`,
        };
        map.set(board.id, option);
      });
    });
    boardRefs.forEach((board) => {
      const option = {
        id: board.id,
        workspaceId: board.appWorkspaceId,
        boardTitle: board.name,
        workspaceTitle: board.workspaceName,
        path: board.path,
      };
      if (!map.has(board.id)) map.set(board.id, option);
      if (!map.has(board.appBoardId)) map.set(board.appBoardId, { ...option, id: board.appBoardId });
    });
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path, 'zh-TW'));
  }, [boardRefs, workspaces]);

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

  useEffect(() => {
    if (!user || canAssignOthers || !hasLoadedSelectedWorkspaceMembers) return;
    const selection = getAssigneeSelection(filters.assignee, user.uid);
    const hasRestrictedSelection = selection.includeUnassigned
      || selection.userIds.some((userId) => userId !== user.uid);
    if (hasRestrictedSelection) {
      setFilters((current) => ({ ...current, assignee: { type: 'me' } }));
    }
  }, [canAssignOthers, filters.assignee, hasLoadedSelectedWorkspaceMembers, user]);

  const resetForm = () => {
    setName('我的工作行事曆');
    setFilters(emptyFilters(activeWorkspace?.id, activeBoard?.id));
    setBuilderPayload(null);
    setEditingId(null);
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('已複製訂閱連結');
  };

  const setAssigneeSelection = (nextSelection: AssigneeSelection) => {
    setFilters((current) => ({
      ...current,
      assignee: toSelectedAssigneeFilter(nextSelection),
    }));
  };

  const toggleAssigneeOption = (optionId: string) => {
    setFilters((current) => {
      const currentSelection = getAssigneeSelection(current.assignee, user?.uid);
      if (optionId === UNASSIGNED_ASSIGNEE_FILTER) {
        return {
          ...current,
          assignee: toSelectedAssigneeFilter({
            ...currentSelection,
            includeUnassigned: !currentSelection.includeUnassigned,
          }),
        };
      }

      const userIds = currentSelection.userIds.includes(optionId)
        ? currentSelection.userIds.filter((userId) => userId !== optionId)
        : [...currentSelection.userIds, optionId];
      return {
        ...current,
        assignee: toSelectedAssigneeFilter({
          ...currentSelection,
          userIds,
        }),
      };
    });
  };

  const setScopeType = (nextScopeType: CalendarSubscriptionScopeType) => {
    setFilters((current) => {
      if (nextScopeType === 'board') {
        return {
          ...current,
          scope_type: 'board',
          workspace_ids: activeWorkspace?.id ? [activeWorkspace.id] : [],
          project_ids: activeBoard?.id ? [activeBoard.id] : [],
        };
      }
      if (nextScopeType === 'workspace') {
        return {
          ...current,
          scope_type: 'workspace',
          workspace_ids: current.workspace_ids.length > 0
            ? current.workspace_ids
            : activeWorkspace?.id ? [activeWorkspace.id] : [],
          project_ids: undefined,
        };
      }
      return {
        ...current,
        scope_type: 'custom',
        workspace_ids: current.workspace_ids.length > 0
          ? current.workspace_ids
          : activeWorkspace?.id ? [activeWorkspace.id] : [],
        project_ids: current.project_ids ?? (activeBoard?.id ? [activeBoard.id] : []),
      };
    });
  };

  const toggleWorkspace = (workspaceId: string) => {
    setFilters((current) => ({
      ...current,
      workspace_ids: toggleArrayValue(current.workspace_ids, workspaceId),
      ...(getScopeType(current) === 'workspace' ? { project_ids: undefined } : {}),
    }));
  };

  const toggleCustomBoard = (board: CalendarBoardOption) => {
    setFilters((current) => {
      const projectIds = toggleArrayValue(current.project_ids ?? [], board.id);
      const nextWorkspaceIds = projectIds.includes(board.id)
        ? uniq([...current.workspace_ids, board.workspaceId])
        : uniq(
          current.workspace_ids.filter((workspaceId) =>
            projectIds.some((projectId) =>
              boardOptions.find((option) => option.id === projectId)?.workspaceId === workspaceId
            )
          )
        );
      return {
        ...current,
        scope_type: 'custom',
        workspace_ids: nextWorkspaceIds,
        project_ids: projectIds,
      };
    });
  };

  const validate = () => {
    if (!user) return '請先登入';
    if (!name.trim()) return '請輸入訂閱名稱';
    if (builderPayload) {
      if (builderPayload.workspace_ids.length === 0) return '新版訂閱至少需要一個工作區';
      if (builderPayload.project_ids.length === 0) return '新版訂閱至少需要一個看板';
    } else {
      if (scopeType === 'board' && (filters.project_ids?.length ?? 0) !== 1) return '請選擇目前看板';
      if (scopeType === 'workspace' && filters.workspace_ids.length === 0) return '請至少選擇一個工作區';
      if (scopeType === 'custom' && (filters.project_ids?.length ?? 0) === 0) return '請至少選擇一個看板';
    }
    if (filters.date_types.length === 0) return '請至少選擇一種日期類型';
    if (assigneeSelection.userIds.length === 0 && !assigneeSelection.includeUnassigned) {
      return '請至少選擇一個負責人或未指派';
    }
    const hasRestrictedSelection = assigneeSelection.includeUnassigned
      || assigneeSelection.userIds.some((userId) => userId !== user.uid);
    if (hasRestrictedSelection && !canAssignOthers) {
      return '只有管理角色可以訂閱未指派或他人的任務';
    }
    return null;
  };

  const buildSubmissionFilters = (): CalendarSubscriptionFilters => {
    if (!builderPayload) return filters;

    return {
      ...builderPayload,
      scope_type: 'custom',
      assignee: filters.assignee,
      date_types: filters.date_types,
    };
  };

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
    setEditingId(subscription.id);
    setName(subscription.name);
    setFilters({
      ...subscription.filters,
      scope_type: getScopeType(subscription.filters),
      workspace_ids: displayWorkspaceIds,
      ...(displayProjectIds.length > 0 ? { project_ids: displayProjectIds } : {}),
    });
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

  if (!isSupabaseBackend) {
    return (
      <div className="h-full overflow-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            自訂行事曆訂閱需要 Supabase 後端，因為 `.ics` 訂閱連結必須由雲端函式對外提供。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">自訂行事曆訂閱</h2>
            <p className="mt-1 text-sm text-slate-500">
              產生只讀行事曆訂閱連結，先選來源範圍，再依負責人與日期類型輸出任務事件；外部行事曆會依各自週期抓取，更新不會即時出現。
            </p>
          </div>
          <button
            onClick={() => void loadSubscriptions()}
            className="inline-flex h-9 items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
          >
            <RefreshCw size={15} />
            重新整理
          </button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
              <SlidersHorizontal size={16} className="text-primary" />
              {editingId ? '修改訂閱條件' : '建立訂閱'}
            </div>

            <label className="block text-xs font-bold text-slate-500">訂閱名稱</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full border border-slate-200 px-3 text-sm outline-none focus:border-primary"
              placeholder="例如：我的兩家公司任務"
            />

            <CalendarSubscriptionBuilderPreview
              boards={boardOptions}
              dateTypes={filters.date_types}
              selectedAssigneeIds={selectedAssigneeIdsForPreview}
              onPayloadChange={setBuilderPayload}
            />

            <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              新版篩選器會保存為 v2 訂閱；實際 `.ics` feed 需套用 DEV-045 Phase 2 Supabase migration 與 Edge Function 後才會與預覽一致。
              {builderPayload && (
                <span className="block pt-1 text-slate-500">
                  v2 snapshot：{builderPayload.workspace_ids.length} 個工作區 / {builderPayload.project_ids.length} 張看板。
                </span>
              )}
            </div>

            <div className="mt-4" data-calendar-subscription-scope-form="true">
              <div className="mb-2 text-xs font-bold text-slate-500">訂閱範圍</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="訂閱範圍">
                {[
                  ['board', '目前看板'],
                  ['workspace', '工作區全部看板'],
                  ['custom', '自訂範圍'],
                ].map(([value, label]) => {
                  const isBoardScopeUnavailable = value === 'board' && (!activeWorkspace || !activeBoard);
                  const isActive = scopeType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isBoardScopeUnavailable}
                      onClick={() => setScopeType(value as CalendarSubscriptionScopeType)}
                      className={`min-h-10 border px-3 py-2 text-left text-xs font-bold transition-colors ${
                        isActive
                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/15'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300`}
                      aria-pressed={isActive}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-3">
                {scopeType === 'board' && (
                  <div>
                    <div className="text-xs font-bold text-slate-500">來源</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {activeWorkspace && activeBoard ? `${activeWorkspace.title} / ${activeBoard.title}` : '尚未選擇看板'}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      只輸出目前看板內符合條件的任務。
                    </p>
                  </div>
                )}

                {scopeType === 'workspace' && (
                  <div>
                    <div className="text-xs font-bold text-slate-500">包含工作區內可讀取的全部看板</div>
                    <div className="mt-2 space-y-2">
                      {workspaces.map((workspace) => (
                        <label key={workspace.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={filters.workspace_ids.includes(workspace.id)}
                            onChange={() => toggleWorkspace(workspace.id)}
                          />
                          <span>{workspace.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {scopeType === 'custom' && (
                  <div>
                    <div className="text-xs font-bold text-slate-500">指定看板</div>
                    <div className="mt-2 max-h-44 space-y-2 overflow-auto pr-1">
                      {boardOptions.length === 0 ? (
                        <div className="text-sm text-slate-400">目前沒有可選看板</div>
                      ) : (
                        boardOptions.map((board) => (
                          <label key={`${board.workspaceId}:${board.id}`} className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={(filters.project_ids ?? []).includes(board.id)}
                              onChange={() => toggleCustomBoard(board)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-800">{board.boardTitle}</span>
                              <span className="block truncate text-xs text-slate-500">{board.workspaceTitle}</span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-slate-700">
                {describePreview(filters, workspaceNameById, boardPathById, memberNameById, user?.uid)}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-500">負責人</div>
                {(assigneeSelection.userIds.length > 0 || assigneeSelection.includeUnassigned) && (
                  <button
                    type="button"
                    onClick={() => setAssigneeSelection({ userIds: [], includeUnassigned: false })}
                    className="text-xs font-bold text-slate-400 hover:text-slate-700"
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canAssignOthers}
                  onClick={() => toggleAssigneeOption(UNASSIGNED_ASSIGNEE_FILTER)}
                  className={`inline-flex items-center gap-1.5 border bg-white px-2.5 py-1 text-xs font-bold shadow-sm transition-colors ${
                    selectedAssigneeSet.has(UNASSIGNED_ASSIGNEE_FILTER)
                      ? 'border-primary text-primary ring-2 ring-primary/20'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300'
                  } disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300`}
                  aria-pressed={selectedAssigneeSet.has(UNASSIGNED_ASSIGNEE_FILTER)}
                >
                  <UserRound size={13} />
                  未指派
                </button>
                {assignableMembers.length === 0 ? (
                  <div className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-400 shadow-sm">
                    <UserRound size={13} />
                    {selectedWorkspaceCount === 0 ? '請先選擇工作區' : '尚無可選負責人'}
                  </div>
                ) : (
                  assignableMembers.map((member) => {
                    const isCurrentUser = member.userId === user?.uid;
                    const isDisabled = !isCurrentUser && !canAssignOthers;
                    const isActive = selectedAssigneeSet.has(member.userId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => toggleAssigneeOption(member.userId)}
                        className={`inline-flex max-w-full items-center gap-1.5 border bg-white px-2.5 py-1 text-xs font-bold shadow-sm transition-colors ${
                          isActive
                            ? 'border-primary text-primary ring-2 ring-primary/20'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        } disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300`}
                        aria-pressed={isActive}
                      >
                        <UserRound size={13} />
                        <span className="max-w-[10rem] truncate">{getMemberLabel(member)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {!canAssignOthers && selectedWorkspaceCount > 0 && (
                <div className="mt-2 flex gap-2 text-xs text-amber-700">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  你目前只能訂閱自己的任務；未指派或他人任務需要在已選工作區具備擁有者、管理員或專案管理者權限。
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-slate-500">日期類型</div>
              <div className="flex flex-col gap-2 text-sm text-slate-700">
                {[
                  ['start_date', '開始日'],
                  ['due_date', '到期日'],
                ].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters.date_types.includes(value as CalendarSubscriptionDateType)}
                      onChange={() => setFilters((current) => ({
                        ...current,
                        date_types: toggleArrayValue(current.date_types, value as CalendarSubscriptionDateType),
                      }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => void submit()}
                disabled={isSaving}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
                {editingId ? '儲存變更' : '產生並複製連結'}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Link2 size={16} className="text-primary" />
                我的訂閱
              </div>
              {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
            </div>

            {subscriptions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                尚未建立訂閱。
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {subscriptions.map((subscription) => {
                  const generatedUrl = generatedUrls[subscription.id];
                  return (
                    <div key={subscription.id} className="px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">{subscription.name}</span>
                            <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-xs ${
                              subscription.isActive
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}>
                              {subscription.isActive ? <Check size={12} /> : <ShieldAlert size={12} />}
                              {subscription.isActive ? '啟用' : '停用'}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-slate-600">
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
                          <div className="mt-1 text-xs text-slate-400">
                            最後同步：{formatDateTime(subscription.lastAccessedAt)}
                          </div>
                          {generatedUrl && (
                            <div className="mt-2 flex min-w-0 items-center gap-2 bg-slate-50 px-2 py-2 text-xs text-slate-600">
                              <KeyRound size={13} className="shrink-0 text-slate-400" />
                              <span className="truncate">{generatedUrl}</span>
                            </div>
                          )}
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
                            <SlidersHorizontal size={13} />
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
                            <UserRound size={13} />
                            {subscription.isActive ? '停用' : '啟用'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CalendarSubscriptionsView;
