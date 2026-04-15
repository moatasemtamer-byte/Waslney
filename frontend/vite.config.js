import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),   // index.html is here in frontend/
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../backend/public'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
