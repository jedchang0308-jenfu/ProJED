import './quick-task.css';
import {
  commitQuickCapture,
  bindQuickCaptureClaim,
  countAllPendingQuickCaptures,
  getQuickCapture,
  listQuickCaptures,
  putClaimIntent,
  removeExpiredQuickCaptures,
  retryQuickCapture,
  updateQuickCapture,
} from '../features/quickTaskCapture/outbox';
import { createQuickCaptureId, normalizeQuickTitle, isQuickTitleValid, type QuickCaptureRecord } from '../features/quickTaskCapture/model';
import { startVoiceCapture, type VoiceSession } from '../features/quickTaskCapture/voice';
import { flushQuickTaskOutbox } from '../features/quickTaskCapture/sync';
import { installQuickReloadSafety } from '../features/quickTaskCapture/reloadSafety';
import { installQuickInstallGuide } from '../features/quickTaskCapture/install';
import { getWorkbenchUrl } from '../features/quickTaskCapture/origins';
import { installAppIconRefresh } from '../services/appIconService';

installAppIconRefresh('quick-task');

const titleInput = document.querySelector<HTMLInputElement>('#quick-task-title');
const form = document.querySelector<HTMLFormElement>('#quick-task-form');
const backButton = document.querySelector<HTMLButtonElement>('#quick-task-back');
const authStatus = document.querySelector<HTMLElement>('#quick-task-auth-status');
const voiceButton = document.querySelector<HTMLButtonElement>('#quick-task-voice');
const submitButton = document.querySelector<HTMLButtonElement>('#quick-task-submit');
const message = document.querySelector<HTMLElement>('#quick-task-message');
const success = document.querySelector<HTMLElement>('#quick-task-success');
const recovery = document.querySelector<HTMLElement>('#quick-task-recovery');

if (!titleInput || !form || !authStatus || !voiceButton || !submitButton || !message || !success || !recovery) {
  throw new Error('QUICK_TASK_BOOTSTRAP_FAILED');
}

if (backButton) {
  const syncBackButton = () => {
    const canGoBack = window.history.length > 1;
    backButton.disabled = !canGoBack;
    backButton.title = canGoBack ? '返回上一頁' : '沒有可返回的上一頁';
  };
  syncBackButton();
  window.addEventListener('pageshow', syncBackButton);
  backButton.addEventListener('click', () => {
    if (!backButton.disabled) window.history.back();
  });
}

let voiceSession: VoiceSession | null = null;
type QuickAuthApi = typeof import('../features/quickTaskCapture/auth');
let authApiPromise: Promise<QuickAuthApi> | null = null;
let authSnapshot: import('../services/supabase/quickTaskCaptureService').QuickAuthSnapshot | null = null;
let verifiedAuthSnapshot: import('../features/quickTaskCapture/auth').VerifiedQuickAuthSnapshot | null = null;
let currentRecord: QuickCaptureRecord | null = null;
let pendingLocalCommit: { record: QuickCaptureRecord; context?: { revision: number; projectRef: string; accountId: string } } | null = null;
let isComposing = false;
let localCommitInFlight = false;
let claimInFlight = false;
let recoveryCaptureId: string | null = null;
let recoveryRenderRevision = 0;
let syncInFlight = false;
let syncRequested = false;
let cleanupInFlight: Promise<number> | null = null;
let cleanupTimer = 0;
let retryTimer: number | null = null;
let authRetryCount = 0;
let pageActive = true;
let pendingClaim: { captureId: string; nonceHash: string; accountId: string; email: string | null; authEpoch: number; contextRevision: number } | null = null;

const getAuthApi = () => {
  authApiPromise ??= import('../features/quickTaskCapture/auth');
  return authApiPromise;
};

const setMessage = (text: string) => {
  message.textContent = text;
  message.hidden = text.length === 0;
};
const setAuthStatus = (text: string, showLogin: boolean, showLogout = false) => {
  authStatus.replaceChildren();
  if (!text) {
    authStatus.hidden = true;
    return;
  }
  authStatus.hidden = false;
  const label = document.createElement('span');
  label.textContent = text;
  authStatus.append(label);
  if (showLogin) {
    const loginButton = document.createElement('button');
    loginButton.type = 'button';
    loginButton.textContent = '登入';
    loginButton.setAttribute('aria-label', '登入快速建任務');
    loginButton.addEventListener('click', () => {
      const callback = new URL(window.location.href);
      callback.searchParams.delete('capture');
      callback.searchParams.delete('claim');
      callback.hash = '';
      void getAuthApi().then(auth => auth.startQuickGoogleSignIn(callback.toString()))
        .catch(() => setAuthStatus('目前無法登入，任務仍可先記在本機。', true));
    });
    authStatus.append(loginButton);
  }
  if (showLogout) {
    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.textContent = '登出此 App';
    logoutButton.setAttribute('aria-label', '登出此快速建任務 App');
    logoutButton.addEventListener('click', () => {
      clearRetryTimer();
      authSnapshot = null;
      verifiedAuthSnapshot = null;
      pendingClaim = null;
      currentRecord = null;
      success.hidden = true;
      setAuthStatus('已停止同步，正在登出此 App…', false);
      void getAuthApi().then(auth => auth.signOutQuickSession())
        .then(() => setAuthStatus('此快速 App 尚未登入', true))
        .catch(error => {
          setAuthStatus('已停止同步，登出尚未完成', false, true);
          setMessage(error instanceof Error && error.message === 'LOGOUT_BARRIER_FAILED'
            ? '無法保存登出狀態，請重試。' : '已停止同步，登出尚未完成，請重試。');
        });
    });
    authStatus.append(logoutButton);
  }
};
const listRecoverableQuickCaptures = async () => {
  const context = await (await getAuthApi()).getQuickBindingContext().catch(() => null);
  return listQuickCaptures(authSnapshot?.accountId ?? context?.accountId ?? null, true);
};
const removeExpiredCaptures = () => {
  if (cleanupInFlight) return cleanupInFlight;
  cleanupInFlight = removeExpiredQuickCaptures().finally(() => { cleanupInFlight = null; });
  return cleanupInFlight;
};
const clearRetryTimer = () => {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
};
const verifyAndFlush = async (expected: NonNullable<typeof authSnapshot>) => {
  if (!pageActive) return;
  if (syncInFlight || localCommitInFlight) {
    syncRequested = true;
    return;
  }
  syncRequested = false;
  clearRetryTimer();
  syncInFlight = true;
  try {
    const auth = await getAuthApi();
    const verification = await auth.verifyQuickSessionState(expected);
    if (authSnapshot?.accountId !== expected.accountId || authSnapshot.authEpoch !== expected.authEpoch) return;
    if (verification.status !== 'verified') {
      verifiedAuthSnapshot = null;
      const label = !navigator.onLine
        ? '目前離線；已保留原帳號本機綁定，網路恢復後自動同步'
        : verification.status === 'unreachable' ? '登入狀態待確認；服務恢復後自動同步'
          : verification.status === 'unauthenticated' ? '此快速 App 尚未登入' : '登入狀態已變更，請重新確認';
      setAuthStatus(label, verification.status === 'unauthenticated', false);
      // Initial verification plus seven retries is the eight-check event budget.
      if (verification.status === 'unreachable' && navigator.onLine && authRetryCount < 7) {
        authRetryCount += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (pageActive && document.visibilityState === 'visible' && authSnapshot?.authEpoch === expected.authEpoch) void verifyAndFlush(authSnapshot);
        }, Math.min(15 * 60_000, 5_000 * 2 ** (authRetryCount - 1)));
      }
      return;
    }
    const verified = verification.snapshot;
    authRetryCount = 0;
    verifiedAuthSnapshot = verified;
    setAuthStatus(`此快速 App 已登入：${verified.email ?? 'ProJED 帳號'}`, false, true);
    const authFailed = await flushQuickTaskOutbox(verified, (captureId, state) => {
      if (authSnapshot?.accountId === verified.accountId && authSnapshot.authEpoch === verified.authEpoch
        && state === 'synced' && currentRecord?.captureId === captureId) renderSuccess(currentRecord, true);
    });
    if (authFailed) {
      verifiedAuthSnapshot = null;
      setAuthStatus('登入已失效，請重新登入原帳號', true);
      return;
    }
    const retryableRecords = await listQuickCaptures(verified.accountId).catch(() => []);
    const nextAttemptAt = retryableRecords
      .filter(record => record.state === 'failed_retryable' && record.nextAttemptAt !== null)
      .reduce<number | null>((earliest, record) => earliest === null || record.nextAttemptAt! < earliest
        ? record.nextAttemptAt
        : earliest, null);
    if (nextAttemptAt !== null && navigator.onLine) {
      const scheduledAuth = { accountId: verified.accountId, authEpoch: verified.authEpoch };
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (document.visibilityState !== 'visible' || !navigator.onLine
          || authSnapshot?.accountId !== scheduledAuth.accountId
          || authSnapshot.authEpoch !== scheduledAuth.authEpoch) return;
        void verifyAndFlush(authSnapshot);
      }, Math.max(0, nextAttemptAt - Date.now()));
    }
  } catch {
    if (authSnapshot?.accountId === expected.accountId && authSnapshot.authEpoch === expected.authEpoch) {
      verifiedAuthSnapshot = null;
      setAuthStatus(navigator.onLine ? '登入狀態待確認' : '離線；原帳號本機綁定仍保留', navigator.onLine);
    }
  } finally {
    syncInFlight = false;
    await renderRecovery();
    const latestSnapshot = authSnapshot;
    const authChanged = latestSnapshot !== null
      && (latestSnapshot.accountId !== expected.accountId || latestSnapshot.authEpoch !== expected.authEpoch);
    const shouldRunAgain = syncRequested || authChanged;
    syncRequested = false;
    if (!localCommitInFlight && latestSnapshot && shouldRunAgain) {
      void verifyAndFlush(latestSnapshot);
    }
  }
};
const refreshAuthAndSync = async () => {
  const snapshot = await (await getAuthApi()).loadQuickSession().catch(() => null);
  authSnapshot = snapshot;
  if (!snapshot) {
    verifiedAuthSnapshot = null;
    return;
  }
  void verifyAndFlush(snapshot);
};
const enableControls = () => {
  voiceButton.disabled = false;
  submitButton.disabled = false;
  titleInput.focus();
  setMessage('');
};

const registerSharedRootWorker = () => {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // A missing worker must not block local capture; the page remains usable.
  });
};

const installReloadSafety = () => {
  void installQuickReloadSafety(() => ({
    draft: Boolean(titleInput.value.trim()),
    composing: isComposing,
    voice: Boolean(voiceSession),
    localCommit: localCommitInFlight,
    claim: claimInFlight,
  })).catch(() => undefined);
};

const needsRecovery = (record: QuickCaptureRecord) => record.state !== 'synced'
  && (record.accountId === null || record.state === 'failed_auth' || record.state === 'failed_permanent');

const hideRecovery = () => {
  recovery.hidden = true;
  recovery.replaceChildren();
};

const renderRecovery = async () => {
  const revision = ++recoveryRenderRevision;
  if (titleInput.value.trim() || currentRecord) {
    hideRecovery();
    return;
  }
  if (pendingClaim) {
    const claim = pendingClaim;
    const record = await getQuickCapture(claim.captureId).catch(() => null);
    if (revision !== recoveryRenderRevision || titleInput.value.trim() || currentRecord) return;
    if (!record || record.accountId !== null || authSnapshot?.accountId !== claim.accountId
      || authSnapshot.authEpoch !== claim.authEpoch) {
      pendingClaim = null;
    } else {
      recovery.hidden = false;
      recovery.dataset.compact = 'false';
      recovery.innerHTML = `<strong>同步到 ${escapeHtml(claim.email ?? '目前 ProJED 帳號')}</strong><span>${escapeHtml(record.title)}</span><div class="quick-task-actions"><button type="button" data-confirm-claim="true">確認同步</button><button type="button" data-cancel-claim="true">稍後處理</button></div>`;
      recovery.querySelector<HTMLButtonElement>('[data-confirm-claim]')?.addEventListener('click', event => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        void confirmPendingClaim().catch(() => setMessage('確認未完成，待辦仍保留在本機。'))
          .finally(() => { button.disabled = false; });
      });
      recovery.querySelector<HTMLButtonElement>('[data-cancel-claim]')?.addEventListener('click', () => {
        pendingClaim = null;
        void renderRecovery();
      });
      return;
    }
  }
  const records = (await listRecoverableQuickCaptures().catch(() => [])).filter(record => record.state !== 'synced');
  const actionable = records.filter(needsRecovery);
  const otherCount = Math.max(0, await countAllPendingQuickCaptures().catch(() => records.length) - records.length);
  if (revision !== recoveryRenderRevision || titleInput.value.trim() || currentRecord) return;
  const selected = actionable.find(record => record.captureId === recoveryCaptureId);
  if (selected?.accountId) {
    renderRecoveryFailure(selected);
    return;
  }
  recoveryCaptureId = null;
  const count = actionable.length + otherCount;
  if (count === 0) {
    hideRecovery();
    return;
  }
  const unboundCount = actionable.filter(record => record.accountId === null).length;
  const label = unboundCount === count ? '本機待同步任務'
    : otherCount === count ? `原帳號待辦 ${count} 筆`
      : unboundCount === 0 && otherCount === 0 ? `同步異常 ${count} 筆` : `需處理 ${count} 筆`;
  recovery.hidden = false;
  recovery.dataset.compact = 'true';
  recovery.innerHTML = `<button class="quick-task-recovery-entry" type="button" data-recover="true">${label}</button>`;
  recovery.querySelector<HTMLButtonElement>('[data-recover]')?.addEventListener('click', () => { void showNextRecovery(); });
};

const confirmPendingClaim = async () => {
  if (!pendingClaim) return;
  const claim = pendingClaim;
  const auth = await getAuthApi();
  const snapshot = await auth.loadQuickSession().catch(() => null);
  const verified = snapshot ? await auth.verifyQuickSession(snapshot).catch(() => null) : null;
  if (!snapshot || !verified || verified.accountId !== claim.accountId
    || verified.authEpoch !== claim.authEpoch || verified.contextRevision !== claim.contextRevision) {
    pendingClaim = null;
    setMessage('登入狀態已變更，請重新確認同步帳號。');
    await renderRecovery();
    return;
  }
  if (pendingClaim !== claim) return;
  const bound = await bindQuickCaptureClaim(claim.captureId, claim.accountId, claim.nonceHash,
    { revision: claim.contextRevision, projectRef: verified.contextProjectRef });
  if (!bound) {
    setMessage('這筆待辦已被其他流程處理，請重新整理待處理清單。');
    pendingClaim = null;
    await renderRecovery();
    return;
  }
  pendingClaim = null;
  const latest = auth.getQuickAuthSnapshot();
  if (latest?.accountId !== claim.accountId || latest.authEpoch !== claim.authEpoch) {
    await renderRecovery();
    return;
  }
  authSnapshot = snapshot;
  verifiedAuthSnapshot = verified;
  setAuthStatus(`此快速 App 已登入：${verified.email ?? 'ProJED 帳號'}`, false, true);
  setMessage('已連結原帳號，正在同步。');
  await verifyAndFlush(verified);
  const completed = await getQuickCapture(claim.captureId).catch(() => null);
  if (authSnapshot?.accountId === claim.accountId && authSnapshot.authEpoch === claim.authEpoch) {
    setMessage(completed?.state === 'synced' ? '已建立' : '待辦仍保留在本機，等待同步。');
  }
  await renderRecovery();
};

const showNextRecovery = async () => {
  if (titleInput.value.trim() || currentRecord) return;
  const records = await listRecoverableQuickCaptures();
  const record = records.find(needsRecovery);
  if (!record) {
    setMessage(authSnapshot ? '請先登出此 App，再登入建立這些待辦的原帳號。' : '請登入建立這些待辦的原帳號。');
    authStatus.querySelector<HTMLButtonElement>('button')?.focus();
    return;
  }
  if (record.accountId === null) {
    await beginClaim(record.captureId).catch(() => setMessage('目前無法確認同步帳號，待辦仍保留在本機。'));
    return;
  }
  recoveryCaptureId = record.captureId;
  await renderRecovery();
};

const renderRecoveryFailure = (record: QuickCaptureRecord) => {
  const needsWorkspace = Boolean(record.lastErrorCode?.includes('WORKSPACE')) || record.lastErrorCode === '23503';
  const canRetry = record.lastErrorCode === 'AUTO_RETRY_EXHAUSTED' || needsWorkspace;
  const explanation = record.state === 'failed_auth' ? '請重新登入原帳號後同步。'
    : needsWorkspace ? '請先到主程式完成帳號與工作台設定，再回來重試。'
      : canRetry ? '同步多次失敗，待辦仍保留在本機。' : '同步結果需要查證，待辦仍保留在本機。';
  recovery.hidden = false;
  recovery.dataset.compact = 'false';
  recovery.innerHTML = `<strong>同步未完成</strong><span>${escapeHtml(record.title)}</span><span>${explanation}</span><div class="quick-task-actions">${record.state === 'failed_auth' ? '<button type="button" data-recovery-login="true">重新登入</button>' : ''}${needsWorkspace ? '<button type="button" data-workbench="true">前往工作台</button>' : ''}${canRetry ? '<button type="button" data-retry="true">重試</button>' : ''}<button type="button" data-back="true">返回</button></div>`;
  recovery.querySelector<HTMLButtonElement>('[data-recovery-login]')?.addEventListener('click', () => {
    void getAuthApi().then(auth => auth.startQuickGoogleSignIn(new URL('/quick-task/', window.location.origin).toString()))
      .catch(() => setMessage('目前無法登入，待辦仍保留在本機。'));
  });
  recovery.querySelector<HTMLButtonElement>('[data-workbench]')?.addEventListener('click', () => {
    window.location.assign(getWorkbenchUrl(window.location.origin));
  });
  recovery.querySelector<HTMLButtonElement>('[data-retry]')?.addEventListener('click', event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    void (async () => {
      const auth = await getAuthApi();
      const snapshot = await auth.loadQuickSession();
      const verified = snapshot ? await auth.verifyQuickSession(snapshot) : null;
      if (!verified || verified.accountId !== record.accountId) {
        setMessage('請先登入原帳號，再重試這筆待辦。');
        return;
      }
      const retried = await retryQuickCapture(record.captureId, verified.accountId);
      if (retried) await verifyAndFlush(verified);
      await renderRecovery();
    })().catch(() => setMessage('重試未完成，待辦仍保留在本機。')).finally(() => { button.disabled = false; });
  });
  recovery.querySelector<HTMLButtonElement>('[data-back]')?.addEventListener('click', () => {
    recoveryCaptureId = null;
    void renderRecovery();
  });
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

const renderSuccess = (record: QuickCaptureRecord, synced: boolean) => {
  success.hidden = false;
  success.innerHTML = `<strong>${synced ? '已建立' : '已記下，待同步'}</strong><span>${escapeHtml(record.title)}</span><div class="quick-task-actions"><button class="primary" type="button" data-next="true">再記一筆</button><button type="button" data-workbench="true">前往工作台</button></div>`;
  success.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => {
    currentRecord = null;
    pendingLocalCommit = null;
    titleInput.value = '';
    success.hidden = true;
    setMessage('');
    titleInput.focus();
    void renderRecovery();
  });
  success.querySelector<HTMLButtonElement>('[data-workbench]')?.addEventListener('click', () => {
    window.location.assign(getWorkbenchUrl(window.location.origin));
  });
};

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
};

const beginClaim = async (captureId: string) => {
  if (claimInFlight) return;
  claimInFlight = true;
  try {
    const auth = await getAuthApi();
    const snapshot = await auth.loadQuickSession();
    const verified = snapshot ? await auth.verifyQuickSession(snapshot) : null;
    if (!verified) {
      setMessage(snapshot ? '目前無法確認登入狀態，請連線後再試。' : '請先登入，再確認同步帳號。');
      if (!snapshot) authStatus.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const nonceHash = await digest(nonce);
    await putClaimIntent(captureId, nonceHash, Date.now() + 15 * 60_000);
    const latest = auth.getQuickAuthSnapshot();
    if (latest?.accountId !== verified.accountId || latest.authEpoch !== verified.authEpoch) return;
    authSnapshot = verified;
    verifiedAuthSnapshot = verified;
    pendingClaim = { captureId, nonceHash, accountId: verified.accountId, email: verified.email,
      authEpoch: verified.authEpoch, contextRevision: verified.contextRevision };
    setMessage('');
    await renderRecovery();
  } finally {
    claimInFlight = false;
  }
};

const finishClaimFromUrl = async () => {
  const params = new URLSearchParams(window.location.search);
  const captureId = params.get('capture');
  const nonce = params.get('claim');
  if (!captureId || !nonce) return;
  claimInFlight = true;
  try {
    const auth = await getAuthApi();
    const snapshot = await auth.loadQuickSession().catch(() => null);
    if (!snapshot) { setMessage('登入尚未完成，請稍後再試。'); return; }
    const verified = await auth.verifyQuickSession(snapshot).catch(() => null);
    if (!verified) { setMessage('登入帳號無法驗證，原名稱仍保留在本機。'); return; }
    const hash = await digest(nonce);
    const record = await getQuickCapture(captureId);
    if (!record || !record.claimIntent || record.claimIntent.nonceHash !== hash || record.claimIntent.expiresAt < Date.now()) {
      setMessage('這筆登入恢復已失效，請從待處理入口明確恢復。');
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('capture');
    nextUrl.searchParams.delete('claim');
    nextUrl.hash = '';
    history.replaceState(history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    authSnapshot = snapshot;
    verifiedAuthSnapshot = verified;
    pendingClaim = { captureId, nonceHash: hash, accountId: verified.accountId, email: verified.email,
      authEpoch: verified.authEpoch, contextRevision: verified.contextRevision };
    setAuthStatus(`已登入：${verified.email ?? 'ProJED 帳號'}，待確認同步`, false, true);
    setMessage('請在下方確認後，才會把這筆本機待辦連結到此帳號。');
    await renderRecovery();
  } catch {
    setMessage('登入恢復暫時失敗，原名稱仍保留在本機。');
  } finally {
    claimInFlight = false;
  }
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (voiceSession || isComposing || submitButton.disabled) return;
  const title = normalizeQuickTitle(titleInput.value);
  if (!isQuickTitleValid(title)) { setMessage('請輸入 1～500 個字元的任務名稱。'); titleInput.focus(); return; }
  submitButton.disabled = true;
  voiceButton.disabled = true;
  localCommitInFlight = true;
  try {
    const offlineContext = await (await getAuthApi()).getQuickBindingContext().catch(() => null);
    const snapshot = verifiedAuthSnapshot && verifiedAuthSnapshot.authEpoch === authSnapshot?.authEpoch
      ? verifiedAuthSnapshot
      : null;
    const localAccountId = snapshot?.accountId
      ?? (offlineContext?.bindingAllowed ? offlineContext.accountId : null);
    const record: QuickCaptureRecord = pendingLocalCommit?.record.title === title ? pendingLocalCommit.record : {
      schemaVersion: 1,
      captureId: currentRecord?.captureId ?? createQuickCaptureId(),
      accountId: localAccountId,
      title,
      workspaceHint: null,
      clientCreatedAt: Date.now(),
      updatedAt: Date.now(),
      state: localAccountId ? 'pending' : 'awaiting_auth',
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      leaseId: null,
      leaseExpiresAt: null,
      claimIntent: null,
    };
    if (!pendingLocalCommit || pendingLocalCommit.record !== record) {
      pendingLocalCommit = { record, context: localAccountId && (snapshot?.contextRevision ?? offlineContext?.revision) !== undefined
        ? { revision: snapshot?.contextRevision ?? offlineContext!.revision,
          projectRef: snapshot?.contextProjectRef ?? offlineContext!.projectRef, accountId: localAccountId } : undefined };
    }
    const committed = currentRecord
      ? await updateQuickCapture(currentRecord.captureId, { state: record.state, lastErrorCode: null, nextAttemptAt: null, leaseId: null, leaseExpiresAt: null })
      : await commitQuickCapture(record, pendingLocalCommit.context);
    if (!committed) throw new Error('IDB_UPDATE_FAILED');
    currentRecord = committed;
    pendingLocalCommit = null;
    titleInput.value = '';
    setMessage('');
    renderSuccess(committed, false);
  } catch (error) {
    setMessage(error instanceof Error && error.message === 'IDB_READBACK_FAILED'
      ? '無法確認是否已記下，請重試；會確認同一筆任務，不會重複建立。'
      : '目前無法記下，請稍後重試。');
  } finally {
    localCommitInFlight = false;
    submitButton.disabled = false;
    voiceButton.disabled = false;
    if (authSnapshot) void verifyAndFlush(authSnapshot);
    await renderRecovery();
  }
});

voiceButton.addEventListener('click', () => {
  if (voiceSession) { voiceSession.stop(); return; }
  voiceSession = startVoiceCapture(titleInput, {
    onState: state => {
      voiceButton.dataset.listening = state === 'listening' ? 'true' : 'false';
      voiceButton.querySelector('span:last-child')!.textContent = state === 'listening' ? '停止' : '語音';
      if (state === 'fallback') {
        voiceSession = null;
        setMessage('請點名稱欄，再點鍵盤麥克風。');
      }
      if (state === 'listening') setMessage('正在聆聽，說完後可繼續編輯。');
      if (state === 'idle') { voiceSession = null; setMessage('語音已加入名稱，可繼續編輯。'); }
    },
    onValue: (value, caret) => { titleInput.value = value; titleInput.setSelectionRange(caret, caret); },
  });
});

titleInput.addEventListener('compositionstart', () => { isComposing = true; });
titleInput.addEventListener('compositionend', () => { isComposing = false; });

titleInput.addEventListener('input', () => {
  if (!titleInput.value.trim()) void renderRecovery();
  else {
    recoveryRenderRevision += 1;
    hideRecovery();
  }
});
titleInput.addEventListener('input', () => {
  if (currentRecord && titleInput.value !== currentRecord.title) {
    currentRecord = null;
    success.hidden = true;
  }
});

enableControls();
const removeQuickInstallGuide = installQuickInstallGuide(document.querySelector<HTMLElement>('.quick-task-shell')!);
registerSharedRootWorker();
installReloadSafety();
void (async () => {
  const auth = await getAuthApi();
  await auth.completeQuickOAuthCallback().catch(() => {
    setMessage('登入驗證未完成；待辦仍保留在本機，請重新登入。');
  });
  authSnapshot = await auth.loadQuickSession().catch(() => null);
  if (authSnapshot) setAuthStatus('正在確認登入狀態…', false);
  else setAuthStatus('此快速 App 尚未登入', true);
  void removeExpiredCaptures().catch(() => undefined);
  await finishClaimFromUrl();
  await renderRecovery();
  const onAuthChange = (snapshot: typeof authSnapshot) => {
    if (authSnapshot?.accountId !== snapshot?.accountId || authSnapshot?.authEpoch !== snapshot?.authEpoch) {
      pendingClaim = null;
      recoveryCaptureId = null;
      recoveryRenderRevision += 1;
      hideRecovery();
    }
    if (currentRecord?.accountId && currentRecord.accountId !== snapshot?.accountId) {
      currentRecord = null;
      success.hidden = true;
      titleInput.value = '';
      setMessage('登入帳號已變更；原待辦仍保留在本機，請從待處理入口恢復。');
    }
    authSnapshot = snapshot;
    verifiedAuthSnapshot = null;
    if (snapshot) {
      setAuthStatus('正在確認登入狀態…', false);
      void verifyAndFlush(snapshot);
    } else {
      clearRetryTimer();
      setAuthStatus('此快速 App 尚未登入', true);
      voiceSession?.abort();
      voiceSession = null;
      void renderRecovery();
    }
  };
  let subscription = await auth.subscribeQuickAuth(onAuthChange);
  let resuming = false;
  const resumePage = async () => {
    if (pageActive || resuming) return;
    resuming = true;
    try {
      subscription = await auth.subscribeQuickAuth(onAuthChange);
      pageActive = true;
      cleanupTimer = window.setInterval(() => { void removeExpiredCaptures().catch(() => undefined); }, 24 * 60 * 60 * 1000);
      authRetryCount = 0;
      await refreshAuthAndSync();
    } finally { resuming = false; }
  };
  const retryAndCleanup = () => {
    if (pageActive && document.visibilityState === 'visible') {
      authRetryCount = 0;
      void removeExpiredCaptures().catch(() => undefined);
      if (authSnapshot) void verifyAndFlush(authSnapshot);
      else void refreshAuthAndSync();
    }
  };
  const onOnline = () => { if (pageActive) { authRetryCount = 0; void refreshAuthAndSync(); } };
  const onOffline = () => clearRetryTimer();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const onPageShow = () => { if (!pageActive) void resumePage(); else retryAndCleanup(); };
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', retryAndCleanup);
  cleanupTimer = window.setInterval(() => { void removeExpiredCaptures().catch(() => undefined); }, 24 * 60 * 60 * 1000);
  window.addEventListener('pagehide', event => {
    pageActive = false;
    subscription.unsubscribe();
    auth.bumpQuickAuthEpoch();
    window.clearInterval(cleanupTimer);
    clearRetryTimer();
    if (event.persisted) return;
    removeQuickInstallGuide();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', retryAndCleanup);
  });
  if (authSnapshot) void verifyAndFlush(authSnapshot);
})().catch(() => {
  claimInFlight = false;
  setMessage('快速輸入已就緒；登入同步稍後可再試。');
});
void renderRecovery();
