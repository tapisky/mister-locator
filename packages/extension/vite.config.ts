import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Rollup cannot build multiple IIFE entries in one pass —
 * IIFE format requires inlineDynamicImports=true, which only supports
 * a single input at a time. The actual build is driven by build.mjs
 * which calls vite.build() sequentially for each entry.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content.ts'),
      name: 'content',
      fileName: () => 'content.js',
      formats: ['iife'],
    },
  },
});
