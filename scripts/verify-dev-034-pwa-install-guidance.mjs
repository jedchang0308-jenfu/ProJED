import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  appInstallAssistant: 'src/components/AppInstallAssistant.tsx',
  pwaInstallService: 'src/services/pwaInstallService.ts',
  settingsView: 'src/components/SettingsView.tsx',
  quickCaptureShell: 'src/components/QuickCaptureShell.tsx',
  quickCaptureStore: 'src/store/useQuickCaptureStore.ts',
  types: 'src/types/index.ts',
  app: 'src/App.tsx',
  main: 'src/main.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));
const userFacingInstallText = source.appInstallAssistant.replace(/import[\s\S]*?type PwaInstallContext,\n} from '..\/services\/pwaInstallService';/, '');
const forbiddenTechnicalTerms = ['Service Worker', 'service worker', 'manifest', 'cache', 'PWA'];
const forbiddenMatches = forbiddenTechnicalTerms.filter(term => userFacingInstallText.includes(term));
const userFacingQuickCaptureText = source.quickCaptureShell.replace(/import[\s\S]*?from '.\/ui\/Badge';/, '');
const quickCaptureForbiddenMatches = ['Service Worker', 'manifest', 'PWA', 'schema', 'API'].filter(term => userFacingQuickCaptureText.includes(term));

assert(
  'install service captures browser install event and persists preference',
  source.pwaInstallService.includes("window.addEventListener('beforeinstallprompt'") &&
    source.pwaInstallService.includes('event.preventDefault()') &&
    source.pwaInstallService.includes('deferredPrompt = event as BeforeInstallPromptEvent') &&
    source.pwaInstallService.includes("window.addEventListener('appinstalled'") &&
    source.pwaInstallService.includes("const INSTALL_STATUS_KEY = 'projed.pwaInstall.status'") &&
    source.pwaInstallService.includes('snoozedUntil') &&
    source.pwaInstallService.includes('dismissed: true') &&
    source.pwaInstallService.includes('resetPwaInstallPreference'),
);

assert(
  'install service separates platform states for simple guidance',
  source.pwaInstallService.includes("'embedded'") &&
    source.pwaInstallService.includes("'ios-safari'") &&
    source.pwaInstallService.includes("'android-installable'") &&
    source.pwaInstallService.includes("'desktop-installable'") &&
    source.pwaInstallService.includes('isStandaloneDisplay') &&
    source.pwaInstallService.includes('isEmbeddedBrowser'),
);

assert(
  'app boot wires install listener before app lifecycle',
  source.main.includes("import { setupPwaInstallPromptListener } from './services/pwaInstallService'") &&
    source.main.includes('setupPwaInstallPromptListener();') &&
    source.main.includes('setupPwaLifecycle();') &&
    source.main.indexOf('setupPwaInstallPromptListener();') < source.main.indexOf('setupPwaLifecycle();'),
);

assert(
  'auto assistant is mounted globally after auth gate',
  source.app.includes("import { AppInstallAssistant } from './components/AppInstallAssistant'") &&
    source.app.includes("import { QuickCaptureShell } from './components/QuickCaptureShell'") &&
    source.app.includes('<AppInstallAssistant />') &&
    source.app.includes('<QuickCaptureShell />') &&
    source.app.indexOf('</AuthGate>') < source.app.indexOf('<QuickCaptureShell />') &&
    source.app.indexOf('</AuthGate>') < source.app.indexOf('<AppInstallAssistant />'),
);

assert(
  'settings page exposes quick-start entry and persistent guidance',
  source.settingsView.includes("id: 'app'") &&
    source.settingsView.includes("label: '快速開啟'") &&
    source.settingsView.includes('將 ProJED 加到桌面') &&
    source.settingsView.includes('<AppInstallAssistant mode="settings" />') &&
    source.appInstallAssistant.includes('data-pwa-install-settings'),
);

assert(
  'auto prompt and settings prompt expose stable DOM contracts',
  source.appInstallAssistant.includes('data-pwa-install-assistant') &&
    source.appInstallAssistant.includes('data-pwa-install-settings') &&
    source.appInstallAssistant.includes('context.shouldAutoShow') &&
    source.appInstallAssistant.includes('mode === \'settings\'') &&
    source.appInstallAssistant.includes('useAuthStore'),
);

assert(
  'guidance text is short and platform-specific',
  source.appInstallAssistant.includes('點分享') &&
    source.appInstallAssistant.includes('選加入主畫面') &&
    source.appInstallAssistant.includes('點新增') &&
    source.appInstallAssistant.includes('用 Safari 或 Chrome 開啟') &&
    source.appInstallAssistant.includes('加入主畫面') &&
    source.appInstallAssistant.includes('稍後') &&
    source.appInstallAssistant.includes('不再提示') &&
    source.appInstallAssistant.includes('重新顯示提示'),
);

assert(
  'user-facing install assistant avoids technical implementation terms',
  forbiddenMatches.length === 0,
  forbiddenMatches,
);

assert(
  'quick capture store persists private pending quick memo items locally',
  source.quickCaptureStore.includes("const QUICK_CAPTURE_STORAGE_KEY = 'projed.quickCapture.inboxItems'") &&
    source.quickCaptureStore.includes('syncStatus: \'pending\'') &&
    source.quickCaptureStore.includes('captureStatus: \'untriaged\'') &&
    source.quickCaptureStore.includes('itemType = \'todo\'') &&
    source.quickCaptureStore.includes('requiresOwnershipConfirmation') &&
    source.quickCaptureStore.includes('writeItems(nextItems)') &&
    source.quickCaptureStore.includes('markCompleted') &&
    source.quickCaptureStore.includes('clearCompleted'),
);

assert(
  'InboxItem type aligns with DEV-039 local-first quick memo fields',
  source.types.includes("export type InboxItemType = 'todo' | 'someday' | 'note'") &&
    source.types.includes("export type InboxItemCaptureStatus = 'untriaged' | 'promoted' | 'completed' | 'archived'") &&
    source.types.includes("export type InboxItemSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'") &&
    source.types.includes('export interface InboxItem') &&
    source.types.includes('requiresOwnershipConfirmation?: boolean') &&
    source.types.includes('promotedTaskNodeId?: string | null'),
);

assert(
  'quick capture shell exposes immediate capture DOM contract',
  source.quickCaptureShell.includes('data-quick-capture-shell') &&
    source.quickCaptureShell.includes('data-quick-capture-input') &&
    source.quickCaptureShell.includes('data-quick-capture-save') &&
    source.quickCaptureShell.includes('data-quick-capture-sync-status') &&
    source.quickCaptureShell.includes('存入備忘錄') &&
    source.quickCaptureShell.includes('快速備忘') &&
    source.quickCaptureShell.includes('待整理'),
);

assert(
  'user-facing quick capture avoids implementation terms',
  quickCaptureForbiddenMatches.length === 0,
  quickCaptureForbiddenMatches,
);

assert(
  'package exposes DEV-034 verifier',
  source.packageJson.includes('"verify:dev-034-pwa-install-guidance"'),
);

assert(
  'SPEC-034 is promoted into DEV-034 delivery governance',
  source.spec.includes('DEV-034') &&
    source.spec.includes('PWA 安裝助理') &&
    source.spec.includes('QuickCaptureShell') &&
    source.spec.includes('資料同步分層'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
