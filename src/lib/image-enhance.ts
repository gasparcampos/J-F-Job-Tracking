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
 * Auto-detect a good black point for a rendered page by looking at its tone
 * histogram. Paper scans are mostly bright; the darkest few percent of pixels
 * are the linework/text. We put the black point just below that so faint grey
 * lines map to black while the paper stays white — adapting per document so a
 * light scan gets a strong boost and an already-dark one gets a mild one.
 */
export function computeAutoBlack(
  raw: ImageData,
  clip = 0.006,
  cap = 190,
): number {
  const d = raw.data;
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    hist[d[i]]++; // red channel ≈ luminance for grayscale scans
    total++;
  }
  const need = total * clip;
  let acc = 0;
  let black = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= need) {
      black = v;
      break;
    }
  }
  // Pull back a touch so we don't clip the lightest real linework to pure black.
  return Math.min(cap, Math.max(0, black - 10));
}

/**
 * Apply a levels stretch to raw ImageData and return a JPEG data URL.
 * Pixels <= black -> 0, >= white -> 255, linear in between.
 */
export function levelsToDataUrl(
  raw: ImageData,
  black: number,
  white = 240,
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
