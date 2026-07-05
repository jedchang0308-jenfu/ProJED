// @ts-nocheck
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.js' // 配合 Vite/TS 配置，通常是匯入 .tsx (原本可能寫 .jsx) 但 Vite 容許
import GlobalErrorBoundary from './components/GlobalErrorBoundary'
import { installSupabaseBrowserDiagnostics } from './services/supabase/browserDiagnostics'
import { setupPwaInstallPromptListener } from './services/pwaInstallService'
import { handleRecoverableAppLoadError, setupPwaLifecycle } from './services/pwaUpdateService'

installSupabaseBrowserDiagnostics();
setupPwaInstallPromptListener();
setupPwaLifecycle();

// 全域監聽資源載入錯誤 (常發生在 PWA 發布新版本後，快取抓到舊 index.html 但找不到 JS chunk)
window.addEventListener('error', (event) => {
  // 過濾動態 import 失敗的情境 (Vite/Rollup 特徵)
  const isChunkLoadError = event.message && (
    event.message.includes('Failed to fetch dynamically imported module') ||
    event.message.includes('Importing a module script failed') ||
    event.error?.name === 'ChunkLoadError'
  );

  if (isChunkLoadError) {
    handleRecoverableAppLoadError(event.error || event.message, 'error');
  }
});

// 在 Promise 中未處理的 Chunk 錯誤
window.addEventListener('unhandledrejection', (event) => {
  const isChunkLoadError = event.reason && (
    event.reason.message?.includes('Failed to fetch dynamically imported module') ||
    event.reason.message?.includes('Importing a module script failed') ||
    event.reason.name === 'ChunkLoadError'
  );

  if (isChunkLoadError) {
    handleRecoverableAppLoadError(event.reason, 'unhandledrejection');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
