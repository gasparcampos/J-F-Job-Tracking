// Copies the pdfjs-dist worker that matches the *installed* version into
// /public so the client always loads a worker whose version matches the API.
// A mismatch (e.g. worker 5.5.207 vs api 5.7.284) makes PDF.js throw and the
// previews fail to render. Runs as a prebuild step.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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

// PDF.js 5 decodes CCITT/JBIG2 (scanner text layers), JPEG2000 and ICC color
// with wasm modules loaded from `wasmUrl` (/pdfjs-wasm/). Without them the
// text of Konica bizhub scans renders blank on phones.
const wasmSrc = join(root, 'node_modules/pdfjs-dist/wasm');
const wasmDest = join(root, 'public', 'pdfjs-wasm');
if (existsSync(wasmSrc)) {
  mkdirSync(wasmDest, { recursive: true });
  for (const f of readdirSync(wasmSrc)) {
    if (f.startsWith('quickjs')) continue; // PDF scripting, not used
    copyFileSync(join(wasmSrc, f), join(wasmDest, f));
  }
  console.log('[copy-pdf-worker] Copied pdfjs-dist/wasm -> public/pdfjs-wasm');
}
