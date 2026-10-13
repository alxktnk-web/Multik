import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Лаборатория отдельной сборкой с одной точкой входа: весь код в одном файле,
// чтобы встроить его в страницу claude.ai (scripts/build-artifact.mjs).
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    rollupOptions: { input: { lab: resolve(__dirname, 'lab/index.html') } },
  },
});
