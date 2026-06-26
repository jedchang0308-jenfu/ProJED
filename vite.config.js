import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@lexical') || id.includes('lexical')) return 'vendor-editor';
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('\\react\\') ||
            id.includes('\\react-dom\\') ||
            id.includes('\\scheduler\\')
          ) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
})
