// Copies the pdfjs-dist worker that matches the *installed* version into
// /public so the client always loads a worker whose version matches the API.
// A mismatch (e.g. worker 5.5.207 vs api 5.7.284) makes PDF.js throw and the
// previews fail to render. Runs as a prebuild step.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const candidates = [
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/build/pdf.worker.mjs',
];

const dest = join(root, 'public', 'pdf.worker.min.mjs');

let copied = false;
for (const rel of candidates) {
  const src = join(root, rel);
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`[copy-pdf-worker] Copied ${rel} -> public/pdf.worker.min.mjs`);
    copied = true;
    break;
  }
}

if (!copied) {
  console.warn('[copy-pdf-worker] Could not find a pdfjs-dist worker to copy.');
}
