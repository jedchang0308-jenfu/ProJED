/**
 * UpdateToast — PWA 新版本更新通知元件
 * 設計意圖：當 Service Worker 在背景偵測到新版本並下載完畢後，
 * 顯示一個優雅的 Toast 通知，讓使用者可以選擇「立即套用」或忽略（下次開啟 App 時自動套用）。
 */
import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const UpdateToast = () => {
    const [show, setShow] = useState(false);

    // useRegisterSW：vite-plugin-pwa 提供的 React Hook
    // offlineReady: SW 安裝完成，App 可離線使用
    // needRefresh: 有新版本已下載，等待使用者確認
    // updateServiceWorker: 呼叫此函式以跳過等待並立即套用新版本
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
        onRegistered(r: ServiceWorkerRegistration | undefined) {
            console.log('[PWA] Service Worker 已註冊:', r);
            // 每 60 秒主動檢查一次更新（補強自動偵測）
            if (r) setInterval(() => r.update(), 60 * 1000);
        },
        onRegisterError(error: unknown) {
            console.error('[PWA] Service Worker 註冊失敗:', error);
        },
    });

    useEffect(() => {
        if (needRefresh) {
            setShow(true);
        }
    }, [needRefresh]);

    if (!show) return null;

    return (
        // Toast 容器：固定在畫面底部中央，帶有進場動畫
        <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border border-indigo-400/30"
            style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
                animation: 'slideUp 0.3s ease-out',
                minWidth: '280px',
                maxWidth: '90vw',
            }}
        >
            {/* 圖示 */}
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <RefreshCw size={16} className="text-indigo-300 animate-spin" style={{ animationDuration: '3s' }} />
            </div>

            {/* 文字 */}
            <div className="flex-1">
                <p className="text-white text-sm font-bold leading-tight">🎉 ProJED 有新版本！</p>
                <p className="text-indigo-200 text-xs mt-0.5">點擊立即套用，或下次開啟時自動更新。</p>
            </div>

            {/* 立即更新按鈕 */}
            <button
                onClick={() => { updateServiceWorker(true); setShow(false); }}
                className="flex-shrink-0 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-colors"
            >
                立即套用
            </button>

            {/* 關閉按鈕（等下次自動套用） */}
            <button
                onClick={() => setShow(false)}
                className="flex-shrink-0 p-1 text-indigo-300 hover:text-white transition-colors"
            >
                <X size={14} />
            </button>

            {/* 進場動畫定義 */}
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default UpdateToast;
