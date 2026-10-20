import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { lighttablePwa } from './scripts/lighttable-pwa.mjs';

// Independent staging output. Never run the Classic precache plugin over v2.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [lighttablePwa()],
  build: {
    outDir: 'dist-lighttable',
    emptyOutDir: true,
    assetsDir: 'lighttable/assets',
    rollupOptions: { input: resolve(__dirname, 'lighttable/index.html') },
  },
});
