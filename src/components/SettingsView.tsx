import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  ChevronRight,
  DatabaseBackup,
  Bell,
  Settings,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useRecordDraftGuard } from '../hooks/useRecordDraftGuard';
import AccountProfileSettings from './AccountProfileSettings';
import BackupSettings from './BackupSettings';
import { BoardMembersPanel } from './BoardMembersPanel';
import CalendarSubscriptionsView from './CalendarSubscriptionsView';
import { AppInstallAssistant } from './AppInstallAssistant';
import { OptionalIconReinstallDetails } from './OptionalIconReinstallGuide';
import { SystemNoticeDetailsDialog } from './SystemNoticeDetailsDialog';

type SettingsSection = 'profile' | 'backup' | 'permissions' | 'calendar' | 'app' | 'notifications';

type SettingsViewProps = {
  initialSection?: SettingsSection;
};

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'profile', label: '個人資料', icon: UserRound },
  { id: 'backup', label: '備份、還原與資料移轉', icon: DatabaseBackup },
  { id: 'permissions', label: '看板權限', icon: ShieldCheck },
  { id: 'calendar', label: '行事曆訂閱', icon: CalendarPlus },
  { id: 'app', label: '安裝APP', icon: Smartphone },
  { id: 'notifications', label: '系統通知', icon: Bell },
];

const SYSTEM_NOTICES = [
  {
    id: 'optional-icon-reinstall-20260929',
    date: '2026-09-29',
    title: '手機 App 新圖示：可自行選擇更換',
    message: '網站圖示已更新，手機 App 可能仍顯示舊圖示。舊圖示可繼續使用；換圖是自願的。',
    details: <OptionalIconReinstallDetails />,
  },
] as const;

const SettingsView: React.FC<SettingsViewProps> = ({ initialSection = 'backup' }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [selectedNotice, setSelectedNotice] = useState<(typeof SYSTEM_NOTICES)[number] | null>(null);
  const closeNoticeDetails = useCallback(() => setSelectedNotice(null), []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const activeWorkspace = useBoardStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)
  );
  const activeBoard = useBoardStore((state) => {
    const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
    return workspace?.boards.find((board) => board.id === state.activeBoardId);
  });
  const setView = useBoardStore((state) => state.setView);
  const guardRecordDraft = useRecordDraftGuard();
  const returnToBoard = () => {
    void guardRecordDraft(() => setView(activeWorkspace && activeBoard ? 'board' : 'home'), {
      title: '返回看板？',
      message: '返回看板會離開目前紀錄；若尚未完成本機保存，請先決定是否存草稿。',
    });
  };

  return (
    <div className="h-full overflow-auto bg-slate-50" data-settings-view="true">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:p-5">
        <header className="border-b border-slate-200 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={returnToBoard}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="回到目前看板；也可以按 Esc"
              data-system-page-return-button="true"
              data-settings-return-button="true"
            >
              <ArrowLeft size={15} />
              回到看板
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Esc</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Settings size={16} className="shrink-0 text-primary" />
                <h2 className="text-2xl font-bold text-slate-900">設定中心</h2>
              </div>
              <p className="mt-0.5 text-xs leading-4 text-slate-500">看板、資料、外部連結與裝置設定</p>
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="設定分類">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                data-settings-section-tab={section.id}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden border px-2 py-2 text-center transition-colors sm:min-h-11 sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left ${
                  isActive
                    ? 'border-primary bg-white text-slate-900 shadow-sm ring-2 ring-primary/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
                aria-pressed={isActive}
              >
                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7 ${
                  isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="w-full min-w-0 break-words text-[11px] font-bold leading-4 sm:w-auto sm:text-sm">{section.label}</span>
              </button>
            );
          })}
        </nav>

        {activeSection === 'profile' && <AccountProfileSettings />}
        {activeSection === 'backup' && <BackupSettings />}
        {activeSection === 'permissions' && <PermissionSettings hasActiveBoard={Boolean(activeBoard)} />}
        {activeSection === 'calendar' && (
          <div className="space-y-3">
            <section className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2" data-calendar-settings-scope="external-link">
              <span className="text-xs font-bold text-slate-400">設定範圍</span>
              <span className="text-sm font-bold text-slate-800">外部連結</span>
            </section>
            <CalendarSubscriptionsView />
          </div>
        )}
        {activeSection === 'app' && (
          <div className="space-y-2">
            <AppInstallAssistant mode="settings" />
          </div>
        )}
        {activeSection === 'notifications' && (
          <section className="border border-slate-200 bg-white" data-system-notifications="true" aria-label="系統通知">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-bold text-slate-900">系統通知</h3>
              <p className="mt-0.5 text-xs text-slate-500">系統公告會保留在這裡，方便日後查看。</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {SYSTEM_NOTICES.map((notice) => (
                <li key={notice.id}>
                  <button
                    type="button"
                    className="group flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
                    aria-haspopup="dialog"
                    data-system-notice={notice.id}
                    data-system-notice-item="true"
                    onClick={() => setSelectedNotice(notice)}
                  >
                    <span className="min-w-0 flex-1">
                      <time className="text-xs text-slate-500" dateTime={notice.date}>{notice.date}</time>
                      <span className="mt-1 block text-sm font-bold text-slate-900 group-hover:underline group-focus-visible:underline">{notice.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">{notice.message}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {selectedNotice && (
        <SystemNoticeDetailsDialog
          date={selectedNotice.date}
          title={selectedNotice.title}
          onClose={closeNoticeDetails}
        >
          {selectedNotice.details}
        </SystemNoticeDetailsDialog>
      )}
    </div>
  );
};

const PermissionSettings: React.FC<{ hasActiveBoard: boolean }> = ({ hasActiveBoard }) => {
  if (!hasActiveBoard) {
    return (
      <section className="border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 text-slate-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">請先選擇看板</h3>
            <p className="mt-1 text-sm text-slate-500">
              看板權限以目前看板為單位管理。請從左側工作區選單選擇一個看板後再回到設定中心。
            </p>
          </div>
        </div>
      </section>
    );
  }

  return <BoardMembersPanel mode="embedded" />;
};

export default SettingsView;
