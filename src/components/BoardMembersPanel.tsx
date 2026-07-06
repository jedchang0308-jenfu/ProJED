import React from 'react';
import {
  Check,
  Clock,
  Copy,
  Link2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
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
import {
  buildBoardInviteUrl,
  generateBoardInviteToken,
  hashBoardInviteToken,
  isLocalBoardInviteUrl,
} from '../utils/boardInviteToken';

type ShareTab = 'members' | 'requests';
type BoardMembersPanelMode = 'embedded';

type BoardMembersPanelProps = {
  mode?: BoardMembersPanelMode;
};

type BoardShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ROLE_LABELS: Record<CollaborationRole, string> = {
  owner: '擁有者',
  admin: '系統管理員',
  project_manager: '專案負責人',
  member: '成員',
  viewer: '檢視者',
};

const ROLE_OPTIONS: CollaborationRole[] = ['owner', 'admin', 'project_manager', 'member', 'viewer'];
const INVITE_ROLE_OPTIONS: CollaborationRole[] = ['admin', 'project_manager', 'member', 'viewer'];
const DEFAULT_INVITE_ROLE: CollaborationRole = 'member';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PERMISSION_ROWS: { capability: PermissionCapability; label: string }[] = [
  { capability: 'read_board', label: '查看看板' },
  { capability: 'create_task', label: '建立任務' },
  { capability: 'edit_task', label: '編輯任務' },
  { capability: 'move_task', label: '移動任務' },
  { capability: 'delete_task', label: '刪除任務' },
  { capability: 'assign_task', label: '指派任務' },
  { capability: 'create_dependency', label: '建立相依關係' },
  { capability: 'manage_board_members', label: '管理看板成員' },
  { capability: 'edit_board_settings', label: '編輯看板設定' },
  { capability: 'read_audit', label: '查看稽核紀錄' },
];

const getMemberLabel = (member: Pick<BoardMember | WorkspaceMember, 'userId' | 'profile'>) =>
  member.profile?.displayName || member.profile?.email || member.userId;

const getMemberEmail = (member: Pick<BoardMember | WorkspaceMember, 'userId' | 'profile'>) =>
  member.profile?.email || member.userId;

const getMemberInitial = (member: Pick<BoardMember | WorkspaceMember, 'userId' | 'profile'>) =>
  getMemberLabel(member).trim().slice(0, 1).toUpperCase() || '?';

const hasBoardCapability = (
  rolePermissions: BoardRolePermissionMatrix,
  role: CollaborationRole,
  capability: PermissionCapability
) => rolePermissions[role].includes(capability);

const formatDate = (value?: number) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const canConfigureRolePermissionsFromAccess = (
  currentBoardAccess: ReturnType<typeof useMemberStore.getState>['currentBoardAccess']
) =>
  currentBoardAccess?.workspaceRole === 'owner'
  || currentBoardAccess?.workspaceRole === 'admin'
  || currentBoardAccess?.boardRole === 'owner'
  || currentBoardAccess?.boardRole === 'admin';

const useBoardMemberPanelState = () => {
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

  return {
    activeWorkspaceId,
    activeBoardId,
    boardMembers,
    boardRolePermissions,
    currentBoardAccess,
    loading,
    loadMembers,
    inviteBoardMember,
    removeBoardMember,
    updateBoardRolePermissions,
    canManageBoardMembers,
    canConfigureRolePermissions: canConfigureRolePermissionsFromAccess(currentBoardAccess),
  };
};

export const BoardShareDialog: React.FC<BoardShareDialogProps> = ({ open, onOpenChange }) => {
  const {
    activeWorkspaceId,
    activeBoardId,
    boardMembers,
    loading,
    loadMembers,
    inviteBoardMember,
    removeBoardMember,
    canManageBoardMembers,
  } = useBoardMemberPanelState();
  const activeBoard = useBoardStore(state => {
    const workspace = state.workspaces.find(item => item.id === state.activeWorkspaceId);
    return workspace?.boards.find(board => board.id === state.activeBoardId);
  });
  const [activeTab, setActiveTab] = React.useState<ShareTab>('members');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<CollaborationRole>(DEFAULT_INVITE_ROLE);
  const [pendingInvites, setPendingInvites] = React.useState<BoardInvite[]>([]);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [recentInviteLinks, setRecentInviteLinks] = React.useState<Record<string, string>>({});
  const [latestInviteId, setLatestInviteId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const latestInvite = latestInviteId
    ? pendingInvites.find(invite => invite.id === latestInviteId) ?? null
    : null;
  const latestInviteLink = latestInviteId ? recentInviteLinks[latestInviteId] : undefined;
  const inviteDisabledReason = !canManageBoardMembers
    ? '你沒有管理看板成員的權限。'
    : '';

  const loadPendingInvites = React.useCallback(async () => {
    if (!activeWorkspaceId || !activeBoardId) {
      setPendingInvites([]);
      return;
    }

    try {
      const invites = await boardInviteService.listPending(activeWorkspaceId, activeBoardId);
      setPendingInvites(invites);
    } catch (error) {
      console.warn('[BoardShareDialog] failed to load pending invites:', error);
      setPendingInvites([]);
    }
  }, [activeBoardId, activeWorkspaceId]);

  React.useEffect(() => {
    if (!open || !activeWorkspaceId || !activeBoardId) return;
    void loadMembers(activeWorkspaceId, activeBoardId);
    void loadPendingInvites();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [activeBoardId, activeWorkspaceId, loadMembers, loadPendingInvites, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

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
        defaultRole: inviteRole,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      const inviteUrl = buildBoardInviteUrl(token);
      setRecentInviteLinks(current => ({ ...current, [createdInvite.id]: inviteUrl }));
      setLatestInviteId(createdInvite.id);
      setInviteEmail('');
      setActiveTab('requests');
      toast.success(isLocalBoardInviteUrl(inviteUrl)
        ? '已建立本機測試邀請連結，請在同一個測試環境開啟。'
        : '已建立看板邀請。');
      await loadPendingInvites();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || '無法建立看板邀請。');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async (invite: BoardInvite) => {
    const link = recentInviteLinks[invite.id];
    if (!link) {
      toast.warning('此邀請的安全連結只會在建立當次顯示。請撤回後重新分享。');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast.success(isLocalBoardInviteUrl(link)
        ? '已複製本機測試邀請連結。'
        : '已複製邀請連結。');
    } catch {
      toast.error('無法複製邀請連結。');
    }
  };

  const handleRevokeInvite = async (invite: BoardInvite) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || inviteLoading) return;

    try {
      setInviteLoading(true);
      await boardInviteService.revoke(activeWorkspaceId, activeBoardId, invite.id);
      setRecentInviteLinks(current => {
        const next = { ...current };
        delete next[invite.id];
        return next;
      });
      if (latestInviteId === invite.id) setLatestInviteId(null);
      toast.success('已刪除邀請連結。');
      await loadPendingInvites();
    } catch {
      toast.error('無法刪除邀請連結。');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (member: BoardMember, role: CollaborationRole) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await inviteBoardMember(activeWorkspaceId, activeBoardId, member.userId, role);
      toast.success('已更新看板角色。');
    } catch {
      toast.error('無法更新看板角色。');
    }
  };

  const handleRemove = async (member: BoardMember) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await removeBoardMember(activeWorkspaceId, activeBoardId, member.userId);
      toast.success('已移除看板成員。');
    } catch {
      toast.error('無法移除看板成員。');
    }
  };

  if (!open || !activeBoardId) return null;

  return (
    <div
      className="fixed inset-0 z-[10040] flex items-start justify-center bg-slate-950/45 px-3 py-8 sm:items-center sm:py-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-share-title"
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-[660px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        data-board-share-dialog
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="board-share-title" className="text-xl font-semibold text-slate-900">
              分享看板
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">
              {activeBoard?.title || '目前看板'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="關閉分享看板"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px_auto]">
            <input
              ref={inputRef}
              type="email"
              value={inviteEmail}
              disabled={!canManageBoardMembers || inviteLoading}
              onChange={(event) => setInviteEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleInvite();
                }
              }}
              className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="電子郵件地址或名稱"
              aria-label="電子郵件地址或名稱"
            />
            <select
              value={inviteRole}
              disabled={!canManageBoardMembers || inviteLoading}
              onChange={(event) => setInviteRole(event.target.value as CollaborationRole)}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              aria-label="邀請角色"
            >
              {INVITE_ROLE_OPTIONS.map(role => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!canManageBoardMembers || inviteLoading || !inviteEmail.trim()}
              onClick={handleInvite}
              className="inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              data-board-share-submit
            >
              分享
            </button>
          </div>

          {inviteDisabledReason ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {inviteDisabledReason}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-slate-500">
              <Link2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800">
                {latestInvite ? '邀請連結已建立' : '建立邀請後即可複製專屬連結'}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-slate-500">
                {latestInvite
                  ? `${latestInvite.email} 可使用受邀信箱透過此連結加入為 ${ROLE_LABELS[latestInvite.defaultRole]}。`
                  : '目前資料層採 email 專屬邀請；先輸入 email 並按分享，再複製連結。'}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={!latestInvite || !latestInviteLink || !canManageBoardMembers}
                onClick={() => latestInvite && handleCopyInviteLink(latestInvite)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Copy size={15} />
                複製連結
              </button>
              <button
                type="button"
                disabled={!latestInvite || !canManageBoardMembers || inviteLoading}
                onClick={() => latestInvite && handleRevokeInvite(latestInvite)}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                刪除連結
              </button>
            </div>
          </div>

          <div className="mt-5 border-b border-slate-200">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`border-b-2 px-0 pb-2 text-sm font-semibold ${
                  activeTab === 'members'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                看板成員 <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{boardMembers.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`border-b-2 px-0 pb-2 text-sm font-semibold ${
                  activeTab === 'requests'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                加入要求 <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{pendingInvites.length}</span>
              </button>
            </div>
          </div>

          <div className="mt-3">
            {activeTab === 'members' ? (
              <MemberRows
                members={boardMembers}
                loading={loading}
                canManage={canManageBoardMembers}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ) : (
              <PendingInviteRows
                invites={pendingInvites}
                inviteLoading={inviteLoading}
                canManage={canManageBoardMembers}
                recentInviteLinks={recentInviteLinks}
                onCopy={handleCopyInviteLink}
                onRevoke={handleRevokeInvite}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

const MemberRows: React.FC<{
  members: BoardMember[];
  loading: boolean;
  canManage: boolean;
  onRoleChange: (member: BoardMember, role: CollaborationRole) => void;
  onRemove: (member: BoardMember) => void;
}> = ({ members, loading, canManage, onRoleChange, onRemove }) => {
  if (members.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
        目前沒有看板成員。
      </div>
    );
  }

  return (
    <div className="space-y-2" data-board-share-members>
      {members.map(member => {
        const isOwner = member.role === 'owner';
        const disabled = !canManage || loading || isOwner;
        return (
          <div key={member.userId} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {getMemberInitial(member)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{getMemberLabel(member)}</div>
              <div className="truncate text-xs text-slate-500">{getMemberEmail(member)}</div>
            </div>
            <select
              value={member.role}
              disabled={disabled}
              onChange={(event) => onRoleChange(member, event.target.value as CollaborationRole)}
              className="h-9 max-w-[132px] rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              aria-label={`${getMemberLabel(member)} 的看板角色`}
              title={!canManage ? '你沒有管理看板成員的權限。' : isOwner ? '擁有者角色不可在此變更。' : undefined}
            >
              {ROLE_OPTIONS.map(role => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(member)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={`移除 ${getMemberLabel(member)}`}
              title={!canManage ? '你沒有管理看板成員的權限。' : isOwner ? '擁有者不可移除。' : '移除成員'}
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

const PendingInviteRows: React.FC<{
  invites: BoardInvite[];
  inviteLoading: boolean;
  canManage: boolean;
  recentInviteLinks: Record<string, string>;
  onCopy: (invite: BoardInvite) => void;
  onRevoke: (invite: BoardInvite) => void;
}> = ({ invites, inviteLoading, canManage, recentInviteLinks, onCopy, onRevoke }) => {
  if (invites.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500" data-board-share-requests>
        目前沒有待處理的加入要求。
      </div>
    );
  }

  return (
    <div className="space-y-2" data-board-share-requests>
      {invites.map(invite => {
        const hasLink = Boolean(recentInviteLinks[invite.id]);
        return (
          <div key={invite.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Clock size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{invite.email}</div>
              <div className="truncate text-xs text-slate-500">
                {ROLE_LABELS[invite.defaultRole]} · 建立於 {formatDate(invite.createdAt)}
              </div>
              {!hasLink ? (
                <div className="mt-0.5 text-xs text-slate-400">
                  安全連結只在建立當次顯示；需要連結時請撤回後重新分享。
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!canManage || !hasLink || inviteLoading}
              onClick={() => onCopy(invite)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={`複製 ${invite.email} 的邀請連結`}
              title={hasLink ? '複製邀請連結' : '安全連結只在建立當次顯示'}
            >
              <Copy size={15} />
            </button>
            <button
              type="button"
              disabled={!canManage || inviteLoading}
              onClick={() => onRevoke(invite)}
              className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              撤回
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const BoardMembersPanel: React.FC<BoardMembersPanelProps> = () => {
  const {
    activeWorkspaceId,
    activeBoardId,
    boardMembers,
    boardRolePermissions,
    currentBoardAccess,
    loading,
    loadMembers,
    inviteBoardMember,
    removeBoardMember,
    updateBoardRolePermissions,
    canManageBoardMembers,
    canConfigureRolePermissions,
  } = useBoardMemberPanelState();
  const activeWorkspace = useBoardStore(state =>
    state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)
  );
  const activeBoard = useBoardStore(state => {
    const workspace = state.workspaces.find(item => item.id === state.activeWorkspaceId);
    return workspace?.boards.find(board => board.id === state.activeBoardId);
  });
  const [permissionSavingKey, setPermissionSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeWorkspaceId || !activeBoardId) return;
    void loadMembers(activeWorkspaceId, activeBoardId);
  }, [activeBoardId, activeWorkspaceId, loadMembers]);

  const handleRoleChange = async (member: BoardMember, role: CollaborationRole) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await inviteBoardMember(activeWorkspaceId, activeBoardId, member.userId, role);
      toast.success('已更新看板角色。');
    } catch {
      toast.error('無法更新看板角色。');
    }
  };

  const handleRemove = async (member: BoardMember) => {
    if (!activeWorkspaceId || !activeBoardId || !canManageBoardMembers || member.role === 'owner') return;

    try {
      await removeBoardMember(activeWorkspaceId, activeBoardId, member.userId);
      toast.success('已移除看板成員。');
    } catch {
      toast.error('無法移除看板成員。');
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
      toast.success('已更新角色權限。');
    } catch {
      toast.error('無法更新角色權限。');
    } finally {
      setPermissionSavingKey(null);
    }
  };

  if (!activeBoardId) return null;

  return (
    <section className="overflow-hidden border border-slate-200 bg-white" data-board-permission-settings>
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <ShieldCheck size={16} className="text-primary" />
          看板權限
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
            設定範圍：目前看板
          </span>
          <span className="inline-flex min-w-0 items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
            目標：{activeWorkspace?.title || '未選擇工作區'} / {activeBoard?.title || '未選擇看板'}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          分享邀請已移到看板右上角。此處保留進階成員角色與權限矩陣。
        </p>
        {!canManageBoardMembers ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            你目前沒有管理看板成員的權限，只能查看設定。
          </div>
        ) : null}
      </header>

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(460px,1.2fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <Users size={16} />
            看板成員
          </div>
          <MemberRows
            members={boardMembers}
            loading={loading}
            canManage={canManageBoardMembers}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ShieldCheck size={16} />
              角色權限矩陣
            </div>
            {canConfigureRolePermissions ? (
              <span className="text-xs font-semibold text-blue-600">可編輯</span>
            ) : (
              <span className="text-xs font-semibold text-slate-400">
                {currentBoardAccess ? '僅可檢視' : '讀取中'}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[1.4fr_repeat(5,minmax(80px,1fr))] bg-slate-50 text-xs font-bold text-slate-500">
                <div className="px-3 py-2">權限</div>
                {ROLE_OPTIONS.map(role => (
                  <div key={role} className="px-2 py-2 text-center">{ROLE_LABELS[role]}</div>
                ))}
              </div>

              {PERMISSION_ROWS.map(row => (
                <div
                  key={row.capability}
                  className="grid grid-cols-[1.4fr_repeat(5,minmax(80px,1fr))] border-t border-slate-200 text-xs"
                >
                  <div className="px-3 py-2 font-medium text-slate-700">{row.label}</div>
                  {ROLE_OPTIONS.map(role => (
                    <div key={role} className="flex items-center justify-center px-2 py-2">
                      {role === 'owner' || !canConfigureRolePermissions ? (
                        hasBoardCapability(boardRolePermissions, role, row.capability) ? (
                          <Check size={15} className="text-emerald-500" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                        )
                      ) : (
                        <button
                          type="button"
                          aria-pressed={hasBoardCapability(boardRolePermissions, role, row.capability)}
                          aria-label={`${ROLE_LABELS[role]} ${row.label}`}
                          disabled={loading || Boolean(permissionSavingKey)}
                          onClick={() => handlePermissionToggle(role, row.capability)}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            hasBoardCapability(boardRolePermissions, role, row.capability)
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'border-slate-200 bg-white text-slate-300 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                        >
                          {hasBoardCapability(boardRolePermissions, role, row.capability) ? (
                            <Check size={15} />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
