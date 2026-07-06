import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  DatabaseBackup,
  Download,
  FolderX,
  Settings,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { BoardMembersPanel } from './BoardMembersPanel';
import CalendarSubscriptionsView from './CalendarSubscriptionsView';
import { AppInstallAssistant } from './AppInstallAssistant';

type SettingsSection = 'backup' | 'permissions' | 'calendar' | 'app';

type SettingsViewProps = {
  initialSection?: SettingsSection;
};

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: 'backup',
    label: '備份與資料',
    description: '匯出任務資料、匯入備份與開啟回收桶。',
    icon: DatabaseBackup,
  },
  {
    id: 'permissions',
    label: '權限設定',
    description: '管理看板邀請、成員角色與權限表。',
    icon: ShieldCheck,
  },
  {
    id: 'calendar',
    label: '行事曆訂閱',
    description: '建立可供外部行事曆讀取的任務訂閱連結。',
    icon: CalendarPlus,
  },
  {
    id: 'app',
    label: '快速開啟',
    description: '將 ProJED 加到桌面，之後直接點圖示開啟。',
    icon: Smartphone,
  },
];

const SettingsView: React.FC<SettingsViewProps> = ({ initialSection = 'backup' }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

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

  const activeMeta = activeWorkspace && activeBoard
    ? `${activeWorkspace.title} / ${activeBoard.title}`
    : '尚未選擇看板';
  const setView = useBoardStore((state) => state.setView);
  const returnToBoard = () => setView(activeWorkspace && activeBoard ? 'board' : 'home');

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <header className="border-b border-slate-200 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <button
                type="button"
                onClick={returnToBoard}
                className="mb-3 inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                title="回到目前看板；也可以按 Esc"
                data-system-page-return-button="true"
                data-settings-return-button="true"
              >
                <ArrowLeft size={15} />
                回到看板
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Esc</span>
              </button>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-primary">
                <Settings size={16} />
                設定中心
              </div>
              <h2 className="text-2xl font-bold text-slate-900">系統設定與管理</h2>
              <p className="mt-1 text-sm text-slate-500">
                目前看板：{activeMeta}
              </p>
            </div>
          </div>
        </header>

        <nav className="grid gap-2 sm:grid-cols-4" aria-label="設定分類">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex min-h-[72px] items-start gap-3 border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-primary bg-white text-slate-900 shadow-sm ring-2 ring-primary/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
                aria-pressed={isActive}
              >
                <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                  isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{section.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{section.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {activeSection === 'backup' && <BackupSettings />}
        {activeSection === 'permissions' && <PermissionSettings hasActiveBoard={Boolean(activeBoard)} />}
        {activeSection === 'calendar' && <CalendarSubscriptionsView />}
        {activeSection === 'app' && <AppInstallAssistant mode="settings" />}
      </div>
    </div>
  );
};

const BackupSettings: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeWorkspace = useBoardStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)
  );
  const activeBoard = useBoardStore((state) => {
    const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
    return workspace?.boards.find((board) => board.id === state.activeBoardId);
  });
  const setView = useBoardStore((state) => state.setView);
  const { canEditBoardSettings } = useBoardPermissions();

  const canImport = Boolean(activeWorkspace && activeBoard && canEditBoardSettings);

  const handleExport = () => {
    useWbsStore.getState().exportData();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canImport) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      useWbsStore.getState().importData(readerEvent.target?.result as string);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <DatabaseBackup size={16} className="text-primary" />
          備份與資料管理
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">任務備份</h3>
            <p className="mt-1 text-sm text-slate-500">
              匯出會下載目前 ProJED 任務、依賴、標籤與工作區快照。匯入會把備份內容套用到目前選取的看板。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              <Download size={16} />
              匯出備份
            </button>

            <button
              type="button"
              disabled={!canImport}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
            >
              <Upload size={16} />
              匯入備份
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              disabled={!canImport}
              onChange={handleImportFile}
            />
          </div>

          {!canImport && (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              匯入備份需要先選擇看板，且你的角色必須具備編輯看板設定權限。
            </div>
          )}
        </div>

        <div className="border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">目前目標</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {activeWorkspace?.title || '未選擇工作區'}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {activeBoard?.title || '未選擇看板'}
          </div>
          <button
            type="button"
            onClick={() => setView('recycle_bin')}
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-600"
          >
            <FolderX size={15} />
            開啟資源回收桶
          </button>
        </div>
      </div>
    </section>
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
              權限設定以看板為單位管理。請從左側工作區選單選擇一個看板後再回到設定中心。
            </p>
          </div>
        </div>
      </section>
    );
  }

  return <BoardMembersPanel mode="embedded" />;
};

export default SettingsView;
