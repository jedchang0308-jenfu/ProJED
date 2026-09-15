import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const releaseId = process.env.PROJED_RELEASE_ID;
  const shellVersion = releaseId
    ? `release:${releaseId}`
    : `build:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return ({
  ...(mode === 'production' && !process.env.PROJED_RELEASE_ID
    ? (() => { throw new Error('DEV-097: sealed production build requires PROJED_RELEASE_ID.'); })()
    : {}),
  // DEV-083 P0: sealed production builds point Vite at an isolated env directory,
  // preventing root .env.local auto-loading and parent-process collisions.
  envDir: process.env.PROJED_RELEASE_ENV_DIR || process.cwd(),
  define: mode === 'production'
    ? {
        'import.meta.env.VITE_SUPABASE_AUTH_MODE': JSON.stringify('oauth-google'),
        'import.meta.env.VITE_SUPABASE_AUTO_TEST_LOGIN': JSON.stringify('false'),
        'import.meta.env.VITE_SUPABASE_TEST_EMAIL': JSON.stringify(''),
        'import.meta.env.VITE_SUPABASE_TEST_PASSWORD': JSON.stringify(''),
        'import.meta.env.VITE_PROJED_RELEASE_ID': JSON.stringify(process.env.PROJED_RELEASE_ID || ''),
      }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'projed-app-shell-meta',
      transformIndexHtml(html) {
        return html.replace('</head>', `    <meta name="projed-shell-version" content="${shellVersion}" />\n  </head>`);
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'app-shell-meta.json',
          source: `${JSON.stringify({ schemaVersion: 1, version: shellVersion })}\n`,
        });
      },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: false,
      workbox: {
        cacheId: `projed-${process.env.PROJED_RELEASE_ID || 'test'}`,
        cleanupOutdatedCaches: false,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/__/, /^\/quick-task(?:\/|$)/],
        ignoreURLParametersMatching: [
          /^utm_/,
          /^fbclid$/,
          /^(install|capture|claim|code|error|error_code|error_description)$/,
        ],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        additionalManifestEntries: [{ url: '/app-shell-meta.json', revision: shellVersion }],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-styles',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    {
      name: 'dev-122-quick-manifest-isolation',
      enforce: 'post',
      transformIndexHtml(html, context) {
        if (!context.filename.replaceAll('\\', '/').endsWith('/quick-task/index.html')) return html;
        return html.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest">/u, '');
      },
      generateBundle(_options, bundle) {
        Object.values(bundle).forEach(asset => {
          if (asset.type !== 'asset' || !asset.fileName.endsWith('quick-task/index.html')) return;
          asset.source = String(asset.source).replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest">/gu, '');
        });
      },
    },
  ],
  server: {
    watch: {
      ignored: ['**/.playwright-cli/**', '**/output/playwright/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        quickTask: 'quick-task/index.html',
      },
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
})
