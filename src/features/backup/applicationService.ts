import { backupBackendService, dataBackend } from '../../services/dataBackend';
import {
  BackupError,
  type BackupErrorCode,
  type BackupExecutionResult,
  type BackupImportPlan,
  type BackupImportTarget,
  type BackupInspection,
  type BackupMode,
  type BackupPackageV2,
  type BackupVerificationReport,
} from './types';
import {
  buildBackupFilename,
  compareBackupSemantics,
  createBackupPackage,
  inspectBackupText,
  stringifyBackupPackage,
  validateBackupFileSize,
} from './package';

const APP_VERSION = '0.0.0';

const requireSupportedBackend = (): 'supabase' | 'local-test' => {
  if (dataBackend === 'supabase' || dataBackend === 'local-test') return dataBackend;
  throw new BackupError('BACKEND_UNSUPPORTED', '目前資料後端只能檢查備份檔，不能建立或執行交易式備份。');
};

export interface ExecuteBackupImportOptions {
  package: BackupPackageV2;
  plan: BackupImportPlan;
  newBoardTitle?: string;
  preReplacementPackage?: BackupPackageV2;
}

export interface ExecuteBackupImportOutcome {
  result: BackupExecutionResult;
  verification: BackupVerificationReport;
}

export interface CreateBoardBackupPackageRequest {
  workspaceId: string;
  boardId: string;
}

export interface CreateBoardBackupPackageResult extends CreateBoardBackupPackageRequest {
  packageValue: BackupPackageV2 | null;
  error: {
    code: BackupErrorCode | 'UNKNOWN';
    message: string;
  } | null;
}

const toBatchError = (error: unknown): CreateBoardBackupPackageResult['error'] => {
  if (error instanceof BackupError) return { code: error.code, message: error.message };
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : '備份建立失敗，請重新整理後再試。',
  };
};

const createPackageFromBackend = async (
  backend: 'supabase' | 'local-test',
  workspaceId: string,
  boardId: string
): Promise<BackupPackageV2> => {
  const source = await backupBackendService.readBoardSource(workspaceId, boardId);
  return createBackupPackage(source, backend, APP_VERSION);
};

const downloadPackage = (packageValue: BackupPackageV2) => {
  const blob = new Blob([stringifyBackupPackage(packageValue)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildBackupFilename(packageValue);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const backupApplicationService = {
  createBoardPackage: async (workspaceId: string, boardId: string): Promise<BackupPackageV2> => {
    const backend = requireSupportedBackend();
    return createPackageFromBackend(backend, workspaceId, boardId);
  },

  createBoardPackages: async (
    requests: CreateBoardBackupPackageRequest[]
  ): Promise<CreateBoardBackupPackageResult[]> => {
    const backend = requireSupportedBackend();
    const results: CreateBoardBackupPackageResult[] = [];
    for (const request of requests) {
      try {
        results.push({
          ...request,
          packageValue: await createPackageFromBackend(backend, request.workspaceId, request.boardId),
          error: null,
        });
      } catch (error) {
        results.push({
          ...request,
          packageValue: null,
          error: toBatchError(error),
        });
      }
    }
    return results;
  },

  inspectText: (text: string): Promise<BackupInspection> => inspectBackupText(text),

  inspectFile: async (file: File): Promise<BackupInspection> => {
    validateBackupFileSize(file.size);
    const text = await file.text();
    return inspectBackupText(text);
  },

  planImport: async (
    packageValue: BackupPackageV2,
    mode: BackupMode,
    target: BackupImportTarget
  ): Promise<BackupImportPlan> => {
    requireSupportedBackend();
    return backupBackendService.planImport({ package: packageValue, mode, target });
  },

  preparePreReplacementPackage: async (plan: BackupImportPlan): Promise<BackupPackageV2> => {
    if (plan.mode !== 'replace_current_board' || !plan.target.boardId) {
      throw new BackupError('INVALID_FILE', '只有取代目前看板內容時需要建立執行前備份。');
    }
    return backupApplicationService.createBoardPackage(plan.target.workspaceId, plan.target.boardId);
  },

  executeImport: async (options: ExecuteBackupImportOptions): Promise<ExecuteBackupImportOutcome> => {
    requireSupportedBackend();
    if (!options.plan.allowed || options.plan.blockers.length > 0) {
      throw new BackupError('IMPORT_ROLLED_BACK', '匯入計畫仍有阻擋項目，不能執行。');
    }
    if (options.plan.packageId !== options.package.packageId) {
      throw new BackupError('INVALID_FILE', '匯入計畫與目前備份檔不一致，請重新檢查檔案。');
    }
    if (options.plan.mode === 'replace_current_board') {
      const preBackup = options.preReplacementPackage;
      if (
        !preBackup
        || preBackup.source.workspaceId !== options.plan.target.workspaceId
        || preBackup.source.boardId !== options.plan.target.boardId
      ) {
        throw new BackupError('INVALID_FILE', '取代前必須先成功建立目前目標看板的安全備份。');
      }
    }

    const result = await backupBackendService.executeImport({
      package: options.package,
      plan: options.plan,
      newBoardTitle: options.newBoardTitle,
    });
    const verification = await backupApplicationService.verifyImport(options.package, result);
    if (!verification.verified) {
      throw new BackupError('VERIFY_MISMATCH', '匯入已寫入，但讀回驗證不一致；請勿繼續操作並保留執行識別碼。', {
        executionId: result.executionId,
        expectedFingerprint: verification.expectedFingerprint,
        actualFingerprint: verification.actualFingerprint,
      });
    }
    return { result, verification };
  },

  verifyImport: async (
    packageValue: BackupPackageV2,
    result: BackupExecutionResult
  ): Promise<BackupVerificationReport> => {
    const [backendActualFingerprint, source] = await Promise.all([
      backupBackendService.readBoardFingerprint(result.targetWorkspaceId, result.targetBoardId),
      backupBackendService.readBoardSource(result.targetWorkspaceId, result.targetBoardId),
    ]);
    const expected = {
      tasks: packageValue.payload.tasks.length,
      dependencies: packageValue.payload.dependencies.length,
    };
    const actual = {
      tasks: source.tasks.length,
      dependencies: source.dependencies.length,
    };
    const semantic = await compareBackupSemantics(packageValue, source, result);
    return {
      verified:
        semantic.valid
        && semantic.expectedFingerprint === semantic.actualFingerprint
        && backendActualFingerprint === result.postWriteFingerprint
        && expected.tasks === actual.tasks
        && expected.dependencies === actual.dependencies,
      expectedFingerprint: semantic.expectedFingerprint,
      actualFingerprint: semantic.actualFingerprint,
      backendExpectedFingerprint: result.postWriteFingerprint,
      backendActualFingerprint,
      expected,
      actual,
    };
  },

  downloadPackage,

  downloadPackages: (packageValues: BackupPackageV2[]) => {
    packageValues.forEach(downloadPackage);
  },
};
