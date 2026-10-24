import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import {
  ChefHat, RefreshCw, Loader2, Filter, XCircle, Table2, User, Calendar, Layers,
  Eye, StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { resolveOrderId, resolveBaseOrderId } from '@/lib/kotPrint.js';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import { kotsExportColumns } from '@/lib/csvConfigs.js';
import {
  isKotDelayed, countDelayedKots, DELAYED_CARD_CLS,
} from '@/lib/kotDelayed.js';
import KotDelayedBadge from '@/components/KotDelayedBadge.jsx';
import {
  buildGroupMap, isCombinedParent, isSharedParent,
  combinationLabel, adminTableLabel,
} from '@/lib/tableGroups.js';

const COLLECTION = 'kitchen_orders';

const STATUS_META = {
  pending: { label: 'Pending', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  preparing: { label: 'Preparing', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  ready: { label: 'Ready', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  completed: { label: 'Completed', cls: 'bg-muted text-muted-foreground border-border' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-700 border-red-500/40 line-through' },
};

const ORDER_TYPE_LABEL = {
  walkin: 'Walk-in',
  preorder: 'Pre-order',
};

// Elapsed waiting-time label (m:ss), capped display for very long waits.
function elapsedLabel(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Whether a KOT's created timestamp falls within the selected date range.
// `from`/`to` are HTML date-input strings (YYYY-MM-DD); the range is
// inclusive of the full from-day and to-day. Empty bounds skip that side.
function inDateRange(kot, from, to) {
  if (!from && !to) return true;
  const t = new Date(kot.created).getTime();
  if (from) {
    const f = new Date(from + 'T00:00:00').getTime();
    if (t < f) return false;
  }
  if (to) {
    const e = new Date(to + 'T23:59:59').getTime();
    if (t > e) return false;
  }
  return true;
}

function parentOf(kot) {
  return (kot && kot.expand && kot.expand.parentOrder) || null;
}

function orderTypeOf(kot) {
  const p = parentOf(kot);
  return (p && p.orderType) || '';
}

function tableOf(kot) {
  const p = parentOf(kot);
  return (p && p.tableNumber) || kot.tableNumber || '';
}

function waiterOf(kot) {
  const p = parentOf(kot);
  return (p && p.placedBy) || kot.placedBy || '';
}

// Parse the JSON `items` field of a kitchen order into a stable array.
// Defensive: the field may be a string, array, or missing.
function kotItems(kot) {
  if (!kot) return [];
  let items = kot.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch (_) { return []; }
  }
  if (!Array.isArray(items)) return [];
  return items;
}

// Short preview of the ordered items for table/card display, e.g.
// "Samosa x2, Masala Dosa x1" (truncated).
function itemsPreview(kot, max = 2) {
  const items = kotItems(kot);
  if (items.length === 0) return '—';
  const parts = items.slice(0, max).map((it) => {
    const name = it.name || it.itemName || 'Item';
    const qty = it.quantity != null ? ` x${it.quantity}` : '';
    return `${name}${qty}`;
  });
  const more = items.length > max ? ` +${items.length - max} more` : '';
  return parts.join(', ') + more;
}

// Euro formatting for item/unit prices in the detail dialog.
function fmtEuro(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `€${v.toFixed(2)}`;
}

export default function AdminKotsView() {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [now, setNow] = useState(Date.now());

  // table_groups + table_group_members — source of truth for combined/
  // merged table membership (Linked Orders + Shared Order), so the Admin
  // KOTs view can show "Tables 4 + 5 + 6" / "Linked: 4 + 5 + 6".
  const [tableGroups, setTableGroups] = useState([]);
  const [tableGroupMembers, setTableGroupMembers] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // all|active|pending|preparing|ready|completed|cancelled|delayed
  const [sortOrder, setSortOrder] = useState('desc'); // desc=newest, asc=oldest
  // Date-range filter for viewing / extracting history by date. The full
  // 40-day retention window is available; defaults to empty (all dates).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail dialog — full ordered-item breakdown for a single KOT.
  const [detailKot, setDetailKot] = useState(null);


  // Ticking clock so elapsed time + delayed state recalculate live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchKots = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const sort = sortOrder === 'asc' ? 'created' : '-created';
      const res = await pb.collection(COLLECTION).getFullList({
        sort,
        expand: 'parentOrder',
        $autoCancel: false,
      });
      setKots(res);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[AdminKotsView] load failed', err);
      toast.error('Failed to load kitchen orders');
      setKots([]);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [sortOrder]);

  // Fetch every table_groups + table_group_members row so the Admin KOTs
  // view can resolve the full combined/merged table combination from the
  // normalized membership (the source of truth) for each KOT's parent.
  const fetchGroupData = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        pb.collection('table_groups').getFullList({ $autoCancel: false }),
        pb.collection('table_group_members').getFullList({ $autoCancel: false }),
      ]);
      setTableGroups(g || []);
      setTableGroupMembers(m || []);
    } catch (_) { /* ignore — combined-table info just won't show */ }
  }, []);

  const groupMap = useMemo(
    () => buildGroupMap(tableGroups, tableGroupMembers),
    [tableGroups, tableGroupMembers],
  );

  useEffect(() => {
    fetchKots(false);
    fetchGroupData();
    // Keep combined-table membership live: when a waiter creates/closes a
    // combination, the Admin KOTs view updates automatically.
    void pb.collection('table_groups').subscribe('*', () => fetchGroupData());
    void pb.collection('table_group_members').subscribe('*', () => fetchGroupData());
    return () => {
      void pb.collection('table_groups').unsubscribe('*').catch(() => {});
      void pb.collection('table_group_members').unsubscribe('*').catch(() => {});
    };
  }, [fetchKots, fetchGroupData]);

  const handleRefresh = () => { fetchKots(true); fetchGroupData(); };

  // Apply status filter (supports the "Delayed" filter via isKotDelayed).
  const filteredKots = useMemo(() => {
    let list = kots;
    if (statusFilter === 'delayed') {
      list = list.filter((k) => isKotDelayed(k, now));
    } else if (statusFilter === 'active') {
      list = list.filter((k) => ['pending', 'preparing', 'ready'].includes(k.status));
    } else if (statusFilter !== 'all') {
      list = list.filter((k) => k.status === statusFilter);
    }
    // Date-range filter (history by date).
    list = list.filter((k) => inDateRange(k, dateFrom, dateTo));
    // Re-sort client-side to keep delayed-first option stable if needed.
    if (sortOrder === 'asc') {
      list = [...list].sort((a, b) => new Date(a.created) - new Date(b.created));
    } else {
      list = [...list].sort((a, b) => new Date(b.created) - new Date(a.created));
    }
    return list;
  }, [kots, statusFilter, sortOrder, now, dateFrom, dateTo]);

  const delayedCount = useMemo(() => countDelayedKots(kots, now), [kots, now]);

  const resetFilters = () => {
    setStatusFilter('all');
    setSortOrder('desc');
    setDateFrom('');
    setDateTo('');
  };

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (sortOrder !== 'desc' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <>
      <Helmet>
        <title>KOTs - Tripti Genusswelt Admin</title>
      </Helmet>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Kitchen Order Tickets (KOTs)</h2>
              <p className="text-sm text-muted-foreground">Live view of all kitchen orders with delayed-state highlighting. KOTs leave the active KDS after 5 hours but stay here for 40 days.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={handleRefresh} variant="outline" className="h-10 w-full sm:w-auto" disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <CsvImportExport
              collection={COLLECTION}
              entityLabel="KOTs"
              exportFileName="kots.csv"
              exportColumns={kotsExportColumns}
              fetchRecords={async () => {
                const sort = sortOrder === 'asc' ? 'created' : '-created';
                const all = await pb.collection(COLLECTION).getFullList({ sort, expand: 'parentOrder', $autoCancel: false });
                // Export respects the selected date range so Admin can
                // extract a specific period (records are kept 8 years).
                return all.filter((k) => inDateRange(k, dateFrom, dateTo));
              }}
            />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total KOTs</p>
              <p className="text-2xl font-bold text-primary mt-1">{kots.length}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {kots.filter((k) => ['pending', 'preparing', 'ready'].includes(k.status)).length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-2 border-destructive/40 rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delayed</p>
              <p className={`text-2xl font-bold mt-1 ${delayedCount > 0 ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}>
                {delayedCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Showing</p>
              <p className="text-2xl font-bold text-primary mt-1">{filteredKots.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-2 border-border rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" /> Filters
            </CardTitle>
            <CardDescription className="text-sm">Filter kitchen orders by status, including a Delayed view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Kitchen Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active (pending/preparing/ready)</SelectItem>
                    <SelectItem value="delayed">Delayed (pending 5+ min)</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Sort (created)</Label>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest first</SelectItem>
                    <SelectItem value="asc">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-10"
                  max={dateTo || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-10"
                  min={dateFrom || undefined}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Records are retained for 40 days (1 month 10 days). Use the date filters to view or extract a range — the CSV export respects the selected dates.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 && (
                <Button onClick={resetFilters} variant="ghost" className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4 mr-2" /> Reset filters
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

        {/* List */}
        <Card className="border-2 border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">Kitchen Orders</CardTitle>
            <CardDescription className="text-sm">
              {loading || refreshing ? 'Loading…' : `${filteredKots.length} KOT${filteredKots.length === 1 ? '' : 's'} matching filters.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <ChefHat className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No kitchen orders found for the selected filters.</p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">KOT ID</th>
                        <th className="px-4 py-3 font-semibold">Order Type</th>
                        <th className="px-4 py-3 font-semibold">Table</th>
                        <th className="px-4 py-3 font-semibold">Waiter</th>
                        <th className="px-4 py-3 font-semibold">Items Ordered</th>
                        <th className="px-4 py-3 font-semibold">Created</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredKots.map((k) => {
                        const meta = STATUS_META[k.status] || STATUS_META.pending;
                        const delayed = isKotDelayed(k, now);
                        const created = new Date(k.created).getTime();
                        const elapsed = now - created;
                        const otype = ORDER_TYPE_LABEL[orderTypeOf(k)] || '—';
                        const parent = parentOf(k);
                        const tableLabel = adminTableLabel(parent, groupMap) || tableOf(k) || '—';
                        const combined = isCombinedParent(parent, groupMap);
                        const shared = isSharedParent(parent, groupMap);
                        const combo = combinationLabel(parent, groupMap);
                        return (
                          <tr key={k.id} className={`hover:bg-muted/30 transition-colors cursor-pointer ${delayed ? 'bg-destructive/5' : ''}`} onClick={() => setDetailKot(k)}>
                            <td className="px-4 py-3">
                              <p className="font-mono font-bold text-primary text-xs notranslate" translate="no">{resolveOrderId(k)}</p>
                              <p className="text-[10px] text-muted-foreground notranslate" translate="no">{resolveBaseOrderId(k)}</p>
                            </td>
                            <td className="px-4 py-3 text-foreground">{otype}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 min-w-0">
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="break-words">{tableLabel}</span>
                                </span>
                                {combined && !shared && combo && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary/15 border border-secondary/40 rounded px-1.5 py-0.5 w-fit notranslate" translate="no">
                                    <Layers className="h-3 w-3 shrink-0" /> Linked: {combo}
                                  </span>
                                )}
                                {shared && combo && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary/15 border border-secondary/40 rounded px-1.5 py-0.5 w-fit notranslate" translate="no">
                                    <Layers className="h-3 w-3 shrink-0" /> Shared Order
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-foreground min-w-0">
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{waiterOf(k) || '—'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[280px]">
                              <span className="text-foreground text-xs break-words">{itemsPreview(k)}</span>
                              <span className="text-[10px] text-secondary font-bold ml-1 whitespace-nowrap">({kotItems(k).length} item{kotItems(k).length === 1 ? '' : 's'})</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground notranslate" translate="no">
                              {new Date(k.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className={`font-bold text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                                {delayed && <KotDelayedBadge />}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-border">
                  {filteredKots.map((k) => {
                    const meta = STATUS_META[k.status] || STATUS_META.pending;
                    const delayed = isKotDelayed(k, now);
                    const created = new Date(k.created).getTime();
                    const elapsed = now - created;
                    const otype = ORDER_TYPE_LABEL[orderTypeOf(k)] || '—';
                    const parent = parentOf(k);
                    const tableLabel = adminTableLabel(parent, groupMap) || tableOf(k) || '—';
                    const combined = isCombinedParent(parent, groupMap);
                    const shared = isSharedParent(parent, groupMap);
                    const combo = combinationLabel(parent, groupMap);
                    return (
                      <div key={k.id} className={`p-4 space-y-3 cursor-pointer ${delayed ? DELAYED_CARD_CLS + ' border-destructive' : ''}`} onClick={() => setDetailKot(k)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-primary text-sm notranslate" translate="no">{resolveOrderId(k)}</p>
                            <p className="text-[10px] text-muted-foreground notranslate" translate="no">
                              {new Date(k.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <Badge variant="outline" className={`font-bold text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                            {delayed && <KotDelayedBadge />}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-semibold">Type</span>
                            <span className="text-foreground font-medium ml-auto">{otype}</span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-semibold">Table</span>
                            <span className="text-foreground font-medium ml-auto break-words text-right">{tableLabel}</span>
                          </div>
                          <div className="flex items-center gap-1.5 col-span-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-semibold">Waiter</span>
                            <span className="text-foreground font-medium ml-auto truncate">{waiterOf(k) || '—'}</span>
                          </div>
                        </div>
                        {combined && combo && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary/15 border border-secondary/40 rounded px-2 py-1 notranslate" translate="no">
                            <Layers className="h-3 w-3 shrink-0" />
                            {shared ? `Shared Order: ${combo}` : `Linked: ${combo}`}
                          </div>
                        )}
                        <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Items Ordered ({kotItems(k).length})</p>
                          <p className="text-xs text-foreground break-words">{itemsPreview(k, 3)}</p>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                          <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Waiting
                          </span>
                          <span className={`text-sm font-bold notranslate ${delayed ? 'text-destructive animate-pulse' : 'text-primary'}`} translate="no">
                            {elapsedLabel(elapsed)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* KOT item detail dialog — complete ordered-item breakdown */}
        <Dialog open={!!detailKot} onOpenChange={(open) => { if (!open) setDetailKot(null); }}>
          <DialogContent className="modal-mobile-safe max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-secondary" /> KOT Items
              </DialogTitle>
              <DialogDescription>
                {detailKot ? (
                  <span className="notranslate" translate="no">
                    {resolveOrderId(detailKot)} · {waiterOf(detailKot) || '—'} · {new Date(detailKot.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                ) : ''}
              </DialogDescription>
            </DialogHeader>
            {detailKot && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Table</p>
                    <p className="text-foreground font-semibold break-words">{tableOf(detailKot) || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Room</p>
                    <p className="text-foreground font-semibold">{detailKot.room || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="text-foreground font-semibold capitalize">{detailKot.status || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Order Type</p>
                    <p className="text-foreground font-semibold">{ORDER_TYPE_LABEL[orderTypeOf(detailKot)] || '—'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-left">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-3 py-2 font-semibold">Category</th>
                        <th className="px-3 py-2 font-semibold text-center">Qty</th>
                        <th className="px-3 py-2 font-semibold">Spice</th>
                        <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
                        <th className="px-3 py-2 font-semibold text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {kotItems(detailKot).length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground italic">No items recorded for this KOT.</td></tr>
                      ) : kotItems(detailKot).map((it, idx) => {
                        const qty = Number(it.quantity ?? 1);
                        const price = Number(it.price || 0);
                        const line = Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0;
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium text-foreground break-words">{it.name || it.itemName || 'Item'}</td>
                            <td className="px-3 py-2 text-muted-foreground break-words">{it.category || '—'}</td>
                            <td className="px-3 py-2 text-center font-bold notranslate" translate="no">x{qty}</td>
                            <td className="px-3 py-2 text-muted-foreground">{it.spiceLevel && it.spiceLevel !== 'None' ? it.spiceLevel : '—'}</td>
                            <td className="px-3 py-2 text-right notranslate" translate="no">{fmtEuro(price)}</td>
                            <td className="px-3 py-2 text-right font-bold notranslate" translate="no">{fmtEuro(line)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {detailKot.notes && (
                  <div className="rounded-lg bg-secondary/10 border border-secondary/30 px-3 py-2 flex items-start gap-2">
                    <StickyNote className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Order Notes</p>
                      <p className="text-sm text-foreground break-words">{detailKot.notes}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm font-bold text-primary uppercase tracking-wide">KOT Total</span>
                  <span className="text-lg font-bold text-primary notranslate" translate="no">
                    {fmtEuro(kotItems(detailKot).reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity ?? 1)), 0))}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}
