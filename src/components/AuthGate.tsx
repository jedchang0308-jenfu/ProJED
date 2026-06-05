/**
 * AuthGate — 認證守門元件
 * 設計意圖：在使用者未登入時顯示登入畫面，
 * 登入成功後渲染 children（主應用程式）。
 * 確保所有 Firestore 操作都有有效的 userId。
 *
 * 【自動遷移機制】
 * 使用者首次登入後，會自動執行 runAutoMigration，
 * 將舊版 localStorage 或 Firestore 舊格式資料升級至新版 WBS 架構。
 * 遷移完成後寫入 Firestore users/{uid}.migrationVersion = 2，
 * 確保後續登入不再重複執行（Idempotent 設計）。
 */
import React, { useState, useEffect, useRef } from 'react';
import useAuthStore from '../store/useAuthStore';
import { runAutoMigration } from '../utils/autoMigration';
import {
  isEmbeddedAuthBlocked,
  isLocalTestAuth,
  isSupabaseLocalPasswordAuth,
  LOCAL_TEST_ACCOUNTS,
  LOCAL_TEST_SELECTED_ACCOUNT_KEY,
} from '../services/authService';
import { isLocalTestBackend, isSupabaseBackend } from '../services/dataBackend';
import { seedLocalTestEnvironment } from '../utils/localTestEnvironment';
import { BOARD_INVITE_TOKEN_PARAM } from '../utils/boardInviteToken';

// 偵測是否為 App 內建瀏覽器 (Line, FB, IG 等)
const detectInAppBrowser = (): boolean => {
  return isEmbeddedAuthBlocked();
};

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error, signInWithGoogle } = useAuthStore();
  const [isInApp, setIsInApp] = useState(false);
  const [copiedLoginUrl, setCopiedLoginUrl] = useState(false);
  const isLocalTestMode = isLocalTestAuth();
  const isLocalSupabasePasswordMode = isSupabaseLocalPasswordAuth();
  const shouldAutoTestLogin =
    isLocalSupabasePasswordMode && import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN === 'true';
  const isInviteLinkFlow = new URLSearchParams(window.location.search).has(BOARD_INVITE_TOKEN_PARAM);
  const autoTestLoginStartedRef = useRef(false);
  // 遷移狀態：'idle' | 'migrating' | 'done'
  const [migrationState, setMigrationState] = useState<'idle' | 'migrating' | 'done'>('idle');
  const initialLocalTestAccount =
    LOCAL_TEST_ACCOUNTS.find(account => account.id === localStorage.getItem(LOCAL_TEST_SELECTED_ACCOUNT_KEY)) ??
    LOCAL_TEST_ACCOUNTS[0];
  const [selectedLocalTestAccountId, setSelectedLocalTestAccountId] = useState(initialLocalTestAccount.id);
  const [localTestEmail, setLocalTestEmail] = useState(initialLocalTestAccount.email ?? '');
  const [localTestPassword, setLocalTestPassword] = useState(initialLocalTestAccount.password);

  const fillLocalTestAccount = (accountId: string) => {
    const account = LOCAL_TEST_ACCOUNTS.find(item => item.id === accountId) ?? LOCAL_TEST_ACCOUNTS[0];
    setSelectedLocalTestAccountId(account.id);
    setLocalTestEmail(account.email ?? '');
    setLocalTestPassword(account.password);
    localStorage.setItem(LOCAL_TEST_SELECTED_ACCOUNT_KEY, account.id);
  };

  const handleLocalTestSignIn = async () => {
    const matchedAccount =
      LOCAL_TEST_ACCOUNTS.find(account => account.email === localTestEmail.trim()) ??
      LOCAL_TEST_ACCOUNTS.find(account => account.id === selectedLocalTestAccountId) ??
      LOCAL_TEST_ACCOUNTS[0];
    localStorage.setItem(LOCAL_TEST_SELECTED_ACCOUNT_KEY, matchedAccount.id);
    await signInWithGoogle();
  };

  const getExternalOpenUrl = () => {
    const currentUrl = new URL(window.location.href);
    const isAndroid = /Android/i.test(navigator.userAgent || '');

    if (isAndroid) {
      return `intent://${currentUrl.host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}#Intent;scheme=${currentUrl.protocol.replace(':', '')};package=com.android.chrome;end`;
    }

    const chromeScheme = currentUrl.protocol === 'https:' ? 'googlechromes' : 'googlechrome';
    return `${chromeScheme}://${currentUrl.host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  };

  const getExternalOpenLabel = () => {
    if (/Android/i.test(navigator.userAgent || '')) return '用 Chrome 開啟';
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return '嘗試用 Chrome 開啟';
    return '用外部瀏覽器開啟';
  };

  const handleCopyLoginUrl = async () => {
    const loginUrl = window.location.href;

    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopiedLoginUrl(true);
      window.setTimeout(() => setCopiedLoginUrl(false), 2500);
    } catch {
      window.prompt('請複製這個網址後，用 Chrome 或 Safari 開啟：', loginUrl);
    }
  };

  useEffect(() => {
    setIsInApp(detectInAppBrowser());
  }, []);

  useEffect(() => {
    if (!shouldAutoTestLogin || user || loading || autoTestLoginStartedRef.current) return;

    autoTestLoginStartedRef.current = true;
    signInWithGoogle().catch((signInError) => {
      autoTestLoginStartedRef.current = false;
      console.error('[AuthGate] 測試帳號自動登入失敗:', signInError);
    });
  }, [loading, shouldAutoTestLogin, signInWithGoogle, user]);

  // 登入後自動觸發遷移（只有 user 從 null 變成非 null 時執行一次）
  useEffect(() => {
    if (!user) {
      // 登出時重置，確保下次登入可以重新檢查
      setMigrationState('idle');
      return;
    }

    if (isLocalTestBackend) {
      seedLocalTestEnvironment();
      setMigrationState('done');
      return;
    }

    if (migrationState !== 'idle') return;

    if (isSupabaseBackend) {
      setMigrationState('done');
      return;
    }

    setMigrationState('migrating');
    runAutoMigration(user.uid)
      .then((result) => {
        if (result === 'migrated') {
          console.log('[AuthGate] 資料遷移完成！');
        } else if (result === 'skipped') {
          console.log('[AuthGate] 已是最新版，無需遷移。');
        } else {
          console.warn('[AuthGate] 遷移過程發生問題，但不影響主應用程式運作。');
        }
      })
      .catch(e => console.error('[AuthGate] 遷移例外:', e))
      .finally(() => setMigrationState('done'));
  }, [user?.uid]);

  // 載入中：顯示 spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300 text-sm">載入中...</p>
        </div>
      </div>
    );
  }

  // 未登入：顯示登入頁面
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className={`bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-10 w-full mx-4 shadow-2xl ${isLocalTestMode ? 'max-w-5xl grid gap-8 lg:grid-cols-[1fr_380px]' : 'max-w-md'}`}>
          <div>
          {/* Logo 與標題 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 overflow-hidden shadow-lg shadow-blue-500/25 border border-slate-700/50">
              <img src="/icons/icon-vibrant-02-aqua-lime.png" alt="ProJED 標誌" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">ProJED</h1>
            <p className="text-slate-400 text-sm">專案管理，從登入開始</p>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* 內建瀏覽器警告 */}
          {isInApp && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 relative overflow-hidden text-left shadow-lg shadow-yellow-500/10">
              <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
              <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
                ⚠️ 必須使用外部瀏覽器
              </h3>
              <p className="text-slate-300 text-sm mb-3">
                Google 基於安全考量，禁止在 LINE、Facebook 等內建瀏覽器中直接登入（會出現 403 不允許的瀏覽器錯誤）。
              </p>
              <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                <p className="text-white text-sm font-medium leading-relaxed">
                  💡 解法：<br/>
                  請點擊右上角或右下角的<span className="text-slate-300 mx-1 bg-slate-700 px-1 py-0.5 rounded">選單（⋮ 或 ⋯）</span>，選擇
                  <span className="text-blue-400 font-bold mx-1">以預設瀏覽器開啟</span>即可正常登入。
                </p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <a
                  href={getExternalOpenUrl()}
                  className="rounded-lg bg-blue-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-blue-400"
                >
                  {getExternalOpenLabel()}
                </a>
                <button
                  type="button"
                  onClick={handleCopyLoginUrl}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-100 transition-colors hover:border-slate-400"
                >
                  {copiedLoginUrl ? '已複製網址' : '複製登入網址'}
                </button>
              </div>
            </div>
          )}

          {isInviteLinkFlow && isLocalTestMode && (
            <div className="mb-6 rounded-lg border border-blue-400/30 bg-blue-500/10 p-4 text-left">
              <h3 className="mb-2 text-sm font-bold text-blue-200">本機測試邀請連結</h3>
              <p className="text-sm leading-relaxed text-slate-300">
                目前網址是 127.0.0.1 本機測試環境，只適合用右側測試帳號驗證邀請流程。真實受邀者不應看到測試角色帳號，請使用正式站台產生的邀請連結，並用受邀電子郵件帳號登入。
              </p>
            </div>
          )}

          {/* Login button */}
          <button
            onClick={isLocalTestMode ? handleLocalTestSignIn : signInWithGoogle}
            disabled={(shouldAutoTestLogin && loading) || isInApp}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl px-6 py-3.5 transition-all duration-200 hover:shadow-lg hover:shadow-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:hover:shadow-none disabled:active:scale-100"
          >
            {isLocalTestMode ? (
              <>
                <span className="text-lg">T</span>
                使用固定測試環境
              </>
            ) : isLocalSupabasePasswordMode ? (
              <>
                <span className="text-lg">S</span>
                {shouldAutoTestLogin ? '正在使用測試帳號登入...' : '使用測試帳號登入'}
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                使用 Google 帳號登入
              </>
            )}
          </button>

          {/* 底部說明 */}
          <p className="text-slate-500 text-xs text-center mt-6">
            登入即表示您的資料將安全儲存於雲端，<br/>支援跨裝置即時同步。
          </p>
          </div>

          {isLocalTestMode && (
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-white">測試角色帳號</h2>
                <p className="mt-1 text-xs text-slate-400">點選角色會填入帳號密碼，再按登入。</p>
              </div>

              <div className="space-y-2">
                {LOCAL_TEST_ACCOUNTS.map(account => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => fillLocalTestAccount(account.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      selectedLocalTestAccountId === account.id
                        ? 'border-blue-400 bg-blue-500/15 text-white'
                        : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{account.displayName}</span>
                      <span className="rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                        {account.role}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400">{account.email}</div>
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-400">帳號</span>
                  <input
                    value={localTestEmail}
                    onChange={(event) => setLocalTestEmail(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-400">密碼</span>
                  <input
                    value={localTestPassword}
                    onChange={(event) => setLocalTestPassword(event.target.value)}
                    type="password"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-400"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 遷移中：顯示升級畫面（防止使用者在遷移期間誤操作）
  if (migrationState === 'migrating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-6 text-center px-8">
          {/* 動畫圖示 */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full" />
            <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
          </div>

          {/* 說明文字 */}
          <div>
            <h2 className="text-white text-lg font-bold mb-2">資料升級中...</h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              正在將您的資料升級至最新的工作分解結構，<br/>
              這只需要幾秒鐘，請勿關閉視窗。
            </p>
          </div>

          {/* 進度提示 */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // 已登入且遷移完成（或跳過）：渲染主應用程式
  return <>{children}</>;
}

