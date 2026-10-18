import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, ScanLine, Loader2, AlertTriangle, ShieldCheck, CheckCircle2, ArrowRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { allocateFifo, expiryState, daysUntilExpiry } from '@/lib/stockFifo.js';
import BarcodeScanner from '@/components/BarcodeScanner.jsx';

function fmtDate(v) { return v ? String(v).slice(0, 10) : '—'; }

export default function StockIssue({ pb, displayName, userId, userRole }) {
  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1=staff, 2=item, 3=qty/confirm
  const [staffId, setStaffId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState('');
  const [allowExpired, setAllowExpired] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [lastIssue, setLastIssue] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [i, l] = await Promise.all([
        pb.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
        pb.collection('stock_lots').getFullList({ sort: 'expiry,-created', expand: 'location', $autoCancel: false, requestKey: null }),
      ]);
      setItems(i); setLots(l);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('load issue data failed', err);
      toast.error('Failed to load stock data');
    } finally { setLoading(false); }
  }, [pb]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const itemLots = useMemo(() => lots.filter((l) => l.stockItem === selectedItemId), [lots, selectedItemId]);
  const selectedItem = useMemo(() => items.find((i) => i.id === selectedItemId), [items, selectedItemId]);

  const allocation = useMemo(() => {
    if (!selectedItemId || !qty) return null;
    const needed = Number(qty);
    if (!Number.isFinite(needed) || needed <= 0) return null;
    return allocateFifo(itemLots, needed, { allowExpired });
  }, [itemLots, qty, allowExpired, selectedItemId]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => !q || String(i.name || '').toLowerCase().includes(q) || String(i.barcode || '').includes(q));
  }, [items, search]);

  const handleScanDetected = (val) => {
    // Match by barcode on items first, then on lots.
    const byItem = items.find((i) => String(i.barcode || '') === val);
    if (byItem) { setSelectedItemId(byItem.id); setStep(3); setScanOpen(false); toast.success(`Item: ${byItem.name}`); return; }
    const byLot = lots.find((l) => String(l.barcode || '') === val);
    if (byLot) { setSelectedItemId(byLot.stockItem); setStep(3); setScanOpen(false); toast.success(`Lot item found`); return; }
    toast.error(`No item/lot found for barcode ${val}`);
    setScanOpen(false);
  };

  const confirmStaff = (e) => {
    e.preventDefault();
    if (!staffId.trim()) { toast.error('Staff ID is required before issuing stock.'); return; }
    setStep(2);
  };

  const selectItem = (id) => { setSelectedItemId(id); setQty(''); setAllowExpired(false); setStep(3); };

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!allocation || allocation.short > 0) { toast.error('Not enough stock to issue (check expired lots / override).'); return; }
    if (allocation.blocked > 0 && !allowExpired) { toast.error(`${allocation.blocked} units are in expired lots. Authorize override to issue them.`); return; }
    setIssuing(true);
    try {
      let prevTotal = Number(selectedItem.quantity) || 0;
      for (const a of allocation.allocations) {
        const lot = a.lot;
        const rem = Number(lot.remainingQty != null ? lot.remainingQty : lot.quantity) || 0;
        const newRem = Math.max(0, rem - a.qty);
        await pb.collection('stock_lots').update(lot.id, { remainingQty: newRem }, { $autoCancel: false, requestKey: `issue-lot-${lot.id}` });
        // Issue record (append-only).
        await pb.collection('stock_issues').create({
          staffId: staffId.trim(),
          staffName: staffName.trim() || staffId.trim(),
          stockItem: selectedItemId,
          lot: lot.id,
          quantity: a.qty,
          issueDate: new Date().toISOString(),
          location: lot.location || null,
          issuedByRole: userRole,
          notes: allowExpired ? 'Expired-stock override authorized' : '',
        }, { $autoCancel: false, requestKey: `issue-rec-${lot.id}` });
        // Audit adjustment.
        const newTotal = Math.max(0, prevTotal - a.qty);
        await pb.collection('stock_items').update(selectedItemId, { quantity: newTotal }, { $autoCancel: false, requestKey: `issue-item-${selectedItemId}-${lot.id}` });
        await pb.collection('stock_adjustments').create({
          stockItem: selectedItemId,
          itemName: selectedItem.name,
          adjustmentType: 'correction',
          delta: -a.qty,
          previousQty: prevTotal,
          newQty: newTotal,
          reason: `Issue to staff ${staffId.trim()}${allowExpired ? ' (expired override)' : ''}`,
          adjustedBy: displayName,
          adjustedById: userId,
          adjustedByRole: userRole,
          notes: `Lot ${lot.id} · exp ${fmtDate(lot.expiry)}`,
        }, { $autoCancel: false, requestKey: `issue-adj-${lot.id}` });
        prevTotal = newTotal;
      }
      toast.success(`Issued ${qty} × ${selectedItem.name} to ${staffId.trim()}.`);
      setLastIssue({ qty: Number(qty), item: selectedItem.name, staff: staffId.trim() });
      // Reset to item selection for the next issue, keep staff.
      setStep(2); setSelectedItemId(''); setQty(''); setAllowExpired(false);
      fetchAll();
    } catch (err) {
      console.error('issue failed', err);
      toast.error('Issue failed: ' + (err.message || 'unknown error'));
    } finally { setIssuing(false); }
  };

  const resetAll = () => { setStep(1); setStaffId(''); setStaffName(''); setSelectedItemId(''); setQty(''); setAllowExpired(false); setLastIssue(null); };

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading stock…</div>;

  return (
    <section className="space-y-4">
      <div className="bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <h3 className="font-serif font-bold text-primary text-lg flex items-center gap-2"><Package className="h-5 w-5" /> Issue Stock (FIFO)</h3>
        <p className="text-xs text-muted-foreground">Flow: Staff ID → scan/select item → enter quantity. Earliest-expiring lots are issued first. Expired stock is blocked unless an authorized override is given.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs font-bold">
        {['Staff ID', 'Select Item', 'Quantity & Confirm'].map((s, i) => (
          <React.Fragment key={s}>
            <span className={`px-3 py-1.5 rounded-full ${step >= i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}. {s}</span>
            {i < 2 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </React.Fragment>
        ))}
      </div>

      {lastIssue && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Last issue: <strong>{lastIssue.qty} × {lastIssue.item}</strong> to <strong>{lastIssue.staff}</strong>.
        </div>
      )}

      {/* Step 1: Staff ID */}
      {step === 1 && (
        <form onSubmit={confirmStaff} className="bg-card border-2 border-border rounded-2xl p-5 shadow-sm space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-sm">Staff ID *</Label>
            <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-12 text-base" placeholder="Enter staff ID first" autoFocus required />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-sm">Staff Name (optional)</Label>
            <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} className="h-11" placeholder="Optional" />
          </div>
          <Button type="submit" className="h-11 w-full shadow-md">Continue to item selection <ArrowRight className="h-4 w-4 ml-2" /></Button>
        </form>
      )}

      {/* Step 2: Select item */}
      {step === 2 && (
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">Issuing as <strong className="text-foreground">{staffId}</strong></div>
            <Button variant="ghost" size="sm" onClick={resetAll} className="h-8 text-destructive">Change staff</Button>
          </div>
          <div className="flex gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item by name or barcode…" className="h-11" />
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)} className="h-11 px-3 shrink-0"><ScanLine className="h-5 w-5" /></Button>
          </div>
          <div className="max-h-[360px] overflow-y-auto border-2 border-border rounded-xl divide-y divide-border/50">
            {filteredItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items found.</p>
            ) : filteredItems.map((it) => (
              <button key={it.id} onClick={() => selectItem(it.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-foreground truncate">{it.name}</div>
                  <div className="text-xs text-muted-foreground font-mono notranslate" translate="no">{it.barcode || 'no barcode'} · on hand {Number(it.quantity) || 0}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Qty + FIFO confirm */}
      {step === 3 && selectedItem && (
        <form onSubmit={handleIssue} className="bg-card border-2 border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Issuing to <strong className="text-foreground">{staffId}</strong></div>
              <div className="text-lg font-serif font-bold text-primary">{selectedItem.name}</div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)} className="h-8">Pick different item</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">Quantity to issue *</Label>
              <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="h-12 text-base" autoFocus required />
            </div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer pb-2">
                <input type="checkbox" checked={allowExpired} onChange={(e) => setAllowExpired(e.target.checked)} className="h-4 w-4 rounded border-border accent-amber-600" />
                <ShieldCheck className="h-4 w-4 text-amber-600" /> Allow expired (authorized override)
              </label>
            </div>
          </div>

          {/* FIFO allocation preview */}
          {allocation && (
            <div className="rounded-xl border-2 border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-bold text-foreground flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-primary" /> FIFO Allocation (earliest expiry first)</div>
              <div className="divide-y divide-border/50">
                {allocation.allocations.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No usable lots.</p>}
                {allocation.allocations.map((a) => {
                  const st = expiryState(a.lot.expiry);
                  return (
                    <div key={a.lot.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-muted-foreground notranslate" translate="no">{a.lot.barcode || '—'}</span>
                      <span className="text-foreground">Take <strong>{a.qty}</strong> of {a.lot.remainingQty ?? a.lot.quantity}</span>
                      <span className="text-muted-foreground notranslate" translate="no">exp {fmtDate(a.lot.expiry)}</span>
                      {st === 'expired' && <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">expired</Badge>}
                      {st === 'warning' && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">{daysUntilExpiry(a.lot.expiry)}d</Badge>}
                    </div>
                  );
                })}
              </div>
              {(allocation.short > 0 || allocation.blocked > 0) && (
                <div className="px-3 py-2 bg-destructive/5 border-t border-border text-xs text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {allocation.short > 0 && <span>Short by {allocation.short} units. </span>}
                  {allocation.blocked > 0 && <span>{allocation.blocked} units blocked in expired lots — authorize override to use.</span>}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)} className="h-11">Back</Button>
            <Button type="submit" disabled={issuing || !allocation || allocation.short > 0 || (allocation.blocked > 0 && !allowExpired)} className="h-11 shadow-md">
              {issuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
              {issuing ? 'Issuing…' : 'Confirm & Issue'}
            </Button>
          </div>
        </form>
      )}

      {scanOpen && <BarcodeScanner onDetected={handleScanDetected} onClose={() => setScanOpen(false)} label="Scan item / lot barcode" />}
    </section>
  );
}
