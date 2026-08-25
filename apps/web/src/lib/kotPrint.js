// Kitchen Order Ticket (KOT) printing utility.
// SINGLE SOURCE OF TRUTH for all KOT printing across Waiter, KDS, and Admin.
//
// Flow:
//   Waiter / KDS / Admin
//        ↓
//   printKOT(order)   ← builds KOT HTML → hidden print iframe → window.print()
//        ↓
//   kotPrint.js
//
// `openKOT(order)` is the convenience entry point used by callers that hand
// over a saved or unsaved order. For a saved order it enriches the record
// (full kitchen_orders row + Shared/Linked table combination), prints via
// `printKOT()`, and records the print event (printedAt / printCount) on the
// kitchen_orders record — preserving the duplicate-print protection guard.
// For an unsaved order (no persisted id) it falls back to `printKOT()`
// directly with no tracking.

import pb from '@/lib/pocketbaseClient.js';
import { kdsPb, waiterPb } from '@/lib/staffClients.js';
import { buildGroupMap, tableDisplayForKot } from '@/lib/tableGroups.js';

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

export function buildKOTHtml(order) {
  const time = new Date(order.created || Date.now()).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const orderId = resolveOrderId(order);
  const rows = (order.items || [])
    .map((it) => {
      const spice = it.spiceLevel && it.spiceLevel !== 'None'
        ? `<span class="spice"> — ${escapeHtml(it.spiceLevel)}</span>`
        : '';
      return `<tr><td class="q">${it.quantity}&times;</td><td class="n">${escapeHtml(it.name)}${spice}</td></tr>`;
    })
    .join('');
  const tableLabel = `${escapeHtml(order.tableDisplay || order.tableNumber)}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT</title>
    <style>
    * {
  font-family: 'Arial Black', 'Courier New', monospace;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

html, body {
  background: #ffffff;
}

body {
  width: fit-content;
  margin: 0;
  padding: 3mm 3mm;
  color: #000000;
  text-align: left;
}

h1 {
  font-size: 2.2rem;
  font-weight: 900;
  text-align: left;
  margin: 4px 0;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

.meta {
  font-size: 1rem;
  text-align: left;
  margin-bottom: 6px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

hr {
  border: none;
  border-top: 5px solid #000000;
  margin: 8px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
}

td {
  padding: 7px 0;
  vertical-align: top;
  font-size: 1.4rem;
  font-weight: 900;
  color: #000000;
  text-align: left;
  -webkit-text-stroke: 0.5px #000000;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

td.q {
  width: fit-content;
  padding-right: 8px;
}

.tbl {
  font-size: 1rem;
  text-align: left;
  color: #000000;
  -webkit-text-stroke: 1px #000000;
}

.oid {
  font-size: 1rem;
  font-weight: 900;
  text-align: left;
  margin-top: 4px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
}

.spice {
  font-size: 1.4rem;
  font-weight: 900;
  color: #000000;
}

.notes {
  font-size: 1.4rem;
  font-weight: 900;
  margin-top: 6px;
  color: #000000;
  text-align: left;
  -webkit-text-stroke: 0.5px #000000;
}

.placedby {
  font-size: 1rem;
  font-weight: 900;
  text-align: left;
  margin-top: 4px;
  color: #000000;
  -webkit-text-stroke: 0.5px #000000;
  line-height: 1.05;
}

.placedby .lbl {
  display: block;
  font-size: 1rem;
}

@page {
  size: 80mm auto;
  margin: 0;
}
    </style></head><body>
    <div class="tbl">KOT: <span class="oid">#${orderId}</span></div>
    <div class="tbl"><span class="meta">${order.room ? escapeHtml(order.room) : ''}</span> - ${tableLabel}</div>
    <div class="meta">${time}</div>
    <hr/>
    <table>${rows}</table>
    ${order.notes ? `<hr/><div class="notes">Note: ${escapeHtml(order.notes)}</div>` : ''}
    <hr/>
    <div class="placedby"><span class="lbl">PLACED BY</span>${escapeHtml(order.placedBy || 'Staff')}</div>
    </body></html>`;
}

// Print a KOT through the hidden-iframe / window.print() flow.
// `order` should already carry any display fields the caller wants printed
// (e.g. `tableDisplay` for Shared/Linked Orders). This function performs NO
// print tracking and NO navigation — it only renders and prints. Callers
// that need print tracking (duplicate-print protection) do so via
// `openKOT()` or their own tracking update after calling `printKOT()`.
export function printKOT(order) {
  try {
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
    doc.write(buildKOTHtml(order));
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

// Pick the PocketBase client that currently holds a valid staff session.
// Kitchen orders are only readable to whichever staff role is signed in
// (admin_users via the default client, or waiter_users / kds_users via their
// own isolated auth stores). Mirrors the multi-client resolution the old
// KotPrintPage used so printing works on waiter/KDS/admin sessions alike.
function pickAuthedClient() {
  const candidates = [pb, waiterPb, kdsPb].filter((client) => client.authStore.isValid);
  return candidates.length > 0 ? candidates : [pb, waiterPb, kdsPb];
}

// Enrich a saved kitchen_orders record for printing: fetch the full row
// (with expanded parentOrder) and resolve the Shared/Linked table
// combination from table_groups + table_group_members (the source of truth)
// so a multi-table KOT prints "Tables 4 + 5 + 6" instead of just the
// parent's primary tableNumber. Returns an order object suitable for
// `printKOT()`, or null if the record could not be loaded from any client.
async function enrichOrderForPrint(id) {
  const clients = pickAuthedClient();
  let lastError = null;
  for (const client of clients) {
    try {
      const rec = await client.collection('kitchen_orders').getOne(id, {
        expand: 'parentOrder',
        $autoCancel: false,
      });
      let groupMap = new Map();
      try {
        const [g, m] = await Promise.all([
          client.collection('table_groups').getFullList({ $autoCancel: false }),
          client.collection('table_group_members').getFullList({ $autoCancel: false }),
        ]);
        groupMap = buildGroupMap(g, m);
      } catch (_) { /* ignore — non-shared orders need no membership */ }
      const tableDisplay = tableDisplayForKot(rec, groupMap);
      if (tableDisplay) rec.tableDisplay = tableDisplay;
      // Keep the loaded client so tracking writes go through the same auth
      // store that successfully read the record.
      rec.__printClient = client;
      return rec;
    } catch (err) {
      lastError = err;
    }
  }
  console.error('Failed to load KOT for print:', lastError);
  return null;
}

// Record a print/send event on the existing kitchen_orders record so the
// duplicate-protection guard (printedAt / printCount) stays consistent across
// Waiter, KDS, and Admin. Reuses the same record — never creates a new KOT,
// Order ID, or suffix. Uses a unique requestKey to avoid auto-cancellation.
async function trackPrint(order, client) {
  if (!order || !order.id) return;
  const writeClient = client || order.__printClient || pb;
  try {
    const nextCount = (Number(order.printCount) || 0) + 1;
    await writeClient.collection('kitchen_orders').update(
      order.id,
      { printedAt: new Date().toISOString(), printCount: nextCount },
      { $autoCancel: false, requestKey: `kot-print-track-${order.id}` },
    );
  } catch (err) {
    console.error('KOT print tracking update failed:', err);
  }
}

// Unified KOT print entry point. For a saved order (has an id) this enriches
// the record (full row + Shared/Linked table combination), prints it via
// `printKOT()`, and records the print event (printedAt / printCount). For an
// unsaved order (no persisted id) it prints directly via `printKOT()` with
// no tracking. Never navigates to a dedicated print page — everything goes
// through the single `kotPrint.js` iframe/print implementation.
//
// Returns true if a print was triggered. Callers may fire-and-forget; the
// returned promise resolves once tracking (if any) has completed.
export async function openKOT(order) {
  // Unsaved order (e.g. a draft with no persisted id): print as-is, no
  // tracking possible.
  if (!order || !order.id) {
    return printKOT(order);
  }

  const enriched = await enrichOrderForPrint(order.id);
  if (enriched) {
    // Carry over any caller-supplied display fields (e.g. a tableDisplay
    // already computed by the caller) only if enrichment did not resolve one.
    if (!enriched.tableDisplay && order.tableDisplay) {
      enriched.tableDisplay = order.tableDisplay;
    }
    printKOT(enriched);
    await trackPrint(enriched);
    return true;
  }

  // Fallback: enrichment failed (e.g. record unreadable from any session).
  // Still attempt to print the order object the caller passed in so the
  // waiter is never left without a ticket. No tracking in this path.
  return printKOT(order);
}

export const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Hot', 'Very Hot'];
