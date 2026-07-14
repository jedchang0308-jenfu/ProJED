import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  settings: 'src/components/SettingsView.tsx',
  ui: 'src/components/BackupSettings.tsx',
  types: 'src/features/backup/types.ts',
  packageDomain: 'src/features/backup/package.ts',
  application: 'src/features/backup/applicationService.ts',
  backend: 'src/services/dataBackend.ts',
  localAdapter: 'src/services/backup/localTestBackupService.ts',
  supabaseAdapter: 'src/services/supabase/projedService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  migration: 'supabase/migrations/20260714025203_dev_047_board_backup_package_v2.sql',
  packageJson: 'package.json',
  modelVerifier: 'scripts/verify-dev-047-backup-package-model.ts',
  transactionVerifier: 'scripts/verify-dev-047-backup-transaction-local-db.ts',
  supabaseVerifier: 'scripts/verify-dev-047-backup-local-supabase.ps1',
  supabaseMatrix: 'scripts/verify-dev-047-backup-transaction-local-supabase.sql',
  browserVerifier: 'scripts/verify-dev-047-backup-package-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md',
  qa: 'ai-doc/qa/QA-DEV-047-board-backup-package-transactional-import.md',
  adr: 'ai-doc/decisions/ADR-041-board-backup-package-v2-transactional-import.md',
};

const checks = [];
const check = (name, ok, details = '') => checks.push({ name, ok: Boolean(ok), details });
const source = {};
for (const [label, file] of Object.entries(files)) {
  const exists = existsSync(resolve(file));
  check(`file exists: ${label}`, exists, file);
  if (exists) source[label] = readFileSync(resolve(file), 'utf8');
}

check(
  'Settings delegates backup workflow to the dedicated component and retires direct legacy import/export',
  source.settings?.includes("import BackupSettings from './BackupSettings'")
    && source.settings.includes('備份、還原與資料移轉')
    && !source.settings.includes('useWbsStore')
    && !source.settings.includes('.exportData(')
    && !source.settings.includes('.importData('),
);

check(
  'UI is inspect-first, defaults to copy, and gates destructive replace behind same-origin and typed confirmation',
  source.ui?.includes("useState<BackupMode>('copy_to_new_board')")
    && source.ui.includes('backupApplicationService.inspectFile(file)')
    && source.ui.includes('backupApplicationService.planImport')
    && source.ui.includes('replaceCompatible')
    && source.ui.includes("confirmation === plan.confirmationPhrase")
    && source.ui.includes("mode === 'replace_current_board' ? 'bg-rose-600")
    && source.ui.includes('preparePreReplacementPackage')
    && source.ui.includes('data-backup-import-success')
    && source.ui.includes('ALL_BOARDS_SOURCE_VALUE')
    && source.ui.includes('data-backup-export-batch-summary')
    && source.ui.includes('data-backup-download-all-v2'),
);

check(
  'Package V2 has bounded schema, manifest, checksum, canonicalization, and semantic read-after-write verification',
  source.types?.includes("BACKUP_FORMAT = 'projed-backup'")
    && source.types.includes('BACKUP_SCHEMA_VERSION = 2')
    && source.types.includes('BACKUP_MAX_FILE_BYTES = 10 * 1024 * 1024')
    && source.types.includes('BACKUP_MAX_TASKS = 10_000')
    && source.packageDomain?.includes('calculateBackupChecksum')
    && source.packageDomain.includes('validateBackupPayload')
    && source.packageDomain.includes('compareBackupSemantics')
    && source.packageDomain.includes('sourceTaskIdMap'),
);

check(
  'File size is rejected before the browser reads or parses an oversized backup',
  source.application?.includes('validateBackupFileSize(file.size)')
    && source.application.indexOf('validateBackupFileSize(file.size)') < source.application.indexOf('file.text()')
    && source.packageDomain?.includes('validateBackupFileSize(bytes)'),
);

check(
  'Legacy formats are converted only after single-board scope proof and ambiguous scope fails closed',
  source.packageDomain?.includes("new Set(['wbs-1.0', 'wbs-1.1', 'wbs-1.2', 'wbs-2.0'])")
    && source.packageDomain.includes("'LEGACY_SCOPE_AMBIGUOUS'")
    && source.packageDomain.includes("sourceKind: 'legacy-converted'")
    && source.packageDomain.includes('createBackupPackage({'),
);

check(
  'Application service reads canonical backend state, requires pre-replacement backup, and rejects verification mismatch',
  source.application?.includes('backupBackendService.readBoardSource')
    && source.application.includes('createBoardPackages')
    && source.application.includes('downloadPackages')
    && source.application.includes('preparePreReplacementPackage')
    && source.application.includes('compareBackupSemantics')
    && source.application.includes("new BackupError('VERIFY_MISMATCH'")
    && !source.application.includes('useWbsStore'),
);

check(
  'Local adapter implements permission checks, fingerprint conflict, idempotency, and atomic rollback',
  source.localAdapter?.includes('commitStorageTransaction')
    && source.localAdapter.includes("new BackupError('IMPORT_ROLLED_BACK'")
    && source.localAdapter.includes("new BackupError('TARGET_CHANGED'")
    && source.localAdapter.includes('idempotentReplay: true')
    && source.localAdapter.includes('getBoardMemberRole(workspaceId, boardId, readCurrentUserId())')
    && source.localAdapter.includes('sourceTaskIdMap: Object.fromEntries(taskIdMap)'),
);

check(
  'Supabase RPC is a scoped security-definer transaction with auth, grants, lock, idempotency, and record-link blockers',
  source.migration?.includes('security definer')
    && source.migration.includes("set search_path = ''")
    && source.migration.includes('auth.uid()')
    && source.migration.includes('revoke execute on function public.import_board_backup_v2')
    && source.migration.includes('grant execute on function public.import_board_backup_v2')
    && source.migration.includes('to authenticated')
    && source.migration.includes('for update')
    && source.migration.includes('private.backup_import_executions')
    && source.migration.includes('record_task_links')
    && source.migration.includes("'sourceTaskIdMap', client_id_map")
    && source.migration.includes("'board_backup_imported'"),
);

check(
  'Client and generated database types expose all three controlled backup RPCs',
  source.supabaseAdapter?.includes("supabase.rpc('preview_board_backup_v2'")
    && source.supabaseAdapter.includes("supabase.rpc('import_board_backup_v2'")
    && source.supabaseAdapter.includes("supabase.rpc('get_board_backup_v2_fingerprint'")
    && source.databaseTypes?.includes('preview_board_backup_v2')
    && source.databaseTypes.includes('import_board_backup_v2')
    && source.databaseTypes.includes('get_board_backup_v2_fingerprint'),
);

const backupExecutionSources = [source.application, source.localAdapter, source.supabaseAdapter].filter(Boolean).join('\n');
check(
  'Backup execution paths do not swallow row failures or call the legacy best-effort replace API',
  !backupExecutionSources.includes('.catch(console.error)')
    && !backupExecutionSources.includes('replaceAllByProject('),
);

check(
  'Package scripts register model, transaction, browser, and aggregate DEV-047 gates',
  source.packageJson?.includes('verify:dev-047-backup-package-contract')
    && source.packageJson.includes('verify:dev-047-backup-package-model')
    && source.packageJson.includes('verify:dev-047-backup-transaction-local-db')
    && source.packageJson.includes('verify:dev-047-backup-local-supabase')
    && source.packageJson.includes('verify:dev-047-backup-package-browser')
    && source.packageJson.includes('verify:dev-047-backup-package'),
);

const failed = checks.filter(item => !item.ok);
checks.forEach(item => console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.details ? ` (${item.details})` : ''}`));
console.log(`DEV-047 static contract: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
