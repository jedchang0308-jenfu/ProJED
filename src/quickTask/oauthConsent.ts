import './oauth-consent.css';
import { getQuickOAuthConfig } from '../features/quickTaskCapture/oauthClient';
import { supabase } from '../services/supabase/client';

const status = document.querySelector<HTMLElement>('#oauth-consent-status');
const details = document.querySelector<HTMLElement>('#oauth-consent-details');
const clientName = document.querySelector<HTMLElement>('#oauth-consent-client');
const userEmail = document.querySelector<HTMLElement>('#oauth-consent-user');
const scopeLabel = document.querySelector<HTMLElement>('#oauth-consent-scope');
const loginButton = document.querySelector<HTMLButtonElement>('#oauth-consent-login');
const denyButton = document.querySelector<HTMLButtonElement>('#oauth-consent-deny');
const approveButton = document.querySelector<HTMLButtonElement>('#oauth-consent-approve');

if (!status || !details || !clientName || !userEmail || !scopeLabel || !loginButton || !denyButton || !approveButton) {
  throw new Error('OAUTH_CONSENT_BOOTSTRAP_FAILED');
}

const setStatus = (text: string) => { status.textContent = text; };
const config = getQuickOAuthConfig();
const authorizationId = new URL(window.location.href).searchParams.get('authorization_id');
const validAuthorizationId = (value: string | null): value is string => Boolean(value && /^[A-Za-z0-9_-]{16,200}$/u.test(value));

const safeOAuthRedirect = (value: string, redirectUri: string) => {
  try {
    const actual = new URL(value);
    const expected = new URL(redirectUri);
    const allowedParams = new Set(['code', 'state', 'error', 'error_description', 'error_uri']);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.username || actual.password || actual.hash
      || [...actual.searchParams.keys()].some(key => !allowedParams.has(key))) return null;
    if (!actual.searchParams.has('code') && !actual.searchParams.has('error')) return null;
    return actual.toString();
  } catch {
    return null;
  }
};

const runConsent = async () => {
  if (!config || !validAuthorizationId(authorizationId)) {
    setStatus('授權連結無效或尚未設定，請返回快速建任務頁面重新操作。');
    return;
  }

  const consentUrl = new URL(window.location.href);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) {
    setStatus('登入 ProJED 帳號後，才能確認這項授權。');
    loginButton.hidden = false;
    loginButton.addEventListener('click', async () => {
      loginButton.disabled = true;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: consentUrl.toString() },
      });
      if (error) {
        loginButton.disabled = false;
        setStatus('目前無法登入，請稍後再試。');
      }
    }, { once: true });
    return;
  }

  const [{ data: userData, error: userError }, authorization] = await Promise.all([
    supabase.auth.getUser(session.access_token),
    supabase.auth.oauth.getAuthorizationDetails(authorizationId),
  ]);
  if (userError) throw userError;
  if (authorization.error || !authorization.data) throw authorization.error ?? new Error('OAUTH_AUTHORIZATION_NOT_FOUND');
  if (!userData.user || userData.user.id !== session.user.id) throw new Error('OAUTH_CONSENT_USER_MISMATCH');

  const payload = authorization.data;
  if ('redirect_url' in payload) {
    const redirect = safeOAuthRedirect(payload.redirect_url, config.redirectUri);
    if (!redirect) throw new Error('OAUTH_REDIRECT_REJECTED');
    window.location.replace(redirect);
    return;
  }
  if (payload.authorization_id !== authorizationId || payload.user.id !== userData.user.id
    || payload.client.id !== config.clientId || payload.redirect_uri !== config.redirectUri) {
    throw new Error('OAUTH_AUTHORIZATION_MISMATCH');
  }

  const scopes = payload.scope.split(/\s+/u).filter(Boolean);
  const allowedScopes = scopes.length > 0 && scopes.every(scope => scope === 'email');
  clientName.textContent = payload.client.name || '快速建任務';
  userEmail.textContent = userData.user.email ?? 'ProJED 帳號';
  scopeLabel.textContent = scopes.map(scope => scope === 'email' ? '電子郵件地址' : scope).join('、') || '未指定';
  details.hidden = false;
  approveButton.disabled = !allowedScopes;
  if (!allowedScopes) setStatus('此授權要求包含目前未開放的資料範圍，請拒絕並聯絡管理者。');
  else setStatus('請確認應用程式與登入帳號，再選擇是否授權。');

  const finish = async (decision: 'approve' | 'deny') => {
    denyButton.disabled = true;
    approveButton.disabled = true;
    setStatus(decision === 'approve' ? '正在完成授權…' : '正在拒絕授權…');
    const result = decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (result.error || !result.data?.redirect_url) throw result.error ?? new Error('OAUTH_REDIRECT_MISSING');
    const redirect = safeOAuthRedirect(result.data.redirect_url, config.redirectUri);
    if (!redirect) throw new Error('OAUTH_REDIRECT_REJECTED');
    window.location.replace(redirect);
  };
  denyButton.addEventListener('click', () => { void finish('deny').catch(() => setStatus('無法完成拒絕操作，請返回快速建任務頁面重試。')); }, { once: true });
  approveButton.addEventListener('click', () => { void finish('approve').catch(() => setStatus('無法完成授權，請返回快速建任務頁面重試。')); }, { once: true });
};

void runConsent().catch(() => setStatus('無法確認授權要求，請返回快速建任務頁面重新操作。'));
