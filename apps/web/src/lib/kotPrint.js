// Kitchen Order Ticket (KOT) printing utility.
// Used by Waiter & Admin order placement / order views. NOT by KDS.

import pb from '@/lib/pocketbaseClient.js';
import { printHtmlInFrame } from '@/lib/printFrame.js';

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

// Module-level cache: category name -> print_order (number | null). The
// admin configures the KOT print sequence per category in the `categories`
// collection (`print_order` field). The cache avoids refetching the
// categories records on every KOT print / reprint.
const categoryPrintOrderCache = new Map();

// Refresh the category -> print_order cache from the `categories`
// collection. Called once per print run; the cache is reused across prints
// so repeated prints don't refetch. Returns nothing — callers read from
// `categoryPrintOrderCache`.
async function refreshCategoryPrintOrder() {
  if (categoryPrintOrderCache.size) return;
  try {
    const records = await pb.collection('categories').getFullList({
      $autoCancel: false,
    });
    records.forEach((r) => {
      const name = (r.name || '').toString();
      if (!name) return;
      const order = r.print_order;
      categoryPrintOrderCache.set(
        name,
        typeof order === 'number' && !Number.isNaN(order) ? order : null,
      );
    });
  } catch (err) {
    console.error('KOT category print-order resolve failed:', err);
  }
}

// Return the admin-configured print order for a category name. Categories
// without an explicit order (null / missing) sort LAST, alphabetically
// among themselves. `Uncategorized` always sorts very last.
export function getCategoryPrintOrder(name) {
  if (!name || name === 'Uncategorized') return Number.MAX_SAFE_INTEGER;
  const order = categoryPrintOrderCache.get(String(name));
  if (typeof order === 'number' && !Number.isNaN(order)) return order;
  // No explicit order: place after all ordered categories, but keep a
  // stable alphabetical sub-order by offsetting with the leading char
  // code. This keeps unordered categories deterministic and after the
  // ordered ones.
  return 1000000 + String(name).charCodeAt(0);
}

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

// Kitchen orders inherit the parent order's creation timestamp when it is
// available, so every split KOT prints the original order date and time.
function resolveOrderDateTime(order) {
  const parent = order?.expand && order.expand.parentOrder;
  const rawCreated = (parent && parent.created) || (order && order.created);
  if (!rawCreated) return null;

  const created = new Date(rawCreated);
  if (Number.isNaN(created.getTime())) return null;

  return {
    date: created.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: created.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

// Shared KOT font stack — Arial Black primary, Courier New fallback for
// environments without it, then generic monospace. Applied to every element
// via the universal selector so headings, metadata, item cells, spice and
// notes all render in the same family.
const KOT_FONT_FAMILY = "'Arial Black', 'Courier New', monospace";

// Build the printable KOT HTML. The layout is an HTML table so column
// alignment (item / quantity) does not depend on a monospace font — Arial
// Black is the primary face and is proportional. Content logic is unchanged:
// items are grouped by category and printed in the admin-configured
// `print_order`; each category section repeats the order ID / room / table so
// a torn-apart slip still carries full identity; item rows carry name, spice
// level and quantity.
//
// `options.separateCategories` (default false) inserts a clear, scissored
// "cut here" boundary between category sections so the printed ticket can be
// physically cut apart per category. When false, the original continuous
// layout (a single horizontal rule between sections) is preserved.
//
// All printed content is center-aligned.
export function buildKOTHtml(order, categoryMap = new Map(), options = {}) {
  const { separateCategories = false } = options;
  const orderId = resolveOrderId(order);
  const expandedGroup = order?.expand?.parentOrder?.expand?.tableGroup;
  const expandedLabel = expandedGroup && expandedGroup.status !== 'closed' && expandedGroup.label && String(expandedGroup.label).includes('+')
    ? String(expandedGroup.label).trim()
    : '';
  const tableCandidates = [order?.tableDisplay, order?.tableLabel, expandedLabel, order?.tableNumber];
  const combinedTable = tableCandidates.find((value) => value && String(value).includes('+'));
  const tableRaw = combinedTable || tableCandidates.find(Boolean) || '';
  const roomRaw = order?.room || '';
  const placedByRaw = order?.placedBy || order?.waiterName || order?.waiter || '';

  // Group items by category, preserving first-appearance order within each
  // category. The category SEQUENCE on the printed ticket follows the
  // admin-configured `print_order` (see getCategoryPrintOrder): categories
  // with an explicit order come first in that order, then unordered
  // categories alphabetically, then `Uncategorized` last.
  const itemsByCategory = new Map();
  (order.items || []).forEach((it) => {
    const resolved = categoryMap.get(it.id);
    const category = String(resolved || it.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!itemsByCategory.has(category)) itemsByCategory.set(category, []);
    itemsByCategory.get(category).push(it);
  });

  const sortedCategories = [...itemsByCategory.keys()].sort((a, b) => {
    const oa = getCategoryPrintOrder(a);
    const ob = getCategoryPrintOrder(b);
    if (oa !== ob) return oa - ob;
    return String(a).localeCompare(String(b));
  });

  // Assemble the printable body.
  const parts = [];

  // Main title (h1, slightly reduced from the previous 2.2rem).
  parts.push('<h1>KOT</h1>');

  // Print the original order timestamp immediately after the KOT heading and
  // before the existing order identity metadata.
  const orderDateTime = resolveOrderDateTime(order);
  if (orderDateTime) {
    parts.push(
      `<div class="datetime">Date: ${escapeHtml(orderDateTime.date)} · Time: ${escapeHtml(orderDateTime.time)}</div>`,
    );
  }

  // Whole-order note (slightly reduced item-detail size).
  if (order.notes) {
    parts.push(`<div class="notes">Note: ${escapeHtml(order.notes)}</div>`);
  }

  // Each category section is self-contained: it repeats the order ID, room
  // number and table number so a printed ticket can be torn apart by
  // category and every slip still carries full identity. Sections are
  // divided by a horizontal rule.
  sortedCategories.forEach((category, idx) => {
    const categoryItems = itemsByCategory.get(category);

    if (idx > 0) {
      if (separateCategories) {
        // Clear, scissored cut boundary so the printed ticket can be
        // physically cut apart between categories. The dashed rule + label
        // gives a visible cut line; extra vertical spacing separates the
        // slips. No emoji used — plain "CUT HERE" text only.
        parts.push('<div class="cutline">— — — CUT HERE — — —</div>');
      } else {
        parts.push('<hr />');
      }
    }

    // Per-category identity header (meta/tbl/oid, 1rem).
    parts.push(`<div class="oid">Order ID: #${escapeHtml(orderId)}</div>`);
    parts.push(`<div class="tbl">${escapeHtml(roomRaw || '—')}, ${escapeHtml(tableRaw || '—')}</div>`);
    // Category heading (item-table size, 1.4rem, bold, black, left).
    parts.push(`<div class="cat">${escapeHtml(String(category).toUpperCase())}</div>`);

    // Item table — each row carries name (+spice) and quantity (item table
    // cells + spice/notes, 1.4rem). Per-item notes, when present, occupy a
    // full-width row beneath the item.
    parts.push('<table class="items">');
    categoryItems.forEach((it) => {
      const name = escapeHtml(it.name || it.itemName || 'Item');
      const spice = it.spiceLevel && it.spiceLevel !== 'None'
        ? ` <span class="spice">(${escapeHtml(it.spiceLevel)})</span>`
        : '';
      const qty = it.quantity ?? 1;
      parts.push(
        `<tr><td class="item">${name}${spice}</td><td class="qty">x${qty}</td></tr>`,
      );
      if (it.notes) {
        parts.push(`<tr><td class="notes" colspan="2">${escapeHtml(it.notes)}</td></tr>`);
      }
    });
    parts.push('</table>');
  });

  // Keep the waiter / placed-by name at the very end, after every category,
  // item detail, and note on the printed KOT.
  if (placedByRaw) {
    parts.push(`<div class="placedby">Waiter / Placed by: ${escapeHtml(placedByRaw)}</div>`);
  }

  const bodyHtml = parts.join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT</title>
    <style>
    * {
      font-family: ${KOT_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      background: #ffffff;
      font-family: ${KOT_FONT_FAMILY};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: fit-content;
      max-width: 80mm;
      margin: 0;
      padding: 3mm 3mm;
      color: #000000;
      text-align: left;
    }
    h1 {
      font-family: ${KOT_FONT_FAMILY};
      font-size: 2rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
      margin: 0 0 4px;
      line-height: 1.2;
    }
    .meta, .tbl, .oid, .placedby, .datetime {
      font-family: ${KOT_FONT_FAMILY};
      font-size: 0.9rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
      margin: 1px 0;
      line-height: 1.3;
    }
    .cat {
      font-family: ${KOT_FONT_FAMILY};
      font-size: 1.25rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
      margin: 6px 0 2px;
      padding: 2px 0;
      border-top: 2px solid #000000;
      border-bottom: 2px solid #000000;
      line-height: 1.3;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
    }
    table.items td {
      font-family: ${KOT_FONT_FAMILY};
      font-size: 1.1rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
      vertical-align: top;
      padding: 1px 2px;
      line-height: 1.3;
    }
    td.qty {
      text-align: left;
      white-space: nowrap;
    }
    .spice, .notes {
      font-family: ${KOT_FONT_FAMILY};
      font-size: 1.1rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
    }
    td.notes {
      text-align: left;
    }
    .notes {
      margin: 2px 0 4px;
    }
    hr {
      border: none;
      border-top: 2px solid #000000;
      margin: 6px 0;
    }
    .cutline {
      display: block;
      font-family: ${KOT_FONT_FAMILY};
      font-size: 0.9rem;
      font-weight: 900;
      color: #000000;
      text-align: left;
      letter-spacing: 2px;
      margin: 12px 0;
      padding: 6px 0 4px;
      border-top: 3px dashed #000000;
      border-bottom: 3px dashed #000000;
      line-height: 1.3;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @page {
      size: 80mm auto;
      margin: 0;
    }
    </style></head><body>${bodyHtml}</body></html>`;
}

// Print a KOT through the shared iframe implementation.
// `options.separateCategories` (default false) inserts a cut boundary between
// category sections; see buildKOTHtml.
export function openKOT(order, options = {}) {
  return printKOT(order, options);
}

export async function printKOT(order, options = {}) {
  try {
    await refreshCategoryPrintOrder();
    const categoryMap = await resolveCategoryMap(order && order.items);
    printHtmlInFrame(buildKOTHtml(order, categoryMap, options), 'KOT');
    return true;
  } catch (err) {
    console.error('KOT print failed:', err);
    return false;
  }
}

export const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Hot', 'Very Hot'];