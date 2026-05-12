import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/zustand')
          ) {
            return 'vendor-react';
          }

          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase';
          }

          if (id.includes('node_modules/@dnd-kit')) {
            return 'vendor-dnd';
          }

          if (
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/date-fns') ||
            id.includes('node_modules/dayjs') ||
            id.includes('node_modules/clsx') ||
            id.includes('node_modules/tailwind-merge')
          ) {
            return 'vendor-ui';
          }

          return 'vendor';
        },
      },
    },
  },
})
