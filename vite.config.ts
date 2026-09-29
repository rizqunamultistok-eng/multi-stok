import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.jpg'],
        manifest: {
          id: '/',
          name: 'Pantau Stok Multi-Saluran',
          short_name: 'PantauStok',
          description: 'Sistem Sinkronisasi Stok Multi-Saluran, POS Kasir & Pemantauan Gudang Realtime.',
          theme_color: '#8d4b9f',
          background_color: '#fbf9fb',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : { ignored: ['**/data/**', '**/logs/**', '**/dist/**', '**/dev-dist/**'] },
      proxy: {
        '/api': 'http://127.0.0.1:3001',
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
    },
  };
});
