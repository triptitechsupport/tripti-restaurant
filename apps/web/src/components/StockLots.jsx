import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layers, Loader2, Search, AlertTriangle, CalendarClock, ShieldCheck, Printer, RefreshCw, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { expiryState, daysUntilExpiry, EXPIRY_WARN_DAYS } from '@/lib/stockFifo.js';
import { printLabels } from '@/lib/barcodeUtils.js';

function fmtDate(v) { return v ? String(v).slice(0, 10) : '—'; }
function fmtDateTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return String(v).slice(0, 16); }
}

function ExpiryBadge({ expiry }) {
  const st = expiryState(expiry);
  if (st === 'none') return <Badge variant="outline" className="text-muted-foreground">No expiry</Badge>;
  const d = daysUntilExpiry(expiry);
  if (st === 'expired') return <Badge className="bg-destructive/15 text-destructive border-destructive/30">Expired {Math.abs(d)}d ago</Badge>;
  if (st === 'warning') return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">{d}d left</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">{d}d left</Badge>;
}

export default function StockLots({ pb, displayName, userId, userRole }) {
  const [lots, setLots] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('all');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [l, i, loc] = await Promise.all([
        pb.collection('stock_lots').getFullList({ sort: 'expiry,-created', expand: 'stockItem,location,receipt', $autoCancel: false, requestKey: null }),
        pb.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
        pb.collection('stock_locations').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
      ]);
      setLots(l); setItems(i); setLocations(loc);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('load lots failed', err);
      toast.error('Failed to load lots');
    } finally { setLoading(false); }
  }, [pb]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const itemName = useCallback((lot) => {
    const ex = lot.expand && lot.expand.stockItem;
    return (ex && (ex.name)) || lot.itemName || '—';
  }, []);
  const locName = useCallback((lot) => {
    const ex = lot.expand && lot.expand.location;
    return (ex && ex.name) || '—';
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lots.filter((l) => {
      if (expiryFilter === 'expired' && expiryState(l.expiry) !== 'expired') return false;
      if (expiryFilter === 'warning' && expiryState(l.expiry) !== 'warning') return false;
      if (expiryFilter === 'ok' && expiryState(l.expiry) !== 'ok') return false;
      if (!q) return true;
      return [itemName(l), l.barcode, l.supplierBill, locName(l)].join(' ').toLowerCase().includes(q);
    });
  }, [lots, search, expiryFilter, itemName, locName]);

  const stats = useMemo(() => {
    let active = 0, expired = 0, warning = 0, remaining = 0;
    lots.forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      if (rem > 0) {
        active += 1; remaining += rem;
        const st = expiryState(l.expiry);
        if (st === 'expired') expired += 1;
        if (st === 'warning') warning += 1;
      }
    });
    return { active, expired, warning, remaining };
  }, [lots]);

  const handleOverride = async () => {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) { toast.error('An override reason is required to use expired stock.'); return; }
    setOverriding(true);
    try {
      await pb.collection('stock_lots').update(overrideTarget.id, {
        status: 'overridden',
        overrideReason: overrideReason.trim(),
        overriddenBy: displayName,
      }, { $autoCancel: false, requestKey: `override-${overrideTarget.id}` });
      // Audit trail entry.
      const ex = overrideTarget.expand && overrideTarget.expand.stockItem;
      await pb.collection('stock_adjustments').create({
        stockItem: overrideTarget.stockItem,
        itemName: (ex && ex.name) || overrideTarget.itemName || '',
        adjustmentType: 'correction',
        delta: 0,
        previousQty: Number(overrideTarget.remainingQty != null ? overrideTarget.remainingQty : overrideTarget.quantity) || 0,
        newQty: Number(overrideTarget.remainingQty != null ? overrideTarget.remainingQty : overrideTarget.quantity) || 0,
        reason: `Expired-stock override: ${overrideReason.trim()}`,
        adjustedBy: displayName,
        adjustedById: userId,
        adjustedByRole: userRole,
        notes: `Lot ${overrideTarget.id} marked overridden`,
      }, { $autoCancel: false, requestKey: `override-audit-${overrideTarget.id}` });
      toast.success('Expired lot overridden (authorized). It can now be issued.');
      setOverrideTarget(null); setOverrideReason('');
      fetchAll();
    } catch (err) {
      console.error('override failed', err);
      toast.error('Failed to override lot');
    } finally { setOverriding(false); }
  };

  const handlePrintLot = (l) => {
    if (!l?.barcode) { toast.error('No barcode on this lot'); return; }
    const ok = printLabels([{ barcode: String(l.barcode).trim() }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };
  const handlePrintLeftover = (l) => {
    if (!l?.barcode) { toast.error('No barcode on this lot'); return; }
    const ok = printLabels([{ barcode: String(l.barcode).trim() }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-muted-foreground">Active Lots</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{stats.active}</p></div>
        <div className="bg-card border-2 border-amber-500/30 rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-amber-700 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Expiring ≤{EXPIRY_WARN_DAYS}d</p><p className="text-2xl font-bold text-amber-700 mt-1 notranslate" translate="no">{stats.warning}</p></div>
        <div className="bg-card border-2 border-destructive/40 rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Expired</p><p className="text-2xl font-bold text-destructive mt-1 notranslate" translate="no">{stats.expired}</p></div>
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-muted-foreground">Units on hand</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{stats.remaining}</p></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <div className="flex flex-1 gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by item, barcode, bill, location…" className="pl-9 h-11" />
          </div>
          <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)} className="h-11 rounded-md border-2 border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="all">All</option>
            <option value="warning">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="ok">Fresh</option>
          </select>
        </div>
        <Button onClick={fetchAll} variant="outline" className="h-11 shrink-0"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading lots…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No lots found. Receive goods to create lots.</p>
        </div>
      ) : (
        <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                {['Barcode', 'Item', 'Qty / Left', 'Prepared', 'Expiry', 'Location', 'Bill', 'Status', 'Labels'].map((h) => (
                  <th key={h} className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((l) => {
                const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
                const st = expiryState(l.expiry);
                const isExpired = st === 'expired' && rem > 0 && (l.status === 'active' || l.status === 'overridden');
                return (
                  <tr key={l.id} className={`hover:bg-muted/20 transition-colors align-top ${st === 'expired' && rem > 0 ? 'bg-destructive/5' : ''}`}>
                    <td className="px-4 py-3 font-mono font-bold text-primary text-xs notranslate" translate="no">{l.barcode || '—'}</td>
                    <td className="px-4 py-3 font-bold text-foreground break-words">{itemName(l)}</td>
                    <td className="px-4 py-3 font-mono text-foreground notranslate" translate="no">{l.quantity} / <strong>{rem}</strong></td>
                    <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap notranslate" translate="no">{fmtDateTime(l.preparedAt)}</td>
                    <td className="px-4 py-3"><ExpiryBadge expiry={l.expiry} /><div className="text-[10px] text-muted-foreground mt-0.5 notranslate" translate="no">{fmtDateTime(l.expiry)}</div></td>
                    <td className="px-4 py-3 text-foreground break-words">{locName(l)}</td>
                    <td className="px-4 py-3 text-foreground break-words">{l.supplierBill || (l.expand && l.expand.receipt && l.expand.receipt.billNumber) || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] uppercase">{l.status || 'active'}</Badge>
                      {isExpired && (
                        <button onClick={() => { setOverrideTarget(l); setOverrideReason(''); }} className="ml-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 hover:bg-amber-200" title="Authorize override of expired stock">
                          <ShieldCheck className="h-3 w-3 inline mr-0.5" />Override
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handlePrintLot(l)} className="text-primary hover:bg-primary/10 rounded p-1.5" title="Print lot label"><Printer className="h-4 w-4" /></button>
                        <button onClick={() => handlePrintLeftover(l)} className="text-secondary-foreground/80 hover:bg-secondary/20 rounded p-1.5" title="Print leftover label"><PackageX className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!overrideTarget} onOpenChange={(o) => { if (!o && !overriding) { setOverrideTarget(null); setOverrideReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> Override expired lot?</DialogTitle>
            <DialogDescription>
              This lot is past its expiry. Issuing expired stock is blocked by default. An authorized override records your reason and the responsible user in the audit trail, then allows this lot to be issued.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {overrideTarget && `${itemName(overrideTarget)} · ${fmtDate(overrideTarget.expiry)}`}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-primary">Override reason (required) *</label>
              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Manager approved use after visual check" className="h-11" />
            </div>
            <p className="text-xs text-muted-foreground">Override recorded by <strong>{displayName}</strong> ({userRole}).</p>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setOverrideTarget(null); setOverrideReason(''); }} disabled={overriding}>Cancel</Button>
            <Button onClick={handleOverride} disabled={overriding || !overrideReason.trim()} className="bg-amber-600 text-white hover:bg-amber-700">
              {overriding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Authorize override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
