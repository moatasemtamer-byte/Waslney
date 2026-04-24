import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Fixed filenames — no hash — so index.html never gets out of sync
        entryFileNames: 'assets/app.js',
        chunkFileNames:  'assets/app-[name].js',
        assetFileNames:  'assets/app[extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
