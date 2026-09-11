import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/owner-api': 'http://127.0.0.1:8081',
      '/api': 'http://127.0.0.1:8080',
    },
  },
  preview: {
    host: '127.0.0.1',
  },
});
