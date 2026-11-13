import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // 設定画面に表示するバージョン（package.json の version）
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      // 復習リマインダーのプッシュ通知を受け取る処理（public/push-sw.js）
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: 'スーパーメモ',
        short_name: 'スーパーメモ',
        description: '仕事やコーディングで学んだことをマインドマップで育て、忘れかけたころに復習できるアプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        theme_color: '#4f46e5',
        background_color: '#f1f5f9',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
})
