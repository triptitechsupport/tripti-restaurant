// Barcode + label utilities. Barcodes are NUMERIC ONLY (the system stores the
// number; name/qty/expiry are entered or mapped separately). We render Code128
// (which supports digits) via JsBarcode onto a canvas/SVG, and provide print
// helpers for location, lot, and leftover labels on 80mm thermal / A4 layouts.
import JsBarcode from 'jsbarcode';
import { nativePrint } from '@/lib/staffApp.js';

/**
 * Validate a numeric-only barcode. Empty is allowed (optional field).
 * Returns { ok, value, error }.
 */
export function validateNumericBarcode(raw) {
  if (raw == null) return { ok: true, value: '', error: null };
  const v = String(raw).trim();
  if (v === '') return { ok: true, value: '', error: null };
  if (!/^\d+$/.test(v)) {
    return { ok: false, value: v, error: 'Barcode must contain digits only (0–9).' };
  }
  if (v.length > 40) {
    return { ok: false, value: v, error: 'Barcode is too long (max 40 digits).' };
  }
  return { ok: true, value: v, error: null };
}

/** Generate a fresh numeric barcode (default 12 digits, EAN-like length). */
export function generateNumericBarcode(length = 12) {
  let s = '';
  // Avoid leading zero so scanners treat it as a full code more reliably.
  s += Math.floor(1 + Math.random() * 9).toString();
  for (let i = 1; i < length; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

/**
 * Generate a numeric barcode that is not in `taken` (Set or array of strings).
 * Retries a few times; falls back to timestamp-based digits if collisions persist.
 */
export function generateUniqueNumericBarcode(taken = [], length = 12) {
  const set = taken instanceof Set
    ? taken
    : new Set((taken || []).map((v) => String(v || '').trim()).filter(Boolean));
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = generateNumericBarcode(length);
    if (!set.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback — still numeric-only.
  const fallback = String(Date.now()) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  return fallback.slice(0, Math.max(length, 12));
}

/** Collect non-empty barcodes from item and lot records (for uniqueness checks). */
export function collectTakenBarcodes(items = [], lots = [], exclude = {}) {
  const set = new Set();
  const skipItem = exclude.itemId || null;
  const skipLot = exclude.lotId || null;
  for (const it of items) {
    if (skipItem && it.id === skipItem) continue;
    const b = String(it.barcode || '').trim();
    if (b) set.add(b);
  }
  for (const lot of lots) {
    if (skipLot && lot.id === skipLot) continue;
    const b = String(lot.barcode || '').trim();
    if (b) set.add(b);
  }
  return set;
}

/** datetime-local value from a PB date/ISO string. */
export function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 10)}T00:00`;
    return '';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string (or null) from a datetime-local input value. */
export function fromDatetimeLocalValue(v) {
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Validate prep vs expiry: expiry must not be before preparation. */
export function validatePrepExpiry(preparedAt, expiry) {
  if (!preparedAt && !expiry) return { ok: true, error: null };
  if (expiry && !preparedAt) {
    // Expiry alone is fine; prep optional for non-prep items.
    return { ok: true, error: null };
  }
  if (preparedAt && expiry) {
    const p = new Date(preparedAt).getTime();
    const e = new Date(expiry).getTime();
    if (Number.isNaN(p) || Number.isNaN(e)) {
      return { ok: false, error: 'Invalid preparation or expiry date/time.' };
    }
    if (e < p) {
      return { ok: false, error: 'Expiry must be on or after the preparation date/time.' };
    }
  }
  return { ok: true, error: null };
}

/**
 * Render a barcode onto an existing <canvas> element using Code128.
 * Returns true on success.
 */
export function renderBarcodeToCanvas(canvas, value, opts = {}) {
  if (!canvas) return false;
  const v = String(value || '').trim();
  if (!v) return false;
  try {
    JsBarcode(canvas, v, {
      format: 'CODE128',
      width: opts.width || 2,
      height: opts.height || 60,
      displayValue: true,
      fontSize: opts.fontSize || 14,
      margin: opts.margin || 8,
      ...opts,
    });
    return true;
  } catch (err) {
    console.error('Barcode render failed', err);
    return false;
  }
}

// Same font stack as KOT printer for thermal 80mm consistency.
const BARCODE_PRINT_FONT = "'Arial Black', 'Courier New', monospace";

/**
 * Build barcode-only print HTML (numeric Code128 + human-readable digits).
 * No stock tables, prices, or extra metadata — scanning the number resolves
 * full item/lot info in the Stock app.
 */
export function buildBarcodePrintHtml(labels, title = 'Barcode') {
  const codes = (labels || [])
    .map((l) => String((l && l.barcode) || '').trim())
    .filter(Boolean);
  const cards = codes
    .map(
      (code, i) => `
    <div class="label">
      <canvas id="bc-${i}"></canvas>
      <div class="digits notranslate" translate="no">${escapeHtml(code)}</div>
    </div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
    * {
      font-family: ${BARCODE_PRINT_FONT};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      box-sizing: border-box;
    }
    html, body {
      background: #ffffff;
      font-family: ${BARCODE_PRINT_FONT};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: fit-content;
      max-width: 80mm;
      margin: 0;
      padding: 3mm 3mm;
      color: #000000;
      text-align: center;
    }
    .label {
      page-break-inside: avoid;
      margin: 0 0 6mm;
      padding: 2mm 0;
      text-align: center;
    }
    canvas {
      max-width: 100%;
      height: auto;
      margin: 0 auto;
      display: block;
    }
    .digits {
      font-family: ${BARCODE_PRINT_FONT};
      font-size: 1.4rem;
      font-weight: 900;
      color: #000000;
      text-align: center;
      margin-top: 2mm;
      letter-spacing: 0.06em;
      line-height: 1.2;
    }
    @page {
      size: 80mm auto;
      margin: 0;
    }
    </style></head><body>${cards || '<div class="digits">No barcode</div>'}
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <script>
    (function () {
      var codes = ${JSON.stringify(codes)};
      function draw() {
        codes.forEach(function (v, i) {
          var el = document.getElementById('bc-' + i);
          if (el && v && window.JsBarcode) {
            try {
              JsBarcode(el, v, {
                format: 'CODE128',
                width: 2,
                height: 56,
                displayValue: false,
                margin: 4,
                background: '#ffffff',
                lineColor: '#000000'
              });
            } catch (e) { if (el) el.style.display = 'none'; }
          } else if (el) { el.style.display = 'none'; }
        });
      }
      if (document.readyState === 'complete') draw();
      else document.addEventListener('DOMContentLoaded', draw);
    })();
    <\/script>
    </body></html>`;
}

/**
 * Print barcode labels using the same hidden-iframe approach as KOT printing
 * (reliable print dialog, 80mm thermal page, no popup blockers).
 * Content is barcode-only; item details live in the system behind the number.
 */
export function printLabels(labels, { title = 'Barcode' } = {}) {
  const list = (labels || []).filter((l) => String((l && l.barcode) || '').trim());
  if (list.length === 0) return false;
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(buildBarcodePrintHtml(list, title));
    doc.close();
    const done = () => {
      try {
        iframe.contentWindow.focus();
        if (!nativePrint(iframe.contentWindow)) iframe.contentWindow.print();
      } catch (_) { /* ignore */ }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
      }, 2000);
    };
    if (iframe.contentWindow.document.readyState === 'complete') {
      setTimeout(done, 350);
    } else {
      iframe.onload = () => setTimeout(done, 350);
    }
    return true;
  } catch (err) {
    console.error('Barcode print failed', err);
    return false;
  }
}

/**
 * Resolve a scanned numeric barcode to item and/or lot records.
 * Returns { barcode, item, lot, lots } — any may be null/empty.
 */
export async function lookupBarcode(pbClient, rawBarcode) {
  const check = validateNumericBarcode(rawBarcode);
  if (!check.ok || !check.value) {
    return { barcode: String(rawBarcode || ''), item: null, lot: null, lots: [], error: check.error || 'Invalid barcode' };
  }
  const code = check.value;
  const filter = pbClient.filter('barcode = {:code}', { code });
  let item = null;
  let lots = [];
  try {
    const items = await pbClient.collection('stock_items').getFullList({
      filter,
      $autoCancel: false,
      requestKey: `lookup-item-${code}`,
    });
    item = items[0] || null;
  } catch (_) { /* ignore */ }
  try {
    lots = await pbClient.collection('stock_lots').getFullList({
      filter,
      expand: 'stockItem,location',
      sort: 'expiry',
      $autoCancel: false,
      requestKey: `lookup-lot-${code}`,
    });
  } catch (_) { /* ignore */ }
  if (!item && lots[0] && lots[0].expand && lots[0].expand.stockItem) {
    item = lots[0].expand.stockItem;
  }
  if (!item && lots[0] && lots[0].stockItem) {
    try {
      item = await pbClient.collection('stock_items').getOne(lots[0].stockItem, {
        $autoCancel: false,
        requestKey: `lookup-item-id-${lots[0].stockItem}`,
      });
    } catch (_) { /* ignore */ }
  }
  return {
    barcode: code,
    item,
    lot: lots[0] || null,
    lots,
    error: item || lots.length ? null : 'No item or lot matches this barcode',
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a location label from a location record (with resolved path). */
export function locationLabel(loc) {
  return {
    title: 'LOCATION',
    subtitle: loc.path || loc.name,
    barcode: loc.barcode || loc.name,
    lines: [loc.name, `Type: ${(loc.type || '').toUpperCase()}`],
    footer: 'Tripti Genusswelt — Stock',
  };
}

function fmtLabelDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return String(v).slice(0, 16);
  }
}

/** Build a lot label. */
export function lotLabel(lot, itemName) {
  const exp = fmtLabelDateTime(lot.expiry);
  const prep = lot.preparedAt ? fmtLabelDateTime(lot.preparedAt) : null;
  return {
    title: 'LOT',
    subtitle: itemName || lot.itemName || '',
    barcode: lot.barcode || '',
    lines: [
      `Qty: ${lot.quantity ?? lot.remainingQty ?? 0}`,
      prep ? `Prepared: ${prep}` : '',
      `Expiry: ${exp}`,
      lot.supplierBill ? `Bill: ${lot.supplierBill}` : '',
    ].filter(Boolean),
    footer: lot.barcode ? '' : 'No barcode assigned',
  };
}

/** Build an item-level barcode label. */
export function itemBarcodeLabel(item) {
  const prep = item.preparedAt ? fmtLabelDateTime(item.preparedAt) : null;
  const exp = item.expiry ? fmtLabelDateTime(item.expiry) : null;
  return {
    title: 'ITEM',
    subtitle: item.name || '',
    barcode: item.barcode || '',
    lines: [
      item.category ? `Cat: ${item.category}` : '',
      item.unit ? `Unit: ${item.unit}` : '',
      prep ? `Prepared: ${prep}` : '',
      exp ? `Expiry: ${exp}` : '',
    ].filter(Boolean),
    footer: 'Tripti Genusswelt — Stock',
  };
}

/** Build a leftover label (remaining quantity after partial issue). */
export function leftoverLabel(lot, itemName) {
  const exp = fmtLabelDateTime(lot.expiry);
  const prep = lot.preparedAt ? fmtLabelDateTime(lot.preparedAt) : null;
  return {
    title: 'LEFTOVER',
    subtitle: itemName || lot.itemName || '',
    barcode: lot.barcode || '',
    lines: [
      `Remaining: ${lot.remainingQty ?? 0}`,
      prep ? `Prepared: ${prep}` : '',
      `Expiry: ${exp}`,
    ].filter(Boolean),
    footer: 'Re-label after partial issue',
  };
}
