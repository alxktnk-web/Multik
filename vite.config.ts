import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { offlineApp } from './scripts/pwa.mjs';

export default defineConfig({
  base: './',
  plugins: [offlineApp()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        lab: resolve(__dirname, 'lab/index.html'),
      },
    },
  },
});
