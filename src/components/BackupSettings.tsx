import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Download,
  FileCheck2,
  FolderX,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import {
  BackupError,
  backupApplicationService,
  type BackupExecutionResult,
  type BackupImportPlan,
  type BackupInspection,
  type BackupMode,
  type BackupPackageV2,
} from '../features/backup';
import { backupBackendService } from '../services/dataBackend';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useTagStore } from '../store/useTagStore';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { toast } from '../store/useToastStore';

const SOURCE_SEPARATOR = '\u001f';
const ALL_BOARDS_SOURCE_VALUE = '__all_boards__';

interface BoardExportOption {
  workspaceId: string;
  workspaceTitle: string;
  boardId: string;
  boardTitle: string;
  value: string;
}

interface BoardExportResult {
  option: BoardExportOption;
  packageValue: BackupPackageV2 | null;
  errorMessage: string;
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW');
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof BackupError) return error.message;
  return error instanceof Error ? error.message : '備份操作失敗，請重新整理後再試。';
};

const Stat: React.FC<{ label: string; value: number; tone?: 'default' | 'danger' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div className={'min-w-[72px] border px-2.5 py-2 ' + (tone === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white')}>
    <div className={'text-lg font-bold ' + (tone === 'danger' ? 'text-rose-700' : 'text-slate-900')}>{value}</div>
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
  </div>
);

const BackupSettings: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaces = useBoardStore(state => state.workspaces);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const setView = useBoardStore(state => state.setView);
  const { canEditBoardSettings } = useBoardPermissions();

  const boardOptions = useMemo<BoardExportOption[]>(() => workspaces.flatMap(workspace =>
    workspace.boards.map(board => ({
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      boardId: board.id,
      boardTitle: board.title,
      value: workspace.id + SOURCE_SEPARATOR + board.id,
    }))
  ), [workspaces]);
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
  const activeBoard = activeWorkspace?.boards.find(board => board.id === activeBoardId);

  const [sourceValue, setSourceValue] = useState('');
  const [exportResults, setExportResults] = useState<BoardExportResult[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [mode, setMode] = useState<BackupMode>('copy_to_new_board');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(activeWorkspaceId ?? '');
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [plan, setPlan] = useState<BackupImportPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [executeLoading, setExecuteLoading] = useState(false);
  const [result, setResult] = useState<BackupExecutionResult | null>(null);

  const isAllBoardsSource = sourceValue === ALL_BOARDS_SOURCE_VALUE;
  const selectedExportTargets = useMemo(() => {
    if (isAllBoardsSource) return boardOptions;
    return boardOptions.filter(option => option.value === sourceValue);
  }, [boardOptions, isAllBoardsSource, sourceValue]);
  const successfulExportPackages = useMemo(
    () => exportResults
      .map(item => item.packageValue)
      .filter((packageValue): packageValue is BackupPackageV2 => Boolean(packageValue)),
    [exportResults]
  );
  const failedExportResults = useMemo(
    () => exportResults.filter(item => item.errorMessage),
    [exportResults]
  );
  const exportTotals = useMemo(
    () => successfulExportPackages.reduce(
      (total, packageValue) => ({
        tasks: total.tasks + packageValue.manifest.entities.tasks,
        dependencies: total.dependencies + packageValue.manifest.entities.dependencies,
        tags: total.tags + packageValue.manifest.entities.tags,
      }),
      { tasks: 0, dependencies: 0, tags: 0 }
    ),
    [successfulExportPackages]
  );
  const exportPackage = isAllBoardsSource ? null : successfulExportPackages[0] ?? null;

  useEffect(() => {
    if (sourceValue === ALL_BOARDS_SOURCE_VALUE && boardOptions.length > 0) return;
    if (sourceValue && boardOptions.some(option => option.value === sourceValue)) return;
    const activeValue = activeWorkspaceId && activeBoardId
      ? activeWorkspaceId + SOURCE_SEPARATOR + activeBoardId
      : boardOptions[0]?.value ?? '';
    setSourceValue(activeValue);
  }, [activeBoardId, activeWorkspaceId, boardOptions, sourceValue]);

  useEffect(() => {
    if (!targetWorkspaceId && activeWorkspaceId) setTargetWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId, targetWorkspaceId]);

  useEffect(() => {
    if (!sourceValue || selectedExportTargets.length === 0) {
      setExportResults([]);
      return;
    }
    let cancelled = false;
    setExportLoading(true);
    setExportError('');
    void backupApplicationService.createBoardPackages(selectedExportTargets.map(option => ({
      workspaceId: option.workspaceId,
      workspaceTitle: option.workspaceTitle,
      boardId: option.boardId,
    })))
      .then(results => {
        if (cancelled) return;
        const resultBySource = new Map(results.map(item => [
          item.workspaceId + SOURCE_SEPARATOR + item.boardId,
          item,
        ]));
        const nextResults = selectedExportTargets.map(option => {
          const matched = resultBySource.get(option.value);
          return {
            option,
            packageValue: matched?.packageValue ?? null,
            errorMessage: matched?.error?.message ?? '',
          };
        });
        setExportResults(nextResults);
        if (!isAllBoardsSource && nextResults[0]?.errorMessage) {
          setExportError(nextResults[0].errorMessage);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setExportResults([]);
          setExportError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setExportLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAllBoardsSource, selectedExportTargets, sourceValue]);

  useEffect(() => {
    setPlan(null);
    setConfirmation('');
    setResult(null);
  }, [mode, targetWorkspaceId, newBoardTitle, inspection]);

  useEffect(() => {
    if (!executeLoading) return;
    const guardNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guardNavigation);
    return () => window.removeEventListener('beforeunload', guardNavigation);
  }, [executeLoading]);

  const replaceCompatible = Boolean(
    inspection
    && activeWorkspaceId
    && activeBoardId
    && inspection.package.source.workspaceId === activeWorkspaceId
    && inspection.package.source.boardId === activeBoardId
    && canEditBoardSettings
  );
  const targetWorkspace = workspaces.find(workspace => workspace.id === targetWorkspaceId);
  const canBuildPlan = Boolean(
    inspection
    && targetWorkspace
    && (mode === 'copy_to_new_board' ? newBoardTitle.trim() : replaceCompatible)
    && !planLoading
    && !executeLoading
  );
  const canExecute = Boolean(
    plan?.allowed
    && !executeLoading
    && (mode === 'copy_to_new_board' || confirmation === plan.confirmationPhrase)
  );

  const handleInspectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setInspectLoading(true);
    setImportError('');
    setInspection(null);
    setPlan(null);
    setResult(null);
    setFileName(file.name);
    void backupApplicationService.inspectFile(file)
      .then(nextInspection => {
        setInspection(nextInspection);
        setMode('copy_to_new_board');
        setNewBoardTitle(nextInspection.package.payload.board.title);
        setTargetWorkspaceId(activeWorkspaceId ?? workspaces[0]?.id ?? '');
      })
      .catch(error => setImportError(getErrorMessage(error)))
      .finally(() => setInspectLoading(false));
  };

  const handlePlan = () => {
    if (!inspection || !targetWorkspace || !canBuildPlan) return;
    setPlanLoading(true);
    setImportError('');
    setResult(null);
    const target = mode === 'copy_to_new_board'
      ? {
          workspaceId: targetWorkspace.id,
          workspaceTitle: targetWorkspace.title,
          boardTitle: newBoardTitle.trim(),
        }
      : {
          workspaceId: activeWorkspace?.id ?? '',
          workspaceTitle: activeWorkspace?.title ?? '',
          boardId: activeBoard?.id,
          boardTitle: activeBoard?.title ?? '',
        };
    void backupApplicationService.planImport(inspection.package, mode, target)
      .then(setPlan)
      .catch(error => setImportError(getErrorMessage(error)))
      .finally(() => setPlanLoading(false));
  };

  const refreshActiveBoardState = async (executionResult: BackupExecutionResult) => {
    const source = await backupBackendService.readBoardSource(
      executionResult.targetWorkspaceId,
      executionResult.targetBoardId
    );
    const oldTargetIds = new Set(Object.values(useWbsStore.getState().nodes)
      .filter(task =>
        task.workspaceId === executionResult.targetWorkspaceId
        && task.boardId === executionResult.targetBoardId
      )
      .map(task => task.id));
    useWbsStore.getState().setNodes(source.tasks, {
      scopeBoardIds: [executionResult.targetBoardId],
      preserveOutOfScope: true,
    });
    useWbsStore.setState(state => ({
      dependencies: [
        ...state.dependencies.filter(dependency =>
          !oldTargetIds.has(dependency.fromId) && !oldTargetIds.has(dependency.toId)
        ),
        ...source.dependencies,
      ],
    }));
    await useTagStore.getState().loadTags(executionResult.targetWorkspaceId);
  };

  const registerImportedBoard = (executionResult: BackupExecutionResult) => {
    const state = useBoardStore.getState();
    state.setWorkspaces(state.workspaces.map(workspace => {
      if (workspace.id !== executionResult.targetWorkspaceId) return workspace;
      if (workspace.boards.some(board => board.id === executionResult.targetBoardId)) return workspace;
      return {
        ...workspace,
        boards: [...workspace.boards, {
          id: executionResult.targetBoardId,
          title: executionResult.targetBoardTitle,
          dependencies: [],
          order: Date.now(),
          createdAt: Date.now(),
        }],
      };
    }));
  };

  const handleExecute = () => {
    if (!inspection || !plan || !canExecute) return;
    setExecuteLoading(true);
    setImportError('');
    setResult(null);
    void (async () => {
      try {
        let preReplacementPackage: BackupPackageV2 | undefined;
        if (plan.mode === 'replace_current_board') {
          preReplacementPackage = await backupApplicationService.preparePreReplacementPackage(plan);
          backupApplicationService.downloadPackage(preReplacementPackage);
        }
        const outcome = await backupApplicationService.executeImport({
          package: inspection.package,
          plan,
          newBoardTitle: newBoardTitle.trim(),
          preReplacementPackage,
        });
        if (plan.mode === 'copy_to_new_board') registerImportedBoard(outcome.result);
        if (
          plan.mode === 'replace_current_board'
          && outcome.result.targetWorkspaceId === activeWorkspaceId
          && outcome.result.targetBoardId === activeBoardId
        ) {
          await refreshActiveBoardState(outcome.result);
        }
        setResult(outcome.result);
        toast.success(plan.mode === 'copy_to_new_board' ? '已複製成新看板。' : '已還原目前看板內容。');
      } catch (error) {
        setImportError(getErrorMessage(error));
      } finally {
        setExecuteLoading(false);
      }
    })();
  };

  const openResultBoard = () => {
    if (!result) return;
    useBoardStore.getState().switchBoard(result.targetWorkspaceId, result.targetBoardId);
  };

  return (
    <section className="border border-slate-200 bg-white" data-backup-settings-section="true">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <DatabaseBackup size={16} className="text-primary" />
            備份、還原與資料移轉
          </div>
          <p className="mt-0.5 text-xs text-slate-500">每份檔案只對應一張看板；匯入前會先檢查影響，不會選檔後立即寫入。</p>
        </div>
        <button
          type="button"
          onClick={() => setView('recycle_bin')}
          disabled={!activeBoard}
          className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          data-settings-open-current-board-trash="true"
        >
          <FolderX size={15} />
          目前看板回收桶
        </button>
      </div>

      <div className="grid xl:grid-cols-2">
        <section className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r" data-backup-export-panel="true">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-slate-900">建立看板備份</h3>
          </div>
          <label className="mt-4 block text-xs font-bold text-slate-500" htmlFor="backup-source-board">來源看板</label>
          <select
            id="backup-source-board"
            value={sourceValue}
            onChange={event => setSourceValue(event.target.value)}
            className="mt-1 h-10 w-full border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            data-backup-source-board-select="true"
          >
            {boardOptions.length > 0 && (
              <option value={ALL_BOARDS_SOURCE_VALUE}>全部看板（每張看板各一個檔）</option>
            )}
            {boardOptions.map(option => (
              <option key={option.value} value={option.value}>{option.workspaceTitle} / {option.boardTitle}</option>
            ))}
          </select>

          {exportLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500" data-backup-export-loading="true">
              <RefreshCw size={15} className="animate-spin" />
              {isAllBoardsSource ? '正在逐張建立看板備份' : '正在讀取後端看板資料'}
            </div>
          )}
          {exportError && <div role="alert" className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{exportError}</div>}
          {isAllBoardsSource && exportResults.length > 0 && !exportLoading && (
            <>
              <div className="mt-4 flex flex-wrap gap-2" data-backup-export-batch-summary="true">
                <Stat label="可下載檔案" value={successfulExportPackages.length} />
                <Stat label="失敗看板" value={failedExportResults.length} tone={failedExportResults.length ? 'danger' : 'default'} />
                <Stat label="任務" value={exportTotals.tasks} />
                <Stat label="依賴" value={exportTotals.dependencies} />
                <Stat label="使用中標籤" value={exportTotals.tags} />
              </div>
              <div className="mt-3 max-h-52 overflow-y-auto border border-slate-200" data-backup-export-batch-list="true">
                {exportResults.map(item => (
                  <div
                    key={item.option.value}
                    className="grid gap-1 border-b border-slate-100 px-3 py-2 last:border-b-0 sm:grid-cols-[1fr_auto]"
                    data-backup-export-batch-row="true"
                  >
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-bold text-slate-800" title={`${item.option.workspaceTitle} / ${item.option.boardTitle}`}>
                        {item.option.workspaceTitle} / {item.option.boardTitle}
                      </div>
                      {item.errorMessage && <div className="mt-1 text-rose-700">{item.errorMessage}</div>}
                    </div>
                    <div
                      className={'self-start border px-2 py-1 text-[11px] font-bold ' + (item.packageValue
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700')}
                      data-backup-export-batch-status={item.packageValue ? 'ready' : 'failed'}
                    >
                      {item.packageValue ? '已建立' : '失敗'}
                    </div>
                  </div>
                ))}
              </div>
              {failedExportResults.length > 0 && (
                <p className="mt-3 text-xs font-semibold text-amber-700" data-backup-export-partial-warning="true">
                  有 {failedExportResults.length} 張看板未建立備份；按下載只會取得已建立的 {successfulExportPackages.length} 個檔案。
                </p>
              )}
              <button
                type="button"
                onClick={() => backupApplicationService.downloadPackages(successfulExportPackages)}
                disabled={successfulExportPackages.length === 0}
                className="mt-4 inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-300"
                data-backup-download-all-v2="true"
              >
                <Download size={16} />
                {failedExportResults.length > 0
                  ? `下載 ${successfulExportPackages.length} 個可建立的備份`
                  : `下載 ${successfulExportPackages.length} 個看板備份`}
              </button>
            </>
          )}
          {exportPackage && !exportLoading && (
            <>
              <div className="mt-4 flex flex-wrap gap-2" data-backup-export-counts="true">
                <Stat label="任務" value={exportPackage.manifest.entities.tasks} />
                <Stat label="依賴" value={exportPackage.manifest.entities.dependencies} />
                <Stat label="使用中標籤" value={exportPackage.manifest.entities.tags} />
              </div>
              <details className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
                <summary className="cursor-pointer font-bold text-slate-700">查看包含與不包含的資料</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="font-bold text-emerald-700">包含</div>
                    <ul className="mt-1 space-y-1">{exportPackage.manifest.includes.map(item => <li key={item}>・{item}</li>)}</ul>
                  </div>
                  <div>
                    <div className="font-bold text-slate-600">不包含</div>
                    <ul className="mt-1 space-y-1">{exportPackage.manifest.excludes.map(item => <li key={item}>・{item}</li>)}</ul>
                  </div>
                </div>
              </details>
              <button
                type="button"
                onClick={() => backupApplicationService.downloadPackage(exportPackage)}
                className="mt-4 inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
                data-backup-download-v2="true"
              >
                <Download size={16} />
                下載看板備份
              </button>
            </>
          )}
        </section>

        <section className="p-4" data-backup-import-panel="true">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-slate-900">匯入或還原</h3>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={inspectLoading || executeLoading}
            className="mt-4 inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            data-backup-select-file="true"
          >
            {inspectLoading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            {inspectLoading ? '正在檢查檔案' : inspection ? '重新選擇備份檔' : '選擇備份檔'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleInspectFile}
            data-backup-file-input="true"
          />

          {importError && <div role="alert" className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{importError}</div>}

          {inspection && (
            <div className="mt-4 space-y-4" data-backup-inspection-ready="true">
              <div className="border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FileCheck2 size={16} className="text-emerald-600" />
                  檔案已通過完整性檢查
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div><dt className="inline text-slate-500">檔案：</dt><dd className="inline font-semibold text-slate-700">{fileName}</dd></div>
                  <div><dt className="inline text-slate-500">版本：</dt><dd className="inline font-semibold text-slate-700">V{inspection.package.schemaVersion}</dd></div>
                  <div><dt className="inline text-slate-500">來源：</dt><dd className="inline font-semibold text-slate-700">{inspection.package.source.boardTitle}</dd></div>
                  <div><dt className="inline text-slate-500">建立：</dt><dd className="inline font-semibold text-slate-700">{formatDateTime(inspection.package.createdAt)}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="inline text-slate-500">完整性：</dt>
                    <dd className="inline font-mono font-semibold text-slate-700">
                      SHA-256 {inspection.package.manifest.checksum.value.slice(0, 16)}...
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Stat label="任務" value={inspection.package.manifest.entities.tasks} />
                  <Stat label="依賴" value={inspection.package.manifest.entities.dependencies} />
                  <Stat label="標籤" value={inspection.package.manifest.entities.tags} />
                </div>
                <details className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-bold text-slate-700">查看此檔案不包含的資料</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {inspection.package.manifest.excludes.map(item => <li key={item}>・{item}</li>)}
                  </ul>
                </details>
              </div>

              {inspection.warnings.map(warning => (
                <div key={warning} className="flex gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {warning}
                </div>
              ))}

              <div>
                <div className="text-xs font-bold text-slate-500">匯入方式</div>
                <div className="mt-1 grid grid-cols-2 border border-slate-200 p-1" role="radiogroup" aria-label="匯入方式">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'copy_to_new_board'}
                    onClick={() => setMode('copy_to_new_board')}
                    className={'flex min-h-10 items-center justify-center gap-2 px-2 text-xs font-bold ' + (mode === 'copy_to_new_board' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}
                    data-backup-mode-copy="true"
                  >
                    <Copy size={15} />
                    複製成新看板
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'replace_current_board'}
                    disabled={!replaceCompatible}
                    onClick={() => setMode('replace_current_board')}
                    className={'flex min-h-10 items-center justify-center gap-2 px-2 text-xs font-bold ' + (mode === 'replace_current_board' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300')}
                    data-backup-mode-replace="true"
                  >
                    <ShieldAlert size={15} />
                    取代目前內容
                  </button>
                </div>
                {!replaceCompatible && (
                  <p className="mt-1 text-xs text-slate-500">只有目前看板自己建立的備份，且具備管理權限時，才能取代內容。</p>
                )}
              </div>

              {mode === 'copy_to_new_board' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-500">
                    目標工作區
                    <select
                      value={targetWorkspaceId}
                      onChange={event => setTargetWorkspaceId(event.target.value)}
                      className="mt-1 h-10 w-full border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      data-backup-target-workspace="true"
                    >
                      {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-500">
                    新看板名稱
                    <input
                      value={newBoardTitle}
                      onChange={event => setNewBoardTitle(event.target.value)}
                      maxLength={80}
                      className="mt-1 h-10 w-full border border-slate-200 px-3 text-sm font-normal text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      data-backup-new-board-title="true"
                    />
                  </label>
                </div>
              ) : (
                <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-backup-replace-target="true">
                  目標：<span className="font-bold">{activeWorkspace?.title} / {activeBoard?.title}</span>
                </div>
              )}

              <button
                type="button"
                disabled={!canBuildPlan}
                onClick={handlePlan}
                className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                data-backup-build-plan="true"
              >
                {planLoading ? <RefreshCw size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                {planLoading ? '正在檢查影響' : '檢查匯入影響'}
              </button>

              {plan && (
                <div className={'border px-3 py-3 ' + (plan.allowed ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50')} data-backup-plan-ready="true">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    {plan.allowed ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
                    {plan.allowed ? '可以執行' : '目前不能執行'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Stat label="新增" value={plan.counts.create} />
                    <Stat label="更新" value={plan.counts.update} />
                    <Stat label="保留" value={plan.counts.keep} />
                    <Stat label="移除" value={plan.counts.delete} tone={plan.counts.delete ? 'danger' : 'default'} />
                  </div>
                  {plan.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-amber-700">{warning}</p>)}
                  {plan.blockers.map(blocker => <p key={blocker.code + '-' + blocker.message} className="mt-2 text-xs font-semibold text-rose-700">{blocker.message}</p>)}

                  {plan.allowed && mode === 'replace_current_board' && (
                    <label className="mt-3 block text-xs font-bold text-rose-700">
                      輸入「{plan.confirmationPhrase}」確認取代
                      <input
                        value={confirmation}
                        onChange={event => setConfirmation(event.target.value)}
                        className="mt-1 h-10 w-full border border-rose-300 bg-white px-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                        data-backup-replace-confirmation="true"
                      />
                    </label>
                  )}

                  {plan.allowed && (
                    <button
                      type="button"
                      disabled={!canExecute}
                      onClick={handleExecute}
                      className={'mt-3 inline-flex h-10 items-center gap-2 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ' + (mode === 'replace_current_board' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary hover:bg-primary-hover')}
                      data-backup-execute="true"
                    >
                      {executeLoading ? <RefreshCw size={16} className="animate-spin" /> : mode === 'copy_to_new_board' ? <Copy size={16} /> : <ShieldAlert size={16} />}
                      {executeLoading ? '正在執行與驗證' : mode === 'copy_to_new_board' ? '複製成新看板' : '建立安全備份並取代'}
                    </button>
                  )}
                </div>
              )}

              {result && (
                <div className="border border-emerald-200 bg-emerald-50 px-3 py-3" data-backup-import-success="true">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <CheckCircle2 size={16} />
                    匯入與讀回驗證完成
                  </div>
                  <p className="mt-1 text-xs text-emerald-700">目標：{result.targetBoardTitle} · 執行識別碼 {result.executionId}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Stat label="新增" value={result.counts.create} />
                    <Stat label="更新" value={result.counts.update} />
                    <Stat label="移除" value={result.counts.delete} />
                  </div>
                  <p className="mt-2 text-xs text-emerald-700">
                    已從後端讀回比對任務內容、父子階層、依賴與筆數。
                    {result.mode === 'replace_current_board' ? ' 執行前安全備份也已下載。' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={openResultBoard}
                    className="mt-3 inline-flex h-9 items-center gap-2 border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                    data-backup-open-result-board="true"
                  >
                    開啟目標看板
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default BackupSettings;
