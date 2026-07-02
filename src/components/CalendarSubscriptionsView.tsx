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
} from '../services/supabase/database.types';
import { toast } from '../store/useToastStore';
import { UNASSIGNED_ASSIGNEE_FILTER } from '../utils/taskFilters';
import { createDefaultCalendarSubscriptionFilters } from '../utils/taskSubscriptionSources';

const ADMIN_ROLES = new Set(['owner', 'admin', 'project_manager']);

const emptyFilters = (): CalendarSubscriptionFilters => createDefaultCalendarSubscriptionFilters();

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

const describeFilters = (
  subscription: CalendarSubscription,
  workspaceNameById: Map<string, string>,
  boardNameById: Map<string, string>,
  memberNameById: Map<string, string>,
  currentUserId?: string,
) => {
  const workspaces = subscription.filters.workspace_ids
    .map((workspaceId) => workspaceNameById.get(workspaceId) ?? workspaceId.slice(0, 8))
    .join('、');
  const assignee = describeAssigneeFilter(subscription.filters.assignee, memberNameById, currentUserId);
  const dateTypes = subscription.filters.date_types
    .map((type) => type === 'start_date' ? '開始日' : '到期日')
    .join('、');
  const boards = (subscription.filters.board_ids || [])
    .map((boardId) => boardNameById.get(boardId) ?? boardId.slice(0, 8))
    .join('、');
  const scope = subscription.filters.scope_type === 'board'
    ? `看板：${boards || '未指定'}`
    : '工作區';
  return `${workspaces || '未指定工作區'}｜範圍：${scope}｜負責人：${assignee}｜日期：${dateTypes || '未指定'}`;
};

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const CalendarSubscriptionsView: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const workspaces = useBoardStore((state) => state.workspaces);
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [workspaceRefs, setWorkspaceRefs] = useState<CalendarWorkspaceRef[]>([]);
  const [boardRefs, setBoardRefs] = useState<CalendarBoardRef[]>([]);
  const [members, setMembers] = useState<CalendarWorkspaceMember[]>([]);
  const [generatedUrls, setGeneratedUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('我的工作行事曆');
  const [filters, setFilters] = useState<CalendarSubscriptionFilters>(emptyFilters);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedWorkspaceCount = new Set(filters.workspace_ids).size;
  const selectedWorkspaceKey = filters.workspace_ids.join(',');
  const selectedBoardSet = useMemo(() => new Set(filters.board_ids || []), [filters.board_ids]);
  const availableBoards = useMemo(() => (
    workspaces
      .filter((workspace) => filters.workspace_ids.includes(workspace.id))
      .flatMap((workspace) => workspace.boards.map((board) => ({
        ...board,
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
      })))
  ), [filters.workspace_ids, workspaces]);
  const assigneeSelection = useMemo(
    () => getAssigneeSelection(filters.assignee, user?.uid),
    [filters.assignee, user?.uid]
  );
  const selectedAssigneeSet = useMemo(() => {
    const values = [...assigneeSelection.userIds];
    if (assigneeSelection.includeUnassigned) values.push(UNASSIGNED_ASSIGNEE_FILTER);
    return new Set(values);
  }, [assigneeSelection]);

  const currentUserAdminWorkspaceCount = useMemo(() => {
    if (!user) return 0;
    return new Set(
      members
        .filter((member) => member.userId === user.uid && ADMIN_ROLES.has(member.role))
        .map((member) => member.workspaceId)
    ).size;
  }, [members, user]);

  const loadedSelectedWorkspaceMemberCount = useMemo(() => {
    const selectedWorkspaceIds = new Set(filters.workspace_ids);
    return new Set(
      members
        .filter((member) => selectedWorkspaceIds.has(member.workspaceId))
        .map((member) => member.workspaceId)
    ).size;
  }, [filters.workspace_ids, members]);

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

  const boardNameById = useMemo(() => {
    const map = new Map<string, string>();
    workspaces.forEach((workspace) => {
      workspace.boards.forEach((board) => map.set(board.id, `${workspace.title} / ${board.title}`));
    });
    boardRefs.forEach((board) => {
      const workspaceName = workspaceNameById.get(board.workspaceId) ?? board.workspaceId.slice(0, 8);
      map.set(board.id, `${workspaceName} / ${board.name}`);
      map.set(board.appBoardId, `${workspaceName} / ${board.name}`);
    });
    subscriptions.forEach((subscription) => {
      (subscription.filters.board_ids || []).forEach((boardId) => {
        if (!map.has(boardId)) map.set(boardId, boardId.slice(0, 8));
      });
    });
    return map;
  }, [boardRefs, subscriptions, workspaceNameById, workspaces]);

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
    if (!isSupabaseBackend || filters.workspace_ids.length === 0) {
      setMembers([]);
      return;
    }

    let cancelled = false;
    setMembers([]);
    calendarSubscriptionService.listWorkspaceMembers(filters.workspace_ids)
      .then((nextMembers) => {
        if (!cancelled) setMembers(nextMembers);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : '讀取成員失敗'));
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceKey, filters.workspace_ids]);

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
    setFilters(emptyFilters());
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

  const validate = () => {
    if (!user) return '請先登入';
    if (!name.trim()) return '請輸入訂閱名稱';
    if (filters.workspace_ids.length === 0) return '請至少選擇一個工作區';
    if (filters.scope_type === 'board' && (filters.board_ids || []).length === 0) return '請至少選擇一個看板';
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

  const submit = async () => {
    const error = validate();
    if (error || !user) {
      if (error) toast.warning(error);
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const updated = await calendarSubscriptionService.update(editingId, { name, filters });
        setSubscriptions((current) => current.map((item) => item.id === updated.id ? updated : item));
        toast.success('訂閱條件已更新');
      } else {
        const created = await calendarSubscriptionService.create({ name, filters }, user.uid);
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
    const displayBoardIds = (subscription.filters.board_ids || []).map((boardId) =>
      boardRefs.find((board) => board.id === boardId)?.appBoardId ?? boardId
    );
    setEditingId(subscription.id);
    setName(subscription.name);
    setFilters({ ...subscription.filters, workspace_ids: displayWorkspaceIds, board_ids: displayBoardIds });
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
              產生只讀行事曆訂閱連結，依工作區、負責人與日期類型輸出任務事件；外部行事曆會依各自週期抓取，更新不會即時出現。
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

            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-slate-500">工作區</div>
              <div className="space-y-2">
                {workspaces.map((workspace) => (
                  <label key={workspace.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={filters.workspace_ids.includes(workspace.id)}
                      onChange={() => setFilters((current) => {
                        const workspace_ids = toggleArrayValue(current.workspace_ids, workspace.id);
                        const allowedBoardIds = new Set(
                          workspaces
                            .filter((item) => workspace_ids.includes(item.id))
                            .flatMap((item) => item.boards.map((board) => board.id))
                        );
                        return {
                          ...current,
                          workspace_ids,
                          board_ids: (current.board_ids || []).filter((boardId) => allowedBoardIds.has(boardId)),
                        };
                      })}
                    />
                    <span>{workspace.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-slate-500">範圍</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, scope_type: 'workspace', board_ids: [] }))}
                  className={`h-9 border px-3 text-sm font-bold ${
                    (filters.scope_type || 'workspace') === 'workspace'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  工作區
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, scope_type: 'board' }))}
                  className={`h-9 border px-3 text-sm font-bold ${
                    filters.scope_type === 'board'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  看板
                </button>
              </div>
              {filters.scope_type === 'board' ? (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {availableBoards.length === 0 ? (
                    <div className="text-xs font-semibold text-slate-400">請先選擇包含看板的工作區。</div>
                  ) : (
                    availableBoards.map((board) => (
                      <label key={board.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedBoardSet.has(board.id)}
                          onChange={() => setFilters((current) => ({
                            ...current,
                            scope_type: 'board',
                            board_ids: toggleArrayValue(current.board_ids || [], board.id),
                          }))}
                        />
                        <span className="min-w-0 truncate">{board.workspaceTitle} / {board.title}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
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
                          <div className="mt-1 text-sm text-slate-500">
                            {describeFilters(subscription, workspaceNameById, boardNameById, memberNameById, user?.uid)}
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
