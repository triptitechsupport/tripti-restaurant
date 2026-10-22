// Business analysis for the admin Analysis tab. Pure functions only, so the
// numbers can be checked without a browser.
//
// Sales are taken from kitchen tickets (every dish that was ordered and not
// cancelled), payments from payment_settlements, and the payment method
// from the RKSV receipts (fiskaly_transactions), which is the only place it
// is stored. Times use the browser's local time (the restaurant's time).

export const VAT_PERCENT = { STANDARD: 20, REDUCED_1: 10, REDUCED_2: 13, SPECIAL: 19, ZERO: 0 };

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Period presets. `to` is exclusive.
export function periodRange(preset, now = new Date(), custom = {}) {
  const today = startOfDay(now);
  switch (preset) {
    case 'today': return { from: today, to: addDays(today, 1) };
    case 'yesterday': return { from: addDays(today, -1), to: today };
    case 'last30': return { from: addDays(today, -29), to: addDays(today, 1) };
    case 'thisMonth': return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case 'lastMonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
    case 'thisYear': return { from: new Date(today.getFullYear(), 0, 1), to: addDays(today, 1) };
    case 'custom': {
      const f = custom.from ? startOfDay(toDate(`${custom.from}T00:00:00`)) : today;
      const t = custom.to ? addDays(startOfDay(toDate(`${custom.to}T00:00:00`)), 1) : addDays(today, 1);
      return t > f ? { from: f, to: t } : { from: f, to: addDays(f, 1) };
    }
    case 'last7':
    default: return { from: addDays(today, -6), to: addDays(today, 1) };
  }
}

// The period of the same length right before.
export function previousRange({ from, to }) {
  const days = Math.round((to - from) / 86400000);
  return { from: addDays(from, -days), to: new Date(from) };
}

function items(kot) {
  let list = kot && kot.items;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch (_) { list = []; } }
  return Array.isArray(list) ? list : [];
}

const lineTotal = (it) => {
  const v = Number(it.price || 0) * Number(it.quantity ?? 1);
  return Number.isFinite(v) ? v : 0;
};

const inRange = (d, r) => d && d >= r.from && d < r.to;

// Sales numbers for one period, used for the main tiles and the comparison.
export function summarize(kots, settlements, range) {
  let sales = 0; let itemsSold = 0; let cancelledValue = 0; let cancelled = 0; let tickets = 0;
  const orders = new Set();
  for (const k of kots) {
    if (!inRange(toDate(k.created), range)) continue;
    tickets += 1;
    const value = items(k).reduce((s, it) => s + lineTotal(it), 0);
    if (k.status === 'cancelled') { cancelled += 1; cancelledValue += value; continue; }
    sales += value;
    itemsSold += items(k).reduce((s, it) => s + Number(it.quantity ?? 1), 0);
    orders.add(k.parentOrder || k.id);
  }
  const paid = settlements.filter((s) => inRange(toDate(s.created), range)).reduce((s, x) => s + Number(x.amount || 0), 0);
  return {
    sales: round2(sales), orders: orders.size, items: itemsSold, tickets,
    avgOrder: orders.size ? round2(sales / orders.size) : 0,
    itemsPerOrder: orders.size ? Math.round((itemsSold / orders.size) * 10) / 10 : 0,
    cancelled, cancelledValue: round2(cancelledValue),
    cancelRate: tickets ? Math.round((cancelled / tickets) * 1000) / 10 : 0,
    paid: round2(paid),
  };
}

export function change(now, before) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 1000) / 10;
}

const PICKUP_TYPES = new Set(['pickup', 'preorder']);

export function analyze(data, range) {
  const {
    kots = [], parents = {}, settlements = [], transactions = [], onlineOrders = [],
    reservations = [], timesheets = [], menu = [], staffNames = {}, staffIds = {},
  } = data;
  const prev = previousRange(range);
  const current = summarize(kots, settlements, range);
  const before = summarize(kots, settlements, prev);

  const days = [];
  for (let d = new Date(range.from); d < range.to; d = addDays(d, 1)) days.push({ day: dayKey(d), date: new Date(d), sales: 0, orders: new Set(), prevSales: 0 });
  const dayIndex = new Map(days.map((d, i) => [d.day, i]));
  const prevDayIndex = new Map();
  for (let d = new Date(prev.from), i = 0; d < prev.to; d = addDays(d, 1), i += 1) prevDayIndex.set(dayKey(d), i);

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0, orders: new Set() }));
  const weekdays = Array.from({ length: 7 }, (_, w) => ({ wd: w, sales: 0, days: 0 }));
  days.forEach((d) => { weekdays[d.date.getDay()].days += 1; });
  const waiterMap = new Map(); const itemMap = new Map(); const catMap = new Map(); const tableMap = new Map();
  const vatMap = new Map(); const channel = { dineIn: { sales: 0, orders: new Set() }, pickup: { sales: 0, orders: new Set() } };
  const serveTimes = [];
  const soldIds = new Set(); const soldNames = new Set();

  for (const k of kots) {
    const created = toDate(k.created);
    if (!inRange(created, range)) {
      if (inRange(created, prev) && k.status !== 'cancelled') {
        const i = prevDayIndex.get(dayKey(created));
        if (i != null && days[i]) days[i].prevSales += items(k).reduce((s, it) => s + lineTotal(it), 0);
      }
      continue;
    }
    const parent = parents[k.parentOrder] || null;
    const waiter = (parent && parent.placedBy) || k.placedBy || '—';
    if (!waiterMap.has(waiter)) waiterMap.set(waiter, { waiter, name: staffNames[waiter] || waiter, sales: 0, orders: new Set(), items: 0, cancelled: 0 });
    const w = waiterMap.get(waiter);
    if (k.status === 'cancelled') { w.cancelled += 1; continue; }
    const orderKey = k.parentOrder || k.id;
    const list = items(k);
    const value = list.reduce((s, it) => s + lineTotal(it), 0);
    const day = days[dayIndex.get(dayKey(created))];
    if (day) { day.sales += value; day.orders.add(orderKey); }
    hours[created.getHours()].sales += value; hours[created.getHours()].orders.add(orderKey);
    weekdays[created.getDay()].sales += value;
    w.sales += value; w.orders.add(orderKey);
    const isPickup = parent && (PICKUP_TYPES.has(parent.orderType) || parent.channel === 'online');
    const ch = isPickup ? channel.pickup : channel.dineIn;
    ch.sales += value; ch.orders.add(orderKey);
    if (!isPickup) {
      const table = (parent && parent.tableNumber) || k.tableNumber || '—';
      if (!tableMap.has(table)) tableMap.set(table, { table, sales: 0, orders: new Set() });
      tableMap.get(table).sales += value; tableMap.get(table).orders.add(orderKey);
    }
    if (k.status === 'completed') {
      const mins = (toDate(k.updated) - created) / 60000;
      if (mins > 0 && mins < 240) serveTimes.push(mins);
    }
    for (const it of list) {
      const qty = Number(it.quantity ?? 1); const line = lineTotal(it);
      const name = String(it.name || it.itemName || 'Item');
      const cat = String(it.category || '').trim() || '—';
      w.items += qty;
      if (it.id) soldIds.add(it.id);
      soldNames.add(name.toLowerCase());
      const key = it.id || name;
      if (!itemMap.has(key)) itemMap.set(key, { name, category: cat, qty: 0, sales: 0 });
      itemMap.get(key).qty += qty; itemMap.get(key).sales += line;
      if (!catMap.has(cat)) catMap.set(cat, { category: cat, qty: 0, sales: 0 });
      catMap.get(cat).qty += qty; catMap.get(cat).sales += line;
      const rate = VAT_PERCENT[it.vat_Rate] != null ? it.vat_Rate : 'STANDARD';
      vatMap.set(rate, (vatMap.get(rate) || 0) + line);
    }
  }

  // Payment method from the RKSV receipts of this period.
  const pay = { CASH: 0, CARD: 0, OTHER: 0, receipts: 0, cancellations: 0 };
  for (const t of transactions) {
    if (!inRange(toDate(t.created), range) || t.receiptType === 'TRAINING' || t.status === 'superseded') continue;
    if (t.receiptType === 'CANCELLATION') { pay.cancellations += Math.abs(Number(t.amount || 0)); continue; }
    if (!['signed', 'outage'].includes(t.status)) continue;
    pay.receipts += 1;
    const type = t.paymentType === 'CASH' || t.paymentType === 'CARD' ? t.paymentType : 'OTHER';
    pay[type] += Number(t.amount || 0);
  }
  const receiptFor = new Set(transactions.filter((t) => t.settlement && t.status !== 'superseded').map((t) => t.settlement));
  const periodSettlements = settlements.filter((s) => inRange(toDate(s.created), range));
  const missing = periodSettlements.filter((s) => !receiptFor.has(s.id));

  // Staff hours from clock-in / clock-out.
  const hoursBy = {};
  for (const t of timesheets) {
    const a = toDate(t.clockIn); const b = toDate(t.clockOut) || null;
    if (!a || !b || !inRange(a, range)) continue;
    const h = (b - a) / 3600000;
    if (h > 0 && h < 24) hoursBy[t.waiter] = (hoursBy[t.waiter] || 0) + h;
  }

  const total = current.sales || 0;
  const share = (v) => (total ? Math.round((v / total) * 1000) / 10 : 0);
  const waiters = [...waiterMap.values()].map((w) => {
    const worked = hoursBy[staffIds[w.waiter]] || 0;
    return {
      waiter: w.waiter, name: w.name, sales: round2(w.sales), orders: w.orders.size, items: w.items, cancelled: w.cancelled,
      avgOrder: w.orders.size ? round2(w.sales / w.orders.size) : 0,
      hours: Math.round(worked * 10) / 10, perHour: worked ? round2(w.sales / worked) : null,
    };
  }).filter((w) => w.orders || w.cancelled).sort((a, b) => b.sales - a.sales);

  const itemsList = [...itemMap.values()].map((i) => ({ ...i, sales: round2(i.sales), share: share(i.sales) })).sort((a, b) => b.sales - a.sales);
  const categories = [...catMap.values()].map((c) => ({ ...c, sales: round2(c.sales), share: share(c.sales) })).sort((a, b) => b.sales - a.sales);
  const notSold = menu
    .filter((m) => m.availability !== false && !soldIds.has(m.id) && !soldNames.has(String(m.nameEN || m.name || '').toLowerCase()))
    .map((m) => ({ id: m.id, name: m.nameEN || m.name, category: m.category || '—', price: Number(m.price || 0) }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const vat = [...vatMap.entries()].map(([rate, gross]) => {
    const pct = VAT_PERCENT[rate] ?? 20;
    const net = gross / (1 + pct / 100);
    return { rate, pct, gross: round2(gross), net: round2(net), tax: round2(gross - net) };
  }).sort((a, b) => b.pct - a.pct);

  const online = { count: 0, sales: 0, cancelled: 0 };
  for (const o of onlineOrders) {
    if (!inRange(toDate(o.created), range)) continue;
    if (['cancelled', 'rejected'].includes(String(o.status || '').toLowerCase())) { online.cancelled += 1; continue; }
    online.count += 1; online.sales += Number(o.totalPrice || 0);
  }
  online.sales = round2(online.sales);

  const resv = { count: 0, guests: 0, approved: 0, declined: 0, pending: 0, completed: 0 };
  for (const r of reservations) {
    const d = toDate(r.reservationDate);
    if (!inRange(d, range)) continue;
    resv.count += 1;
    const st = String(r.status || '').toLowerCase();
    if (st === 'declined' || st === 'rejected') { resv.declined += 1; continue; }
    if (st === 'approved') resv.approved += 1; else if (st === 'completed') resv.completed += 1; else resv.pending += 1;
    resv.guests += Number(r.numberOfGuests || r.partySize || 0);
  }

  const activeHours = hours.filter((h) => h.sales > 0);
  const firstHour = activeHours.length ? activeHours[0].hour : 11;
  const lastHour = activeHours.length ? activeHours[activeHours.length - 1].hour : 22;

  return {
    range, prev, current, before,
    change: {
      sales: change(current.sales, before.sales), orders: change(current.orders, before.orders),
      avgOrder: change(current.avgOrder, before.avgOrder), items: change(current.items, before.items),
      paid: change(current.paid, before.paid),
    },
    daily: days.map((d) => ({ day: d.day, date: d.date, sales: round2(d.sales), orders: d.orders.size, prevSales: round2(d.prevSales) })),
    hours: hours.slice(Math.min(firstHour, 11), Math.max(lastHour, 22) + 1).map((h) => ({ hour: h.hour, sales: round2(h.sales), orders: h.orders.size })),
    weekdays: weekdays.map((w) => ({ wd: w.wd, sales: round2(w.sales), avg: w.days ? round2(w.sales / w.days) : 0, days: w.days })),
    waiters, items: itemsList, categories, notSold, vat,
    channel: {
      dineIn: { sales: round2(channel.dineIn.sales), orders: channel.dineIn.orders.size, share: share(channel.dineIn.sales) },
      pickup: { sales: round2(channel.pickup.sales), orders: channel.pickup.orders.size, share: share(channel.pickup.sales) },
    },
    tables: [...tableMap.values()].map((t) => ({ table: t.table, sales: round2(t.sales), orders: t.orders.size })).sort((a, b) => b.sales - a.sales),
    payments: {
      CASH: round2(pay.CASH), CARD: round2(pay.CARD), OTHER: round2(pay.OTHER), receipts: pay.receipts,
      cancellations: round2(pay.cancellations), missing: missing.length, missingAmount: round2(missing.reduce((s, x) => s + Number(x.amount || 0), 0)),
    },
    serveAvg: serveTimes.length ? Math.round((serveTimes.reduce((s, v) => s + v, 0) / serveTimes.length) * 10) / 10 : null,
    online, reservations: resv,
  };
}
