/**
 * Levels-based contrast for rendered scanned pages.
 *
 * CSS `filter: contrast()` pivots around mid-grey and therefore LIGHTENS the
 * pale-grey lines typical of faint scans (it erases the drawing). A levels
 * stretch with an adjustable black point does the right thing: raising the
 * black point pushes faint grey linework toward black while keeping the paper
 * white — making faint drawings and route sheets legible.
 */

/** Map a user "contrast" knob (≈0.8–3) to a levels black point (0–210). */
export function contrastToBlack(contrast: number): number {
  return Math.min(210, Math.max(0, Math.round((contrast - 1) * 90)));
}

/**
 * Apply a levels stretch to raw ImageData and return a JPEG data URL.
 * Pixels <= black -> 0, >= white -> 255, linear in between.
 */
export function levelsToDataUrl(
  raw: ImageData,
  black: number,
  white = 245,
  quality = 0.9,
): string {
  const range = Math.max(1, white - black);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = ((i - black) / range) * 255;
  }

  const out = new ImageData(
    new Uint8ClampedArray(raw.data),
    raw.width,
    raw.height,
  );
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }

  const canvas = document.createElement('canvas');
  canvas.width = raw.width;
  canvas.height = raw.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}
