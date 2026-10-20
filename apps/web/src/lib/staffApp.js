// True inside the Tripti Staff Android app. The app adds "TriptiStaffApp" to
// its user agent. Opening any page with ?app=1 turns the same mode on in a
// normal browser (handy for testing); ?app=0 turns it off again.
const KEY = 'tripti_staff_app';

function detect() {
  if (typeof window === 'undefined') return false;
  try {
    const flag = new URLSearchParams(window.location.search).get('app');
    if (flag === '1') localStorage.setItem(KEY, '1');
    if (flag === '0') localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
  if (/TriptiStaffApp/i.test(navigator.userAgent || '')) return true;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export const isStaffApp = detect();
if (isStaffApp && typeof document !== 'undefined') document.documentElement.classList.add('staff-app');

// The app's own printing and file saving (Android has no browser print
// dialog or downloads inside the app).
const native = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.TriptiStaff : null);

// Prints a window's current page through Android printing. Returns false
// outside the app, so callers fall back to the browser's print().
export function nativePrint(win = window, title = 'Tripti') {
  const plugin = native();
  if (!plugin) return false;
  // Print a copy without scripts: the page is already drawn (barcodes too),
  // and scripts would start the whole website again inside the print view.
  const copy = win.document.documentElement.cloneNode(true);
  copy.querySelectorAll('script, link[rel="modulepreload"]').forEach((el) => el.remove());
  const html = `<!doctype html>${copy.outerHTML}`;
  plugin.printHtml({ html, title, baseUrl: window.location.origin + '/' }).catch((err) => {
    console.error('[StaffApp] print failed', err);
  });
  return true;
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Exports create a temporary link and click it. In the app, save the file to
// Downloads/Tripti instead.
if (typeof window !== 'undefined' && typeof HTMLAnchorElement !== 'undefined') {
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick() {
    const plugin = native();
    const href = this.href || '';
    if (plugin && this.download && /^(blob|data):/.test(href)) {
      const name = this.download;
      fetch(href).then((r) => r.blob()).then(async (blob) => {
        await plugin.saveFile({ name, mime: blob.type || 'application/octet-stream', data: await toBase64(blob) });
      }).catch((err) => console.error('[StaffApp] save failed', err));
      return;
    }
    click.call(this);
  };
}
