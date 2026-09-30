import './quick-task.css';
import {
  commitQuickCapture,
  bindQuickCaptureClaim,
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
let isComposing = false;
let localCommitInFlight = false;
let claimInFlight = false;
let recoveryPromptDismissed = false;
let syncInFlight = false;
let syncRequested = false;
let cleanupInFlight: Promise<number> | null = null;
let cleanupTimer = 0;
let retryTimer: number | null = null;
let pendingClaim: { captureId: string; nonceHash: string; accountId: string; email: string | null } | null = null;

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
      void getAuthApi().then(auth => auth.signOutQuickSession())
        .then(() => setAuthStatus('此快速 App 尚未登入', true))
        .catch(() => setMessage('登出未完成；為保護待辦，請稍後再試。'));
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
      const label = verification.status === 'unreachable' || !navigator.onLine
        ? '目前離線；已保留原帳號本機綁定，網路恢復後自動同步'
        : verification.status === 'unauthenticated' ? '此快速 App 尚未登入' : '登入狀態已變更，請重新確認';
      setAuthStatus(label, verification.status === 'unauthenticated', false);
      return;
    }
    const verified = verification.snapshot;
    verifiedAuthSnapshot = verified;
    setAuthStatus(`此快速 App 已登入：${verified.email ?? 'ProJED 帳號'}`, false, true);
    await flushQuickTaskOutbox(verified, (captureId, state) => {
      if (state === 'synced' && currentRecord?.captureId === captureId) renderSuccess(currentRecord, true);
    });
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

const renderRecovery = async () => {
  if (pendingClaim) {
    const record = await getQuickCapture(pendingClaim.captureId).catch(() => null);
    if (!record) {
      pendingClaim = null;
    } else {
      recovery.hidden = false;
      recovery.innerHTML = `<strong>確認連結此待辦</strong><span>${escapeHtml(record.title)}</span><span>登入帳號：${escapeHtml(pendingClaim.email ?? 'ProJED 帳號')}。確認後才會加入此帳號並同步。</span><div class="quick-task-actions"><button type="button" data-confirm-claim="true">確認同步</button><button type="button" data-cancel-claim="true">稍後處理</button></div>`;
      recovery.querySelector<HTMLButtonElement>('[data-confirm-claim]')?.addEventListener('click', () => { void confirmPendingClaim(); });
      recovery.querySelector<HTMLButtonElement>('[data-cancel-claim]')?.addEventListener('click', () => {
        pendingClaim = null;
        recovery.hidden = true;
        recovery.replaceChildren();
      });
      return;
    }
  }
  if (recoveryPromptDismissed) {
    recovery.hidden = true;
    recovery.replaceChildren();
    return;
  }
  const count = (await listRecoverableQuickCaptures().catch(() => [])).filter(record => record.state !== 'synced').length;
  if (count === 0 || titleInput.value.trim() || currentRecord) {
    recovery.hidden = true;
    recovery.replaceChildren();
    return;
  }
  recovery.hidden = false;
  recovery.innerHTML = `<strong>待處理 ${count} 筆</strong><span>名稱仍保存在這台裝置。可以現在處理，或稍後再回來。</span><div class="quick-task-actions"><button type="button" data-recover="true">處理</button><button type="button" data-dismiss-recovery="true">稍後處理</button></div>`;
  recovery.querySelector<HTMLButtonElement>('[data-recover]')?.addEventListener('click', () => { void showNextRecovery(); });
  recovery.querySelector<HTMLButtonElement>('[data-dismiss-recovery]')?.addEventListener('click', () => {
    recoveryPromptDismissed = true;
    recovery.hidden = true;
    recovery.replaceChildren();
  });
};

const confirmPendingClaim = async () => {
  if (!pendingClaim) return;
  const claim = pendingClaim;
  const auth = await getAuthApi();
  const snapshot = await auth.loadQuickSession().catch(() => null);
  const verified = snapshot ? await auth.verifyQuickSession(snapshot).catch(() => null) : null;
  if (!snapshot || !verified || verified.accountId !== claim.accountId) {
    setMessage('登入帳號已變更，原待辦仍保留在本機。');
    return;
  }
  const bound = await bindQuickCaptureClaim(claim.captureId, claim.accountId, claim.nonceHash);
  if (!bound) {
    setMessage('這筆待辦已被其他流程處理，請重新整理待處理清單。');
    pendingClaim = null;
    await renderRecovery();
    return;
  }
  pendingClaim = null;
  authSnapshot = snapshot;
  verifiedAuthSnapshot = verified;
  setAuthStatus(`此快速 App 已登入：${verified.email ?? 'ProJED 帳號'}`, false, true);
  setMessage('已連結原帳號，正在同步。');
  await flushQuickTaskOutbox(verified, (_id, state) => setMessage(state === 'synced' ? '已建立' : '仍待處理，名稱已保留。'));
  await renderRecovery();
};

const showNextRecovery = async () => {
  if (titleInput.value.trim() || currentRecord) return;
  const records = await listRecoverableQuickCaptures();
  const record = records.find(item => item.state !== 'synced');
  if (!record) return renderRecovery();
  if (record.accountId === null) {
    recovery.hidden = false;
    recovery.innerHTML = '<strong>有一筆尚未連結帳號的待辦</strong><span>名稱已安全留在本機，登入後才能查看並同步。</span><div class="quick-task-actions"><button type="button" data-login-unbound="true">登入以恢復</button></div>';
    recovery.querySelector<HTMLButtonElement>('[data-login-unbound]')?.addEventListener('click', () => {
      void beginClaim(record.captureId).catch(() => setMessage('登入尚未開啟，原名稱仍保留在本機。'));
    });
    return;
  }
  currentRecord = record;
  titleInput.value = record.title;
  titleInput.focus();
  setMessage(`正在恢復：${record.state === 'failed_auth' ? '請登入原帳號後同步' : '可重試或返回輸入'}`);
  recovery.hidden = false;
  recovery.innerHTML = `<strong>本機待處理</strong><span>${escapeHtml(record.title)}</span><div class="quick-task-actions"><button type="button" data-retry="true">重試</button><button type="button" data-back="true">返回輸入</button></div>`;
  recovery.querySelector<HTMLButtonElement>('[data-retry]')?.addEventListener('click', async () => {
    if (!authSnapshot) { setMessage('請先登入原帳號，再重試這筆待辦。'); return; }
    await retryQuickCapture(record.captureId, authSnapshot.accountId);
    await flushQuickTaskOutbox(authSnapshot, (_id, state) => setMessage(state === 'synced' ? '已建立' : '仍待處理，名稱已保留。'));
    currentRecord = null;
    titleInput.value = '';
    await renderRecovery();
  });
  recovery.querySelector<HTMLButtonElement>('[data-back]')?.addEventListener('click', async () => {
    currentRecord = null;
    titleInput.value = '';
    setMessage('可以記下一筆新的待辦。');
    await renderRecovery();
  });
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

const renderSuccess = (record: QuickCaptureRecord, synced: boolean) => {
  success.hidden = false;
  const needsLogin = !record.accountId || verifiedAuthSnapshot?.accountId !== record.accountId;
  success.innerHTML = `<strong>${synced ? '已建立' : '已記下，待同步'}</strong><span>${escapeHtml(record.title)}</span><div class="quick-task-actions"><button class="primary" type="button" data-next="true">再記一筆</button><button type="button" data-workbench="true">前往工作台</button>${!synced && needsLogin ? '<button type="button" data-login="true">登入以同步</button>' : ''}</div>`;
  success.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => {
    currentRecord = null;
    titleInput.value = '';
    success.hidden = true;
    setMessage('');
    titleInput.focus();
    void renderRecovery();
  });
  success.querySelector<HTMLButtonElement>('[data-workbench]')?.addEventListener('click', () => {
    window.location.assign(getWorkbenchUrl(window.location.origin));
  });
  success.querySelector<HTMLButtonElement>('[data-login]')?.addEventListener('click', () => {
    void beginClaim(record.captureId).catch(() => setMessage('登入尚未開啟，原名稱仍保留在本機。'));
  });
};

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
};

const beginClaim = async (captureId: string) => {
  claimInFlight = true;
  try {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    await putClaimIntent(captureId, await digest(nonce), Date.now() + 15 * 60_000);
    const callback = new URL('/quick-task/', window.location.origin);
    callback.searchParams.set('capture', captureId);
    callback.searchParams.set('claim', nonce);
    await (await getAuthApi()).startQuickGoogleSignIn(callback.toString());
  } catch (error) {
    claimInFlight = false;
    throw error;
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
    pendingClaim = { captureId, nonceHash: hash, accountId: verified.accountId, email: verified.email };
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
  const offlineContext = await (await getAuthApi()).getQuickBindingContext().catch(() => null);
  const snapshot = verifiedAuthSnapshot && verifiedAuthSnapshot.authEpoch === authSnapshot?.authEpoch
    ? verifiedAuthSnapshot
    : null;
  const localAccountId = snapshot?.accountId
    ?? (offlineContext?.bindingAllowed ? offlineContext.accountId : null);
  const record: QuickCaptureRecord = {
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
  try {
    const committed = currentRecord
      ? await updateQuickCapture(currentRecord.captureId, { state: record.state, lastErrorCode: null, nextAttemptAt: null, leaseId: null, leaseExpiresAt: null })
      : await commitQuickCapture(record, localAccountId && (snapshot?.contextRevision ?? offlineContext?.revision) !== undefined
        ? {
          revision: snapshot?.contextRevision ?? offlineContext!.revision,
          projectRef: snapshot?.contextProjectRef ?? offlineContext!.projectRef,
          accountId: localAccountId,
        }
        : undefined);
    if (!committed) throw new Error('IDB_UPDATE_FAILED');
    currentRecord = committed;
    titleInput.value = '';
    setMessage('');
    renderSuccess(committed, false);
  } catch (error) {
    setMessage(error instanceof Error && error.message === 'IDB_READBACK_FAILED'
      ? '無法確認是否已記下。請清空輸入欄查看待處理清單；若未出現再重試。'
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

titleInput.addEventListener('input', () => { if (!titleInput.value.trim()) void renderRecovery(); else recovery.hidden = true; });
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
  const subscription = await auth.subscribeQuickAuth(snapshot => {
    if (currentRecord && snapshot && currentRecord.accountId && currentRecord.accountId !== snapshot.accountId) {
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
  });
  const retryAndCleanup = () => {
    if (document.visibilityState === 'visible') {
      void removeExpiredCaptures().catch(() => undefined);
      if (authSnapshot) void verifyAndFlush(authSnapshot);
      else void refreshAuthAndSync();
    }
  };
  const onOnline = () => { void refreshAuthAndSync(); };
  const onOffline = () => clearRetryTimer();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('pageshow', retryAndCleanup);
  document.addEventListener('visibilitychange', retryAndCleanup);
  cleanupTimer = window.setInterval(() => { void removeExpiredCaptures().catch(() => undefined); }, 24 * 60 * 60 * 1000);
  window.addEventListener('pagehide', () => {
    subscription.unsubscribe();
    removeQuickInstallGuide();
    window.clearInterval(cleanupTimer);
    clearRetryTimer();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('pageshow', retryAndCleanup);
    document.removeEventListener('visibilitychange', retryAndCleanup);
  }, { once: true });
  if (authSnapshot) void verifyAndFlush(authSnapshot);
})().catch(() => {
  claimInFlight = false;
  setMessage('快速輸入已就緒；登入同步稍後可再試。');
});
void renderRecovery();
