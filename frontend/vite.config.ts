import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    sveltekit(),
    VitePWA({
      // Im Capacitor-Build kein Service Worker: Assets liegen lokal in der APK,
      // ein SW würde sie nur veralten lassen.
      disable: !!process.env.CAP_BUILD,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Task Suggester',
        short_name: 'Tasks',
        description: 'Your personal task suggester',
        theme_color: '#6366f1',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        screenshots: [
          { src: '/screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Task Suggester Desktop' },
          { src: '/screenshot-narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Task Suggester Mobile' },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: null,
      },
    }),
  ],
});
