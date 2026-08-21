import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaNavigationFallbackDenylist } from './src/pwa/navigation';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: true },
      manifest: {
        name: 'Longview',
        short_name: 'Longview',
        description: 'A personal AI chief of staff for long-term goals.',
        theme_color: '#07111f',
        background_color: '#07111f',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: pwaNavigationFallbackDenylist
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**'],
    restoreMocks: true
  }
});
