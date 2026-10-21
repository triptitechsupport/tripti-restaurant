import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChefHat, Clock, CookingPot, Bell, Euro, HandCoins, Users, RefreshCw, Loader2 } from 'lucide-react';
import defaultPb from '@/lib/pocketbaseClient.js';
import { pbDateFilter } from '@/lib/pbDateFilter.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Live view for the cashier and the admin: today's open orders, every KOT
// still in the kitchen, money still to collect, and what each waiter has
// open. Read only; refreshes every 10 seconds.
const T = {
  en: {
    title: 'Live overview', updated: 'Updated', open: 'Open orders', waiting: 'Waiting', cooking: 'Cooking',
    ready: 'Ready to serve', due: 'To collect', paid: 'Paid today', requests: 'Bill requests',
    kots: 'Kitchen tickets now', noKots: 'No tickets in the kitchen.', table: 'Table', min: 'min',
    waiters: 'Waiters', noWaiters: 'No waiter has an open order.', onShift: 'On shift', tables: 'open tables',
    st: { pending: 'Waiting', preparing: 'Cooking', ready: 'Ready' },
  },
  de: {
    title: 'Live-Übersicht', updated: 'Aktualisiert', open: 'Offene Bestellungen', waiting: 'Wartend', cooking: 'In Zubereitung',
    ready: 'Servierbereit', due: 'Offen zu kassieren', paid: 'Heute bezahlt', requests: 'Rechnungswünsche',
    kots: 'Bons in der Küche', noKots: 'Keine Bons in der Küche.', table: 'Tisch', min: 'Min.',
    waiters: 'Kellner', noWaiters: 'Kein Kellner hat eine offene Bestellung.', onShift: 'Im Dienst', tables: 'offene Tische',
    st: { pending: 'Wartend', preparing: 'In Zubereitung', ready: 'Bereit' },
  },
};
const STATUS_STYLE = {
  pending: 'bg-red-100 text-red-800 border-red-300',
  preparing: 'bg-amber-100 text-amber-800 border-amber-300',
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};
const cents = (it) => Math.round(Number(it.price || 0) * 100) * (Number(it.quantity) || 0);
const euro = (c) => `€${(c / 100).toFixed(2)}`;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return pbDateFilter(d);
}

export default function LiveOverview({ client }) {
  const pb = client || defaultPb;
  const { language } = useLanguage();
  const tx = T[language === 'de' ? 'de' : 'en'];
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setBusy(true);
    const since = startOfToday();
    const opts = { filter: `created >= "${since}"`, $autoCancel: false };
    try {
      const [orders, kots] = await Promise.all([
        pb.collection('waiter_orders').getFullList({ ...opts, sort: 'created' }),
        pb.collection('kitchen_orders').getFullList({ ...opts, sort: 'created' }),
      ]);
      // Optional: names of the waiters and who is clocked in.
      let staff = [];
      let shifts = [];
      try { staff = await pb.collection('waiter_users').getFullList({ $autoCancel: false, fields: 'id,displayName,username,role' }); } catch (_) { /* not allowed */ }
      try { shifts = await pb.collection('waiter_timesheets').getFullList({ filter: 'clockOut = ""', $autoCancel: false }); } catch (_) { /* not allowed */ }
      setData({ orders, kots, staff, shifts, at: Date.now() });
    } catch (err) {
      console.error('[LiveOverview] load failed', err);
    } finally {
      setBusy(false);
    }
  }, [pb]);

  useEffect(() => {
    load();
    const t = setInterval(() => { load(); setNow(Date.now()); }, 10000);
    return () => clearInterval(t);
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const openOrders = data.orders.filter((o) => o.orderStatus !== 'closed');
    const openIds = new Set(openOrders.map((o) => o.id));
    const live = data.kots.filter((k) => ['pending', 'preparing', 'ready'].includes(k.status));
    let due = 0;
    let paid = 0;
    const perOrderDue = {};
    data.kots.forEach((k) => {
      if (k.status === 'cancelled') return;
      (k.items || []).forEach((it) => {
        if (it.cleared === true) paid += cents(it);
        else if (openIds.has(k.parentOrder)) {
          due += cents(it);
          perOrderDue[k.parentOrder] = (perOrderDue[k.parentOrder] || 0) + cents(it);
        }
      });
    });
    const orderById = new Map(data.orders.map((o) => [o.id, o]));
    const waiters = new Map();
    const nameOf = (n) => n || 'Waiter';
    openOrders.forEach((o) => {
      const name = nameOf(o.placedBy);
      const w = waiters.get(name) || { name, tables: new Set(), due: 0, ready: 0 };
      w.tables.add(o.tableNumber);
      w.due += perOrderDue[o.id] || 0;
      waiters.set(name, w);
    });
    live.filter((k) => k.status === 'ready').forEach((k) => {
      const name = nameOf(orderById.get(k.parentOrder)?.placedBy || k.placedBy);
      const w = waiters.get(name) || { name, tables: new Set([k.tableNumber]), due: 0, ready: 0 };
      w.ready += 1;
      waiters.set(name, w);
    });
    const onShift = new Set(data.shifts.map((s) => s.waiter));
    const staffByName = new Map(data.staff.map((s) => [s.displayName || s.username, s]));
    return {
      openOrders,
      live,
      due,
      paid,
      requests: openOrders.filter((o) => o.billRequestedAt && !o.billReadyAt && o.paymentStatus !== 'paid').length,
      count: (s) => live.filter((k) => k.status === s).length,
      orderById,
      waiters: [...waiters.values()].map((w) => ({ ...w, onShift: onShift.has(staffByName.get(w.name)?.id) }))
        .sort((a, b) => b.due - a.due),
    };
  }, [data]);

  if (!view) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const tiles = [
    { label: tx.open, value: view.openOrders.length, icon: Activity, style: 'text-primary' },
    { label: tx.requests, value: view.requests, icon: HandCoins, style: view.requests ? 'text-amber-700' : 'text-primary' },
    { label: tx.waiting, value: view.count('pending'), icon: Clock, style: 'text-red-700' },
    { label: tx.cooking, value: view.count('preparing'), icon: CookingPot, style: 'text-amber-700' },
    { label: tx.ready, value: view.count('ready'), icon: Bell, style: 'text-emerald-700' },
    { label: tx.due, value: euro(view.due), icon: Euro, style: 'text-red-700' },
    { label: tx.paid, value: euro(view.paid), icon: Euro, style: 'text-emerald-700' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Activity className="h-5 w-5" />{tx.title}</h2>
        <button type="button" onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Refresh">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {tx.updated} {new Date(data.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {tiles.map(({ label, value, icon: Icon, style }) => (
          <div key={label} className="rounded-xl border-2 border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{label}</p>
            <p className={`text-2xl font-bold mt-1 ${style}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border-2 border-border bg-card">
        <h3 className="px-4 py-3 font-bold text-primary flex items-center gap-2 border-b border-border"><ChefHat className="h-4 w-4" />{tx.kots} ({view.live.length})</h3>
        {view.live.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{tx.noKots}</p>
        ) : (
          <ul className="divide-y divide-border">
            {view.live.map((k) => {
              const age = Math.max(0, Math.round((now - new Date(k.created).getTime()) / 60000));
              const parent = view.orderById.get(k.parentOrder);
              return (
                <li key={k.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="font-bold w-14 shrink-0">{tx.table} {k.tableLabel || k.tableNumber}</span>
                  <span className="min-w-0 flex-1 text-sm truncate">
                    {(k.items || []).map((it) => `${it.quantity}× ${it.name}`).join(', ')}
                    <span className="block text-[11px] text-muted-foreground">{parent?.placedBy || k.placedBy || ''}</span>
                  </span>
                  <span className={`text-xs font-semibold shrink-0 ${age >= 20 && k.status !== 'ready' ? 'text-red-700' : 'text-muted-foreground'}`}>{age} {tx.min}</span>
                  <span className={`text-[11px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${STATUS_STYLE[k.status]}`}>{tx.st[k.status]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border-2 border-border bg-card">
        <h3 className="px-4 py-3 font-bold text-primary flex items-center gap-2 border-b border-border"><Users className="h-4 w-4" />{tx.waiters}</h3>
        {view.waiters.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{tx.noWaiters}</p>
        ) : (
          <ul className="divide-y divide-border">
            {view.waiters.map((w) => (
              <li key={w.name} className="px-4 py-2.5 flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${w.onShift ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} title={w.onShift ? tx.onShift : ''} />
                <span className="min-w-0 flex-1">
                  <span className="font-bold block truncate">{w.name}</span>
                  <span className="text-[11px] text-muted-foreground">{w.tables.size} {tx.tables}{w.ready ? ` · ${w.ready} ${tx.ready.toLowerCase()}` : ''}</span>
                </span>
                <span className="font-bold text-red-700 shrink-0">{euro(w.due)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
