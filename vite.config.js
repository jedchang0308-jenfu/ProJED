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
      },
      // PWA manifest：讓 App 在手機桌面上看起來像原生 App
      manifest: false,
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
