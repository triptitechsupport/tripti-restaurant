import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient.js';
import { kdsPb, waiterPb } from '@/lib/staffClients.js';
import { resolveOrderId } from '@/lib/kotPrint.js';
import { buildGroupMap, tableDisplayForParent } from '@/lib/tableGroups.js';

// Dedicated KOT display page optimized for 58mm thermal printers.
// Renders ONLY the ticket content — no header, footer, nav, or site chrome.

function formatTime(value) {
  try {
    return new Date(value || Date.now()).toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export default function KotPrintPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('loading');
  const [trackingBusy, setTrackingBusy] = useState(false);
  // table_groups + table_group_members for resolving the full Shared Order
  // table combination ("Tables 4 + 5 + 6") on the printed ticket.
  const [groupMap, setGroupMap] = useState(() => new Map());
  // Keep a ref to the client + record id that successfully loaded the ticket
  // so the Print handler can update print tracking on the same auth store.
  const loadedClientRef = useRef(null);

  useEffect(() => {
    document.title = `KOT ${orderId ? String(orderId).slice(-6).toUpperCase() : ''}`;
    let active = true;
    (async () => {
      if (!orderId) {
        if (active) setStatus('error');
        return;
      }
      // Kitchen orders are only readable to whichever staff role is currently
      // signed in (admin_users via the default client, or waiter_users /
      // kds_users via their own isolated auth stores). Try every client that
      // currently holds a valid session — whichever one placed/owns this
      // order will succeed — instead of always assuming the default admin
      // client, which is what broke this on mobile waiter/KDS sessions.
      const candidates = [pb, waiterPb, kdsPb].filter((client) => client.authStore.isValid);
      const clientsToTry = candidates.length > 0 ? candidates : [pb, waiterPb, kdsPb];

      let lastError = null;
      for (const client of clientsToTry) {
        try {
          const rec = await client.collection('kitchen_orders').getOne(orderId, {
            expand: 'parentOrder',
            $autoCancel: false,
          });
          if (active) {
            loadedClientRef.current = client;
            setOrder(rec);
            setStatus('ready');
            document.title = `KOT ${resolveOrderId(rec)}`;
            // Fetch table combination membership so a Shared Order ticket
            // prints the full "Tables 4 + 5 + 6" label (read from the
            // normalized table_group_members, the source of truth) instead
            // of just the parent's primary tableNumber.
            try {
              const [g, m] = await Promise.all([
                client.collection('table_groups').getFullList({ $autoCancel: false }),
                client.collection('table_group_members').getFullList({ $autoCancel: false }),
              ]);
              if (active) setGroupMap(buildGroupMap(g, m));
            } catch (_) { /* ignore — non-shared orders need no membership */ }
          }
          return;
        } catch (err) {
          lastError = err;
        }
      }
      console.error('Failed to load KOT:', lastError);
      if (active) setStatus('error');
    })();
    return () => {
      active = false;
    };
  }, [orderId]);

  // Record a print/send event on the existing kitchen_orders record so the
  // duplicate-protection guard (printedAt / printCount) stays consistent
  // across Waiter, KDS, and Admin. Reuses the same record — never creates a
  // new KOT, Order ID, or suffix.
  const trackPrint = async () => {
    const client = loadedClientRef.current;
    if (!client || !order || !order.id) return;
    setTrackingBusy(true);
    try {
      const nextCount = (Number(order.printCount) || 0) + 1;
      const updated = await client.collection('kitchen_orders').update(
        order.id,
        { printedAt: new Date().toISOString(), printCount: nextCount },
        { $autoCancel: false, requestKey: `kot-print-track-${order.id}` },
      );
      setOrder((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      console.error('KOT print tracking update failed:', err);
    } finally {
      setTrackingBusy(false);
    }
  };

  const handlePrint = () => {
    // Trigger the browser print dialog, then record the print event.
    window.print();
    trackPrint();
  };

  const styles = `
    :root { color-scheme: light; }
    html, body { margin: 0; padding: 0; background: #f4f1ea; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kot-screen {
      min-height: 100vh;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 20px 12px 32px;
      box-sizing: border-box;
    }
    .kot-wrap {
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 32px 20px;
      box-sizing: border-box;
      color: #000000;
      background: #ffffff;
      border: none;
      border-radius: 0;
      box-shadow: none;
      font-family: 'Arial Black', 'Courier New', Courier, monospace;
      font-weight: 900;
      text-align: left;
    }
    .kot-name { text-align: left; font-size: 7rem; font-weight: 900; margin: 0 0 14px; letter-spacing: 0.5px; line-height: 1.02; color: #000000; -webkit-text-stroke: 1px #000000; }
    .kot-sub { text-align: left; font-size: 4.5rem; font-weight: 900; margin: 0 0 18px; line-height: 1.05; color: #000000; -webkit-text-stroke: 1px #000000; }
    .kot-hr { border: none; border-top: 14px solid #000000; margin: 26px 0; }
    .kot-table { text-align: left; font-size: 12rem; font-weight: 900; line-height: 1.0; margin: 22px 0; color: #000000; -webkit-text-stroke: 2px #000000; }
    .kot-oid { text-align: left; font-size: 4.5rem; font-weight: 900; margin: 16px 0; line-height: 1.05; color: #000000; -webkit-text-stroke: 1px #000000; }
    .kot-meta { text-align: left; font-size: 4.5rem; font-weight: 900; margin: 16px 0; line-height: 1.05; color: #000000; -webkit-text-stroke: 1px #000000; }
    .kot-items { width: 100%; border-collapse: collapse; }
    .kot-items td { vertical-align: top; padding: 24px 0; font-size: 5.5rem; font-weight: 900; line-height: 1.08; color: #000000; text-align: left; -webkit-text-stroke: 1px #000000; }
    .kot-q { width: auto; font-weight: 900; padding-right: 20px; white-space: nowrap; }
    .kot-item-line { display: block; }
    .kot-spice { font-size: 5.5rem; font-weight: 900; color: #000000; }
    .kot-notes { font-size: 4.5rem; font-weight: 900; margin-top: 18px; line-height: 1.15; color: #000000; text-align: left; -webkit-text-stroke: 1px #000000; }
    .kot-foot { text-align: left; font-size: 5.5rem; font-weight: 900; margin-top: 18px; line-height: 1.05; color: #000000; -webkit-text-stroke: 1px #000000; }
    .kot-foot .lbl { display: block; font-size: 3.5rem; }
    .kot-actions {
      width: 100%; max-width: 340px; margin: 16px auto 0; display: flex; flex-direction: column; gap: 10px;
    }
    .kot-print-btn {
      display: block; width: 100%; padding: 14px;
      font-size: 16px; font-weight: 700; background: #000; color: #fff;
      border: none; border-radius: 8px; cursor: pointer; font-family: sans-serif;
      min-height: 48px;
    }
    .kot-cancel-btn {
      display: block; width: 100%; padding: 14px;
      font-size: 16px; font-weight: 700; background: #fff; color: #000;
      border: 2px solid #000; border-radius: 8px; cursor: pointer; font-family: sans-serif;
      min-height: 48px;
    }
    .kot-msg { text-align: left; font-family: sans-serif; margin-top: 40px; color: #000000; padding: 0 16px; }
    @media print {
      html, body { background: #ffffff; }
      .kot-screen { min-height: 0; padding: 0; align-items: stretch; }
      .kot-actions { display: none !important; }
      .kot-wrap {
        width: auto; max-width: none; margin: 0; padding: 4mm 3mm;
        border: none; border-radius: 0; box-shadow: none; text-align: left;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .kot-wrap * { color: #000000 !important; font-weight: 900 !important; text-align: left !important; }
      .kot-hr { border-top: 10px solid #000000; }
      @page { size: 80mm auto; margin: 0; }
    }
  `;

  if (status === 'loading') {
    return (
      <>
        <style>{styles}</style>
        <div className="kot-screen">
          <div className="kot-msg">Loading ticket…</div>
        </div>
      </>
    );
  }

  if (status === 'error' || !order) {
    return (
      <>
        <style>{styles}</style>
        <div className="kot-screen">
          <div className="kot-msg">Order not found.</div>
        </div>
      </>
    );
  }

  const orderNo = resolveOrderId(order);
  const parent = (order.expand && order.expand.parentOrder) || null;
  const tableDisplay = tableDisplayForParent(parent, groupMap) || order.tableNumber || '';
  const tableLabel = `TABLE ${tableDisplay}`;
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <>
      <style>{styles}</style>
      <div className="kot-screen">
      <div className="kot-wrap">
        <div className="kot-name">TRIPTI GENUSSWELT</div>
        <div className="kot-sub">KITCHEN ORDER TICKET</div>
        <hr className="kot-hr" />
        <div className="kot-table">{tableLabel}</div>
        <div className="kot-oid">Order #{orderNo}</div>
        <div className="kot-meta">
          {order.room ? `${order.room} · ` : ''}
          {formatTime(order.created)}
        </div>
        <hr className="kot-hr" />
        <table className="kot-items">
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <span className="kot-q">{it.quantity}×</span>
                  <span>{it.name}</span>
                  {it.spiceLevel && it.spiceLevel !== 'None' ? (
                    <span className="kot-spice"> — {it.spiceLevel}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.notes ? (
          <>
            <hr className="kot-hr" />
            <div className="kot-notes">Note: {order.notes}</div>
          </>
        ) : null}
        <hr className="kot-hr" />
        <div className="kot-foot">
          <span className="lbl">PLACED BY</span>
          {order.placedBy || 'Staff'} ({order.placedByRole || 'staff'})
        </div>
      </div>
      <div className="kot-actions">
        <button className="kot-print-btn" onClick={handlePrint} disabled={trackingBusy}>
          {trackingBusy ? 'Printing…' : 'Print (select 80mm paper)'}
        </button>
        <button
          className="kot-cancel-btn"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign('/');
          }}
        >
          Cancel
        </button>
      </div>
      </div>
    </>
  );
}
