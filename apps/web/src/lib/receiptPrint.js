// eslint-disable-next-line import/no-unresolved -- Vite ?raw import
import receiptCss from '@/styles/fiscal-receipt.css?raw';
import { nativePrint } from '@/lib/staffApp.js';

// Print a fiscal (RKSV) receipt the same way kitchen tickets are printed
// (lib/kotPrint.js): a separate 80 mm page in a hidden frame, sent to the
// Android print service in the staff app or to the browser's print dialog.
// `receiptHtml` is the already drawn receipt (including the QR code).
export function printReceiptHtml(receiptHtml, title = 'Beleg') {
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
${receiptCss}
html, body { margin: 0; padding: 0; background: #fff; }
.fiscal-receipt { width: 80mm; max-width: 80mm; margin: 0; padding: 3mm 4mm; box-sizing: border-box;
  border: 0; box-shadow: none; color: #000; font-size: 12.5px; font-weight: 600; }
.fiscal-receipt * { color: #000 !important; }
.fiscal-receipt hr, .fiscal-title, .fiscal-vat, .fiscal-footer { border-color: #000 !important; }
.fiscal-no-print { display: none !important; }
@page { size: 80mm auto; margin: 0; }
</style></head><body>${receiptHtml}</body></html>`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    const done = () => {
      try {
        iframe.contentWindow.focus();
        if (!nativePrint(iframe.contentWindow, title)) iframe.contentWindow.print();
      } catch (_) { /* ignore */ }
      setTimeout(() => { try { document.body.removeChild(iframe); } catch (_) { /* ignore */ } }, 2000);
    };
    if (doc.readyState === 'complete') setTimeout(done, 200);
    else iframe.onload = () => setTimeout(done, 200);
    return true;
  } catch (err) {
    console.error('Receipt print failed:', err);
    return false;
  }
}
