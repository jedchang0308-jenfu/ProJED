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
import useDialogStore from '../store/useDialogStore';
import { toast } from '../store/useToastStore';
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: 'backup',
    label: '備份與資料',
    icon: DatabaseBackup,
  },
  {
    id: 'permissions',
    label: '看板權限',
    icon: ShieldCheck,
  },
  {
    id: 'calendar',
    label: '行事曆訂閱',
    icon: CalendarPlus,
  },
  {
    id: 'app',
    label: '快速開啟',
    icon: Smartphone,
  },
];

const readFileAsText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (readerEvent) => resolve(String(readerEvent.target?.result ?? ''));
  reader.onerror = () => reject(reader.error ?? new Error('讀取備份檔案失敗'));
  reader.readAsText(file);
});

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

  const setView = useBoardStore((state) => state.setView);
  const returnToBoard = () => setView(activeWorkspace && activeBoard ? 'board' : 'home');

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
              <p className="mt-0.5 truncate text-xs text-slate-500">
                看板、資料、外部連結與裝置設定
              </p>
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="設定分類">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                data-settings-section-tab={section.id}
                className={`flex h-11 min-w-0 items-center gap-2 border px-3 text-left transition-colors ${
                  isActive
                    ? 'border-primary bg-white text-slate-900 shadow-sm ring-2 ring-primary/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
                aria-pressed={isActive}
              >
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 truncate text-sm font-bold">{section.label}</span>
              </button>
            );
          })}
        </nav>

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
        {activeSection === 'app' && <AppInstallAssistant mode="settings" />}
      </div>
    </div>
  );
};

const BackupSettings: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const activeWorkspace = useBoardStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)
  );
  const activeBoard = useBoardStore((state) => {
    const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
    return workspace?.boards.find((board) => board.id === state.activeBoardId);
  });
  const setView = useBoardStore((state) => state.setView);
  const { canEditBoardSettings } = useBoardPermissions();
  const showActionDialog = useDialogStore((state) => state.showActionDialog);

  const canImport = Boolean(activeWorkspace && activeBoard && canEditBoardSettings && !isImporting);
  const targetLabel = activeWorkspace && activeBoard
    ? `${activeWorkspace.title} / ${activeBoard.title}`
    : '尚未選擇看板';
  const importDisabledReason = !activeWorkspace || !activeBoard
    ? '請先選擇要匯入的工作區與看板。'
    : !canEditBoardSettings
      ? '你的角色沒有編輯看板設定權限，不能匯入備份。'
      : isImporting
        ? '匯入進行中，請勿關閉或重新整理頁面。'
        : '';

  const handleExport = () => {
    useWbsStore.getState().exportData();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canImport || !activeWorkspace || !activeBoard) return;

    void (async () => {
      try {
        const fileText = await readFileAsText(file);
        const decision = await showActionDialog({
          title: '匯入至目前看板？',
          message: `目標：${targetLabel}。來源檔案：${file.name}。匯入會把備份中的任務資料套用到目前看板，可能覆寫或新增任務；匯入同步期間請勿關閉或重整頁面。`,
          actions: [
            { id: 'cancel', label: '取消匯入', description: '不變更目前看板資料。' },
            {
              id: 'import',
              label: '確認匯入至目前看板',
              description: `${activeBoard.title} 會成為這次匯入的唯一目標看板。`,
              variant: 'primary',
            },
          ],
        });
        if (decision !== 'import') return;
        setIsImporting(true);
        await useWbsStore.getState().importData(fileText);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '讀取備份檔案失敗。');
      } finally {
        setIsImporting(false);
      }
    })();
  };

  return (
    <section className="border border-slate-200 bg-white" data-backup-settings-section="true">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <DatabaseBackup size={16} className="text-primary" />
          備份與資料
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
        <div className="border border-slate-200 bg-slate-50 p-4" data-settings-export-scope="global_snapshot">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">匯出全域快照</h3>
            <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
              全域快照
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            會下載目前 ProJED 的工作區、看板、任務、依賴與標籤快照。
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleExport}
              data-settings-export-global-snapshot="true"
              className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              <Download size={16} />
              匯出全域快照
            </button>
          </div>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4" data-settings-import-scope="current_board">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">匯入至目前看板</h3>
            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
              目前看板
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            會把備份中的任務資料套用到目前看板；不會還原 Workspace 結構。
          </p>
          <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="font-bold text-slate-500">目標：</span>
            <span className="font-semibold text-slate-800">{targetLabel}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canImport}
              onClick={() => fileInputRef.current?.click()}
              data-settings-import-current-board="true"
              className="inline-flex h-10 items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
            >
              <Upload size={16} />
              {isImporting ? '匯入中' : '選擇檔案並確認匯入'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              disabled={!canImport}
              onChange={handleImportFile}
              data-settings-import-file-input="true"
            />
          </div>

          {importDisabledReason && (
            <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {importDisabledReason}
            </div>
          )}
        </div>

        <div className="border border-slate-200 bg-slate-50 p-3" data-settings-trash-scope="current_board">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">目前看板回收桶</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">
            {activeWorkspace?.title || '未選擇工作區'}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {activeBoard?.title || '未選擇看板'}
          </div>
          <button
            type="button"
            onClick={() => setView('recycle_bin')}
            disabled={!activeBoard}
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
            data-settings-open-current-board-trash="true"
          >
            <FolderX size={15} />
            開啟目前看板回收桶
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
