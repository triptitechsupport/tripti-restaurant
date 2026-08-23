import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ChefHat, PlusCircle, ListOrdered, Printer, Flame, DoorOpen, RefreshCw, Trash2 } from 'lucide-react';
import OrderPlacement from '@/components/OrderPlacement.jsx';
import { openKOT, resolveOrderId } from '@/lib/kotPrint.js';
import { buildGroupMap, tableDisplayForParent } from '@/lib/tableGroups.js';
import { isKotDelayed, countDelayedKots, DELAYED_CARD_CLS } from '@/lib/kotDelayed.js';
import KotDelayedBadge from '@/components/KotDelayedBadge.jsx';
import { toast } from 'sonner';

const STATUS_META = {
  pending: { label: 'Pending', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  preparing: { label: 'Preparing', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  ready: { label: 'Ready', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  completed: { label: 'Served', cls: 'bg-muted text-muted-foreground border-border' },
};

const SPICE_CLS = {
  Mild: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  Medium: 'bg-amber-100 text-amber-700 border-amber-300',
  Hot: 'bg-orange-100 text-orange-700 border-orange-300',
  'Very Hot': 'bg-red-100 text-red-700 border-red-300',
};

export default function AdminPlaceOrderPage() {
  const navigate = useNavigate();
  const displayName = pb.authStore.model?.email || 'Admin';
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  // table_groups + table_group_members — source of truth for Shared Order
  // table membership, so the Admin Orders tab shows "Tables 4 + 5 + 6".
  const [tableGroups, setTableGroups] = useState([]);
  const [tableGroupMembers, setTableGroupMembers] = useState([]);
  const [tab, setTab] = useState('place');
  // Live clock for delayed-state calculation — same shared isKotDelayed()
  // check as KDS and Waiter (pending 5+ minutes since creation). No separate
  // per-screen timer; just the consistent calculation against the KOT's
  // creation timestamp.
  const [now, setNow] = useState(() => Date.now());

  const fetchOrders = useCallback(async () => {
    try {
      const res = await pb.collection('kitchen_orders').getList(1, 100, { sort: '-created', expand: 'parentOrder', $autoCancel: false });
      setOrders(res.items);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    try {
      const res = await pb.collection('table_configurations').getFullList({ sort: 'name', $autoCancel: false });
      setTables(res);
    } catch (_) { /* ignore */ }
  }, []);

  // Fetch every table_groups + table_group_members row so the Admin Orders
  // tab can resolve the full Shared Order table combination from the
  // normalized membership (the source of truth).
  const fetchGroupData = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        pb.collection('table_groups').getFullList({ $autoCancel: false }),
        pb.collection('table_group_members').getFullList({ $autoCancel: false }),
      ]);
      setTableGroups(g || []);
      setTableGroupMembers(m || []);
    } catch (_) { /* ignore */ }
  }, []);

  const groupMap = useMemo(() => buildGroupMap(tableGroups, tableGroupMembers), [tableGroups, tableGroupMembers]);

  useEffect(() => {
    fetchOrders();
    fetchTables();
    fetchGroupData();
    pb.collection('kitchen_orders').subscribe('*', () => fetchOrders());
    pb.collection('table_groups').subscribe('*', () => fetchGroupData());
    pb.collection('table_group_members').subscribe('*', () => fetchGroupData());
    const poll = setInterval(fetchOrders, 12000);
    // Tick the live clock for delayed-state highlighting.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      pb.collection('kitchen_orders').unsubscribe('*');
      try { pb.collection('table_groups').unsubscribe('*'); } catch (_) { /* ignore */ }
      try { pb.collection('table_group_members').unsubscribe('*'); } catch (_) { /* ignore */ }
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchOrders, fetchTables, fetchGroupData]);

  const markAvailable = async (order) => {
    const t = tables.find((x) => x.name === order.tableNumber);
    if (!t) { toast.error('Table config not found'); return; }
    try {
      await pb.collection('table_configurations').update(t.id, { isReserved: false, reservedInfo: '' }, { $autoCancel: false });
      toast.success(`Table ${order.tableNumber} marked available`);
      fetchTables();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update table');
    }
  };

  const deleteOrder = async (order) => {
    try {
      await pb.collection('kitchen_orders').delete(order.id, { $autoCancel: false });
      toast.success('Order removed');
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove order');
    }
  };

  return (
    <>
      <Helmet>
        <title>Place Order - Admin - Tripti Genusswelt</title>
      </Helmet>
      <main className="min-h-screen bg-background p-4 md:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-serif font-bold text-primary">Place Kitchen Order</h1>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="place"><PlusCircle className="h-4 w-4 mr-1" /> New Order</TabsTrigger>
            <TabsTrigger value="orders"><ListOrdered className="h-4 w-4 mr-1" /> Orders ({orders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="place">
            <OrderPlacement placedBy={displayName} placedByRole="admin" onPlaced={fetchOrders} showActiveTab={false} />
          </TabsContent>

          <TabsContent value="orders">
            <div className="flex justify-end mb-3 items-center gap-3 flex-wrap">
              {countDelayedKots(orders, now) > 0 ? (
                <Badge className="bg-destructive text-destructive-foreground animate-pulse">
                  {countDelayedKots(orders, now)} delayed
                </Badge>
              ) : null}
              <Button variant="outline" size="sm" onClick={fetchOrders}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>
            {orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">No orders yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map((order) => {
                  const meta = STATUS_META[order.status] || STATUS_META.pending;
                  const delayed = isKotDelayed(order, now);
                  const parent = (order.expand && order.expand.parentOrder) || null;
                  const tableLabel = tableDisplayForParent(parent, groupMap) || order.tableNumber || '';
                  return (
                    <Card key={order.id} className={`border-border ${delayed ? DELAYED_CARD_CLS + ' border-destructive' : ''}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground uppercase">Table</p>
                            <p className="text-2xl font-bold break-words">{tableLabel}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <Badge variant="outline" className={`font-bold ${meta.cls}`}>{meta.label}</Badge>
                              {delayed ? <KotDelayedBadge /> : null}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 notranslate" translate="no">
                              #{resolveOrderId(order)} · {new Date(order.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <ul className="space-y-1 text-sm">
                          {(order.items || []).map((it, idx) => (
                            <li key={idx} className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-primary">{it.quantity}×</span>
                              <span>{it.name}</span>
                              {it.spiceLevel && it.spiceLevel !== 'None' ? (
                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SPICE_CLS[it.spiceLevel] || 'bg-muted text-muted-foreground border-border'}`}>
                                  <Flame className="h-3 w-3" /> {it.spiceLevel}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {order.notes ? <p className="text-xs italic text-muted-foreground">“{order.notes}”</p> : null}
                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <span className="font-semibold text-primary">€{(order.totalPrice || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => openKOT(order)}>
                            <Printer className="h-4 w-4 mr-1" /> KOT
                          </Button>
                          <Button size="sm" variant="ghost" className="flex-1 text-primary" onClick={() => markAvailable(order)}>
                            <DoorOpen className="h-4 w-4 mr-1" /> Free
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteOrder(order)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
