import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.API_URL || 'http://localhost:3000';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: false, // we use our own manifest.webmanifest in public/
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/assets\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: '../server/webapp',
    emptyOutDir: true,
    // Emit .js.map / .css.map alongside bundles so DevTools can show
    // original TS sources instead of minified output.
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
