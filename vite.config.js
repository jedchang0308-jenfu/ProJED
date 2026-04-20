import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 策略：自動在背景更新，不打擾使用者
      registerType: 'autoUpdate',
      // 開發模式下也啟用 SW，方便本機測試
      devOptions: { enabled: false },
      // 加入 workbox 設定
      workbox: {
        // 預快取主要資源（HTML / JS / CSS）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 設計意圖：讓舊版 SW 可以立刻被新版取代，不需等所有頁籤關閉
        skipWaiting: true,
        clientsClaim: true,
        // 新版 SW 啟動時自動清除舊版 precache，防止手機快取殘留舊 JS chunk 造成 404 白畫面
        cleanupOutdatedCaches: true,
        // 不預快取 index.html，讓 Firebase 的 no-cache header 生效
        globIgnores: ['**/index.html'],
      },
      // PWA manifest：讓 App 在手機桌面上看起來像原生 App
      // PWA manifest：已關閉，退回 ServiceWorker 模式以支援 Android 多捷徑
      manifest: false,
    }),
  ],
})
