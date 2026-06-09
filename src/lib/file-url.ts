/**
 * Converts a stored file URL into a same-origin proxy URL (/api/file).
 *
 * Firebase Storage download URLs don't send CORS headers, so loading them
 * directly with PDF.js (fetch/XHR) is blocked by the browser. Routing through
 * our own /api/file endpoint serves the bytes same-origin.
 *
 * - Firebase URLs (firebasestorage.googleapis.com/.../o/<path>?...) -> /api/file?path=<path>
 * - Legacy local /uploads/... paths are returned unchanged.
 * - Anything else is passed through as-is.
 */
export function toProxyUrl(fileUrl?: string): string {
  if (!fileUrl) return '';
  // Already local/relative.
  if (fileUrl.startsWith('/')) return fileUrl;

  const m = fileUrl.match(/\/o\/([^?]+)/);
  if (m) {
    const path = decodeURIComponent(m[1]);
    return `/api/file?path=${encodeURIComponent(path)}`;
  }

  // Unknown remote URL — let the proxy validate/extract it.
  if (/^https?:\/\//i.test(fileUrl)) {
    return `/api/file?url=${encodeURIComponent(fileUrl)}`;
  }

  return fileUrl;
}
