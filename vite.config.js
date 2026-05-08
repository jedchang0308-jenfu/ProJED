import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // 固定檔名（無 hash）以支援 mobile 捷徑快取一致性
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA 已移除：Service Worker 曾導致白畫面，由 index.html 的清除腳本接手
  ],
})
