// Kitchen Order Ticket (KOT) printing utility.
// Used by Waiter & Admin order placement / order views. NOT by KDS.

import pb from '@/lib/pocketbaseClient.js';

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Module-level cache: menu item id -> category. The KOT/order items do not
// carry category information, so categories are resolved from the menu_items
// collection by item id at print time. The cache avoids refetching the same
// menu_items records on every KOT print / reprint.
const menuItemCategoryCache = new Map();

// Resolve a category for every item id in `items` via a single batched
// menu_items lookup (one getFullList with an OR filter on the uncached ids).
// Returns a Map of item id -> category. ids that cannot be resolved are
// omitted from the map so the caller can apply its own fallback.
async function resolveCategoryMap(items) {
  const ids = [...new Set(
    (items || [])
      .map((it) => it && it.id)
      .filter(Boolean)
      .filter((id) => !menuItemCategoryCache.has(String(id))),
  )].map(String);

  if (ids.length) {
    const filter = ids.map((id) => `id = ${JSON.stringify(id)}`).join(' || ');
    try {
      const records = await pb.collection('menu_items').getFullList({
        filter,
        $autoCancel: false,
      });
      records.forEach((r) => {
        menuItemCategoryCache.set(r.id, (r.category || 'Uncategorized').toString());
      });
    } catch (err) {
      console.error('KOT category resolve failed:', err);
    }
  }

  const map = new Map();
  (items || []).forEach((it) => {
    if (!it || !it.id) return;
    const cat = menuItemCategoryCache.get(String(it.id));
    if (cat) map.set(it.id, cat);
  });
  return map;
}

// Resolve the base order ID (without KOT suffix) for a kitchen order.
// Prefers the parent waiter_orders.orderId (WI00001 / PO00001 ...), then an
// orderId copied onto the order object in memory, then falls back to the
// KOT id.
export function resolveBaseOrderId(order) {
  if (!order) return 'NEW';
  if (order.orderId) return order.orderId;
  const parent = order.expand && order.expand.parentOrder;
  if (parent && parent.orderId) return parent.orderId;
  return order.id ? String(order.id).slice(-6).toUpperCase() : 'NEW';
}

// Resolve the full, human-readable order ID for a kitchen order, including
// the per-parent KOT suffix when present (WI00123_001, WI00123_002 ...).
export function resolveOrderId(order) {
  const base = resolveBaseOrderId(order);
  if (!order) return base;
  const suffix = order.kotSuffix;
  if (suffix) return `${base}_${suffix}`;
  return base;
}

export function buildKOTHtml(order, categoryMap = new Map()) {
  const time = new Date(order.created || Date.now()).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const orderId = resolveOrderId(order);
  const itemsByCategory = new Map();
  (order.items || []).forEach((it) => {
    const resolved = categoryMap.get(it.id);
    const category = String(resolved || it.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!itemsByCategory.has(category)) itemsByCategory.set(category, []);
    itemsByCategory.get(category).push(it);
  });
  const rows = [...itemsByCategory.entries()]
    .map(([category, categoryItems]) => {
      const itemRows = categoryItems
        .map((it) => {
          const spice = it.spiceLevel && it.spiceLevel !== 'None'
            ? `<span class="spice"> — ${escapeHtml(it.spiceLevel)}</span>`
            : '';
          return `<tr><td class="q">${it.quantity}&times;</td><td class="n">${escapeHtml(it.name)}${spice}</td></tr>`;
        })
        .join('');
      return `<tr><td class="category" colspan="2">${escapeHtml(category)}</td></tr>${itemRows}`;
    })
    .join('');
  const tableLabel = `${escapeHtml(order.tableDisplay || order.tableNumber)}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT</title>
    <style>
    * {
  font-family: 'Arial Black', 'Courier New', Courier, monospace;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

html, body {
font-weight:bold;
  background: #ffffff;
  font-family: 'Arial Black', 'Courier New', Courier, monospace;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  width: fit-content;
  margin: 0;
  padding: 3mm 3mm;
  color: #000000;
  text-align: left;
}

.meta {
  text-align: left;
  margin-bottom: 6px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

hr {
  border: none;
  border-top: 3px solid #000000;
  margin: 8px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
}

    td {
  padding: 5px 0;
  vertical-align: top;
  
  color: #000000;
  text-align: left;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

td.q {
  width: fit-content;
  padding-right: 8px;
}

.category {
  padding-top: 10px;
  padding-bottom: 2px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

.spice {
  
  color: #000000;
}


.oid {
    text-align: left;
  margin-top: 4px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

.notes {
  font-size: 1.4rem;
  margin-top: 6px;
  color: #000000;
  text-align: left;
  -webkit-text-stroke: 0.5px #000000;
}

p {
padding: 0;
margin: 0;
}

@page {
  size: 80mm auto;
  margin: 0;
}
    </style></head><body>
    <div>KOT: <span class="oid">#${orderId}</span></div>
    <div><span class="meta">${order.room ? escapeHtml(order.room) : ''}</span> - ${tableLabel}</div>
    <div class="meta">${time}</div>
    <hr/>
    <table>${rows}</table>
    ${order.notes ? `<hr/><div class="notes">Note: ${escapeHtml(order.notes)}</div>` : ''}
    <hr/>
    <div class="placedby"><p class="lbl">Placed ByY</p>${escapeHtml(order.placedBy || 'Staff')}</div>
    </body></html>`;
}

// Print a KOT through the shared iframe implementation.
export function openKOT(order) {
  return printKOT(order);
}

export async function printKOT(order) {
  try {
    const categoryMap = await resolveCategoryMap(order && order.items);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(buildKOTHtml(order, categoryMap));
    doc.close();
    const done = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (_) { /* ignore */ }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
      }, 2000);
    };
    if (iframe.contentWindow.document.readyState === 'complete') {
      setTimeout(done, 200);
    } else {
      iframe.onload = () => setTimeout(done, 200);
    }
    return true;
  } catch (err) {
    console.error('KOT print failed:', err);
    return false;
  }
}

export const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Hot', 'Very Hot'];