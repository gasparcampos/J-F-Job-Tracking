/**
 * Contrast/levels boost for rendered scanned pages.
 *
 * Many shop PDFs are low-contrast scans (e.g. the Route Sheet block with the
 * customer, part #, job #). Rendered as-is they look washed-out grey and the
 * text is unreadable. This stretches the tonal range so light grey backgrounds
 * go white and faint grey text/lines go dark — making both the drawing and the
 * route sheet legible — without destroying the anti-aliasing on fine lines.
 *
 * Operates in place on a 2D canvas context. Safe only on untainted canvases
 * (our pages are drawn by PDF.js from fetched bytes, so they are not tainted).
 */
export function enhanceScan(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts?: { black?: number; white?: number },
): void {
  const black = opts?.black ?? 50; // input black point
  const white = opts?.white ?? 205; // input white point
  const range = Math.max(1, white - black);

  // Per-value lookup table for a simple levels stretch.
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = ((i - black) / range) * 255;
  }

  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, width, height);
  } catch {
    // Tainted canvas or other read failure — skip enhancement gracefully.
    return;
  }

  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
    // alpha (d[i+3]) left as-is
  }
  ctx.putImageData(img, 0, 0);
}
