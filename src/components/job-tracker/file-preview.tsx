'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, FileText, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { toProxyUrl } from '@/lib/file-url';
import { enhanceScan } from '@/lib/image-enhance';

interface FilePreviewProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
  /** Render only the first page, no pager — for compact card thumbnails. */
  thumbnail?: boolean;
  /** Max height of the preview area (Tailwind class). */
  maxHeightClass?: string;
  /** Click handler (e.g. open the full-screen viewer). Adds a hover hint. */
  onClick?: () => void;
}

/**
 * Inline preview for an uploaded document.
 * - PDFs are rendered page-by-page with PDF.js (client-side) into images.
 * - Images are shown directly.
 * Used inside the New Job form so the user sees the document right after upload.
 */
export function FilePreview({
  fileUrl,
  fileName,
  className,
  thumbnail = false,
  maxHeightClass,
  onClick,
}: FilePreviewProps) {
  const [images, setImages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Detect type from clean name (fileUrl may have ?alt=media&token=).
  const typeSource = (fileName || fileUrl.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  // Load through our same-origin proxy to avoid Firebase Storage CORS issues.
  const src = toProxyUrl(fileUrl);

  const renderPdf = useCallback(async () => {
    if (!src || !isPdf) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setImages([]);
    setPage(0);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      // Use the worker shipped in /public (same as the full-screen viewer).
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const doc = await pdfjsLib.getDocument(src).promise;
      const out: string[] = [];
      // Thumbnails only need the first page; full preview renders all.
      const lastPage = thumbnail ? 1 : doc.numPages;
      for (let i = 1; i <= lastPage; i++) {
        const pageObj = await doc.getPage(i);
        const viewport = pageObj.getViewport({ scale: thumbnail ? 1.5 : 2.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // Solid white background so transparent PDF pages don't look washed out.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pageObj.render({
          canvasContext: ctx,
          viewport,
          background: '#ffffff',
        }).promise;
        // Boost contrast so faint grey scans become legible.
        enhanceScan(ctx, canvas.width, canvas.height);
        out.push(canvas.toDataURL('image/jpeg', 0.9));
      }
      if (myReq === reqId.current) setImages(out);
    } catch (e) {
      console.error('PDF preview error:', e);
      if (myReq === reqId.current) setError('No se pudo cargar la vista previa del PDF');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [src, isPdf, thumbnail]);

  useEffect(() => {
    if (isPdf) renderPdf();
  }, [isPdf, renderPdf]);

  const clickable = typeof onClick === 'function';
  const box =
    `relative rounded-xl border border-border bg-muted/30 overflow-hidden ` +
    `${clickable ? 'cursor-pointer hover:border-primary/60 transition-colors group/preview ' : ''}` +
    `${className ?? ''}`;
  const imgHeight = maxHeightClass ?? (thumbnail ? 'max-h-40' : 'max-h-[420px]');

  // Small magnifier hint shown on hover when clickable.
  const clickHint = clickable ? (
    <div className="absolute top-2 right-2 bg-background/90 backdrop-blur rounded-full p-1.5 border border-border shadow opacity-0 group-hover/preview:opacity-100 transition-opacity">
      <ZoomIn size={14} className="text-primary" />
    </div>
  ) : null;

  if (isImage) {
    return (
      <div className={box} onClick={onClick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName || 'preview'}
          className={`w-full ${imgHeight} object-contain bg-black/20`}
        />
        {clickHint}
      </div>
    );
  }

  if (!isPdf) {
    return (
      <div
        className={`${box} flex flex-col items-center justify-center py-10 text-muted-foreground`}
        onClick={onClick}
      >
        <FileText size={32} className="mb-2 text-primary" />
        <p className="text-xs">{fileName || 'Archivo'}</p>
        <p className="text-[10px]">Sin vista previa disponible</p>
        {clickHint}
      </div>
    );
  }

  return (
    <div className={box} onClick={onClick}>
      {loading && (
        <div className={`flex flex-col items-center justify-center text-muted-foreground ${thumbnail ? 'py-8' : 'py-12'}`}>
          <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
          <p className="text-xs">Cargando vista previa…</p>
        </div>
      )}

      {error && !loading && (
        <div className={`flex flex-col items-center justify-center text-muted-foreground ${thumbnail ? 'py-8' : 'py-12'}`}>
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
            className={`w-full ${imgHeight} object-contain bg-black/20`}
          />
          {clickHint}
          {!thumbnail && images.length > 1 && (
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
