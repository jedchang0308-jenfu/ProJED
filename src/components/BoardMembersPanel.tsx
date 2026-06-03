import React from 'react';
import { Check, Clock, Link2, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useMemberStore } from '../store/useMemberStore';
import useBoardStore from '../store/useBoardStore';
import { toast } from '../store/useToastStore';
import { boardInviteService } from '../services/dataBackend';
import {
  type BoardInvite,
  type BoardMember,
  type BoardRolePermissionMatrix,
  type CollaborationRole,
  type PermissionCapability,
  type WorkspaceMember,
  normalizeBoardRolePermissionMatrix,
} from '../types';
import { buildBoardInviteUrl, generateBoardInviteToken, hashBoardInviteToken, isLocalBoardInviteUrl } from '../utils/boardInviteToken';

type MemberPanelTab = 'emailInvite' | 'boardMembers' | 'rolePermissions';
type BoardMembersPanelMode = 'popover' | 'embedded';

type BoardMembersPanelProps = {
  mode?: BoardMembersPanelMode;
};

const ROLE_LABELS: Record<CollaborationRole, string> = {
  owner: '擁有者',
  admin: '管理員',
  project_manager: '專案管理者',
  member: '成員',
  viewer: '檢視者',
};

const ROLE_OPTIONS: CollaborationRole[] = ['owner', 'admin', 'project_manager', 'member', 'viewer'];
const DEFAULT_INVITE_ROLE: CollaborationRole = 'member';

const PANEL_TABS: { id: MemberPanelTab; label: string }[] = [
  { id: 'emailInvite', label: '邀請連結' },
  { id: 'boardMembers', label: '看板成員' },
  { id: 'rolePermissions', label: '角色權限' },
];

const PERMISSION_ROWS: { capability: PermissionCapability; label: string }[] = [
  { capability: 'read_board', label: '檢查看板' },
  { capability: 'create_task', label: '建立任務' },
  { capability: 'edit_task', label: '編輯任務' },
  { capability: 'move_task', label: '移動任務' },
  { capability: 'delete_task', label: '刪除任務' },
  { capability: 'assign_task', label: '指派任務' },
  { capability: 'create_dependency', label: '建立依賴關係' },
  { capability: 'manage_board_members', label: '管理看板成員' },
  { capability: 'edit_board_settings', label: '編輯看板設定' },
  { capability: 'read_audit', label: '查看稽核紀錄' },
];

const getMemberLabel = (member: Pick<BoardMember | WorkspaceMember, 'userId' | 'profile'>) =>
  member.profile?.displayName || member.profile?.email || member.userId;

const hasBoardCapability = (
  rolePermissions: BoardRolePermissionMatrix,
  role: CollaborationRole,
  capability: PermissionCapability
) => rolePermissions[role].includes(capability);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (value?: number) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export const BoardMembersPanel: React.FC<BoardMembersPanelProps> = ({ mode = 'popover' }) => {
  const isEmbedded = mode === 'embedded';
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const boardMembers = useMemberStore(state => state.boardMembers);
  const boardRolePermissions = useMemberStore(state => state.boardRolePermissions);
  const currentBoardAccess = useMemberStore(state => state.currentBoardAccess);
  const loading = useMemberStore(state => state.loading);
  const loadMembers = useMemberStore(state => state.loadMembers);
  const inviteBoardMember = useMemberStore(state => state.inviteBoardMember);
  const removeBoardMember = useMemberStore(state => state.removeBoardMember);
  const updateBoardRolePermissions = useMemberStore(state => state.updateBoardRolePermissions);
  const { canManageBoardMembers } = useBoardPermissions();
  const [isOpen, setIsOpen] = React.useState(isEmbedded);
  const [activeTab, setActiveTab] = React.useState<MemberPanelTab>('emailInvite');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [pendingInvites, setPendingInvites] = React.useState<BoardInvite[]>([]);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [permissionSavingKey, setPermissionSavingKey] = React.useState<string | null>(null);
  const [recentInviteLinks, setRecentInviteLinks] = React.useState<Record<string, string>>({});
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const canConfigureRolePermissions =
    currentBoardAccess?.workspaceRole === 'owner'
    || currentBoardAccess?.workspaceRole === 'admin'
    || currentBoardAccess?.boardRole === 'owner'
    || currentBoardAccess?.boardRole === 'admin';

  React.useEffect(() => {
    if (isEmbedded) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isEmbedded, isOpen]);

  const loadPendingInvites = React.useCallback(async () => {
    if (!activeWorkspaceId || !activeBoardId) {
      setPendingInvites([]);
      return;
    }

    try {
      const invites = await boardInviteService.listPending(activeWorkspaceId, activeBoardId);
      setPendingInvites(invites);
    } catch (error) {
      console.warn('[BoardMembersPanel] 無法讀取待處理的看板邀請:', error);
      setPendingInvites([]);
    }
  }, [activeBoardId, activeWorkspaceId]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== 'emailInvite') return;
    void loadPendingInvites();
  }, [activeTab, isOpen, loadPendingInvites]);

  React.useEffect(() => {
    if (
      !isOpen
      || (activeTab !== 'boardMembers' && activeTab !== 'rolePermissions')
      || !activeWorkspaceId
      || !activeBoardId
    ) return;
    void loadMembers(activeWorkspaceId, activeBoardId);
  }, [activeBoardId, activeTab, activeWorkspaceId, isOpen, loadMembers]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || inviteLoading) return;
    if (!EMAIL_RE.test(email)) {
      toast.error('請輸入有效的電子郵件地址。');
      return;
    }

    try {
      setInviteLoading(true);
      const token = generateBoardInviteToken();
      const createdInvite = await boardInviteService.create(activeWorkspaceId, activeBoardId, {
        email,
        tokenHash: await hashBoardInviteToken(token),
        defaultRole: DEFAULT_INVITE_ROLE,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      const inviteUrl = buildBoardInviteUrl(token);
      setRecentInviteLinks(current => ({ ...current, [createdInvite.id]: inviteUrl }));
      toast.success(
        isLocalBoardInviteUrl(inviteUrl)
          ? '本機測試邀請連結已建立，請勿傳給真實受邀者。'
          : '邀請連結已建立，請複製後傳給對方。'
      );
      setInviteEmail('');
      await loadPendingInvites();
    } catch {
      toast.error('無法邀請此看板成員。');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async (invite: BoardInvite) => {
    const link = recentInviteLinks[invite.id];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(
        isLocalBoardInviteUrl(link)
          ? '本機測試邀請連結已複製，請勿傳給真實受邀者。'
          : '邀請連結已複製。'
      );
    } catch {
      toast.error('無法複製邀請連結。');
    }
  };

  const handleRevokeInvite = async (invite: BoardInvite) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || inviteLoading) return;

    try {
      setInviteLoading(true);
      await boardInviteService.revoke(activeWorkspaceId, activeBoardId, invite.id);
      toast.success('看板邀請已撤回。');
      await loadPendingInvites();
    } catch {
      toast.error('無法撤回此看板邀請。');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (member: BoardMember, role: CollaborationRole) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await inviteBoardMember(activeWorkspaceId, activeBoardId, member.userId, role);
      toast.success('看板角色已更新。');
    } catch {
      toast.error('無法更新此看板角色。');
    }
  };

  const handleRemove = async (member: BoardMember) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await removeBoardMember(activeWorkspaceId, activeBoardId, member.userId);
      toast.success('看板成員已移除。');
    } catch {
      toast.error('無法移除此看板成員。');
    }
  };

  const handlePermissionToggle = async (role: CollaborationRole, capability: PermissionCapability) => {
    if (
      !activeWorkspaceId
      || !activeBoardId
      || !canConfigureRolePermissions
      || role === 'owner'
      || permissionSavingKey
    ) return;

    const currentCapabilities = new Set(boardRolePermissions[role]);
    if (currentCapabilities.has(capability)) {
      currentCapabilities.delete(capability);
    } else {
      currentCapabilities.add(capability);
    }

    const nextPermissions = normalizeBoardRolePermissionMatrix({
      ...boardRolePermissions,
      [role]: Array.from(currentCapabilities),
    });

    try {
      setPermissionSavingKey(`${role}:${capability}`);
      await updateBoardRolePermissions(activeWorkspaceId, activeBoardId, nextPermissions);
      toast.success('角色權限已更新。');
    } catch {
      toast.error('無法更新角色權限。');
    } finally {
      setPermissionSavingKey(null);
    }
  };

  if (!activeBoardId) return null;

  const panelContent = isOpen ? (
        <div className={isEmbedded
          ? 'overflow-hidden border border-slate-200 bg-white'
          : 'absolute right-0 top-11 z-[10020] w-[420px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl'
        }>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">看板權限</h3>
              <p className="text-xs text-slate-400">管理看板邀請、成員與角色權限。</p>
            </div>
            {!isEmbedded && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="關閉看板權限面板"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50 px-2 py-2">
            {PANEL_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 rounded-md text-xs font-bold transition ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'emailInvite' && (
            <div className="px-4 py-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <UserPlus size={14} />
                <span>建立邀請連結</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="請輸入成員電子郵件"
                  value={inviteEmail}
                  disabled={!canManageBoardMembers || inviteLoading}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                  aria-label="邀請電子郵件"
                />
                <button
                  type="button"
                  disabled={!canManageBoardMembers || inviteLoading || !inviteEmail.trim()}
                  onClick={handleInvite}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  邀請
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                系統目前不會自動寄出電子郵件。建立後請點待處理邀請右側的連結圖示，複製後自行傳給對方。
              </p>
              {!canManageBoardMembers && (
                <p className="mt-2 text-xs text-slate-400">你目前的角色可以查看看板權限，但不能邀請成員。</p>
              )}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Clock size={14} />
                  <span>待處理邀請</span>
                </div>
                {pendingInvites.length === 0 ? (
                  <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                    目前沒有待處理邀請。
                  </div>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {pendingInvites.map(invite => (
                      <div key={invite.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-700">{invite.email}</div>
                          <div className="text-xs text-slate-400">
                            待接受 - {ROLE_LABELS[invite.defaultRole]} - 送出時間 {formatDate(invite.createdAt)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {recentInviteLinks[invite.id]
                              ? isLocalBoardInviteUrl(recentInviteLinks[invite.id])
                                ? '這是本機測試連結，只能供 QA 驗證；請勿傳給真實受邀者。'
                                : '點右側連結圖示複製邀請連結。'
                              : '邀請連結只會在建立當下顯示；如需重寄請撤回後重新建立。'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canManageBoardMembers || inviteLoading}
                          onClick={() => handleRevokeInvite(invite)}
                          className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          撤回
                        </button>
                        {recentInviteLinks[invite.id] ? (
                          <button
                            type="button"
                            disabled={!canManageBoardMembers || inviteLoading}
                            onClick={() => handleCopyInviteLink(invite)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={`複製 ${invite.email} 的邀請連結`}
                          >
                            <Link2 size={14} />
                          </button>
                        ) : (
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300"
                            title="邀請連結只會在建立當下顯示；如需重寄，請撤回後重新建立。"
                            aria-label="邀請連結已無法在此裝置查回"
                          >
                            <Link2 size={14} />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'boardMembers' && (
            <div className="max-h-[360px] overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {boardMembers.length === 0 ? (
                  <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    目前沒有看板成員。
                  </div>
                ) : boardMembers.map(member => (
                  <div key={member.userId} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {getMemberLabel(member).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-700">{getMemberLabel(member)}</div>
                      <div className="truncate text-xs text-slate-400">{member.profile?.email || member.userId}</div>
                    </div>
                    <select
                      value={member.role}
                      disabled={!canManageBoardMembers || loading || member.role === 'owner'}
                      onChange={(event) => handleRoleChange(member, event.target.value as CollaborationRole)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 disabled:bg-slate-100 disabled:text-slate-400"
                      aria-label={`${getMemberLabel(member)} 的角色`}
                    >
                      {ROLE_OPTIONS.map(role => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!canManageBoardMembers || loading || member.role === 'owner'}
                      onClick={() => handleRemove(member)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`從看板移除 ${getMemberLabel(member)}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'rolePermissions' && (
            <div className="max-h-[360px] overflow-auto px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <ShieldCheck size={14} />
                  <span>角色權限表</span>
                </div>
                {canConfigureRolePermissions && (
                  <span className="text-[11px] font-semibold text-blue-600">可設定</span>
                )}
              </div>
              <div className="min-w-[380px] overflow-hidden rounded-md border border-slate-100">
                <div className="grid grid-cols-[1.3fr_repeat(5,minmax(52px,1fr))] bg-slate-50 text-[11px] font-bold text-slate-500">
                  <div className="px-2 py-2">權限項目</div>
                  {ROLE_OPTIONS.map(role => (
                    <div key={role} className="px-1 py-2 text-center">{ROLE_LABELS[role]}</div>
                  ))}
                </div>
                {PERMISSION_ROWS.map(row => (
                  <div
                    key={row.capability}
                    className="grid grid-cols-[1.3fr_repeat(5,minmax(52px,1fr))] border-t border-slate-100 text-xs"
                  >
                    <div className="px-2 py-2 font-medium text-slate-600">{row.label}</div>
                    {ROLE_OPTIONS.map(role => (
                      <div key={role} className="flex items-center justify-center px-1 py-2">
                        {role === 'owner' || !canConfigureRolePermissions ? (
                          hasBoardCapability(boardRolePermissions, role, row.capability) ? (
                            <Check size={14} className="text-emerald-500" />
                          ) : (
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                          )
                        ) : (
                          <button
                            type="button"
                            aria-pressed={hasBoardCapability(boardRolePermissions, role, row.capability)}
                            aria-label={`${ROLE_LABELS[role]} ${row.label}`}
                            disabled={loading || Boolean(permissionSavingKey)}
                            onClick={() => handlePermissionToggle(role, row.capability)}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              hasBoardCapability(boardRolePermissions, role, row.capability)
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'border-slate-200 bg-white text-slate-300 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                          >
                            {hasBoardCapability(boardRolePermissions, role, row.capability) ? (
                              <Check size={14} />
                            ) : (
                              <span className="h-1 w-1 rounded-full bg-current" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
  ) : null;

  if (isEmbedded) {
    return (
      <div ref={panelRef}>
        {panelContent}
      </div>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Users size={16} />
        <span>看板權限</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
          {boardMembers.length}
        </span>
      </button>

      {panelContent}
    </div>
  );
};
