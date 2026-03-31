/**
 * AuthGate — 認證守門元件
 * 設計意圖：在使用者未登入時顯示登入畫面，
 * 登入成功後渲染 children（主應用程式）。
 * 確保所有 Firestore 操作都有有效的 userId。
 */
import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/useAuthStore';

// 偵測是否為 App 內建瀏覽器 (Line, FB, IG 等)
const detectInAppBrowser = (): boolean => {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return (
    ua.indexOf('FBAN') > -1 || 
    ua.indexOf('FBAV') > -1 || 
    ua.indexOf('Instagram') > -1 || 
    ua.indexOf('Line') > -1 || 
    ua.indexOf('MicroMessenger') > -1 ||
    ua.indexOf('Threads') > -1
  );
};

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error, signInWithGoogle } = useAuthStore();
  const [isInApp, setIsInApp] = useState(false);

  useEffect(() => {
    setIsInApp(detectInAppBrowser());
  }, []);

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
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-10 max-w-md w-full mx-4 shadow-2xl">
          {/* Logo 與標題 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-2xl font-bold text-white">P</span>
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
                Google 基於安全考量，禁止在 Line/FB 等 App 中直接登入 (會出現 403 disallowed_useragent 錯誤)。
              </p>
              <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                <p className="text-white text-sm font-medium leading-relaxed">
                  💡 解法：<br/>
                  請點擊右上角或右下角的<span className="text-slate-300 mx-1 bg-slate-700 px-1 py-0.5 rounded">選單 (⋮ 或 ⋯)</span>，選擇
                  <span className="text-blue-400 font-bold mx-1">以預設瀏覽器開啟</span> (Chrome 或 Safari) 即可正常登入。
                </p>
              </div>
            </div>
          )}

          {/* Google 登入按鈕 */}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl px-6 py-3.5 transition-all duration-200 hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
          >
            {/* Google Icon SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            使用 Google 帳號登入
          </button>

          {/* 底部說明 */}
          <p className="text-slate-500 text-xs text-center mt-6">
            登入即表示您的資料將安全儲存於雲端，<br/>支援跨裝置即時同步。
          </p>
        </div>
      </div>
    );
  }

  // 已登入：渲染主應用程式
  return <>{children}</>;
}
