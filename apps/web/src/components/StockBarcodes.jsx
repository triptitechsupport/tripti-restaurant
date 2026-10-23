import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Barcode, Printer, ScanLine, Loader2, Search, RefreshCw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { renderBarcodeToCanvas, printLabels, generateUniqueNumericBarcode, collectTakenBarcodes, lookupBarcode } from '@/lib/barcodeUtils.js';
import BarcodeScanner from '@/components/BarcodeScanner.jsx';

export default function StockBarcodes({ pb }) {
  const [lots, setLots] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const previewRefs = useRef({});

  const fetchAll = useCallback(async () => {
    try {
      const [l, i, loc] = await Promise.all([
        pb.collection('stock_lots').getFullList({ sort: '-created', expand: 'stockItem,location', $autoCancel: false, requestKey: null }),
        pb.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
        pb.collection('stock_locations').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
      ]);
      setLots(l); setItems(i); setLocations(loc);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('load barcodes failed', err);
      toast.error('Failed to load data');
    } finally { setLoading(false); }
  }, [pb]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Render barcode previews for visible lots and items.
  useEffect(() => {
    lots.forEach((l) => {
      const canvas = previewRefs.current[l.id];
      if (canvas && l.barcode) renderBarcodeToCanvas(canvas, l.barcode, { height: 40, fontSize: 11, width: 2 });
    });
    items.forEach((it) => {
      const canvas = previewRefs.current[`item-${it.id}`];
      if (canvas && it.barcode) renderBarcodeToCanvas(canvas, it.barcode, { height: 36, fontSize: 10, width: 2 });
    });
  }, [lots, items]);

  const itemName = useCallback((lot) => {
    const ex = lot.expand && lot.expand.stockItem;
    return (ex && ex.name) || lot.itemName || '—';
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lots.filter((l) => !q || [itemName(l), l.barcode, l.supplierBill].join(' ').toLowerCase().includes(q));
  }, [lots, search, itemName]);

  const coverage = useMemo(() => {
    const withBc = lots.filter((l) => l.barcode).length;
    return { total: lots.length, withBc, pct: lots.length ? Math.round((withBc / lots.length) * 100) : 0 };
  }, [lots]);

  const fmtDt = (v) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (_) { return String(v); }
  };

  const handleScanDetected = async (val) => {
    setScanOpen(false);
    try {
      const result = await lookupBarcode(pb, val);
      if (result.error && !result.item && !(result.lots && result.lots.length)) {
        setScanResult({ type: 'notfound', value: result.barcode || val, detail: null });
        toast.error(result.error || `No lot/item matches barcode ${val}`);
        return;
      }
      const it = result.item;
      const lot = result.lot;
      const loc = lot && lot.expand && lot.expand.location;
      setScanResult({
        type: it ? 'item' : 'lot',
        value: result.barcode || val,
        label: (it && it.name) || itemName(lot) || 'Match',
        id: (it && it.id) || (lot && lot.id),
        detail: {
          name: (it && it.name) || itemName(lot) || '—',
          quantity: it ? (Number(it.quantity) || 0) : (Number(lot?.remainingQty ?? lot?.quantity) || 0),
          unit: (it && it.unit) || '',
          category: (it && it.category) || '',
          preparedAt: (it && it.preparedAt) || (lot && lot.preparedAt) || null,
          expiry: (it && it.expiry) || (lot && lot.expiry) || null,
          location: (loc && (loc.path || loc.name)) || '—',
          lotBarcode: lot && lot.barcode,
          lotRemaining: lot != null ? (Number(lot.remainingQty != null ? lot.remainingQty : lot.quantity) || 0) : null,
          lotStatus: lot && lot.status,
          supplierBill: lot && lot.supplierBill,
          lotsCount: (result.lots || []).length,
        },
      });
      toast.success(`Found: ${(it && it.name) || itemName(lot)}`);
    } catch (err) {
      console.error('Barcode lookup failed', err);
      setScanResult({ type: 'notfound', value: val, detail: null });
      toast.error('Barcode lookup failed');
    }
  };

  const printLot = (l) => {
    if (!l?.barcode) { toast.error('No barcode on this lot'); return; }
    const ok = printLabels([{ barcode: String(l.barcode).trim() }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };
  const printAllFiltered = () => {
    const withBc = filtered.filter((l) => l.barcode);
    if (withBc.length === 0) { toast.info('No barcoded lots to print'); return; }
    printLabels(withBc.map((l) => ({ barcode: String(l.barcode).trim() })), { title: 'Barcode' });
  };
  const printAllLocations = () => {
    if (locations.length === 0) { toast.info('No locations to print'); return; }
    // Location labels still use a printable code derived from name when no numeric barcode exists.
    printLabels(locations.map((l) => ({ barcode: String(l.barcode || l.name || '').replace(/\s+/g, '') })), { title: 'Barcode' });
  };

  const printItem = (it) => {
    if (!it?.barcode) { toast.error('No barcode assigned'); return; }
    const ok = printLabels([{ barcode: String(it.barcode).trim() }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };

  const assignBarcode = async (lot) => {
    const taken = collectTakenBarcodes(items, lots, { lotId: lot.id });
    const bc = generateUniqueNumericBarcode(taken);
    try {
      await pb.collection('stock_lots').update(lot.id, { barcode: bc }, { $autoCancel: false, requestKey: `bc-assign-${lot.id}` });
      toast.success(`Barcode ${bc} assigned`);
      fetchAll();
    } catch (err) { console.error(err); toast.error('Failed to assign barcode'); }
  };

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>;

  return (
    <section className="space-y-4">
      <div className="bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <h3 className="font-serif font-bold text-primary text-lg flex items-center gap-2"><Barcode className="h-5 w-5" /> Barcodes & Labels</h3>
        <p className="text-xs text-muted-foreground">Print numeric barcodes and location/lot/leftover labels. Scan with the device camera (falls back to manual entry when camera is unavailable).</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-muted-foreground">Lots</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{coverage.total}</p></div>
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-muted-foreground">With barcode</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{coverage.withBc} <span className="text-sm text-muted-foreground">({coverage.pct}%)</span></p></div>
        <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm flex items-center gap-2">
          <Button onClick={() => setScanOpen(true)} className="h-11 flex-1 shadow-md"><ScanLine className="h-5 w-5 mr-2" /> Scan barcode</Button>
        </div>
      </div>

      {scanResult && (
        <div className={`rounded-xl px-4 py-3 text-sm ${scanResult.type === 'notfound' ? 'bg-destructive/10 border border-destructive/30 text-destructive' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-900'}`}>
          {scanResult.type === 'notfound' ? (
            <div className="flex items-center gap-2"><Search className="h-4 w-4 shrink-0" /> No match for <span className="font-mono font-bold notranslate" translate="no">{scanResult.value}</span></div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <Package className="h-4 w-4 shrink-0" />
                <span>{scanResult.detail?.name || scanResult.label}</span>
                <span className="font-mono font-normal text-xs notranslate" translate="no">({scanResult.value})</span>
              </div>
              {scanResult.detail && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground">
                  <div>On hand: <strong className="notranslate" translate="no">{scanResult.detail.quantity}</strong>{scanResult.detail.unit ? ` ${scanResult.detail.unit}` : ''}</div>
                  {scanResult.detail.category ? <div>Category: <strong>{scanResult.detail.category}</strong></div> : null}
                  <div>Prepared: <strong className="notranslate" translate="no">{fmtDt(scanResult.detail.preparedAt)}</strong></div>
                  <div>Expiry: <strong className="notranslate" translate="no">{fmtDt(scanResult.detail.expiry)}</strong></div>
                  {scanResult.detail.location && scanResult.detail.location !== '—' ? <div>Location: <strong>{scanResult.detail.location}</strong></div> : null}
                  {scanResult.detail.lotRemaining != null ? <div>Lot remaining: <strong className="notranslate" translate="no">{scanResult.detail.lotRemaining}</strong>{scanResult.detail.lotStatus ? ` (${scanResult.detail.lotStatus})` : ''}</div> : null}
                  {scanResult.detail.supplierBill ? <div>Bill: <strong>{scanResult.detail.supplierBill}</strong></div> : null}
                  {scanResult.detail.lotsCount > 1 ? <div>Matching lots: <strong className="notranslate" translate="no">{scanResult.detail.lotsCount}</strong></div> : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lots by item, barcode, bill…" className="pl-9 h-11" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printAllLocations} className="h-11 flex-1 sm:flex-none"><Printer className="h-4 w-4 mr-2" /> All location labels</Button>
          <Button variant="outline" onClick={printAllFiltered} className="h-11 flex-1 sm:flex-none"><Printer className="h-4 w-4 mr-2" /> Print filtered</Button>
          <Button onClick={fetchAll} variant="ghost" className="h-11" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Barcode className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No lots yet. Receive goods to create barcoded lots.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((l) => (
            <div key={l.id} className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-foreground text-sm truncate">{itemName(l)}</div>
                  <div className="text-xs text-muted-foreground notranslate" translate="no">Left: {l.remainingQty ?? l.quantity} / {l.quantity}</div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase shrink-0">{l.status || 'active'}</Badge>
              </div>
              {l.barcode ? (
                <div className="bg-white rounded-lg p-2 flex items-center justify-center min-h-[64px]">
                  <canvas ref={(el) => { previewRefs.current[l.id] = el; }} width={240} height={56} />
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-border p-3 text-center text-xs text-muted-foreground">No barcode assigned</div>
              )}
              <div className="flex items-center gap-2 mt-1">
                {l.barcode ? (
                  <Button size="sm" variant="outline" onClick={() => printLot(l)} className="h-9 flex-1"><Printer className="h-4 w-4 mr-1.5" /> Print label</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => assignBarcode(l)} className="h-9 flex-1"><Barcode className="h-4 w-4 mr-1.5" /> Assign barcode</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => assignBarcode(l)} className="h-9 px-2 shrink-0" title="Generate new barcode"><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item-level barcodes */}
      <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm">
        <h4 className="text-sm font-serif font-bold text-primary flex items-center gap-2"><Package className="h-4 w-4" /> Item Barcodes</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Print or regenerate the numeric barcode assigned to each stock item (with prep &amp; expiry).</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No stock items yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {items.map((it) => (
              <div key={it.id} className="border-2 border-border rounded-xl p-3 flex flex-col gap-2 bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-foreground text-sm truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground notranslate" translate="no">{it.barcode || 'No barcode'}</div>
                  </div>
                </div>
                {it.barcode ? (
                  <div className="bg-white rounded-lg p-1.5 flex items-center justify-center min-h-[52px]">
                    <canvas ref={(el) => { previewRefs.current[`item-${it.id}`] = el; }} width={220} height={48} />
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">No barcode assigned</div>
                )}
                <div className="flex items-center gap-2">
                  {it.barcode ? (
                    <Button size="sm" variant="outline" onClick={() => printItem(it)} className="h-8 flex-1"><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const taken = collectTakenBarcodes(items, lots, { itemId: it.id });
                    const bc = generateUniqueNumericBarcode(taken);
                    try {
                      await pb.collection('stock_items').update(it.id, { barcode: bc }, { $autoCancel: false, requestKey: `bc-item-${it.id}` });
                      toast.success(`Barcode ${bc} assigned`); fetchAll();
                    } catch (err) { console.error(err); toast.error('Failed to assign barcode'); }
                  }} className="h-8 px-2 shrink-0" title="Generate new barcode"><RefreshCw className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {scanOpen && <BarcodeScanner onDetected={handleScanDetected} onClose={() => setScanOpen(false)} label="Scan lot / item barcode" />}
    </section>
  );
}
