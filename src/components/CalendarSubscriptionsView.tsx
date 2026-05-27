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
  type CalendarWorkspaceRef,
  type CalendarWorkspaceMember,
} from '../services/supabase/calendarSubscriptionService';
import type { CalendarSubscriptionDateType, CalendarSubscriptionFilters } from '../services/supabase/database.types';
import { toast } from '../store/useToastStore';

const ADMIN_ROLES = new Set(['owner', 'admin', 'project_manager']);

const emptyFilters = (): CalendarSubscriptionFilters => ({
  workspace_ids: [],
  assignee: { type: 'me' },
  date_types: ['due_date'],
});

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

const describeFilters = (
  subscription: CalendarSubscription,
  workspaceNameById: Map<string, string>,
  memberNameById: Map<string, string>,
) => {
  const workspaces = subscription.filters.workspace_ids
    .map((workspaceId) => workspaceNameById.get(workspaceId) ?? workspaceId.slice(0, 8))
    .join('、');
  const assignee = subscription.filters.assignee.type === 'me'
    ? '我'
    : memberNameById.get(subscription.filters.assignee.user_id) ?? subscription.filters.assignee.user_id.slice(0, 8);
  const dateTypes = subscription.filters.date_types
    .map((type) => type === 'start_date' ? '開始日' : '到期日')
    .join('、');
  return `${workspaces || '未指定工作區'}｜負責人：${assignee}｜日期：${dateTypes || '未指定'}`;
};

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const CalendarSubscriptionsView: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const workspaces = useBoardStore((state) => state.workspaces);
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [workspaceRefs, setWorkspaceRefs] = useState<CalendarWorkspaceRef[]>([]);
  const [members, setMembers] = useState<CalendarWorkspaceMember[]>([]);
  const [generatedUrls, setGeneratedUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('我的工作行事曆');
  const [filters, setFilters] = useState<CalendarSubscriptionFilters>(emptyFilters);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedWorkspaceCount = new Set(filters.workspace_ids).size;
  const selectedWorkspaceKey = filters.workspace_ids.join(',');

  const currentUserAdminWorkspaceCount = useMemo(() => {
    if (!user) return 0;
    return new Set(
      members
        .filter((member) => member.userId === user.uid && ADMIN_ROLES.has(member.role))
        .map((member) => member.workspaceId)
    ).size;
  }, [members, user]);

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
      const [nextSubscriptions, nextWorkspaceRefs] = await Promise.all([
        calendarSubscriptionService.list(),
        calendarSubscriptionService.listWorkspaceRefs(),
      ]);
      setSubscriptions(nextSubscriptions);
      setWorkspaceRefs(nextWorkspaceRefs);
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
    if (!canAssignOthers && filters.assignee.type === 'user') {
      setFilters((current) => ({ ...current, assignee: { type: 'me' } }));
    }
  }, [canAssignOthers, filters.assignee.type]);

  const resetForm = () => {
    setName('我的工作行事曆');
    setFilters(emptyFilters());
    setEditingId(null);
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('已複製訂閱連結');
  };

  const validate = () => {
    if (!user) return '請先登入';
    if (!name.trim()) return '請輸入訂閱名稱';
    if (filters.workspace_ids.length === 0) return '請至少選擇一個工作區';
    if (filters.date_types.length === 0) return '請至少選擇一種日期類型';
    if (filters.assignee.type === 'user' && !filters.assignee.user_id) return '請選擇指定負責人';
    if (filters.assignee.type === 'user' && !canAssignOthers) return '只有管理角色可以訂閱他人的任務';
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
    setEditingId(subscription.id);
    setName(subscription.name);
    setFilters({ ...subscription.filters, workspace_ids: displayWorkspaceIds });
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
            自訂行事曆訂閱需要 Supabase 後端，因為 `.ics` 訂閱連結必須由 Edge Function 對外提供。
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
              產生只讀 iCal 連結，依工作區、負責人與日期類型輸出任務事件。
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
                      onChange={() => setFilters((current) => ({
                        ...current,
                        workspace_ids: toggleArrayValue(current.workspace_ids, workspace.id),
                      }))}
                    />
                    <span>{workspace.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-slate-500">負責人</div>
              <div className="flex flex-col gap-2 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={filters.assignee.type === 'me'}
                    onChange={() => setFilters((current) => ({ ...current, assignee: { type: 'me' } }))}
                  />
                  <span>我</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    disabled={!canAssignOthers}
                    checked={filters.assignee.type === 'user'}
                    onChange={() => setFilters((current) => ({
                      ...current,
                      assignee: { type: 'user', user_id: assignableMembers[0]?.userId ?? '' },
                    }))}
                  />
                  <span className={!canAssignOthers ? 'text-slate-400' : ''}>指定某人</span>
                </label>
              </div>
              {!canAssignOthers && selectedWorkspaceCount > 0 && (
                <div className="mt-2 flex gap-2 text-xs text-amber-700">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  指定某人需要在已選工作區具備 owner、admin 或 project_manager 權限。
                </div>
              )}
              {filters.assignee.type === 'user' && (
                <select
                  value={filters.assignee.user_id}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    assignee: { type: 'user', user_id: event.target.value },
                  }))}
                  className="mt-2 h-10 w-full border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  {assignableMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {getMemberLabel(member)}
                    </option>
                  ))}
                </select>
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
                            {describeFilters(subscription, workspaceNameById, memberNameById)}
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
