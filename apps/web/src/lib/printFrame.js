import { nativePrint } from '@/lib/staffApp.js';

// Print a complete HTML page (kitchen ticket, fiscal receipt) from a hidden
// frame: through the Android print service in the staff app, otherwise
// through the browser's print dialog.
export function printHtmlInFrame(html, title = 'Tripti') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0');
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
  };
  const done = () => {
    let viaApp = false;
    try {
      win.focus();
      // The app copies the page straight away, so the frame can go soon.
      viaApp = nativePrint(win, title);
      if (!viaApp) {
        // Phone browsers return from print() while the dialog is still open:
        // keep the frame until printing has finished.
        win.addEventListener('afterprint', () => setTimeout(remove, 500));
        win.print();
      }
    } catch (_) { /* ignore */ }
    setTimeout(remove, viaApp ? 2000 : 60000);
  };
  if (doc.readyState === 'complete') setTimeout(done, 200);
  else iframe.onload = () => setTimeout(done, 200);
}
