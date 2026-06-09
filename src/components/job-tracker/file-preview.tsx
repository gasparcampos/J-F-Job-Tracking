'use client';

import { FileText, ZoomIn } from 'lucide-react';
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
  // Detect type from clean name (fileUrl may have ?alt=media&token=).
  const typeSource = (fileName || fileUrl.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  // Same-origin proxy avoids Firebase Storage CORS issues.
  const src = toProxyUrl(fileUrl);

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

  // ---- PDF thumbnail (card): native browser render ----
  // PDF.js can't decode some scanned route-sheet images (renders them blank),
  // but the browser's own PDF engine can. Use a native <iframe>, same as the
  // viewer, so the WHOLE print (drawing + route sheet) shows on the card. The
  // iframe is non-interactive; a transparent overlay handles the click, and
  // loading="lazy" keeps it cheap with many cards.
  if (thumbnail) {
    return (
      <div className={box} onClick={onClick}>
        <iframe
          src={`${src}#toolbar=0&navpanes=0&statusbar=0&messages=0&view=FitH`}
          title={fileName || 'PDF'}
          loading="lazy"
          tabIndex={-1}
          className="w-full bg-white"
          style={{ height: '560px', border: 'none', pointerEvents: 'none' }}
        />
        {/* Transparent click layer (iframe swallows clicks otherwise) */}
        {clickable && <div className="absolute inset-0" onClick={onClick} />}
        {clickHint}
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
