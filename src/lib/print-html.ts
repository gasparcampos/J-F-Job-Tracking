/**
 * Prints a standalone HTML document through a hidden iframe. No popup
 * window is opened, so popup blockers and extensions that inject scripts
 * into blank windows (which antivirus tools may flag) don't interfere.
 */
export function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener('afterprint', cleanup);
  // Give the iframe a moment to lay out before opening the print dialog.
  setTimeout(() => {
    win.focus();
    win.print();
    // Fallback cleanup for browsers that don't fire afterprint.
    setTimeout(() => iframe.parentNode && iframe.remove(), 60000);
  }, 150);
}

export const escHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
