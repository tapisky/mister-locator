// build.mjs — runs each extension entry point as a separate Vite/Rollup build
// because IIFE format requires inlineDynamicImports=true which only supports
// a single input at a time.

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'dist');

// Clean dist once at the start
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = [
  { name: 'content',    src: 'src/content.ts' },
  { name: 'background', src: 'src/background.ts' },
  { name: 'popup',      src: 'src/popup.ts' },
];

for (const entry of entries) {
  console.log(`Building ${entry.name}…`);
  await build({
    configFile: false,
    build: {
      outDir,
      emptyOutDir: false,   // we already cleaned it above
      lib: {
        entry: resolve(__dirname, entry.src),
        name: entry.name,
        fileName: () => `${entry.name}.js`,
        formats: ['iife'],
      },
      // Ensure sourcemaps are generated for easier debugging
      sourcemap: false,
    },
    // Suppress per-build output spam
    logLevel: 'warn',
  });
  console.log(`  ✓ dist/${entry.name}.js`);
}

console.log('\nExtension build complete!');
