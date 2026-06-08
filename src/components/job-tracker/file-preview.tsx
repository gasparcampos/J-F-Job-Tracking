'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

interface FilePreviewProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
}

/**
 * Inline preview for an uploaded document.
 * - PDFs are rendered page-by-page with PDF.js (client-side) into images.
 * - Images are shown directly.
 * Used inside the New Job form so the user sees the document right after upload.
 */
export function FilePreview({ fileUrl, fileName, className }: FilePreviewProps) {
  const [images, setImages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Detect type from clean name (fileUrl may have ?alt=media&token=).
  const typeSource = (fileName || fileUrl.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  const renderPdf = useCallback(async () => {
    if (!fileUrl || !isPdf) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setImages([]);
    setPage(0);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      // Use the worker shipped in /public (same as the full-screen viewer).
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const doc = await pdfjsLib.getDocument(fileUrl).promise;
      const out: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pageObj = await doc.getPage(i);
        const viewport = pageObj.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pageObj.render({ canvasContext: ctx, viewport }).promise;
        out.push(canvas.toDataURL('image/png'));
      }
      if (myReq === reqId.current) setImages(out);
    } catch (e) {
      console.error('PDF preview error:', e);
      if (myReq === reqId.current) setError('No se pudo cargar la vista previa del PDF');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [fileUrl, isPdf]);

  useEffect(() => {
    if (isPdf) renderPdf();
  }, [isPdf, renderPdf]);

  const box = `rounded-xl border border-border bg-muted/30 overflow-hidden ${className ?? ''}`;

  if (isImage) {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={fileName || 'preview'}
          className="w-full max-h-[420px] object-contain bg-black/20"
        />
      </div>
    );
  }

  if (!isPdf) {
    return (
      <div className={`${box} flex flex-col items-center justify-center py-10 text-muted-foreground`}>
        <FileText size={32} className="mb-2 text-primary" />
        <p className="text-xs">{fileName || 'Archivo'}</p>
        <p className="text-[10px]">Sin vista previa disponible</p>
      </div>
    );
  }

  return (
    <div className={box}>
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
          <p className="text-xs">Cargando vista previa…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText size={32} className="mb-2 text-primary" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {!loading && !error && images.length > 0 && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[page]}
            alt={`${fileName || 'PDF'} página ${page + 1}`}
            className="w-full max-h-[420px] object-contain bg-black/20"
          />
          {images.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/90 backdrop-blur rounded-full px-2 py-1 border border-border shadow">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded-full hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[10px] font-medium tabular-nums">
                {page + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(images.length - 1, p + 1))}
                disabled={page === images.length - 1}
                className="p-1 rounded-full hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
