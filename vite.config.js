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
      // 強制註銷舊的 Service Worker 並清除所有快取，徹底解決白畫面問題
      selfDestroying: true,
      manifest: false,
    }),
  ],
})
