import { NextRequest, NextResponse } from 'next/server';
import { bucket } from '@/lib/firebase-admin';
import { purchaseOrdersDB } from '@/lib/po-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const MAX_BYTES = 25 * 1024 * 1024;

/** POST multipart { file }: attach an M-T-R (mill test report) to the PO. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const po = await purchaseOrdersDB.findById(id);
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const file = (await request.formData()).get('file');
    if (!(file instanceof Blob) || !file.size) return NextResponse.json({ error: 'file required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 413 });

    const name = (file as File).name || 'mtr';
    const path = `po-mtr/${po.poNumber}/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await bucket.file(path).save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
    });
    const saved = await purchaseOrdersDB.setFiles(id, [...po.mtr, { name, path, size: file.size }]);
    return NextResponse.json(saved ?? po);
  } catch (error) {
    console.error('MTR upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

/** DELETE ?path=...: remove one attached file. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const path = request.nextUrl.searchParams.get('path') ?? '';
  const po = await purchaseOrdersDB.findById(id);
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!po.mtr.some((f) => f.path === path)) return NextResponse.json({ error: 'No such file' }, { status: 404 });
  await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {});
  const saved = await purchaseOrdersDB.setFiles(id, po.mtr.filter((f) => f.path !== path));
  return NextResponse.json(saved ?? po);
}
