'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, FileText, ZoomIn } from 'lucide-react';
import { toProxyUrl } from '@/lib/file-url';

interface FilePreviewProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
  /** Compact first-page raster for card thumbnails. */
  thumbnail?: boolean;
  /** Max height of the preview area (Tailwind class). */
  maxHeightClass?: string;
  /** Click handler (e.g. open the full-screen viewer). Adds a hover hint. */
  onClick?: () => void;
}

/**
 * Document preview.
 *
 * - Card thumbnails (`thumbnail`): first page rasterized via PDF.js at high
 *   resolution on a white background — faithful to the file (no tone curve),
 *   so the print and route sheet read at the large card size.
 * - Form preview (default): the actual PDF in a native <iframe>.
 * - Images render with <img>.
 */
export function FilePreview({
  fileUrl,
  fileName,
  className,
  thumbnail = false,
  maxHeightClass,
  onClick,
}: FilePreviewProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Detect type from clean name (fileUrl may have ?alt=media&token=).
  const typeSource = (fileName || fileUrl.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  // Same-origin proxy avoids Firebase Storage CORS issues.
  const src = toProxyUrl(fileUrl);

  const renderThumb = useCallback(async () => {
    if (!src || !isPdf) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setThumbSrc(null);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjsLib.getDocument(src).promise;
      const pageObj = await doc.getPage(1);
      // High scale so fine print (dimensions + route sheet) keeps enough
      // detail to read at the large card size.
      const viewport = pageObj.getViewport({ scale: 4 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pageObj.render({
        canvasContext: ctx,
        viewport,
        background: '#ffffff',
      }).promise;
      // Faithful PNG (no tone processing) — same as the viewer renders it.
      const url = canvas.toDataURL('image/png');
      if (myReq === reqId.current) setThumbSrc(url);
    } catch (e) {
      console.error('PDF thumbnail error:', e);
      if (myReq === reqId.current) setError('No se pudo cargar la vista previa');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [src, isPdf]);

  useEffect(() => {
    if (thumbnail && isPdf) renderThumb();
  }, [thumbnail, isPdf, renderThumb]);

  const clickable = typeof onClick === 'function';
  const box =
    `relative rounded-xl border border-border bg-muted/30 overflow-hidden ` +
    `${clickable ? 'cursor-pointer hover:border-primary/60 transition-colors group/preview ' : ''}` +
    `${className ?? ''}`;
  const imgHeight = maxHeightClass ?? (thumbnail ? 'max-h-40' : 'max-h-[460px]');

  const clickHint = clickable ? (
    <div className="absolute top-2 right-2 bg-background/90 backdrop-blur rounded-full p-1.5 border border-border shadow opacity-0 group-hover/preview:opacity-100 transition-opacity">
      <ZoomIn size={14} className="text-primary" />
    </div>
  ) : null;

  // ---- Images (any context) ----
  if (isImage) {
    return (
      <div className={box} onClick={onClick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName || 'preview'}
          className={`mx-auto block max-w-full ${imgHeight} object-contain bg-black/20`}
        />
        {clickHint}
      </div>
    );
  }

  // ---- Non-PDF, non-image ----
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

  // ---- PDF thumbnail (card): faithful high-res raster ----
  if (thumbnail) {
    return (
      <div className={box} onClick={onClick}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Cargando…</p>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <FileText size={28} className="mb-2 text-primary" />
            <p className="text-[11px]">{error}</p>
          </div>
        )}
        {thumbSrc && !loading && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbSrc}
              alt={fileName || 'PDF'}
              className={`mx-auto block max-w-full ${imgHeight} object-contain bg-black/20`}
            />
            {clickHint}
          </>
        )}
      </div>
    );
  }

  // ---- PDF full preview (form): native browser PDF render (true to original) ----
  return (
    <div className={box}>
      <iframe
        src={`${src}#toolbar=1&navpanes=0&view=FitH`}
        title={fileName || 'PDF'}
        className={`w-full ${imgHeight} bg-white`}
        style={{ height: '460px', border: 'none' }}
      />
    </div>
  );
}
