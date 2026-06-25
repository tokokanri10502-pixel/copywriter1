import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages の公開先が https://<user>.github.io/copywriter1/ のため base を合わせる。
// PWA: アプリ本体(JS/CSS/フォント/アイコン)をService Workerで先読みキャッシュし、
//      2回目以降の起動を高速化する（autoUpdate=新しいデプロイで自動更新）。
export default defineConfig({
  base: '/copywriter1/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'TOKOコピーライター育成アプリ',
        short_name: 'コピー育成',
        display: 'standalone',
        background_color: '#faf7f1',
        theme_color: '#b3472d',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // フォント(woff2)含めキャッシュ。Google Fontsはランタイムキャッシュで賄う。
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
