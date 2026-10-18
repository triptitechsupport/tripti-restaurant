import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import {
  BarChart3, RefreshCw, Loader2, Filter, XCircle, TrendingUp, Clock, Users,
  ChefHat, UtensilsCrossed, Layers, AlertTriangle, Download, FileJson,
  Trophy, Timer, Inbox, Info, PackageCheck,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { recordsToCsv, downloadCsv } from '@/lib/csvUtils.js';
import { resolveOrderId } from '@/lib/kotPrint.js';
import { isKotDelayed, KOT_DELAY_THRESHOLD_MS } from '@/lib/kotDelayed.js';
import StockAnalysis from '@/components/StockAnalysis.jsx';

/**
 * Admin Analysis — read-only operational analytics over existing stored
 * kitchen_orders (KOTs), waiter_orders, and item data. No schema changes;
 * every metric is derived from current records and timestamp fields.
 *
 * IMPORTANT — timestamp transparency:
 * PocketBase does not store a dedicated "readyAt" / "servedAt" timestamp.
 * The only per-record time fields available are `created`, `updated`, and
 * (on waiter_orders) `endedAt`. We therefore approximate stage durations
 * from `updated - created` for KOTs that have reached a given status:
 *   - Time-to-ready   ≈ updated - created for KOTs currently in `ready`
 *   - Time-to-served  ≈ updated - created for KOTs in `completed`
 * `updated` reflects the last write, so for a completed KOT it approximates
 * the moment it was marked served. Where a value cannot be measured (no
 * timestamp, still pending, etc.) we show "—" and exclude it from averages
 * rather than inventing a number.
 */

const COLLECTION = 'kitchen_orders';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ---- helpers ----

function parseItems(kot) {
  if (!kot) return [];
  let items = kot.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (_) { return []; }
  }
  return Array.isArray(items) ? items : [];
}

function waiterOf(kot) {
  const p = kot && kot.expand && kot.expand.parentOrder;
  return (p && p.placedBy) || (kot && kot.placedBy) || '';
}

function tableOf(kot) {
  const p = kot && kot.expand && kot.expand.parentOrder;
  return (p && p.tableNumber) || (kot && kot.tableNumber) || '';
}

function toMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtEuro(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `€${v.toFixed(2)}`;
}

function dayKey(iso) {
  const t = toMs(iso);
  if (t == null) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- component ----

export default function AdminAnalysisView() {
  const [analysisView, setAnalysisView] = useState('operations'); // 'operations' | 'stock'
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [waiterFilter, setWaiterFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Live clock for pending/late recalculation.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchKots = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await pb.collection(COLLECTION).getFullList({
        sort: '-created',
        expand: 'parentOrder',
        $autoCancel: false,
      });
      setKots(res);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[AdminAnalysis] load failed', err);
      toast.error('Failed to load kitchen orders for analysis');
      setKots([]);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKots(false); }, [fetchKots]);

  // Distinct filter option lists derived from loaded data.
  const waiterOptions = useMemo(() => {
    const set = new Set();
    kots.forEach((k) => { const w = waiterOf(k); if (w) set.add(w); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [kots]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    kots.forEach((k) => parseItems(k).forEach((it) => {
      const c = (it.category || 'Uncategorized').toString().trim();
      if (c) set.add(c);
    }));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [kots]);

  // Apply filters.
  const filteredKots = useMemo(() => {
    const fromMs = dateFrom ? toMs(`${dateFrom}T00:00:00`) : null;
    const endMs = dateTo ? toMs(`${dateTo}T23:59:59`) : null;
    const q = search.trim().toLowerCase();
    return kots.filter((k) => {
      const cMs = toMs(k.created);
      if (fromMs != null && (cMs == null || cMs < fromMs)) return false;
      if (endMs != null && (cMs == null || cMs > endMs)) return false;
      if (waiterFilter !== 'all' && waiterOf(k) !== waiterFilter) return false;
      if (statusFilter !== 'all' && k.status !== statusFilter) return false;
      if (categoryFilter !== 'all') {
        const has = parseItems(k).some((it) => (it.category || 'Uncategorized').toString().trim() === categoryFilter);
        if (!has) return false;
      }
      if (q) {
        const hay = [
          resolveOrderId(k), tableOf(k), waiterOf(k), k.status || '',
          k.notes || '', ...parseItems(k).map((it) => it.name || it.itemName || ''),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [kots, dateFrom, dateTo, waiterFilter, statusFilter, categoryFilter, search]);

  // ---- analytics computations ----
  const analytics = useMemo(() => {
    const itemMap = new Map();
    const catMap = new Map();
    const waiterMap = new Map();
    const tableMap = new Map();
    const roomMap = new Map();
    const dayMap = new Map();
    const comboMap = new Map();
    const comboIdName = new Map();
    let cancelledCount = 0;
    let completedCount = 0;
    let readyCount = 0;
    let pendingCount = 0;
    let preparingCount = 0;
    let totalRevenue = 0;
    let totalItems = 0;

    filteredKots.forEach((k) => {
      const items = parseItems(k);
      const w = waiterOf(k) || 'Unknown';
      const tbl = tableOf(k) || '—';
      const room = (k.room || '—').toString();
      const dk = dayKey(k.created);

      if (!waiterMap.has(w)) {
        waiterMap.set(w, { kotCount: 0, completed: 0, cancelled: 0, serveTimes: [], readyTimes: [] });
      }
      const wStat = waiterMap.get(w);
      wStat.kotCount += 1;

      const cMs = toMs(k.created);
      const uMs = toMs(k.updated);
      const dur = cMs != null && uMs != null ? uMs - cMs : null;
      if (k.status === 'cancelled') { cancelledCount += 1; wStat.cancelled += 1; }
      if (k.status === 'completed') {
        completedCount += 1;
        wStat.completed += 1;
        if (dur != null && dur >= 0) wStat.serveTimes.push(dur);
      }
      if (k.status === 'ready') {
        readyCount += 1;
        if (dur != null && dur >= 0) wStat.readyTimes.push(dur);
      }
      if (k.status === 'pending') pendingCount += 1;
      if (k.status === 'preparing') preparingCount += 1;

      tableMap.set(tbl, (tableMap.get(tbl) || 0) + 1);
      roomMap.set(room, (roomMap.get(room) || 0) + 1);
      if (dk) dayMap.set(dk, (dayMap.get(dk) || 0) + 1);

      const itemIds = [];
      items.forEach((it) => {
        const name = (it.name || it.itemName || 'Item').toString();
        const cat = (it.category || 'Uncategorized').toString().trim() || 'Uncategorized';
        const qty = Number(it.quantity ?? 1);
        const price = Number(it.price || 0);
        const line = Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0;
        const key = `${it.id || name}__${name}`;
        if (!itemMap.has(key)) itemMap.set(key, { name, category: cat, quantity: 0, orderCount: 0, revenue: 0 });
        const st = itemMap.get(key);
        st.quantity += qty;
        st.orderCount += 1;
        st.revenue += line;
        totalItems += qty;
        totalRevenue += line;

        if (!catMap.has(cat)) catMap.set(cat, { quantity: 0, orderCount: 0, revenue: 0 });
        catMap.get(cat).quantity += qty;
        catMap.get(cat).revenue += line;

        if (it.id) {
          itemIds.push(it.id);
          comboIdName.set(it.id, name);
        }
      });

      const catsInKot = new Set(items.map((it) => (it.category || 'Uncategorized').toString().trim() || 'Uncategorized'));
      catsInKot.forEach((cat) => {
        if (!catMap.has(cat)) catMap.set(cat, { quantity: 0, orderCount: 0, revenue: 0 });
        catMap.get(cat).orderCount += 1;
      });

      const uniqueIds = [...new Set(itemIds)];
      for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i + 1; j < uniqueIds.length; j++) {
          const a = uniqueIds[i], b = uniqueIds[j];
          const key = a < b ? `${a} | ${b}` : `${b} | ${a}`;
          comboMap.set(key, (comboMap.get(key) || 0) + 1);
        }
      }
    });

    const itemList = [...itemMap.values()].sort((a, b) => b.quantity - a.quantity);
    const catList = [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.quantity - a.quantity);
    const waiterList = [...waiterMap.entries()].map(([waiter, v]) => ({
      waiter,
      kotCount: v.kotCount,
      completed: v.completed,
      cancelled: v.cancelled,
      serveCount: v.serveTimes.length,
      serveAvg: avg(v.serveTimes),
      serveMax: v.serveTimes.length ? Math.max(...v.serveTimes) : null,
      serveMin: v.serveTimes.length ? Math.min(...v.serveTimes) : null,
      readyAvg: avg(v.readyTimes),
    })).sort((a, b) => (b.serveAvg ?? -1) - (a.serveAvg ?? -1));

    const tableList = [...tableMap.entries()].map(([table, count]) => ({ table, count })).sort((a, b) => b.count - a.count);
    const roomList = [...roomMap.entries()].map(([room, count]) => ({ room, count })).sort((a, b) => b.count - a.count);
    const volumeList = [...dayMap.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));

    const comboList = [...comboMap.entries()]
      .map(([key, count]) => {
        const [a, b] = key.split(' | ');
        return { pair: `${comboIdName.get(a) || a} + ${comboIdName.get(b) || b}`, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const allServeTimes = [];
    const allReadyTimes = [];
    filteredKots.forEach((k) => {
      const cMs = toMs(k.created);
      const uMs = toMs(k.updated);
      const dur = cMs != null && uMs != null ? uMs - cMs : null;
      if (k.status === 'completed' && dur != null && dur >= 0) allServeTimes.push(dur);
      if (k.status === 'ready' && dur != null && dur >= 0) allReadyTimes.push(dur);
    });

    const pendingLate = filteredKots
      .filter((k) => k.status === 'pending')
      .map((k) => ({ kot: k, ageMs: now - (toMs(k.created) || now), delayed: isKotDelayed(k, now) }))
      .sort((a, b) => b.ageMs - a.ageMs);

    return {
      itemList, catList, waiterList, tableList, roomList, volumeList, comboList,
      cancelledCount, completedCount, readyCount, pendingCount, preparingCount,
      totalRevenue, totalItems, totalKots: filteredKots.length,
      serveAvg: avg(allServeTimes),
      serveMax: allServeTimes.length ? Math.max(...allServeTimes) : null,
      serveMin: allServeTimes.length ? Math.min(...allServeTimes) : null,
      readyAvg: avg(allReadyTimes),
      readyMax: allReadyTimes.length ? Math.max(...allReadyTimes) : null,
      pendingLate,
      hasServeData: allServeTimes.length > 0,
      hasReadyData: allReadyTimes.length > 0,
    };
  }, [filteredKots, now]);

  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setWaiterFilter('all');
    setCategoryFilter('all'); setStatusFilter('all'); setSearch('');
  };

  const activeFilterCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (waiterFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (search ? 1 : 0);

  // ---- exports ----
  const exportItemsCsv = () => {
    if (!analytics.itemList.length) { toast.info('No item data to export'); return; }
    const cols = [
      { key: 'name', label: 'Item' },
      { key: 'category', label: 'Category' },
      { key: 'quantity', label: 'Total Quantity' },
      { key: 'orderCount', label: 'Order Count' },
      { key: 'revenue', label: 'Revenue (EUR)', format: (v) => Number(v).toFixed(2) },
    ];
    downloadCsv('analysis_items.csv', recordsToCsv(analytics.itemList, cols));
    toast.success('Exported item analysis to CSV');
  };

  const exportWaitersCsv = () => {
    if (!analytics.waiterList.length) { toast.info('No waiter data to export'); return; }
    const rows = analytics.waiterList.map((w) => ({
      waiter: w.waiter,
      kotCount: w.kotCount,
      completed: w.completed,
      cancelled: w.cancelled,
      serveCount: w.serveCount,
      serveAvgSec: w.serveAvg != null ? Math.round(w.serveAvg / 1000) : '',
      serveMaxSec: w.serveMax != null ? Math.round(w.serveMax / 1000) : '',
      serveMinSec: w.serveMin != null ? Math.round(w.serveMin / 1000) : '',
    }));
    const cols = [
      { key: 'waiter', label: 'Waiter' },
      { key: 'kotCount', label: 'KOTs Placed' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'serveCount', label: 'Served (timed)' },
      { key: 'serveAvgSec', label: 'Avg Serve (sec)' },
      { key: 'serveMinSec', label: 'Fastest Serve (sec)' },
      { key: 'serveMaxSec', label: 'Slowest Serve (sec)' },
    ];
    downloadCsv('analysis_waiters.csv', recordsToCsv(rows, cols));
    toast.success('Exported waiter analysis to CSV');
  };

  const exportAllJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: { dateFrom, dateTo, waiter: waiterFilter, category: categoryFilter, status: statusFilter, search },
      summary: {
        totalKots: analytics.totalKots,
        totalItems: analytics.totalItems,
        totalRevenue: analytics.totalRevenue,
        cancelled: analytics.cancelledCount,
        completed: analytics.completedCount,
        ready: analytics.readyCount,
        pending: analytics.pendingCount,
        preparing: analytics.preparingCount,
        serveAvgMs: analytics.serveAvg,
        serveMaxMs: analytics.serveMax,
        serveMinMs: analytics.serveMin,
        readyAvgMs: analytics.readyAvg,
      },
      items: analytics.itemList,
      categories: analytics.catList,
      waiters: analytics.waiterList,
      tables: analytics.tableList,
      rooms: analytics.roomList,
      volumeByDay: analytics.volumeList,
      combos: analytics.comboList,
    };
    downloadJson('analysis_full.json', payload);
    toast.success('Exported full analysis to JSON');
  };

  const slowestWaiter = analytics.waiterList.find((w) => w.serveAvg != null);
  const fastestWaiter = [...analytics.waiterList].filter((w) => w.serveAvg != null).sort((a, b) => (a.serveAvg ?? 0) - (b.serveAvg ?? 0))[0];
  const topItem = analytics.itemList[0];
  const cancelRate = analytics.totalKots > 0 ? (analytics.cancelledCount / analytics.totalKots) * 100 : 0;

  const chartDataItems = analytics.itemList.slice(0, 10).map((i) => ({ name: i.name.length > 16 ? i.name.slice(0, 15) + '…' : i.name, quantity: i.quantity }));
  const chartDataCats = analytics.catList.slice(0, 10).map((c) => ({ name: c.category.length > 16 ? c.category.slice(0, 15) + '…' : c.category, quantity: c.quantity, revenue: Number(c.revenue.toFixed(2)) }));
  const chartDataVolume = analytics.volumeList.slice(-14);
  const chartDataWaiters = analytics.waiterList.filter((w) => w.serveAvg != null).slice(0, 10).map((w) => ({
    name: w.waiter.length > 14 ? w.waiter.slice(0, 13) + '…' : w.waiter,
    avgSec: Math.round((w.serveAvg || 0) / 1000),
  }));

  return (
    <>
      <Helmet><title>Analysis - Tripti Genusswelt Admin</title></Helmet>
      <div className="space-y-5">
        {/* Sub-navigation: Operations vs Stock & Waste */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            onClick={() => setAnalysisView('operations')}
            className={`flex items-center px-4 py-2 text-sm font-bold rounded-lg transition-all ${analysisView === 'operations' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}
          >
            <ChefHat className="h-4 w-4 mr-2" /> Operations
          </button>
          <button
            onClick={() => setAnalysisView('stock')}
            className={`flex items-center px-4 py-2 text-sm font-bold rounded-lg transition-all ${analysisView === 'stock' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}
          >
            <PackageCheck className="h-4 w-4 mr-2" /> Stock & Waste
          </button>
        </div>

        {analysisView === 'stock' ? (
          <StockAnalysis />
        ) : (
        <>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Operational Analysis</h2>
              <p className="text-sm text-muted-foreground">Read-only analytics over kitchen orders, items, and waiter performance.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={() => fetchKots(true)} variant="outline" className="h-10 w-full sm:w-auto" disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <Button onClick={exportAllJson} variant="secondary" className="h-10 w-full sm:w-auto">
              <FileJson className="h-4 w-4 mr-2" /> Export JSON
            </Button>
          </div>
        </div>

        {/* Transparency note */}
        <div className="flex items-start gap-2 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-xs text-foreground">
          <Info className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
          <p>
            Preparation and serving times are approximated from each KOT's <strong>created</strong> and <strong>updated</strong> timestamps
            (PocketBase does not store a dedicated ready/served timestamp). Time-to-ready uses KOTs currently in <em>ready</em>;
            time-to-served uses <em>completed</em> KOTs. Values that cannot be measured are shown as <strong>—</strong> and excluded from averages.
          </p>
        </div>

        {/* Filters */}
        <Card className="border-2 border-border rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" /> Filters
            </CardTitle>
            <CardDescription className="text-sm">Narrow the analysis by date range, waiter, category, status, or free-text search.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">From date</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">To date</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Waiter</Label>
                <Select value={waiterFilter} onValueChange={setWaiterFilter}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All waiters</SelectItem>
                    {waiterOptions.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Search</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, table, order ID…" className="h-10" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 && (
                <Button onClick={resetFilters} variant="ghost" className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4 mr-2" /> Reset filters ({activeFilterCount})
                </Button>
              )}
              {lastRefreshed && (
                <p className="text-[11px] text-muted-foreground notranslate ml-auto" translate="no">
                  Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : analytics.totalKots === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No kitchen orders match the selected filters.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ChefHat className="h-3.5 w-3.5" /> Total KOTs</p>
                  <p className="text-2xl font-bold text-primary mt-1">{analytics.totalKots}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><UtensilsCrossed className="h-3.5 w-3.5" /> Items Served</p>
                  <p className="text-2xl font-bold text-primary mt-1">{analytics.totalItems}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Revenue</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1 notranslate" translate="no">{fmtEuro(analytics.totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-destructive/40 rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Cancelled</p>
                  <p className="text-2xl font-bold text-destructive mt-1">{analytics.cancelledCount} <span className="text-sm font-medium text-muted-foreground">({cancelRate.toFixed(1)}%)</span></p>
                </CardContent>
              </Card>
            </div>

            {/* Timing summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Avg Time-to-Served</p>
                  <p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{fmtDur(analytics.serveAvg)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{analytics.hasServeData ? `${analytics.completedCount} completed KOTs` : 'no completed KOTs'}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Peak Time-to-Served</p>
                  <p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{fmtDur(analytics.serveMax)}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Avg Time-to-Ready</p>
                  <p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{fmtDur(analytics.readyAvg)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{analytics.hasReadyData ? `${analytics.readyCount} ready KOTs` : 'no ready KOTs'}</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-border rounded-2xl">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Top Item</p>
                  <p className="text-base font-bold text-primary mt-1 break-words">{topItem ? topItem.name : '—'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{topItem ? `${topItem.quantity}× across ${topItem.orderCount} KOTs` : ''}</p>
                </CardContent>
              </Card>
            </div>

            {/* Waiter performance highlights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="border-2 border-emerald-500/30 rounded-2xl bg-emerald-500/5">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Fastest Waiter (to served)</p>
                  <p className="text-lg font-bold text-foreground mt-1 break-words">{fastestWaiter ? fastestWaiter.waiter : '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 notranslate" translate="no">
                    {fastestWaiter ? `Avg ${fmtDur(fastestWaiter.serveAvg)} · ${fastestWaiter.serveCount} served` : 'no timed completions'}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 border-amber-500/30 rounded-2xl bg-amber-500/5">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Slowest Waiter (to served)</p>
                  <p className="text-lg font-bold text-foreground mt-1 break-words">{slowestWaiter ? slowestWaiter.waiter : '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 notranslate" translate="no">
                    {slowestWaiter ? `Avg ${fmtDur(slowestWaiter.serveAvg)} · ${slowestWaiter.serveCount} served` : 'no timed completions'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-2 border-border rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2"><UtensilsCrossed className="text-secondary" /> Top 10 Items by Quantity</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartDataItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-8 text-center">No item data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartDataItems} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                        <Tooltip />
                        <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-2 border-border rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2"><Layers className="text-secondary" /> Category Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartDataCats.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-8 text-center">No category data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartDataCats} margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis type="category" dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="quantity" name="Quantity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="revenue" name="Revenue €" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-2 border-border rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2"><TrendingUp className="text-secondary" /> Order Volume Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartDataVolume.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-8 text-center">No volume data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartDataVolume} margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis type="category" dataKey="day" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} interval={0} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" name="KOTs" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-2 border-border rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2"><Users className="text-secondary" /> Waiter Avg Time-to-Served (sec)</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartDataWaiters.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-8 text-center">No timed completions yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartDataWaiters} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="s" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                        <Tooltip formatter={(v) => [`${v} s`, 'Avg serve']} />
                        <Bar dataKey="avgSec" name="Avg serve (s)" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Items table */}
            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base font-bold">Most Frequently Ordered Items</CardTitle>
                  <CardDescription className="text-sm">Ranked by total quantity ordered, with order count and revenue.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportItemsCsv} className="min-h-touch"><Download className="h-4 w-4 mr-2" /> CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Total Qty</TableHead>
                        <TableHead className="text-right">Order Count</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.itemList.slice(0, 25).map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-foreground break-words">{it.name}</TableCell>
                          <TableCell className="text-muted-foreground break-words">{it.category}</TableCell>
                          <TableCell className="text-right font-bold notranslate" translate="no">{it.quantity}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{it.orderCount}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{fmtEuro(it.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Waiter performance table */}
            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base font-bold">Waiter Performance</CardTitle>
                  <CardDescription className="text-sm">Time-to-served approximated from created→updated on completed KOTs.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportWaitersCsv} className="min-h-touch"><Download className="h-4 w-4 mr-2" /> CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Waiter</TableHead>
                        <TableHead className="text-right">KOTs Placed</TableHead>
                        <TableHead className="text-right">Completed</TableHead>
                        <TableHead className="text-right">Cancelled</TableHead>
                        <TableHead className="text-right">Avg Serve</TableHead>
                        <TableHead className="text-right">Fastest</TableHead>
                        <TableHead className="text-right">Slowest</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.waiterList.map((w) => (
                        <TableRow key={w.waiter}>
                          <TableCell className="font-medium text-foreground break-words">{w.waiter}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{w.kotCount}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{w.completed}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{w.cancelled}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{fmtDur(w.serveAvg)}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{fmtDur(w.serveMin)}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{fmtDur(w.serveMax)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Two-column: categories + combos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-2 border-border rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Category Performance</CardTitle>
                  <CardDescription className="text-sm">Quantity, KOT reach, and revenue per category.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">KOTs</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.catList.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell className="font-medium text-foreground break-words">{c.category}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{c.quantity}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{c.orderCount}</TableCell>
                          <TableCell className="text-right notranslate" translate="no">{fmtEuro(c.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="border-2 border-border rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Popular Item Combinations</CardTitle>
                  <CardDescription className="text-sm">Items frequently ordered together within the same KOT.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analytics.comboList.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic p-6 text-center">No multi-item KOTs in range.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Combination</TableHead>
                          <TableHead className="text-right">Times Together</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.comboList.map((c, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-foreground break-words">{c.pair}</TableCell>
                            <TableCell className="text-right font-bold notranslate" translate="no">{c.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pending / late KOTs */}
            <Card className="border-2 border-border rounded-2xl overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Pending / Late KOTs</CardTitle>
                <CardDescription className="text-sm">
                  KOTs still pending. Late = waiting {Math.round(KOT_DELAY_THRESHOLD_MS / 60000)}+ min since creation.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {analytics.pendingLate.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic p-6 text-center">No pending KOTs in range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>KOT ID</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Waiter</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Waiting</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.pendingLate.slice(0, 30).map(({ kot, ageMs, delayed }) => (
                        <TableRow key={kot.id} className={delayed ? 'bg-destructive/5' : ''}>
                          <TableCell className="font-mono font-bold text-primary text-xs notranslate" translate="no">{resolveOrderId(kot)}</TableCell>
                          <TableCell className="break-words">{tableOf(kot) || '—'}</TableCell>
                          <TableCell className="break-words">{waiterOf(kot) || '—'}</TableCell>
                          <TableCell className="text-xs text-foreground break-words">{parseItems(kot).map((it) => `${it.name || it.itemName || 'Item'} x${it.quantity ?? 1}`).join(', ') || '—'}</TableCell>
                          <TableCell className={`text-right font-bold notranslate ${delayed ? 'text-destructive animate-pulse' : 'text-primary'}`} translate="no">{fmtDur(ageMs)}</TableCell>
                          <TableCell>{delayed ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 font-bold text-[10px]">Late</Badge> : <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold text-[10px]">Pending</Badge>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Table / room trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-2 border-border rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Busiest Tables</CardTitle>
                  <CardDescription className="text-sm">KOT count per table.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analytics.tableList.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic p-6 text-center">No table data.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Table</TableHead>
                          <TableHead className="text-right">KOTs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.tableList.slice(0, 15).map((t) => (
                          <TableRow key={t.table}>
                            <TableCell className="font-medium text-foreground break-words">{t.table}</TableCell>
                            <TableCell className="text-right font-bold notranslate" translate="no">{t.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="border-2 border-border rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Room Trends</CardTitle>
                  <CardDescription className="text-sm">KOT count per room.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analytics.roomList.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic p-6 text-center">No room data.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Room</TableHead>
                          <TableHead className="text-right">KOTs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.roomList.map((r) => (
                          <TableRow key={r.room}>
                            <TableCell className="font-medium text-foreground break-words">{r.room}</TableCell>
                            <TableCell className="text-right font-bold notranslate" translate="no">{r.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
        </>
        )}
      </div>
    </>
  );
}
