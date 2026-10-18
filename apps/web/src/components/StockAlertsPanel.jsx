import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle, PackageX, CalendarClock, Boxes, ArrowRight, RefreshCw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { expiryState, daysUntilExpiry, EXPIRY_WARN_DAYS } from '@/lib/stockFifo.js';

/**
 * Reusable stock alert panel — shows low-stock, out-of-stock, expiring-soon
 * and expired-lot warnings. Used on both the Admin Dashboard and the Stock
 * Management Dashboard so the same thresholds (minStock, 7-day expiry window)
 * surface everywhere.
 *
 * Props:
 *  - pb: PocketBase client (already authenticated for stock_items/stock_lots)
 *  - variant: 'admin' | 'stock'  (changes the action label/target)
 *  - onAction: (target) => void   target: 'inventory' | 'lots' | 'stock-dashboard'
 *  - className: extra wrapper classes
 *
 * Renders nothing when there are no active alerts (clean dashboard).
 */
function statusOf(item) {
  const qty = Number(item.quantity) || 0;
  const min = Number(item.minStock) || 0;
  if (qty <= 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

function fmtDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString([], { dateStyle: 'medium' }); }
  catch (_) { return String(v).slice(0, 10); }
}

function lotItemName(lot) {
  const ex = lot.expand && lot.expand.stockItem;
  return (ex && ex.name) || lot.itemName || '—';
}

export default function StockAlertsPanel({ pb, variant = 'stock', onAction, className = '' }) {
  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [i, l] = await Promise.all([
        pb.collection('stock_items').getFullList({ $autoCancel: false, requestKey: null }),
        pb.collection('stock_lots').getFullList({ expand: 'stockItem,location', $autoCancel: false, requestKey: null }),
      ]);
      setItems(i);
      setLots(l);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('Stock alerts load failed', err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    fetchAll();
    let cancelled = false;
    const unsubFns = [];
    const attach = (col) => {
      void pb
        .collection(col)
        .subscribe('*', (e) => {
          if (cancelled) return;
          // Refresh on any change so alerts stay current after imports/adjustments.
          void fetchAll();
        }, { requestKey: `stock-alerts-${col}-${variant}` })
        .then((u) => {
          if (cancelled) { try { u && u(); } catch { /* ignore */ } return; }
          if (typeof u === 'function') unsubFns.push(u);
        })
        .catch((e) => console.error(`Stock alerts subscribe ${col} failed`, e));
    };
    attach('stock_items');
    attach('stock_lots');
    // Polling fallback in case realtime drops through the proxy.
    const pollId = window.setInterval(() => { if (!cancelled) void fetchAll(); }, 20000);
    const onVis = () => { if (document.visibilityState === 'visible' && !cancelled) void fetchAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(pollId);
      unsubFns.forEach((u) => { try { u(); } catch { /* ignore */ } });
    };
  }, [fetchAll, pb, variant]);

  const alerts = useMemo(() => {
    const outItems = items.filter((it) => statusOf(it) === 'out');
    const lowItems = items.filter((it) => statusOf(it) === 'low');
    const expiringLots = [];
    const expiredLots = [];
    lots.forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      if (rem <= 0) return;
      const st = (l.status || 'active').toString();
      if (st !== 'active' && st !== 'overridden') return;
      const es = expiryState(l.expiry);
      if (es === 'expired') expiredLots.push(l);
      else if (es === 'warning') expiringLots.push(l);
    });
    // Sort: soonest expiry first.
    const byExpiryAsc = (a, b) => {
      const ae = a.expiry ? new Date(a.expiry).getTime() : Infinity;
      const be = b.expiry ? new Date(b.expiry).getTime() : Infinity;
      return ae - be;
    };
    expiringLots.sort(byExpiryAsc);
    expiredLots.sort(byExpiryAsc);
    return { outItems, lowItems, expiringLots, expiredLots };
  }, [items, lots]);

  const totalAlerts =
    alerts.outItems.length +
    alerts.lowItems.length +
    alerts.expiringLots.length +
    alerts.expiredLots.length;

  // Reset dismissal whenever the alert set changes meaningfully so a new
  // problem re-surfaces the panel.
  useEffect(() => {
    setDismissed(false);
  }, [totalAlerts]);

  if (loading || totalAlerts === 0 || dismissed) return null;

  const isAdmin = variant === 'admin';
  const goInventory = () => { if (onAction) onAction(isAdmin ? 'stock-dashboard' : 'inventory'); };
  const goLots = () => { if (onAction) onAction(isAdmin ? 'stock-dashboard' : 'lots'); };

  const renderItems = (list, tone, max = 4) =>
    list.slice(0, max).map((it) => (
      <div key={it.id} className="flex items-center gap-2 px-4 py-2 text-sm">
        <span className={`h-2 w-2 rounded-full shrink-0 ${tone === 'out' ? 'bg-destructive' : 'bg-amber-500'}`} />
        <span className="font-bold text-foreground truncate flex-1 min-w-0">{it.name}</span>
        <span className="text-xs text-muted-foreground font-mono notranslate" translate="no">
          {Number(it.quantity) || 0}/{Number(it.minStock) || 0}
        </span>
      </div>
    ));

  const renderLots = (list, tone, max = 4) =>
    list.slice(0, max).map((l) => {
      const d = daysUntilExpiry(l.expiry);
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      return (
        <div key={l.id} className="flex items-center gap-2 px-4 py-2 text-sm">
          <span className={`h-2 w-2 rounded-full shrink-0 ${tone === 'expired' ? 'bg-destructive' : 'bg-amber-500'}`} />
          <span className="font-bold text-foreground truncate flex-1 min-w-0">{lotItemName(l)}</span>
          <span className="text-xs text-muted-foreground font-mono notranslate" translate="no">×{rem}</span>
          <span className={`text-xs font-bold shrink-0 ${tone === 'expired' ? 'text-destructive' : 'text-amber-700'}`}>
            {d < 0 ? `${Math.abs(d)}d ago` : `${d}d left`}
          </span>
        </div>
      );
    });

  return (
    <div className={`rounded-2xl border-2 border-secondary bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}>
      <div className="flex items-center gap-3 px-5 py-4 bg-secondary/15 border-b-2 border-secondary/40">
        <div className="h-11 w-11 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shadow-sm shrink-0">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-serif font-bold text-primary leading-tight flex items-center gap-2">
            <Boxes className="h-4 w-4 text-secondary" /> Stock Alerts
          </h2>
          <p className="text-xs text-muted-foreground font-medium">
            {totalAlerts} stock issue{totalAlerts !== 1 ? 's' : ''} need attention — low/out of stock or lots expiring within {EXPIRY_WARN_DAYS} days.
          </p>
        </div>
        <span className="pending-sticky-badge-blink min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow-sm shrink-0">
          {totalAlerts}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alerts"
          title="Dismiss (reappears if alerts change)"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="divide-y divide-border/60 max-h-[320px] overflow-y-auto">
        {alerts.outItems.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-destructive/5">
              <span className="text-xs font-bold uppercase tracking-wide text-destructive flex items-center gap-1.5">
                <PackageX className="h-3.5 w-3.5" /> Out of Stock
              </span>
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">{alerts.outItems.length}</Badge>
            </div>
            {renderItems(alerts.outItems, 'out')}
            {alerts.outItems.length > 4 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground italic">+ {alerts.outItems.length - 4} more</div>
            )}
          </div>
        )}

        {alerts.lowItems.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-amber-500/5">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Low Stock
              </span>
              <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">{alerts.lowItems.length}</Badge>
            </div>
            {renderItems(alerts.lowItems, 'low')}
            {alerts.lowItems.length > 4 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground italic">+ {alerts.lowItems.length - 4} more</div>
            )}
          </div>
        )}

        {alerts.expiringLots.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-amber-500/5">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Expiring ≤ {EXPIRY_WARN_DAYS}d
              </span>
              <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">{alerts.expiringLots.length}</Badge>
            </div>
            {renderLots(alerts.expiringLots, 'warning')}
            {alerts.expiringLots.length > 4 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground italic">+ {alerts.expiringLots.length - 4} more</div>
            )}
          </div>
        )}

        {alerts.expiredLots.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-destructive/5">
              <span className="text-xs font-bold uppercase tracking-wide text-destructive flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Expired
              </span>
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">{alerts.expiredLots.length}</Badge>
            </div>
            {renderLots(alerts.expiredLots, 'expired')}
            {alerts.expiredLots.length > 4 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground italic">+ {alerts.expiredLots.length - 4} more</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card/95">
        <Button type="button" size="sm" variant="outline" onClick={goInventory} className="shadow-sm">
          <Boxes className="h-4 w-4 mr-1.5" /> {isAdmin ? 'Open Stock Dashboard' : 'View Inventory'}
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
        {(alerts.expiringLots.length > 0 || alerts.expiredLots.length > 0) && (
          <Button type="button" size="sm" variant="ghost" onClick={goLots} className="ml-auto">
            <CalendarClock className="h-4 w-4 mr-1.5" /> {isAdmin ? 'Open Stock Dashboard' : 'View Lots'}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={fetchAll} className="shrink-0" aria-label="Refresh alerts" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
