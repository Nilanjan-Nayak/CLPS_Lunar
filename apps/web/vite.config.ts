import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The browser never talks to localhost directly: /api and /assets are proxied to the API service.
const API = process.env.API_URL || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      // trailing slash: NASA files live under /assets/<path>; the bare /assets route is the in-app registry page
      '/assets/': { target: API, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  // bundle output goes to /static/* so it can never collide with the API's /assets/* NASA files
  build: { sourcemap: false, chunkSizeWarningLimit: 2000, assetsDir: 'static' },
});
