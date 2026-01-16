import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // <--- Import this

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Auto-update the app when you push new code
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      devOptions: {
        enabled: true // <--- Allows you to test offline mode in Dev server
      },
      manifest: {
        name: 'Local First Todo',
        short_name: 'Todo',
        description: 'My awesome local-first app',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png', // You can add these icons later
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  define: {
    'global': 'window',
  },
})