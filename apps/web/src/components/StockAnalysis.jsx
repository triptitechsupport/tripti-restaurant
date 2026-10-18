import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes, AlertTriangle, CalendarClock, Trash2, Truck, Package, Barcode,
  MapPin, ShieldCheck, RefreshCw, Loader2, Download, FileJson, TrendingUp, Layers, Inbox,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { recordsToCsv, downloadCsv } from '@/lib/csvUtils.js';
import { expiryState, daysUntilExpiry, EXPIRY_WARN_DAYS } from '@/lib/stockFifo.js';

const PIE_COLORS = ['#8B1538', '#FFC700', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#64748b'];

function fmtEuro(n) { const v = Number(n); return Number.isFinite(v) ? `€${v.toFixed(2)}` : '—'; }
function fmtDate(v) { return v ? String(v).slice(0, 10) : '—'; }
function dayKey(iso) { return iso ? String(iso).slice(0, 10) : null; }

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StockAnalysis() {
  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [waste, setWaste] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [issues, setIssues] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [i, l, w, r, is, a, loc] = await Promise.all([
        pb.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
        pb.collection('stock_lots').getFullList({ sort: '-created', expand: 'stockItem,location,receipt', $autoCancel: false, requestKey: null }),
        pb.collection('waste_records').getFullList({ sort: '-wasteDate', $autoCancel: false, requestKey: null }),
        pb.collection('stock_receipts').getFullList({ sort: '-created', $autoCancel: false, requestKey: null }),
        pb.collection('stock_issues').getFullList({ sort: '-issueDate', expand: 'stockItem,lot', $autoCancel: false, requestKey: null }),
        pb.collection('stock_adjustments').getFullList({ sort: '-created', $autoCancel: false, requestKey: null }),
        pb.collection('stock_locations').getFullList({ sort: 'name', $autoCancel: false, requestKey: null }),
      ]);
      setItems(i); setLots(l); setWaste(w); setReceipts(r); setIssues(is); setAdjustments(a); setLocations(loc);
    } catch (err) {
      console.error('[StockAnalysis] load failed', err);
      toast.error('Failed to load stock data for analysis');
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    return true;
  };

  const itemNameById = useMemo(() => {
    const m = {}; items.forEach((i) => { m[i.id] = i.name; }); return m;
  }, [items]);

  // ---- Stock value & levels ----
  const stockValue = useMemo(() => {
    let value = 0; let units = 0;
    items.forEach((it) => {
      const qty = Number(it.quantity) || 0;
      const cost = Number(it.unitCost) || 0;
      units += qty;
      value += qty * cost;
    });
    // Also value via lots unitCost (more precise).
    let lotValue = 0;
    lots.forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      const cost = Number(l.unitCost) || 0;
      lotValue += rem * cost;
    });
    return { value, lotValue, units };
  }, [items, lots]);

  const lowStock = useMemo(() => items.filter((it) => {
    const qty = Number(it.quantity) || 0;
    const min = Number(it.minStock) || 0;
    return min > 0 && qty <= min;
  }).sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0)), [items]);

  // ---- Expiring / expired lots ----
  const lotExpiry = useMemo(() => {
    const expiring = []; const expired = []; const fresh = [];
    lots.forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      if (rem <= 0) return;
      const st = expiryState(l.expiry);
      if (st === 'expired') expired.push(l);
      else if (st === 'warning') expiring.push(l);
      else if (st === 'ok') fresh.push(l);
    });
    expiring.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    expired.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { expiring, expired, fresh };
  }, [lots]);

  // ---- Waste analysis ----
  const wasteAnalysis = useMemo(() => {
    const inRangeWaste = waste.filter((w) => !dateFrom && !dateTo ? true : inRange(w.wasteDate || w.created));
    const byReason = {}; const byItem = {}; const byDay = {}; let totalQty = 0;
    inRangeWaste.forEach((w) => {
      const qty = Number(w.quantity) || 0;
      totalQty += qty;
      const r = w.reason || 'other';
      byReason[r] = (byReason[r] || 0) + qty;
      const name = w.itemName || itemNameById[w.stockItem] || 'Unknown';
      byItem[name] = (byItem[name] || 0) + qty;
      const dk = dayKey(w.wasteDate || w.created);
      if (dk) byDay[dk] = (byDay[dk] || 0) + qty;
    });
    const reasonList = Object.entries(byReason).map(([reason, qty]) => ({ reason, qty })).sort((a, b) => b.qty - a.qty);
    const itemList = Object.entries(byItem).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
    const dayList = Object.entries(byDay).map(([day, qty]) => ({ day, qty })).sort((a, b) => a.day.localeCompare(b.day));
    return { total: inRangeWaste.length, totalQty, reasonList, itemList, dayList };
  }, [waste, dateFrom, dateTo, itemNameById]);

  // ---- Receiving / issuing activity ----
  const activity = useMemo(() => {
    const receiptsInRange = receipts.filter((r) => !dateFrom && !dateTo ? true : inRange(r.created));
    const issuesInRange = issues.filter((is) => !dateFrom && !dateTo ? true : inRange(is.issueDate || is.created));
    const receivedQty = lots.filter((l) => !dateFrom && !dateTo ? true : inRange(l.created))
      .reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const issuedQty = issuesInRange.reduce((s, is) => s + (Number(is.quantity) || 0), 0);
    // Supplier/bill summaries
    const bySupplier = {}; const byBill = {};
    receiptsInRange.forEach((r) => {
      const sup = r.supplier || 'Unknown';
      bySupplier[sup] = (bySupplier[sup] || 0) + 1;
      const bill = r.billNumber || '—';
      byBill[bill] = (byBill[bill] || 0) + 1;
    });
    // Issue by staff
    const byStaff = {};
    issuesInRange.forEach((is) => {
      const id = is.staffId || 'Unknown';
      byStaff[id] = (byStaff[id] || 0) + (Number(is.quantity) || 0);
    });
    return {
      receipts: receiptsInRange.length, issues: issuesInRange.length,
      receivedQty, issuedQty,
      supplierList: Object.entries(bySupplier).map(([supplier, count]) => ({ supplier, count })).sort((a, b) => b.count - a.count),
      billList: Object.entries(byBill).map(([bill, count]) => ({ bill, count })).sort((a, b) => b.count - a.count),
      staffList: Object.entries(byStaff).map(([staff, qty]) => ({ staff, qty })).sort((a, b) => b.qty - a.qty),
    };
  }, [receipts, issues, lots, dateFrom, dateTo]);

  // ---- FIFO & override events ----
  const fifoEvents = useMemo(() => {
    const overrides = lots.filter((l) => l.status === 'overridden');
    const overrideAdj = adjustments.filter((a) => (a.reason || '').includes('Expired-stock override'));
    // FIFO adherence: issues that reference a lot (vs. no lot).
    const withLot = issues.filter((is) => is.lot).length;
    const withoutLot = issues.filter((is) => !is.lot).length;
    return { overrides: overrides.length, overrideAdj: overrideAdj.length, withLot, withoutLot };
  }, [lots, adjustments, issues]);

  // ---- Location utilization ----
  const locationUtil = useMemo(() => {
    const byLoc = {};
    locations.forEach((l) => { byLoc[l.id] = { name: l.name, type: l.type, lots: 0, units: 0 }; });
    lots.forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      if (rem <= 0 || !l.location) return;
      if (!byLoc[l.location]) byLoc[l.location] = { name: '—', type: '—', lots: 0, units: 0 };
      byLoc[l.location].lots += 1;
      byLoc[l.location].units += rem;
    });
    return Object.values(byLoc).sort((a, b) => b.units - a.units);
  }, [locations, lots]);

  // ---- Barcode coverage ----
  const barcodeCoverage = useMemo(() => {
    const itemsWithBc = items.filter((i) => i.barcode).length;
    const lotsWithBc = lots.filter((l) => l.barcode).length;
    return {
      items: { total: items.length, withBc: itemsWithBc, pct: items.length ? Math.round((itemsWithBc / items.length) * 100) : 0 },
      lots: { total: lots.length, withBc: lotsWithBc, pct: lots.length ? Math.round((lotsWithBc / lots.length) * 100) : 0 },
    };
  }, [items, lots]);

  // ---- Audit activity ----
  const auditActivity = useMemo(() => {
    const inRangeAdj = adjustments.filter((a) => !dateFrom && !dateTo ? true : inRange(a.created));
    const byType = {};
    inRangeAdj.forEach((a) => { const t = a.adjustmentType || 'other'; byType[t] = (byType[t] || 0) + 1; });
    return { total: inRangeAdj.length, byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count) };
  }, [adjustments, dateFrom, dateTo]);

  // ---- exports ----
  const exportStockCsv = () => {
    const cols = [
      { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
      { key: 'quantity', label: 'On Hand' }, { key: 'minStock', label: 'Min Stock' },
      { key: 'unitCost', label: 'Unit Cost', format: (v) => Number(v || 0).toFixed(2) },
      { key: 'value', label: 'Value', format: (v) => Number(v || 0).toFixed(2) },
      { key: 'barcode', label: 'Barcode' }, { key: 'perishable', label: 'Perishable', format: (v) => (v ? 'true' : 'false') },
    ];
    const rows = items.map((it) => ({ ...it, value: (Number(it.quantity) || 0) * (Number(it.unitCost) || 0) }));
    downloadCsv('stock_levels.csv', recordsToCsv(rows, cols));
    toast.success('Exported stock levels to CSV');
  };
  const exportWasteCsv = () => {
    const cols = [
      { key: 'wasteDate', label: 'Date', format: (v) => fmtDate(v) },
      { key: 'itemName', label: 'Item' }, { key: 'category', label: 'Category' },
      { key: 'quantity', label: 'Qty' }, { key: 'unit', label: 'Unit' },
      { key: 'reason', label: 'Reason' }, { key: 'responsibleUser', label: 'Responsible' },
    ];
    downloadCsv('waste_analysis.csv', recordsToCsv(waste, cols));
    toast.success('Exported waste analysis to CSV');
  };
  const exportJson = () => {
    downloadJson('stock_analysis.json', {
      generatedAt: new Date().toISOString(),
      filters: { dateFrom, dateTo },
      stockValue, lowStock, lotExpiry, wasteAnalysis, activity,
      fifoEvents, locationUtil, barcodeCoverage, auditActivity,
    });
    toast.success('Exported full stock analysis to JSON');
  };

  const resetFilters = () => { setDateFrom(''); setDateTo(''); };

  const wasteReasonPie = wasteAnalysis.reasonList.map((r) => ({ name: r.reason, value: r.qty }));
  const wasteTrend = wasteAnalysis.dayList.slice(-14);
  const wasteItemChart = wasteAnalysis.itemList.slice(0, 8).map((i) => ({ name: i.name.length > 14 ? i.name.slice(0, 13) + '…' : i.name, qty: i.qty }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Boxes className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Stock & Waste Analysis</h2>
            <p className="text-sm text-muted-foreground">Inventory value, expiry, waste trends, receiving/issuing, FIFO overrides, locations, barcodes, and audit activity.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button onClick={() => fetchAll(true)} variant="outline" className="h-10 w-full sm:w-auto" disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Refresh
          </Button>
          <Button onClick={exportJson} variant="secondary" className="h-10 w-full sm:w-auto"><FileJson className="h-4 w-4 mr-2" /> Export JSON</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-2 border-border rounded-2xl">
        <CardHeader className="pb-3"><CardTitle className="text-base font-bold">Filters</CardTitle><CardDescription className="text-sm">Date range applies to waste, receiving, issuing, and audit activity.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label className="text-xs font-bold text-muted-foreground">From date</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold text-muted-foreground">To date</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10" /></div>
          {(dateFrom || dateTo) && <Button onClick={resetFilters} variant="ghost" className="h-10 text-destructive">Reset</Button>}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 && lots.length === 0 && waste.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No stock, lot, or waste data yet. Receive goods and record waste to populate this analysis.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-2 border-border rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Boxes className="h-3.5 w-3.5" /> Stock Value (lots)</p><p className="text-2xl font-bold text-emerald-600 mt-1 notranslate" translate="no">{fmtEuro(stockValue.lotValue)}</p><p className="text-[10px] text-muted-foreground mt-0.5">{stockValue.units} units on hand</p></CardContent></Card>
            <Card className="border-2 border-amber-500/30 rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-amber-700 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Expiring ≤{EXPIRY_WARN_DAYS}d</p><p className="text-2xl font-bold text-amber-700 mt-1 notranslate" translate="no">{lotExpiry.expiring.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">lots with stock</p></CardContent></Card>
            <Card className="border-2 border-destructive/40 rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Expired</p><p className="text-2xl font-bold text-destructive mt-1 notranslate" translate="no">{lotExpiry.expired.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">lots with stock</p></CardContent></Card>
            <Card className="border-2 border-border rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Waste Qty</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{wasteAnalysis.totalQty}</p><p className="text-[10px] text-muted-foreground mt-0.5">{wasteAnalysis.total} entries</p></CardContent></Card>
          </div>

          {/* Activity cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-2 border-border rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Received</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{activity.receivedQty}</p><p className="text-[10px] text-muted-foreground mt-0.5">units · {activity.receipts} bills</p></CardContent></Card>
            <Card className="border-2 border-border rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Package className="h-3.5 w-3.5" /> Issued</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{activity.issuedQty}</p><p className="text-[10px] text-muted-foreground mt-0.5">units · {activity.issues} issues</p></CardContent></Card>
            <Card className="border-2 border-amber-500/30 rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-amber-700 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Overrides</p><p className="text-2xl font-bold text-amber-700 mt-1 notranslate" translate="no">{fifoEvents.overrides}</p><p className="text-[10px] text-muted-foreground mt-0.5">expired-stock overrides</p></CardContent></Card>
            <Card className="border-2 border-border rounded-2xl"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Barcode className="h-3.5 w-3.5" /> Barcode Coverage</p><p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{barcodeCoverage.lots.pct}%</p><p className="text-[10px] text-muted-foreground mt-0.5">{barcodeCoverage.lots.withBc}/{barcodeCoverage.lots.total} lots</p></CardContent></Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-2 border-border rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-bold flex items-center gap-2"><Trash2 className="text-secondary" /> Waste by Reason</CardTitle></CardHeader>
              <CardContent>
                {wasteReasonPie.length === 0 ? <p className="text-sm text-muted-foreground italic py-8 text-center">No waste recorded.</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={wasteReasonPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name}: ${e.value}`}>
                        {wasteReasonPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-bold flex items-center gap-2"><TrendingUp className="text-secondary" /> Waste Trend (last 14 days)</CardTitle></CardHeader>
              <CardContent>
                {wasteTrend.length === 0 ? <p className="text-sm text-muted-foreground italic py-8 text-center">No waste trend data.</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={wasteTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} interval={0} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="qty" name="Waste qty" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-bold flex items-center gap-2"><Trash2 className="text-secondary" /> Top Wasted Items</CardTitle></CardHeader>
              <CardContent>
                {wasteItemChart.length === 0 ? <p className="text-sm text-muted-foreground italic py-8 text-center">No waste data.</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={wasteItemChart} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip /><Bar dataKey="qty" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} /></BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-bold flex items-center gap-2"><Package className="text-secondary" /> Issue Activity by Staff</CardTitle></CardHeader>
              <CardContent>
                {activity.staffList.length === 0 ? <p className="text-sm text-muted-foreground italic py-8 text-center">No issues recorded.</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={activity.staffList.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="staff" tick={{ fontSize: 11 }} width={110} /><Tooltip /><Bar dataKey="qty" name="Issued qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} /></BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Low stock + expiring tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <div><CardTitle className="text-base font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Items</CardTitle><CardDescription className="text-sm">On hand ≤ minimum stock.</CardDescription></div>
                <Button variant="outline" size="sm" onClick={exportStockCsv} className="min-h-touch"><Download className="h-4 w-4 mr-2" /> CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                {lowStock.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No low-stock items.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Item</TableHead><TableHead className="text-right">On Hand</TableHead><TableHead className="text-right">Min</TableHead></TableRow></TableHeader>
                    <TableBody>{lowStock.slice(0, 20).map((it) => (
                      <TableRow key={it.id}><TableCell className="font-medium text-foreground break-words">{it.name}</TableCell><TableCell className="text-right font-bold text-destructive notranslate" translate="no">{Number(it.quantity) || 0}</TableCell><TableCell className="text-right notranslate" translate="no">{Number(it.minStock) || 0}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3"><CardTitle className="text-base font-bold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-500" /> Expiring Soon (≤{EXPIRY_WARN_DAYS}d)</CardTitle><CardDescription className="text-sm">Lots with stock expiring within {EXPIRY_WARN_DAYS} days.</CardDescription></CardHeader>
              <CardContent className="p-0">
                {lotExpiry.expiring.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No lots expiring soon.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Item</TableHead><TableHead className="text-right">Left</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
                    <TableBody>{lotExpiry.expiring.slice(0, 20).map((l) => (
                      <TableRow key={l.id}><TableCell className="font-medium text-foreground break-words">{(l.expand && l.expand.stockItem && l.expand.stockItem.name) || '—'}</TableCell><TableCell className="text-right font-bold notranslate" translate="no">{l.remainingQty ?? l.quantity}</TableCell><TableCell className="notranslate" translate="no">{fmtDate(l.expiry)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Expired lots + supplier/bill summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-2 border-destructive/40 rounded-2xl overflow-hidden">
              <CardHeader className="pb-3"><CardTitle className="text-base font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Expired Lots (with stock)</CardTitle><CardDescription className="text-sm">Blocked from issue unless overridden.</CardDescription></CardHeader>
              <CardContent className="p-0">
                {lotExpiry.expired.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No expired lots with stock.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Item</TableHead><TableHead className="text-right">Left</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>{lotExpiry.expired.slice(0, 20).map((l) => (
                      <TableRow key={l.id} className="bg-destructive/5"><TableCell className="font-medium text-foreground break-words">{(l.expand && l.expand.stockItem && l.expand.stockItem.name) || '—'}</TableCell><TableCell className="text-right font-bold notranslate" translate="no">{l.remainingQty ?? l.quantity}</TableCell><TableCell className="notranslate" translate="no">{fmtDate(l.expiry)}</TableCell><TableCell><Badge variant="outline" className="text-[10px] uppercase">{l.status || 'active'}</Badge></TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3"><CardTitle className="text-base font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Supplier / Bill Summary</CardTitle><CardDescription className="text-sm">Receipts in the selected range.</CardDescription></CardHeader>
              <CardContent className="p-0">
                {activity.supplierList.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No receipts in range.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Supplier</TableHead><TableHead className="text-right">Bills</TableHead></TableRow></TableHeader>
                    <TableBody>{activity.supplierList.map((s) => (
                      <TableRow key={s.supplier}><TableCell className="font-medium text-foreground break-words">{s.supplier}</TableCell><TableCell className="text-right font-bold notranslate" translate="no">{s.count}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Location utilization + audit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3"><CardTitle className="text-base font-bold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Location Utilization</CardTitle><CardDescription className="text-sm">Active lots and units per location.</CardDescription></CardHeader>
              <CardContent className="p-0">
                {locationUtil.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No location data.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Location</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Lots</TableHead><TableHead className="text-right">Units</TableHead></TableRow></TableHeader>
                    <TableBody>{locationUtil.map((l, i) => (
                      <TableRow key={i}><TableCell className="font-medium text-foreground break-words">{l.name}</TableCell><TableCell className="text-muted-foreground uppercase text-xs">{l.type}</TableCell><TableCell className="text-right notranslate" translate="no">{l.lots}</TableCell><TableCell className="text-right font-bold notranslate" translate="no">{l.units}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <div><CardTitle className="text-base font-bold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Audit Activity</CardTitle><CardDescription className="text-sm">Adjustment records in range (immutable trail).</CardDescription></div>
                <Button variant="outline" size="sm" onClick={exportWasteCsv} className="min-h-touch"><Download className="h-4 w-4 mr-2" /> Waste CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                {auditActivity.byType.length === 0 ? <p className="text-sm text-muted-foreground italic p-6 text-center">No adjustments in range.</p> : (
                  <Table><TableHeader><TableRow className="bg-muted/40"><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                    <TableBody>{auditActivity.byType.map((a) => (
                      <TableRow key={a.type}><TableCell className="font-medium text-foreground uppercase text-xs">{a.type}</TableCell><TableCell className="text-right font-bold notranslate" translate="no">{a.count}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
                <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">FIFO adherence: <strong className="text-foreground">{fifoEvents.withLot}</strong> issues with lot / <strong className="text-foreground">{fifoEvents.withLot + fifoEvents.withoutLot}</strong> total · {fifoEvents.overrides} override(s).</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
