import { fileURLToPath } from 'node:url';
import { build } from 'vite';

/** Build the same application used by Capacitor, with the hosting application's public config. */
export async function buildWeb({ outDir, envDir }) {
  await build({
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir,
    base: '/pad/',
    build: { outDir, emptyOutDir: true },
  });
}
