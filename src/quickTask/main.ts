import './quick-task.css';
import {
  commitQuickCapture,
  bindQuickCaptureClaim,
  getQuickCapture,
  listQuickCaptures,
  putClaimIntent,
  retryQuickCapture,
  updateQuickCapture,
} from '../features/quickTaskCapture/outbox';
import { createQuickCaptureId, normalizeQuickTitle, isQuickTitleValid, type QuickCaptureRecord } from '../features/quickTaskCapture/model';
import { startVoiceCapture, type VoiceSession } from '../features/quickTaskCapture/voice';
import { flushQuickTaskOutbox } from '../features/quickTaskCapture/sync';
import { installQuickReloadSafety } from '../features/quickTaskCapture/reloadSafety';
import { installQuickInstallGuide } from '../features/quickTaskCapture/install';

const titleInput = document.querySelector<HTMLInputElement>('#quick-task-title');
const form = document.querySelector<HTMLFormElement>('#quick-task-form');
const voiceButton = document.querySelector<HTMLButtonElement>('#quick-task-voice');
const submitButton = document.querySelector<HTMLButtonElement>('#quick-task-submit');
const message = document.querySelector<HTMLElement>('#quick-task-message');
const success = document.querySelector<HTMLElement>('#quick-task-success');
const recovery = document.querySelector<HTMLElement>('#quick-task-recovery');

if (!titleInput || !form || !voiceButton || !submitButton || !message || !success || !recovery) {
  throw new Error('QUICK_TASK_BOOTSTRAP_FAILED');
}

let voiceSession: VoiceSession | null = null;
type QuickAuthApi = typeof import('../features/quickTaskCapture/auth');
let authApiPromise: Promise<QuickAuthApi> | null = null;
let authSnapshot: import('../services/supabase/quickTaskCaptureService').QuickAuthSnapshot | null = null;
let currentRecord: QuickCaptureRecord | null = null;
let isComposing = false;
let localCommitInFlight = false;
let claimInFlight = false;

const getAuthApi = () => {
  authApiPromise ??= import('../features/quickTaskCapture/auth');
  return authApiPromise;
};

const setMessage = (text: string) => { message.textContent = text; };
const listRecoverableQuickCaptures = () => listQuickCaptures(authSnapshot?.accountId ?? null, true);
const enableControls = () => {
  voiceButton.disabled = false;
  submitButton.disabled = false;
  titleInput.focus();
  setMessage('可以直接輸入名稱，或點右側「語音」。');
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
  const count = (await listRecoverableQuickCaptures().catch(() => [])).filter(record => record.state !== 'synced').length;
  if (count === 0 || titleInput.value.trim() || currentRecord) {
    recovery.hidden = true;
    recovery.replaceChildren();
    return;
  }
  recovery.hidden = false;
  recovery.innerHTML = `<strong>待處理 ${count} 筆</strong><span>之前記下的名稱還在本機，現在要處理嗎？</span><div class="quick-task-actions"><button type="button" data-recover="true">處理</button></div>`;
  recovery.querySelector<HTMLButtonElement>('[data-recover]')?.addEventListener('click', () => { void showNextRecovery(); });
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
  success.innerHTML = `<strong>${synced ? '已建立' : '已記下，待同步'}</strong><span>${escapeHtml(record.title)}</span><div class="quick-task-actions"><button class="primary" type="button" data-next="true">再記一筆</button><button type="button" data-workbench="true">前往工作台</button>${!synced ? '<button type="button" data-login="true">登入以同步</button>' : ''}</div>`;
  success.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => {
    currentRecord = null;
    titleInput.value = '';
    success.hidden = true;
    setMessage('可以直接輸入名稱，或點右側「語音」。');
    titleInput.focus();
    void renderRecovery();
  });
  success.querySelector<HTMLButtonElement>('[data-workbench]')?.addEventListener('click', () => {
    window.location.assign('/?quick_workbench=1');
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
    const snapshot = await (await getAuthApi()).loadQuickSession().catch(() => null);
    if (!snapshot) { setMessage('登入尚未完成，請稍後再試。'); return; }
    const hash = await digest(nonce);
    const record = await getQuickCapture(captureId);
    if (!record || !record.claimIntent || record.claimIntent.nonceHash !== hash || record.claimIntent.expiresAt < Date.now()) {
      setMessage('這筆登入恢復已失效，請從待處理入口明確恢復。');
      return;
    }
    const { supabase } = await import('../services/supabase/client');
    const { data, error } = await supabase.auth.getUser(snapshot.accessToken);
    if (error || data.user?.id !== snapshot.accountId) { setMessage('登入帳號無法驗證，原名稱仍保留在本機。'); return; }
    const bound = await bindQuickCaptureClaim(captureId, snapshot.accountId, hash);
    if (!bound) {
      setMessage('這筆待辦已被其他登入流程處理，請重新整理待處理清單。');
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('capture');
    nextUrl.searchParams.delete('claim');
    nextUrl.hash = '';
    history.replaceState(history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    authSnapshot = snapshot;
    setMessage('已連結原帳號，正在同步。');
    await flushQuickTaskOutbox(snapshot, (_id, state) => setMessage(state === 'synced' ? '已建立' : '仍待處理，名稱已保留。'));
    currentRecord = null;
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
  const snapshot = authSnapshot ?? await (await getAuthApi()).loadQuickSession().catch(() => null);
  const record: QuickCaptureRecord = {
    schemaVersion: 1,
    captureId: currentRecord?.captureId ?? createQuickCaptureId(),
    accountId: snapshot?.accountId ?? null,
    title,
    workspaceHint: localStorage.getItem('projed-last-ws'),
    clientCreatedAt: Date.now(),
    updatedAt: Date.now(),
    state: snapshot ? 'pending' : 'awaiting_auth',
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
      : await commitQuickCapture(record);
    if (!committed) throw new Error('IDB_UPDATE_FAILED');
    currentRecord = committed;
    titleInput.value = '';
    setMessage(snapshot ? '正在同步。' : '登入後可同步到全域任務工作台。');
    renderSuccess(committed, false);
    if (snapshot) {
      await flushQuickTaskOutbox(snapshot, (_id, state) => {
        if (state === 'synced') renderSuccess(committed, true);
      });
    }
  } catch (error) {
    setMessage(error instanceof Error && error.message === 'IDB_READBACK_FAILED' ? '尚未記下，請重試。' : '目前無法記下，請稍後重試。');
  } finally {
    localCommitInFlight = false;
    submitButton.disabled = false;
    voiceButton.disabled = false;
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
  authSnapshot = await auth.loadQuickSession().catch(() => null);
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
    if (snapshot) void flushQuickTaskOutbox(snapshot, (_id, state) => { if (state === 'synced' && currentRecord) renderSuccess(currentRecord, true); });
    else { voiceSession?.abort(); voiceSession = null; currentRecord = null; }
  });
  window.addEventListener('pagehide', () => { subscription.unsubscribe(); removeQuickInstallGuide(); });
})().catch(() => {
  claimInFlight = false;
  setMessage('快速輸入已就緒；登入同步稍後可再試。');
});
void renderRecovery();
