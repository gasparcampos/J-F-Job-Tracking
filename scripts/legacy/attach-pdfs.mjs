// Attach PDFs to the jobs imported from Access (source == 'access-master').
//   Main file (fileUrl):       \\JF-MACHINE\Main\J-F PDF\<JOB#>.pdf  (1-page sheet)
//                              or, if missing, the Access ROUTER PACKET.
//   Attachment (attachmentUrl): the ROUTER PACKET, when the sheet is the main file.
// Safe to re-run: when a sheet shows up later for a job that only had the
// packet, the sheet becomes the main file and the packet moves to attachment.
// Usage: node scripts/legacy/attach-pdfs.mjs [--write]
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { db } from './db.mjs';

const write = process.argv[2] === '--write';
const SHEET_DIR = '\\\\JF-MACHINE\\Main\\J-F PDF';
const bucket = getStorage().bucket(process.env.APP_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`);

async function upload(path) {
  const name = basename(path);
  const storagePath = `uploads/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const token = randomUUID();
  await bucket.file(storagePath).save(readFileSync(path), {
    contentType: 'application/pdf',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } },
  });
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
    name,
  };
}

const snap = await db.collection('jobs').where('source', '==', 'access-master').get();
for (const d of snap.docs) {
  const j = d.data();
  const sheet = `${SHEET_DIR}\\${j.jobNumber}.pdf`;
  const packet = String(j.legacy?.FilePath ?? '').replace(/^#|#$/g, '').replace(/^.*#(.+)#.*$/, '$1');
  const hasSheet = existsSync(sheet);
  const hasPacket = !!packet && existsSync(packet);
  const sheetIsMain = j.fileName === `${j.jobNumber}.pdf`;

  let patch = null;
  let plan = '';
  if (!j.fileUrl) {
    if (hasSheet) {
      plan = `main=sheet${hasPacket ? ' + attach=packet' : ''}`;
      if (write) {
        const s = await upload(sheet);
        patch = { fileUrl: s.url, fileName: s.name };
        if (hasPacket) {
          const p = await upload(packet);
          Object.assign(patch, { attachmentUrl: p.url, attachmentName: p.name });
        }
      }
    } else if (hasPacket) {
      plan = 'main=packet';
      if (write) {
        const p = await upload(packet);
        patch = { fileUrl: p.url, fileName: p.name };
      }
    } else plan = 'NO PDF FOUND';
  } else if (hasSheet && !sheetIsMain && !j.attachmentUrl) {
    plan = 'sheet arrived: main=sheet, packet -> attach';
    if (write) {
      const s = await upload(sheet);
      patch = { fileUrl: s.url, fileName: s.name, attachmentUrl: j.fileUrl, attachmentName: j.fileName };
    }
  } else plan = 'already done';

  console.log(`${j.jobNumber}: ${plan}`);
  if (patch) await d.ref.update({ ...patch, updatedAt: new Date().toISOString() });
}
