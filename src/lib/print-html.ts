const ROOT_ID = '__jf-print-root';
const STYLE_ID = '__jf-print-style';

/**
 * Prints a standalone HTML document (its <style> blocks and <body>) from the
 * CURRENT page: the content is mounted in a shadow root (so its CSS can't
 * leak into the app) and a print stylesheet hides everything else.
 *
 * No popup window or iframe is created. Blank popups/iframes get ad-block
 * extension scripts injected, which Norton flags and aborts, leaving the
 * print preview empty.
 *
 * The document's CSS should style `.print-page` instead of `body`; `@page`
 * rules are lifted to the main document.
 */
export function printHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const rawCss = [...parsed.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  const pageRules = rawCss.match(/@page\s*\{[^}]*\}/g)?.join('\n') ?? '';
  const css = rawCss.replace(/@page\s*\{[^}]*\}/g, '');
  const title = parsed.title;

  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @media print {
      ${pageRules}
      html, body {
        background: #fff !important;
        color-scheme: light !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; }
    }`;
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>:host{all:initial;display:block;color-scheme:light;}${css}</style><div class="print-page">${parsed.body.innerHTML}</div>`;
  document.body.appendChild(host);

  const prevTitle = document.title;
  if (title) document.title = title;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    document.title = prevTitle;
    host.remove();
    style.remove();
  };
  window.addEventListener('afterprint', cleanup);

  // Let the content lay out (and the QR SVG paint) before printing.
  setTimeout(() => {
    window.print();
    // Fallback for browsers that don't fire afterprint (the root is hidden
    // on screen, so leaving it a while is harmless).
    setTimeout(cleanup, 60000);
  }, 100);
}

export const escHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
