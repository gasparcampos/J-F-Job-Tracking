import { printHtml, escHtml as esc } from '@/lib/print-html';
import { lineSubtotal, money, poTotal, time12, usDate } from '@/lib/po-shared';
import type { PoLookups, PoSupplier, PurchaseOrder } from '@/types/po';

const phone = (p?: string) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p ?? '');
};
const zip = (z?: string) => {
  const d = String(z ?? '').replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(z ?? '');
};

/** The Access "Purchase Order" report (PDF Preview / Print Order). */
export function printPurchaseOrder(po: PurchaseOrder, lookups: PoLookups, supplier: PoSupplier | null) {
  const c = lookups.company;
  const now = new Date();
  const rows = po.lines
    .map(
      (l) => `<tr>
        <td class="c">${esc(l.units ?? '')}</td>
        <td><b>${esc(l.prodDescrip)}</b><div class="spec">SPEC: ${esc(l.spec)}</div></td>
        <td>${esc(l.partNumber)}</td>
        <td class="c">${esc(l.rev)}</td>
        <td class="c b">${esc(l.wo)}</td>
        <td class="r">${money(l.unitPrice)}</td>
        <td class="r">${money(lineSubtotal(l))}</td>
      </tr>`
    )
    .join('');
  const html = `<!doctype html><html><head><title>Purchase Order ${po.poNumber}</title><style>
    /* margin 0: the browser leaves out its own header/footer (date, title, web address). */
    @page { size: letter; margin: 0; }
    .print-page { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11px; padding: 0.45in 0.45in 0.7in;
      box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #000; padding-bottom: 8px; }
    .co { font-size: 18px; font-weight: 800; }
    .logo { display: block; height: 58px; width: auto; margin-bottom: 4px; }
    .title { text-align: right; }
    .title h1 { margin: 0; font-size: 26px; letter-spacing: 1px; }
    .title .num { font-size: 20px; font-weight: 800; }
    .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-top: 10px; }
    .box { border: 1px solid #000; padding: 6px 8px; }
    .box h3 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: #333; }
    .kv { display: grid; grid-template-columns: 120px 1fr; row-gap: 2px; }
    .kv span:nth-child(odd) { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #e5e5e5; border: 1px solid #000; padding: 4px; font-size: 10px; text-transform: uppercase; }
    td { border: 1px solid #000; padding: 4px; vertical-align: top; }
    .spec { font-size: 10px; color: #333; margin-top: 2px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
    .total td { font-weight: 800; font-size: 13px; }
    .notes { margin-top: 10px; border: 1px solid #000; padding: 6px 8px; min-height: 40px; white-space: pre-wrap; }
    .foot { position: fixed; left: 0.45in; right: 0.45in; bottom: 0.3in; font-size: 9px; color: #444; }
  </style></head><body>
    <div class="top">
      <div>
        <img class="logo" src="/jf-machine-shop-logo.png" alt="${esc(c.name)}" />
        <div>${esc(c.address)}</div>
        <div>${esc(c.city)}, ${esc(c.state)} ${esc(zip(c.postalCode))}</div>
        <div>Phone: ${esc(phone(c.phone))}${c.email ? `  Email: ${esc(c.email)}` : ''}</div>
      </div>
      <div class="title">
        <h1>Purchase Order</h1>
        <div class="num">Number ${esc(po.poNumber)}</div>
      </div>
    </div>
    <div class="grid">
      <div class="box">
        <h3>Supplier</h3>
        <div class="b" style="font-size:13px">${esc(po.supplierName)}</div>
        ${supplier?.contactName ? `<div>Attn: ${esc(supplier.contactName)}</div>` : ''}
        <div>${esc(supplier?.address)}</div>
        <div>${esc([supplier?.city, supplier?.state].filter(Boolean).join(', '))} ${esc(zip(supplier?.postalCode))}</div>
        ${supplier?.phone ? `<div>${esc(phone(supplier.phone))}</div>` : ''}
      </div>
      <div class="box kv">
        <span>Order Date</span><span>${esc(usDate(po.orderDate))}</span>
        <span>ETA</span><span>${esc(usDate(po.eta))}</span>
        <span>Employee</span><span>${esc(po.employeeName)}</span>
        <span>Ship Via</span><span>${esc(po.shippingMethod)}</span>
        <span>Description</span><span>${esc(po.description)}</span>
        <span>Time Order</span><span>${esc(time12(po.timeOrder))}</span>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="box kv" style="grid-template-columns:70px 1fr"><span>MAT-TYPE</span><span>${esc(po.matType)}</span></div>
      <div class="box kv" style="grid-template-columns:80px 1fr"><span>DWG# & Part</span><span>${esc(po.partDwg)}</span></div>
      <div class="box kv" style="grid-template-columns:40px 1fr"><span>HT#</span><span>${esc(po.heatNumber)}</span></div>
    </div>
    <table>
      <thead><tr><th style="width:44px">Units</th><th>PROD_DESCRIP / SPEC</th><th style="width:120px">PART#</th><th style="width:44px">REV</th><th style="width:60px">WO#</th><th style="width:70px">Unit Price</th><th style="width:76px">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total"><td colspan="6" class="r">Order Total</td><td class="r">${money(poTotal(po.lines))}</td></tr></tfoot>
    </table>
    <div class="notes"><b>NOTES:</b> ${esc(po.notes)}</div>
    <div class="foot">${esc(now.toLocaleDateString('en-US', { dateStyle: 'long' }))} ${esc(now.toLocaleTimeString('en-US'))}</div>
  </body></html>`;
  printHtml(html);
}
