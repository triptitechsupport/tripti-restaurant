import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Truck, Plus, Trash2, Loader2, Upload, Download, FileSpreadsheet, ScanLine, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { parseCsv, downloadCsv, recordsToCsv } from '@/lib/csvUtils.js';
import { goodsInExportColumns, parseGoodsInRow } from '@/lib/goodsInCsv.js';
import { validateNumericBarcode, generateNumericBarcode, generateUniqueNumericBarcode, collectTakenBarcodes, toDatetimeLocalValue, fromDatetimeLocalValue, validatePrepExpiry } from '@/lib/barcodeUtils.js';
import BarcodeScanner from '@/components/BarcodeScanner.jsx';

const emptyLine = () => ({ barcode: '', itemId: '', itemName: '', quantity: '', expiry: '', preparedAt: '', unitCost: '', locationId: '', perishable: false, notes: '' });

export default function StockGoodsIn({ pb: pbProp, displayName, userId, userRole }) {
  const pbClient = pbProp || pb;
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Receipt header
  const [header, setHeader] = useState({ billNumber: '', supplier: '', billDate: new Date().toISOString().slice(0, 10), notes: '' });
  // Manual lines
  const [lines, setLines] = useState([emptyLine()]);

  // CSV preview
  const [csvPreview, setCsvPreview] = useState(null); // { rows, errors, validCount }
  const [importing, setImporting] = useState(false);

  // Barcode scanner
  const [scanFor, setScanFor] = useState(null); // line index
  const fileRef = useRef(null);

  const fetchMeta = useCallback(async () => {
    try {
      const [i, l] = await Promise.all([
        pbClient.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
        pbClient.collection('stock_locations').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
      ]);
      setItems(i); setLocations(l);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('load meta failed', err);
      toast.error('Failed to load items/locations');
    } finally { setLoading(false); }
  }, [pbClient]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const locPath = useMemo(() => {
    const m = {};
    locations.forEach((l) => { m[l.id] = l; });
    const path = (id) => { const l = m[id]; if (!l) return ''; if (!l.parent) return l.name; return `${path(l.parent)} → ${l.name}`; };
    return path;
  }, [locations]);

  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const onItemSelect = (idx, itemId) => {
    const it = items.find((i) => i.id === itemId);
    updateLine(idx, {
      itemId,
      itemName: it ? it.name : '',
      perishable: !!(it && it.perishable),
      preparedAt: it && it.preparedAt ? toDatetimeLocalValue(it.preparedAt) : toDatetimeLocalValue(new Date().toISOString()),
      expiry: it && it.expiry ? toDatetimeLocalValue(it.expiry) : '',
    });
  };

  const handleScanDetected = (val) => {
    if (scanFor == null) return;
    updateLine(scanFor, { barcode: val });
    toast.success(`Barcode captured: ${val}`);
    setScanFor(null);
  };

  // ---- CSV import ----
  const handleCsvFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { rows } = parseCsv(text);
      const parsed = rows.map((r) => parseGoodsInRow(r));
      const validRows = parsed.filter((p) => p.errors.length === 0).map((p) => p.line);
      setCsvPreview({ rows: parsed, validCount: validRows.length, totalCount: parsed.length });
      if (validRows.length === 0) toast.error('No valid rows in CSV. Check the column format.');
      else toast.info(`${validRows.length} of ${parsed.length} rows valid. Review and import.`);
    } catch (err) {
      console.error('csv parse failed', err);
      toast.error('Failed to read CSV file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const sample = [{ barcode: '4006381333931', itemName: 'Basmati Rice 5kg', quantity: '10', expiry: '', unitCost: '6.50', locationName: 'Dry Store', perishable: 'false', supplierBill: 'INV-1001', notes: '' }];
    downloadCsv('goods_in_template.csv', recordsToCsv(sample, goodsInExportColumns));
  };

  const cancelCsv = () => setCsvPreview(null);

  const commitCsv = async () => {
    if (!csvPreview) return;
    const validLines = csvPreview.rows.filter((p) => p.errors.length === 0).map((p) => p.line);
    if (validLines.length === 0) { toast.error('No valid rows to import'); return; }
    setImporting(true);
    try {
      const billNumber = header.billNumber || `CSV-${Date.now()}`;
      const receipt = await pbClient.collection('stock_receipts').create({
        billNumber, supplier: header.supplier, billDate: header.billDate || new Date().toISOString().slice(0, 10),
        notes: `CSV import — ${validLines.length} lines. ${header.notes || ''}`.trim(),
        receivedBy: displayName, receivedById: userId, receivedByRole: userRole,
      }, { $autoCancel: false, requestKey: 'csv-receipt' });
      let created = 0;
      for (const ln of validLines) {
        // Match item by name (case-insensitive); create if missing.
        let item = items.find((i) => i.name.toLowerCase() === ln.itemName.toLowerCase());
        if (!item) {
          item = await pbClient.collection('stock_items').create({
            name: ln.itemName, category: '', unit: '', quantity: 0, minStock: 0,
            barcode: ln.barcode || '', perishable: ln.perishable, unitCost: ln.unitCost ?? null, notes: '',
          }, { $autoCancel: false, requestKey: `csv-item-${ln.itemName}` });
          setItems((prev) => [...prev, item]);
        }
        const loc = ln.locationName ? locations.find((l) => l.name.toLowerCase() === ln.locationName.toLowerCase()) : null;
        await createLotAndAdjust(pbClient, {
          itemId: item.id, itemName: item.name, barcode: ln.barcode, quantity: Number(ln.quantity),
          expiry: ln.expiry || null, unitCost: ln.unitCost ?? null, locationId: loc ? loc.id : null,
          perishable: ln.perishable, supplierBill: ln.supplierBill || billNumber, receiptId: receipt.id,
          notes: ln.notes, displayName, userId, userRole,
        });
        created += 1;
      }
      toast.success(`Imported ${created} lot(s) against bill ${billNumber}.`);
      setCsvPreview(null);
      setHeader({ billNumber: '', supplier: '', billDate: new Date().toISOString().slice(0, 10), notes: '' });
    } catch (err) {
      console.error('csv import failed', err);
      toast.error('CSV import failed: ' + (err.message || 'unknown error'));
    } finally { setImporting(false); }
  };

  // ---- Manual submit ----
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (valid.length === 0) { toast.error('Add at least one valid line (item + quantity).'); return; }
    // Validate barcodes + expiry for perishables.
    for (const l of valid) {
      const bc = validateNumericBarcode(l.barcode);
      if (!bc.ok) { toast.error(`Barcode error: ${bc.error}`); return; }
      if (l.perishable && !l.expiry) { toast.error(`Expiry is required for perishable item "${l.itemName}".`); return; }
      const prepIso = fromDatetimeLocalValue(l.preparedAt);
      const expIso = fromDatetimeLocalValue(l.expiry);
      if (prepIso && expIso) {
        const pe = validatePrepExpiry(prepIso, expIso);
        if (!pe.ok) { toast.error(`${l.itemName}: ${pe.error}`); return; }
      }
    }
    setSaving(true);
    try {
      const receipt = await pbClient.collection('stock_receipts').create({
        billNumber: header.billNumber || `GRN-${Date.now()}`,
        supplier: header.supplier, billDate: header.billDate || new Date().toISOString().slice(0, 10),
        notes: header.notes, receivedBy: displayName, receivedById: userId, receivedByRole: userRole,
      }, { $autoCancel: false, requestKey: 'manual-receipt' });
      for (let i = 0; i < valid.length; i++) {
        const l = valid[i];
        const prepIso = fromDatetimeLocalValue(l.preparedAt) || new Date().toISOString();
        const expIso = fromDatetimeLocalValue(l.expiry) || null;
        await createLotAndAdjust(pbClient, {
          itemId: l.itemId, itemName: l.itemName, barcode: l.barcode, quantity: Number(l.quantity),
          expiry: expIso, preparedAt: prepIso,
          unitCost: l.unitCost ? Number(l.unitCost) : null,
          locationId: l.locationId || null, perishable: !!l.perishable,
          supplierBill: header.billNumber || '', receiptId: receipt.id, notes: l.notes,
          displayName, userId, userRole,
        }, `m-${i}`);
      }
      toast.success(`Received ${valid.length} lot(s) against bill ${header.billNumber || 'GRN'}.`);
      setLines([emptyLine()]);
      setHeader((h) => ({ ...h, billNumber: '', notes: '' }));
    } catch (err) {
      console.error('goods-in failed', err);
      toast.error('Goods-in failed: ' + (err.message || 'unknown error'));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>;

  return (
    <section className="space-y-4">
      <div className="bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <h3 className="font-serif font-bold text-primary text-lg flex items-center gap-2"><Truck className="h-5 w-5" /> Receive Goods (Goods-In)</h3>
        <p className="text-xs text-muted-foreground">Receive stock against a supplier bill. Each line creates a lot with its own quantity, expiry, location, and numeric barcode. Expiry is required for perishable items.</p>
      </div>

      {/* CSV import / export */}
      <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-serif font-bold text-primary flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> CSV Import / Export</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Bulk-receive from a supplier bill CSV. Columns: Barcode, Item Name, Quantity, Expiry, Unit Cost, Location, Perishable, Supplier Bill, Notes.</p>
          </div>
          <div className="sm:ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="h-9"><Download className="h-4 w-4 mr-1.5" /> Template</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-9"><Upload className="h-4 w-4 mr-1.5" /> Import CSV</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
          </div>
        </div>

        {csvPreview && (
          <div className="mt-4 border-2 border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <span className="text-sm font-bold text-foreground">Preview — {csvPreview.validCount}/{csvPreview.totalCount} valid rows</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={cancelCsv} disabled={importing} className="h-8"><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                <Button size="sm" onClick={commitCsv} disabled={importing || csvPreview.validCount === 0} className="h-8">{importing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Import {csvPreview.validCount} rows</Button>
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-muted/30 sticky top-0">{['Barcode', 'Item', 'Qty', 'Expiry', 'Cost', 'Location', 'Status'].map((h) => <th key={h} className="text-left font-semibold text-muted-foreground px-3 py-2 border-b border-border">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border/50">
                  {csvPreview.rows.map((p, i) => (
                    <tr key={i} className={p.errors.length ? 'bg-destructive/5' : ''}>
                      <td className="px-3 py-2 font-mono notranslate" translate="no">{p.line.barcode || '—'}</td>
                      <td className="px-3 py-2 break-words">{p.line.itemName}</td>
                      <td className="px-3 py-2 notranslate" translate="no">{p.line.quantity}</td>
                      <td className="px-3 py-2 notranslate" translate="no">{p.line.expiry || '—'}</td>
                      <td className="px-3 py-2 notranslate" translate="no">{p.line.unitCost ?? '—'}</td>
                      <td className="px-3 py-2 break-words">{p.line.locationName || '—'}</td>
                      <td className="px-3 py-2">{p.errors.length ? <span className="text-destructive font-medium">{p.errors[0]}</span> : <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">OK</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Manual entry form */}
      <form onSubmit={handleManualSubmit} className="bg-card border-2 border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-sm">Supplier Bill No.</Label>
            <Input value={header.billNumber} onChange={(e) => setHeader((h) => ({ ...h, billNumber: e.target.value }))} className="h-11" placeholder="INV-1001" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-sm">Supplier</Label>
            <Input value={header.supplier} onChange={(e) => setHeader((h) => ({ ...h, supplier: e.target.value }))} className="h-11" placeholder="Supplier name" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-sm">Bill Date</Label>
            <Input type="date" value={header.billDate} onChange={(e) => setHeader((h) => ({ ...h, billDate: e.target.value }))} className="h-11" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-serif font-bold text-primary">Line Items (one lot per line)</h4>
            <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-9"><Plus className="h-4 w-4 mr-1" /> Add line</Button>
          </div>
          <div className="space-y-3">
            {lines.map((l, idx) => (
              <div key={idx} className="border-2 border-border rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/10">
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs font-bold text-muted-foreground">Item *</Label>
                  <select value={l.itemId} onChange={(e) => onItemSelect(idx, e.target.value)} className="w-full h-10 rounded-md border-2 border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select item…</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Barcode (numeric)</Label>
                  <div className="flex gap-1">
                    <Input value={l.barcode} onChange={(e) => updateLine(idx, { barcode: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className="h-10 font-mono" placeholder="digits only" />
                    <Button type="button" size="sm" variant="outline" onClick={() => setScanFor(idx)} className="h-10 px-2 shrink-0" title="Scan with camera"><ScanLine className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => updateLine(idx, { barcode: generateNumericBarcode() })} className="h-10 px-2 shrink-0" title="Generate"><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Quantity *</Label>
                  <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Expiry {l.perishable ? '*' : '(optional)'}</Label>
                  <Input type="datetime-local" value={l.expiry} onChange={(e) => updateLine(idx, { expiry: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Prepared (date &amp; time)</Label>
                  <Input type="datetime-local" value={l.preparedAt} onChange={(e) => updateLine(idx, { preparedAt: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Unit Cost</Label>
                  <Input type="number" min="0" step="any" value={l.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Location</Label>
                  <select value={l.locationId} onChange={(e) => updateLine(idx, { locationId: e.target.value })} className="w-full h-10 rounded-md border-2 border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">— None —</option>
                    {locations.map((loc) => <option key={loc.id} value={loc.id}>{locPath(loc.id)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pb-2">
                    <input type="checkbox" checked={l.perishable} onChange={(e) => updateLine(idx, { perishable: e.target.checked })} className="h-4 w-4 rounded border-border accent-primary" /> Perishable
                  </label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(idx)} className="h-9 text-destructive hover:bg-destructive/10 ml-auto" disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-bold text-primary text-sm">Receipt Notes</Label>
          <Input value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} className="h-11" placeholder="Optional notes about this delivery" />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="h-11 shadow-md">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Truck className="h-4 w-4 mr-2" />}
            {saving ? 'Receiving…' : 'Receive Goods'}
          </Button>
        </div>
      </form>

      {scanFor != null && (
        <BarcodeScanner onDetected={handleScanDetected} onClose={() => setScanFor(null)} label="Scan item barcode" />
      )}
    </section>
  );
}

// Shared helper: create a lot, bump stock_items.quantity, and log an audit
// adjustment (initial/restock). No silent edits — every change is recorded.
export async function createLotAndAdjust(pbClient, opts, keySuffix = '') {
  const { itemId, itemName, barcode, quantity, expiry, preparedAt, unitCost, locationId, perishable, supplierBill, receiptId, notes, displayName, userId, userRole } = opts;
  // Fetch current item quantity for audit previousQty.
  let prevQty = 0;
  try {
    const item = await pbClient.collection('stock_items').getOne(itemId, { $autoCancel: false, requestKey: `gi-item-${itemId}-${keySuffix}` });
    prevQty = Number(item.quantity) || 0;
  } catch (_) { /* ignore */ }
  const lot = await pbClient.collection('stock_lots').create({
    barcode: barcode || '',
    stockItem: itemId,
    receipt: receiptId || null,
    quantity,
    remainingQty: quantity,
    expiry: expiry || null,
    preparedAt: preparedAt || null,
    location: locationId || null,
    supplierBill: supplierBill || '',
    unitCost: unitCost ?? null,
    perishable: !!perishable,
    status: 'active',
    receivedDate: new Date().toISOString().slice(0, 10),
    notes: notes || '',
  }, { $autoCancel: false, requestKey: `gi-lot-${itemId}-${keySuffix}` });
  // Bump aggregate stock level.
  const newQty = prevQty + quantity;
  // The latest purchase price becomes the item's price (used for recipe costs).
  const price = Number(unitCost);
  await pbClient.collection('stock_items').update(itemId, { quantity: newQty, ...(unitCost != null && unitCost !== '' && price > 0 ? { unitCost: price } : {}) }, { $autoCancel: false, requestKey: `gi-item-up-${itemId}-${keySuffix}` });
  // Audit trail.
  await pbClient.collection('stock_adjustments').create({
    stockItem: itemId,
    itemName,
    adjustmentType: 'restock',
    delta: quantity,
    previousQty: prevQty,
    newQty,
    reason: `Goods-in against bill ${supplierBill || '—'}`,
    adjustedBy: displayName,
    adjustedById: userId,
    adjustedByRole: userRole,
    notes: `Lot ${lot.id}${notes ? ' — ' + notes : ''}`,
  }, { $autoCancel: false, requestKey: `gi-adj-${itemId}-${keySuffix}` });
  return lot;
}
