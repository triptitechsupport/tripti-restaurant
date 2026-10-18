import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import {
  Receipt, RefreshCw, Loader2, CheckCircle2, Circle, Table2, User, Calendar, CreditCard,
  Eye, X, StickyNote, Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import { billingExportColumns } from '@/lib/csvConfigs.js';

const COLLECTION = 'waiter_orders';

// billingStatus values stored in PocketBase: "not_completed" | "completed".
// null/empty (older rows) are treated as "Not Completed".
const BILLING_COMPLETED = 'completed';
const BILLING_NOT_COMPLETED = 'not_completed';

function billingLabel(status) {
  return status === BILLING_COMPLETED ? 'Completed' : 'Not Completed';
}

function isCompleted(order) {
  return order && order.billingStatus === BILLING_COMPLETED;
}

export default function AdminBillingView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // All OPEN/Active orders = orderStatus !== 'closed'. Sorted newest first.
      const res = await pb.collection(COLLECTION).getFullList({
        filter: "orderStatus != 'closed'",
        sort: '-created',
        $autoCancel: false,
      });
      setOrders(res);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[AdminBillingView] load failed', err);
      toast.error('Failed to load billing orders');
      setOrders([]);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(false);

    // Realtime: reflect billing-status / order changes without manual refresh.
    void pb
      .collection(COLLECTION)
      .subscribe('*', (e) => {
        setOrders((prev) => {
          if (e.action === 'delete') {
            return prev.filter((o) => o.id !== e.record.id);
          }
          // Only keep open/active orders in this view.
          if (e.record.orderStatus === 'closed') {
            return prev.filter((o) => o.id !== e.record.id);
          }
          const exists = prev.some((o) => o.id === e.record.id);
          if (e.action === 'create') {
            return [e.record, ...prev];
          }
          if (e.action === 'update') {
            return exists
              ? prev.map((o) => (o.id === e.record.id ? e.record : o))
              : [e.record, ...prev];
          }
          return prev;
        });
      })
      .catch((error) => console.error('Realtime subscription failed', error));

    return () => {
      void pb.collection(COLLECTION).unsubscribe('*').catch(() => {});
    };
  }, [fetchOrders]);

  const handleRefresh = () => fetchOrders(true);

  const handleMarkCompleted = async (order) => {
    setUpdatingId(order.id);
    try {
      const updated = await pb.collection(COLLECTION).update(order.id, {
        billingStatus: BILLING_COMPLETED,
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      toast.success(`Order ${order.orderId || ''} marked as completed`);
    } catch (err) {
      console.error('[AdminBillingView] mark completed failed', err);
      toast.error('Failed to update billing status');
    } finally {
      setUpdatingId(null);
    }
  };

  // ---- View Items modal ----
  // Fetch the kitchen_orders (KOTs) linked to a waiter_orders parent and
  // surface them read-only so Admin can manually perform the external
  // OnlineBon operation. No OnlineBon integration.
  const [viewingOrder, setViewingOrder] = useState(null);
  const [kots, setKots] = useState([]);
  const [loadingKots, setLoadingKots] = useState(false);

  const handleViewItems = useCallback(async (order) => {
    setViewingOrder(order);
    setKots([]);
    setLoadingKots(true);
    try {
      const res = await pb.collection('kitchen_orders').getFullList({
        filter: pb.filter('parentOrder = {:pid}', { pid: order.id }),
        sort: 'created',
        $autoCancel: false,
      });
      setKots(res);
    } catch (err) {
      console.error('[AdminBillingView] load KOTs failed', err);
      toast.error('Failed to load order items');
      setKots([]);
    } finally {
      setLoadingKots(false);
    }
  }, []);

  const closeViewItems = () => {
    setViewingOrder(null);
    setKots([]);
    setLoadingKots(false);
  };

  // Aggregate all item lines across every KOT for the order summary total.
  const aggregatedItems = useMemo(() => {
    const all = [];
    (kots || []).forEach((k) => {
      (Array.isArray(k.items) ? k.items : []).forEach((it) => {
        if (it && it.cleared) return; // cleared lines are removed from the order
        all.push({
          name: it.name || it.nameEN || 'Item',
          quantity: Number(it.quantity) || 0,
          price: Number(it.price) || 0,
          spiceLevel: it.spiceLevel && it.spiceLevel !== 'None' ? it.spiceLevel : null,
          tableNumber: it.tableNumber || null,
        });
      });
    });
    return all;
  }, [kots]);

  const itemsTotal = useMemo(
    () => aggregatedItems.reduce((sum, it) => sum + it.price * it.quantity, 0),
    [aggregatedItems],
  );

  const completedCount = orders.filter(isCompleted).length;
  const pendingCount = orders.length - completedCount;

  return (
    <>
      <Helmet>
        <title>Billing - Tripti Genusswelt Admin</title>
      </Helmet>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Billing</h2>
              <p className="text-sm text-muted-foreground">
                Open/Active orders from the Waiter UI. Mark an order Completed once the OnlineBon process is finished externally.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={handleRefresh} variant="outline" className="h-10 w-full sm:w-auto" disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <CsvImportExport
              collection={COLLECTION}
              entityLabel="billing orders"
              exportFileName="billing_orders.csv"
              exportColumns={billingExportColumns}
              fetchRecords={async () => {
                return await pb.collection(COLLECTION).getFullList({
                  filter: "orderStatus != 'closed'",
                  sort: '-created',
                  $autoCancel: false,
                });
              }}
            />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Orders</p>
              <p className="text-2xl font-bold text-primary mt-1">{orders.length}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-amber-400/50 rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not Completed</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-emerald-400/50 rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <Card className="border-2 border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">Open / Active Orders</CardTitle>
            <CardDescription className="text-sm">
              {loading || refreshing ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'} currently open.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No open orders to bill right now.</p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">Order ID</th>
                        <th className="px-4 py-3 font-semibold">Table</th>
                        <th className="px-4 py-3 font-semibold">Waiter</th>
                        <th className="px-4 py-3 font-semibold">Created</th>
                        <th className="px-4 py-3 font-semibold">Order Status</th>
                        <th className="px-4 py-3 font-semibold">Billing Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orders.map((o) => {
                        const completed = isCompleted(o);
                        return (
                          <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-mono font-bold text-primary text-xs notranslate" translate="no">{o.orderId || '—'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="break-words">{o.tableNumber || '—'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-foreground min-w-0">
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{o.placedBy || '—'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground notranslate" translate="no">
                              {new Date(o.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="font-bold text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                {o.orderStatus === 'open' ? 'Open' : (o.orderStatus || 'Open')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {completed ? (
                                <Badge variant="outline" className="font-bold text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="font-bold text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  <Circle className="h-3 w-3 mr-1" /> Not Completed
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewItems(o)}
                                  className="min-h-touch"
                                >
                                  <Eye className="h-4 w-4 mr-1" /> View Items
                                </Button>
                                <Button
                                  size="sm"
                                  variant={completed ? 'outline' : 'default'}
                                  disabled={completed || updatingId === o.id}
                                  onClick={() => handleMarkCompleted(o)}
                                  className="min-h-touch"
                                >
                                  {updatingId === o.id ? (
                                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Updating…</>
                                  ) : completed ? (
                                    <><CheckCircle2 className="h-4 w-4 mr-1" /> Completed</>
                                  ) : (
                                    <><CreditCard className="h-4 w-4 mr-1" /> Mark Completed</>
                                  )}
                                </Button>
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
                  {orders.map((o) => {
                    const completed = isCompleted(o);
                    return (
                      <div key={o.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-primary text-sm notranslate" translate="no">{o.orderId || '—'}</p>
                            <p className="text-[10px] text-muted-foreground notranslate" translate="no">
                              {new Date(o.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          <Badge variant="outline" className="font-bold text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0">
                            {o.orderStatus === 'open' ? 'Open' : (o.orderStatus || 'Open')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-semibold">Table</span>
                            <span className="text-foreground font-medium ml-auto break-words text-right">{o.tableNumber || '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 col-span-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-semibold">Waiter</span>
                            <span className="text-foreground font-medium ml-auto truncate">{o.placedBy || '—'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
                          {completed ? (
                            <Badge variant="outline" className="font-bold text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 self-start">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-bold text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 self-start">
                              <Circle className="h-3 w-3 mr-1" /> Not Completed
                            </Badge>
                          )}
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewItems(o)}
                              className="min-h-touch w-full"
                            >
                              <Eye className="h-4 w-4 mr-1" /> View Items
                            </Button>
                            <Button
                              size="sm"
                              variant={completed ? 'outline' : 'default'}
                              disabled={completed || updatingId === o.id}
                              onClick={() => handleMarkCompleted(o)}
                              className="min-h-touch w-full"
                            >
                              {updatingId === o.id ? (
                                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Updating…</>
                              ) : completed ? (
                                <><CheckCircle2 className="h-4 w-4 mr-1" /> Completed</>
                              ) : (
                                <><CreditCard className="h-4 w-4 mr-1" /> Mark Completed</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* View Items modal — read-only order details for manual OnlineBon */}
        <Dialog open={!!viewingOrder} onOpenChange={(open) => { if (!open) closeViewItems(); }}>
          <DialogContent className="max-w-2xl w-[95vw] sm:w-[92vw] rounded-2xl border-2 border-primary shadow-xl p-0 gap-0 overflow-hidden">
            <DialogHeader className="flex flex-row items-start justify-between gap-3 border-b-2 border-border p-4 sm:p-5 bg-muted/30">
              <div className="min-w-0">
                <DialogTitle className="text-primary text-lg sm:text-xl flex items-center gap-2">
                  <Utensils className="h-5 w-5 shrink-0" />
                  <span className="truncate">Order Details</span>
                </DialogTitle>
                <DialogDescription className="font-medium text-muted-foreground mt-0.5">
                  Read-only summary for the external OnlineBon process.
                </DialogDescription>
              </div>
            </DialogHeader>

            <ScrollArea className="max-h-[70vh]">
              <div className="p-4 sm:p-5 space-y-4">
                {loadingKots ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : !viewingOrder ? null : (
                  <>
                    {/* Order meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <MetaItem label="Order ID" value={viewingOrder.orderId || '—'} mono />
                      <MetaItem label="Table" value={viewingOrder.tableNumber || '—'} />
                      <MetaItem label="Waiter" value={viewingOrder.placedBy || '—'} />
                      <MetaItem
                        label="Date / Time"
                        value={new Date(viewingOrder.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      />
                      <MetaItem
                        label="Order Type"
                        value={viewingOrder.orderType === 'preorder' ? 'Pre-order' : 'Walk-in'}
                      />
                      <MetaItem
                        label="Billing Status"
                        value={isCompleted(viewingOrder) ? 'Completed' : 'Not Completed'}
                      />
                    </div>

                    <Separator />

                    {/* Items */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold text-primary uppercase tracking-wide">
                          Ordered Items
                        </h3>
                      </div>

                      {aggregatedItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic py-4 text-center">
                          No items found for this order.
                        </p>
                      ) : (
                        <div className="rounded-xl border-2 border-border overflow-hidden">
                          {/* Desktop / tablet item table */}
                          <table className="hidden sm:table w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                              <tr className="text-left">
                                <th className="px-3 py-2 font-semibold">Item</th>
                                <th className="px-3 py-2 font-semibold text-center w-16">Qty</th>
                                <th className="px-3 py-2 font-semibold text-right w-24">Price</th>
                                <th className="px-3 py-2 font-semibold text-right w-24">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {aggregatedItems.map((it, idx) => (
                                <tr key={idx} className="align-top">
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-foreground break-words">{it.name}</p>
                                    {it.spiceLevel && (
                                      <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                                        Spice: {it.spiceLevel}
                                      </span>
                                    )}
                                    {it.tableNumber && (
                                      <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
                                        Table {it.tableNumber}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center font-semibold notranslate" translate="no">{it.quantity}×</td>
                                  <td className="px-3 py-2 text-right text-muted-foreground notranslate" translate="no">€{it.price.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-primary notranslate" translate="no">€{(it.price * it.quantity).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Mobile item list */}
                          <div className="sm:hidden divide-y divide-border">
                            {aggregatedItems.map((it, idx) => (
                              <div key={idx} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground text-sm break-words">{it.name}</p>
                                    {it.spiceLevel && (
                                      <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                                        Spice: {it.spiceLevel}
                                      </span>
                                    )}
                                    {it.tableNumber && (
                                      <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
                                        Table {it.tableNumber}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-xs shrink-0 notranslate" translate="no">{it.quantity}×</span>
                                </div>
                                <div className="flex items-center justify-between mt-1 text-xs">
                                  <span className="text-muted-foreground notranslate" translate="no">€{it.price.toFixed(2)} each</span>
                                  <span className="font-bold text-primary notranslate" translate="no">€{(it.price * it.quantity).toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Per-KOT notes (modifiers/special requests) */}
                    {(kots || []).some((k) => k.notes && String(k.notes).trim()) && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <StickyNote className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-bold text-primary uppercase tracking-wide">
                            Notes / Special Requests
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {kots.map((k) => {
                            const note = k.notes && String(k.notes).trim();
                            if (!note) return null;
                            const label = k.kotSuffix
                              ? `Ticket _${k.kotSuffix}`
                              : `Ticket ${new Date(k.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                            return (
                              <div key={k.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                                <p className="text-sm text-foreground break-words whitespace-pre-wrap">{note}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Totals */}
                    <div className="space-y-1.5">
                      <TotalRow label="Items Total" value={`€${itemsTotal.toFixed(2)}`} />
                      {Number(viewingOrder.totalAmount) > 0 && (
                        <TotalRow
                          label="Order Total"
                          value={`€${Number(viewingOrder.totalAmount).toFixed(2)}`}
                          bold
                        />
                      )}
                      {Number(viewingOrder.paidAmount) > 0 && (
                        <TotalRow
                          label="Paid"
                          value={`€${Number(viewingOrder.paidAmount).toFixed(2)}`}
                          accent="emerald"
                        />
                      )}
                      {Number(viewingOrder.outstandingAmount) > 0 && (
                        <TotalRow
                          label="Outstanding"
                          value={`€${Number(viewingOrder.outstandingAmount).toFixed(2)}`}
                          accent="amber"
                        />
                      )}
                      {viewingOrder.paymentStatus && (
                        <div className="pt-1">
                          <Badge
                            variant="outline"
                            className={`font-bold text-[10px] ${
                              viewingOrder.paymentStatus === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : viewingOrder.paymentStatus === 'partial'
                                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                  : 'bg-muted text-muted-foreground border-border'
                            }`}
                          >
                            Payment: {viewingOrder.paymentStatus}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function MetaItem({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold text-foreground break-words notranslate ${mono ? 'font-mono' : ''}`} translate="no">
        {value}
      </p>
    </div>
  );
}

function TotalRow({ label, value, bold, accent }) {
  const accentClass = accent === 'emerald'
    ? 'text-emerald-600'
    : accent === 'amber'
      ? 'text-amber-600'
      : '';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`${bold ? 'text-base font-bold text-primary' : `text-sm font-semibold ${accentClass || 'text-foreground'}`} notranslate`} translate="no">
        {value}
      </span>
    </div>
  );
}
