// Kitchen Order Ticket (KOT) printing utility.
// Used by Waiter & Admin order placement / order views. NOT by KDS.

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
  const tableLabel = `TABLE ${escapeHtml(order.tableDisplay || order.tableNumber)}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT</title>
    <style>
      * { font-family: 'Arial Black', 'Courier New', monospace; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { background: #ffffff; }
      body { width: auto; margin: 0; padding: 4mm 3mm; color: #000000; font-weight: 900; text-align: left; }
      h1 { font-size: 4.5rem; font-weight: 900; text-align: left; margin: 6px 0; color: #000000; -webkit-text-stroke: 1px #000000; }
      .meta { font-size: 2.8rem; font-weight: 900; text-align: left; margin-bottom: 10px; color: #000000; -webkit-text-stroke: 1px #000000; }
      hr { border: none; border-top: 10px solid #000000; margin: 14px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 14px 0; vertical-align: top; font-size: 3.2rem; font-weight: 900; color: #000000; text-align: left; -webkit-text-stroke: 1px #000000; }
      td.q { width: auto; font-weight: 900; padding-right: 16px; }
      .tbl { font-size: 7rem; font-weight: 900; text-align: left; color: #000000; -webkit-text-stroke: 2px #000000; }
      .oid { font-size: 2.8rem; font-weight: 900; text-align: left; margin-top: 6px; color: #000000; -webkit-text-stroke: 1px #000000; }
      .spice { font-size: 3.2rem; font-weight: 900; color: #000000; }
      .notes { font-size: 2.8rem; font-weight: 900; margin-top: 10px; color: #000000; text-align: left; -webkit-text-stroke: 1px #000000; }
      .placedby { font-size: 4.5rem; font-weight: 900; text-align: left; margin-top: 6px; color: #000000; -webkit-text-stroke: 1px #000000; line-height: 1.05; }
      .placedby .lbl { display: block; font-size: 2.8rem; }
      @page { size: 80mm auto; margin: 0; }
    </style></head><body>
    <h1>KITCHEN ORDER TICKET</h1>
    <div class="tbl">${tableLabel}</div>
    <div class="oid">Order #${orderId}</div>
    <div class="meta">${order.room ? escapeHtml(order.room) + ' &middot; ' : ''}${time}</div>
    <hr/>
    <table>${rows}</table>
    ${order.notes ? `<hr/><div class="notes">Note: ${escapeHtml(order.notes)}</div>` : ''}
    <hr/>
    <div class="placedby"><span class="lbl">PLACED BY</span>${escapeHtml(order.placedBy || 'Staff')} (${escapeHtml(order.placedByRole || 'staff')})</div>
    </body></html>`;
}

// Navigate to the dedicated 58mm KOT display page (same tab) for a saved order.
// The KOT page shows Print + Cancel; Cancel returns to the previous page.
export function openKOT(order) {
  const id = order && order.id ? order.id : order;
  if (!id) {
    // Fallback for unsaved orders: use the legacy iframe print.
    return printKOT(order);
  }
  window.location.assign(`/kot-print/${id}`);
  return true;
}

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

export const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Hot', 'Very Hot'];
