import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export default defineConfig({
  base: './',
  resolve: { alias: { '@typescript-libs': join(dirname(require.resolve('typescript/package.json')), 'lib') } },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
