import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyQuickSyncError,
  createQuickCaptureId,
  insertFinalTranscript,
  isQuickTitleValid,
  normalizeQuickTitle,
} from '../src/features/quickTaskCapture/model';

const checks: Array<{ id: string; ok: boolean; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, ok: boolean, details?: unknown) => {
  checks.push({ id, ok, details });
  if (!ok) failures.push(id);
};
const read = (path: string) => readFileSync(resolve(path), 'utf8');

const quickHtml = read('quick-task/index.html');
const rootHtml = read('index.html');
const quickMain = read('src/quickTask/main.ts');
const vite = read('vite.config.js');
const firebase = read('firebase.json');
const rootManifestSource = read('public/manifest.webmanifest');
const quickManifestSource = read('public/quick-task/manifest.webmanifest');
const rootManifest = JSON.parse(rootManifestSource) as {
  id?: string;
  start_url?: string;
  scope?: string;
  shortcuts?: Array<{
    name?: string;
    short_name?: string;
    description?: string;
    url?: string;
    icons?: Array<{ src?: string; sizes?: string; type?: string }>;
  }>;
};
const quickManifest = JSON.parse(quickManifestSource) as {
  id?: string;
  start_url?: string;
  scope?: string;
  icons?: Array<{ src?: string; sizes?: string; type?: string }>;
};
const distRootManifest = existsSync(resolve('dist/manifest.webmanifest'))
  ? JSON.parse(read('dist/manifest.webmanifest')) as typeof rootManifest
  : null;
const shortcutIconPath = resolve('public/icons/icon-vibrant-03-mango-berry.png');
const shortcutIcon = readFileSync(shortcutIconPath);
const shortcutIconDimensions = shortcutIcon.length >= 24 && shortcutIcon.subarray(1, 4).toString('ascii') === 'PNG'
  ? { width: shortcutIcon.readUInt32BE(16), height: shortcutIcon.readUInt32BE(20) }
  : null;
const quickShortcut = rootManifest.shortcuts?.[0];
const appInstallAssistant = read('src/components/AppInstallAssistant.tsx');
const migration = read('supabase/migrations/20260914120000_dev_122_quick_unplaced_task_rpc.sql');
const placementMigration = read('supabase/migrations/20260826083940_dev_089_scope_safe_task_placement_command.sql');
const workbench = read('src/components/MainLayout.tsx');
const panel = read('src/components/TaskWorkbenchPanel.tsx');
const pwaUpdate = read('src/services/pwaUpdateService.ts');
const outbox = read('src/features/quickTaskCapture/outbox.ts');
const sync = read('src/features/quickTaskCapture/sync.ts');
const buildMeta = (() => {
  try { return JSON.parse(read('dist/app-shell-meta.json')); }
  catch { return { version: 'unknown' }; }
})();

const insertion = insertFinalTranscript({ value: '先確認閥門', selectionStart: 1, selectionEnd: 3, transcript: '現場' });
check('S01', quickHtml.includes('id="quick-task-title"') && quickHtml.includes('id="quick-task-voice"') && quickHtml.includes('id="quick-task-submit"') && quickHtml.includes('onsubmit="return false"'));
check('S02', !quickMain.includes("from '../App'") && !quickMain.includes("from '../store/") && !quickMain.includes("from '../services/dataBackend"));
check('S03', quickManifest.id === '/quick-task/'
  && quickManifest.start_url === '/quick-task/'
  && quickManifest.scope === '/quick-task/'
  && quickManifest.icons?.every(icon => icon.src === '/icons/icon-vibrant-03-mango-berry.png' && icon.sizes === '1024x1024' && icon.type === 'image/png')
  && shortcutIconDimensions?.width === 1024
  && shortcutIconDimensions.height === 1024
  && vite.includes("quickTask: 'quick-task/index.html'")
  && quickHtml.includes('data-quick-install="true"'));
check('S04', vite.includes("/^\\/quick-task(?:\\/|$)/")
  && vite.includes('ignoreURLParametersMatching')
  && vite.includes('capture|claim')
  && firebase.includes('"/quick-task{,/**}"'));
check('S05', createQuickCaptureId().startsWith('task_workbench_unplaced_') && createQuickCaptureId() !== createQuickCaptureId());
check('S06', insertion.value === '先現場閥門' && insertion.caret === 3);
check('S07', normalizeQuickTitle('\u00a0  現場確認  \u3000') === '現場確認' && isQuickTitleValid('任務') && !isQuickTitleValid(' '.repeat(501)));
check('S08', quickMain.includes('commitQuickCapture') && quickMain.includes('renderSuccess') && quickMain.includes('await finishClaimFromUrl()'));
check('S09', quickMain.includes('startVoiceCapture') && quickMain.includes('installQuickInstallGuide') && quickMain.includes('使用語音輸入任務名稱') === false && quickHtml.includes('使用語音輸入任務名稱'));
check('S10', migration.includes('security invoker') && migration.includes('create_quick_unplaced_task_v1') && migration.includes('quick_task_capture_receipts') && migration.includes('revoke all on function'));
check('S11', migration.includes('pg_advisory_xact_lock') && migration.includes("'boardId', '__task_workbench_unplaced__'") && migration.includes("'detailNotes'"));
check('S11-lock-scope', migration.includes("format('account:%s:unplaced:parent:root', v_owner::text)")
  && placementMigration.includes("format('account:%s:unplaced:parent:root', v_user_id::text)")
  && migration.includes('pg_catalog.hashtextextended')
  && migration.includes('pg_catalog.pg_advisory_xact_lock'),
  'quick create and placement share the canonical account-unplaced advisory lock');
check('S12', !quickMain.includes('credentials:') && !quickMain.includes("from '../services/dataBackend'") && quickMain.includes('quick_workbench=1'));
check('S13', quickMain.includes('putClaimIntent') && quickMain.includes('getUser(snapshot.accessToken)') && quickMain.includes('history.replaceState'));
check('S14', panel.includes('onClosed?: () => void') && workbench.includes('consumeQuickWorkbenchIntent') && workbench.includes('openTaskWorkbenchPanel'));
check('S15-runtime-errors', classifyQuickSyncError(new Error('QT_AUTH_REQUIRED')) === 'failed_auth' && classifyQuickSyncError(new Error('QT_NO_AVAILABLE_WORKSPACE')) === 'failed_permanent');
check('S15', rootManifest.id === '/'
  && rootManifest.start_url === '/'
  && rootManifest.scope === '/'
  && rootManifest.shortcuts?.filter(shortcut => shortcut.url === '/quick-task/').length === 1
  && quickShortcut !== undefined
  && quickShortcut.name === '快速建待辦'
  && quickShortcut.short_name === '建待辦'
  && quickShortcut.description === '直接輸入一筆待辦'
  && quickShortcut.url === '/quick-task/'
  && quickShortcut.icons?.length === 1
  && quickShortcut.icons[0]?.src === '/icons/icon-vibrant-03-mango-berry.png'
  && quickShortcut.icons[0]?.sizes === '1024x1024'
  && quickShortcut.icons[0]?.type === 'image/png'
  && (rootHtml.match(/rel=["']manifest["']/gu) ?? []).length === 1
  && rootHtml.includes('href="/manifest.webmanifest"')
  && vite.includes('manifest: false')
  && distRootManifest !== null
  && JSON.stringify(distRootManifest) === JSON.stringify(rootManifest)
  && appInstallAssistant.includes('安裝 ProJED 後，支援的平台可從 ProJED 圖示選「快速建待辦」；需要桌面單鍵入口，也可安裝獨立圖示。'));
check('S16', vite.includes('app-shell-meta.json') && vite.includes('projed-shell-version') && pwaUpdate.includes('/app-shell-meta.json?projed_update_check='));
check('S17', migration.includes("QT_EXISTING_ROW_INVALID") && migration.includes('where owner_id = v_owner and id = p_capture_id'));
check('S18', migration.includes('v_order bigint') && migration.includes('v_order > 2147483647') && migration.includes("QT_ORDER_EXHAUSTED"));
check('S19', outbox.includes("const nextState: QuickCaptureState = exhausted ? 'failed_permanent' : state")
  && outbox.includes("nextErrorCode = exhausted ? 'AUTO_RETRY_EXHAUSTED' : lastErrorCode")
  && outbox.includes("record.lastErrorCode !== 'AUTO_RETRY_EXHAUSTED'"));
check('S20', sync.includes("retryAfter > 0 && state === 'failed_retryable'")
  && sync.includes("updateQuickCapture(leased.captureId, { nextAttemptAt: Date.now() + retryAfter })"));
check('S21', quickMain.includes("listQuickCaptures(authSnapshot?.accountId ?? null, true)")
  && quickMain.includes("record.state !== 'synced'"));

const artifact = {
  devId: 'DEV-122',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  buildId: buildMeta.version ?? 'unknown',
  actorAlias: 'DEV122-STATIC',
  fixtureVersion: 'DEV122-STATIC-V1',
  platform: 'Node',
  route: 'repo',
  command: 'npm run verify:dev-122-mobile-zero-data-quick-task',
  assertionCount: checks.length,
  checks: checks.map(check => ({ ...check, expected: true, actual: check.ok, status: check.ok ? 'PASS' : 'FAIL' })),
  failures,
  generatedAt: new Date().toISOString(),
};
const outputDir = resolve('output/playwright/dev-122-mobile-zero-data-quick-task');
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
if (failures.length) {
  console.error(`DEV-122 static verification failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`DEV-122 static verification passed: ${checks.length} assertions.`);
