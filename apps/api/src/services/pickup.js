// Online pickup orders: pickup slots, order creation and the timed hand-over
// to the kitchen. All times the guest sees are Vienna local time.
import crypto from 'node:crypto';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const TZ = 'Europe/Vienna';

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoConfirm: true,
  slotMinutes: 15,
  minLeadMinutes: 45,
  defaultPrepMinutes: 20,
  releaseBufferMinutes: 10,
  maxDaysAhead: 14,
  maxOrdersPerSlot: 4,
  maxDishesPerSlot: 0,
  previewDays: 2,
  lunchStart: '11:30',
  lunchEnd: '13:00',
  dinnerStart: '17:30',
  dinnerEnd: '21:00',
  noteDE: '',
  noteEN: '',
};

const ACTIVE = ['received', 'confirmed', 'in_kitchen', 'ready'];

/* ---------- time helpers ---------- */

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function viennaParts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: WD[p.weekday],
    y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second),
  };
}

// Vienna local date + "HH:MM" -> real instant.
export function viennaToDate(dateStr, time) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ts) => {
    const p = viennaParts(new Date(ts));
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - ts;
  };
  let ts = guess - offsetAt(guess);
  ts = guess - offsetAt(ts);
  return new Date(ts);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// PocketBase date filters want "YYYY-MM-DD HH:MM:SS" in UTC.
export const pbDate = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

/* ---------- data ---------- */

export async function loadSettings() {
  try {
    const res = await pb.collection('pickup_settings').getList(1, 1, { sort: 'created' });
    if (res.items.length) {
      const r = res.items[0];
      const out = { ...DEFAULT_SETTINGS, id: r.id };
      Object.keys(DEFAULT_SETTINGS).forEach((k) => {
        // An empty time window means "no pickups then" (e.g. no lunch service).
        const isTime = /^(lunch|dinner)(Start|End)$/.test(k);
        if (r[k] !== undefined && r[k] !== null && (r[k] !== '' || isTime)) out[k] = r[k];
      });
      // Booleans saved as false must stay false.
      out.enabled = r.enabled === true;
      out.autoConfirm = r.autoConfirm === true;
      return out;
    }
  } catch (err) {
    logger.warn(`[pickup] settings not readable: ${err.message}`);
  }
  return { ...DEFAULT_SETTINGS };
}

async function loadClosures() {
  let closedWeekday = 3;
  let closedDates = [];
  try {
    const h = await pb.collection('restaurant_hours').getList(1, 1);
    if (h.items.length && h.items[0].closedWeekday !== undefined && h.items[0].closedWeekday !== null) closedWeekday = Number(h.items[0].closedWeekday);
  } catch { /* default Wednesday */ }
  try {
    closedDates = await pb.collection('closed_dates').getFullList();
  } catch { /* none */ }
  return { closedWeekday, closedDates };
}

async function isOrderingOn() {
  try {
    // Same record the website reads (the first one) for its "ordering on" switch.
    const r = await pb.collection('order_settings').getList(1, 1);
    return r.items.length ? r.items[0].isOrderingEnabled === true : true;
  } catch {
    return false;
  }
}

const dayOf = (v) => (v ? String(v).slice(0, 10) : '');
function closedReason(dateStr, weekday, closures) {
  if (weekday === closures.closedWeekday) return 'weekly';
  const hit = closures.closedDates.find((c) => {
    const a = dayOf(c.start_date);
    const b = dayOf(c.end_date) || a;
    return a && dateStr >= a && dateStr <= b;
  });
  return hit ? (hit.reason || 'closed') : '';
}

/* ---------- slots ---------- */

// How long before pickup the order must be placed, from the dishes chosen.
export function leadFor(items, settings) {
  let prep = 0;
  let noticeMin = 0;
  items.forEach(({ menu }) => {
    const p = Number(menu.prepMinutes) > 0 ? Number(menu.prepMinutes) : Number(settings.defaultPrepMinutes) || 0;
    prep = Math.max(prep, p);
    noticeMin = Math.max(noticeMin, (Number(menu.noticeHours) || 0) * 60);
  });
  if (!items.length) prep = Number(settings.defaultPrepMinutes) || 0;
  return { prep, lead: Math.max(Number(settings.minLeadMinutes) || 0, prep, noticeMin), noticeMin };
}

export async function computeOptions(items, { now = new Date(), settings: given } = {}) {
  const settings = given || await loadSettings();
  const closures = await loadClosures();
  const orderingOn = await isOrderingOn();
  const { prep, lead, noticeMin } = leadFor(items, settings);
  const earliest = new Date(now.getTime() + lead * 60000);
  const today = viennaParts(now).date;
  const dishes = items.reduce((s, i) => s + i.quantity, 0);

  const lastDay = addDays(today, Math.max(0, Number(settings.maxDaysAhead) || 0));
  let booked = [];
  try {
    booked = await pb.collection('orders').getFullList({
      filter: pb.filter('orderType = "pickup" && pickupDate >= {:a} && pickupDate <= {:b}', { a: today, b: lastDay }),
      fields: 'pickupDate,pickupTime,status,items',
    });
  } catch (err) {
    logger.warn(`[pickup] could not count booked slots: ${err.message}`);
  }
  booked = booked.filter((o) => ACTIVE.includes(o.status));
  const load = {};
  booked.forEach((o) => {
    const k = `${o.pickupDate} ${o.pickupTime}`;
    const n = (Array.isArray(o.items) ? o.items : []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    load[k] = load[k] || { orders: 0, dishes: 0 };
    load[k].orders += 1;
    load[k].dishes += n;
  });

  const windows = [[settings.lunchStart, settings.lunchEnd], [settings.dinnerStart, settings.dinnerEnd]]
    .map(([a, b]) => [toMin(a), toMin(b)])
    .filter(([a, b]) => a !== null && b !== null && b > a);
  const step = Math.max(5, Number(settings.slotMinutes) || 15);

  const days = [];
  for (let i = 0; i <= (Number(settings.maxDaysAhead) || 0); i += 1) {
    const date = addDays(today, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const reason = closedReason(date, weekday, closures);
    const slots = [];
    if (!reason) {
      windows.forEach(([a, b]) => {
        for (let t = a; t < b; t += step) {
          const time = toHHMM(t);
          const at = viennaToDate(date, time);
          const l = load[`${date} ${time}`] || { orders: 0, dishes: 0 };
          const full = (settings.maxOrdersPerSlot > 0 && l.orders >= settings.maxOrdersPerSlot)
            || (settings.maxDishesPerSlot > 0 && l.dishes + dishes > settings.maxDishesPerSlot);
          slots.push({ time, ok: at >= earliest && !full, full, tooSoon: at < earliest });
        }
      });
    }
    days.push({ date, weekday, closed: !!reason, reason, slots, anyOpen: slots.some((s) => s.ok) });
  }
  return {
    enabled: settings.enabled && orderingOn,
    settings: {
      slotMinutes: step,
      minLeadMinutes: settings.minLeadMinutes,
      maxDaysAhead: settings.maxDaysAhead,
      noteDE: settings.noteDE,
      noteEN: settings.noteEN,
      autoConfirm: settings.autoConfirm,
    },
    prepMinutes: prep,
    leadMinutes: lead,
    noticeHours: Math.round(noticeMin / 60),
    earliest: earliest.toISOString(),
    days,
  };
}

/* ---------- create ---------- */

export class PickupError extends Error {
  constructor(message, code = 'invalid', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function resolveItems(list) {
  if (!Array.isArray(list) || !list.length) throw new PickupError('Your cart is empty.', 'empty');
  if (list.length > 60) throw new PickupError('Too many different dishes.', 'too_many');
  const merged = new Map();
  list.forEach((x) => {
    const id = String(x && x.id || '');
    const q = Math.floor(Number(x && x.quantity));
    if (!/^[a-z0-9]{15}$/.test(id) || !Number.isFinite(q) || q < 1 || q > 50) throw new PickupError('Invalid dish in cart.', 'invalid_item');
    merged.set(id, (merged.get(id) || 0) + q);
  });
  const ids = [...merged.keys()];
  const filter = ids.map((_, i) => `id = {:i${i}}`).join(' || ');
  const params = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const menus = await pb.collection('menu_items').getFullList({ filter: pb.filter(filter, params) });
  const byId = new Map(menus.map((m) => [m.id, m]));
  const out = [];
  const unavailable = [];
  merged.forEach((quantity, id) => {
    const menu = byId.get(id);
    if (!menu || menu.availability !== true || menu.pickupBlocked === true) unavailable.push(menu ? (menu.nameDE || menu.name) : id);
    else out.push({ menu, quantity });
  });
  if (unavailable.length) throw new PickupError(`Not available for pickup: ${unavailable.join(', ')}`, 'unavailable');
  if (out.reduce((s, i) => s + i.quantity, 0) > 100) throw new PickupError('Too many dishes for one order. Please call us.', 'too_many');
  return out;
}

// eslint-disable-next-line no-control-regex -- strip control characters from guest input
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export async function createPickupOrder(body) {
  const name = clean(body.name, 80);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 30);
  const notes = clean(body.notes, 500);
  const lang = body.lang === 'en' ? 'en' : 'de';
  const date = String(body.date || '');
  const time = String(body.time || '');
  if (name.length < 2) throw new PickupError('Please enter your name.', 'name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new PickupError('Please enter a valid email address.', 'email');
  if (phone.replace(/\D/g, '').length < 6) throw new PickupError('Please enter a phone number.', 'phone');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new PickupError('Please choose a pickup time.', 'slot');

  const items = await resolveItems(body.items);
  const settings = await loadSettings();
  const opts = await computeOptions(items, { settings });
  if (!opts.enabled) throw new PickupError('Online ordering is switched off right now.', 'disabled', 409);
  const day = opts.days.find((d) => d.date === date);
  const slot = day && day.slots.find((s) => s.time === time);
  if (!slot || !slot.ok) throw new PickupError('This pickup time is no longer available. Please choose another one.', 'slot_taken', 409);

  const pickupAt = viennaToDate(date, time);
  const releaseAt = new Date(pickupAt.getTime() - (opts.prepMinutes + (Number(settings.releaseBufferMinutes) || 0)) * 60000);
  const lines = items.map(({ menu, quantity }) => ({
    id: menu.id,
    name: menu.nameEN || menu.name,
    nameDE: menu.nameDE || menu.name,
    nameEN: menu.nameEN || menu.name,
    category: menu.category,
    price: Number(menu.price) || 0,
    quantity,
    vat_Rate: menu.vat_Rate || '',
    prepMinutes: Number(menu.prepMinutes) || 0,
  }));
  const total = Math.round(lines.reduce((s, l) => s + l.price * 100 * l.quantity, 0)) / 100;
  const status = settings.autoConfirm ? 'confirmed' : 'received';
  const token = crypto.randomBytes(18).toString('hex');
  const record = await pb.collection('orders').create({
    orderType: 'pickup',
    status,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    deliveryAddress: '',
    items: lines,
    totalPrice: total,
    paymentStatus: 'pending',
    paymentMethod: 'pay_at_pickup',
    pickupDate: date,
    pickupTime: time,
    pickupAt: pickupAt.toISOString(),
    releaseAt: releaseAt.toISOString(),
    prepMinutes: opts.prepMinutes,
    notes,
    lang,
    publicToken: token,
    estimatedDeliveryTime: `${date} ${time}`,
    statusLog: [{ at: new Date().toISOString(), status, by: 'Online' }],
  });
  logger.info(`[pickup] order ${record.orderNumber} for ${date} ${time}`);
  // An order for (almost) right now goes to the kitchen at once.
  if (status === 'confirmed' && releaseAt <= new Date()) {
    try { await releaseToKitchen(record.id, 'Online'); } catch (err) { logger.error(`[pickup] immediate release failed: ${err.message}`); }
  }
  return { id: record.id, token, orderNumber: record.orderNumber };
}

export function publicView(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    customerName: o.customerName,
    pickupDate: o.pickupDate,
    pickupTime: o.pickupTime,
    items: (Array.isArray(o.items) ? o.items : []).map((i) => ({ name: i.name, nameDE: i.nameDE, nameEN: i.nameEN, quantity: i.quantity, price: i.price })),
    totalPrice: o.totalPrice,
    notes: o.notes,
    paymentStatus: o.paymentStatus,
    cancelReason: o.status === 'cancelled' ? o.cancelReason : '',
    created: o.created,
  };
}

export async function getPublicOrder(id, token) {
  if (!/^[a-z0-9]{15}$/.test(String(id)) || !/^[a-f0-9]{36}$/.test(String(token))) throw new PickupError('Order not found.', 'not_found', 404);
  let o;
  try { o = await pb.collection('orders').getOne(id); } catch { throw new PickupError('Order not found.', 'not_found', 404); }
  const a = Buffer.from(String(o.publicToken || ''));
  const b = Buffer.from(String(token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new PickupError('Order not found.', 'not_found', 404);
  try { await syncKitchenStatus([o]); } catch { /* shown as stored */ }
  return publicView(o);
}

// One change at a time per order, so a cancel can't cross a kitchen hand-over
// (the API runs as a single process).
const locks = new Map();
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return run;
}

// The guest may cancel until the order goes to the kitchen.
export async function cancelByGuest(id, token) {
  await getPublicOrder(id, token);
  return withLock(id, () => cancelByGuestNow(id));
}

async function cancelByGuestNow(id) {
  const o = await pb.collection('orders').getOne(id);
  if (!['received', 'confirmed'].includes(o.status) || o.kitchenOrder) throw new PickupError('This order is already being prepared. Please call us.', 'too_late', 409);
  const log = Array.isArray(o.statusLog) ? o.statusLog : [];
  const updated = await pb.collection('orders').update(id, {
    status: 'cancelled',
    cancelReason: o.lang === 'en' ? 'Cancelled by guest' : 'Vom Gast storniert',
    statusLog: [...log, { at: new Date().toISOString(), status: 'cancelled', by: 'Gast' }],
  });
  return publicView(updated);
}

/* ---------- hand-over to the kitchen ---------- */

// Turns a pickup order into a till order (so it can be paid and gets an RKSV
// receipt like any other order) plus a kitchen ticket on the KDS.
export function releaseToKitchen(orderId, by = 'System') {
  return withLock(orderId, () => releaseNow(orderId, by));
}

async function releaseNow(orderId, by) {
  const o = await pb.collection('orders').getOne(orderId);
  if (o.kitchenOrder) return o;
  if (!['confirmed', 'received'].includes(o.status)) throw new PickupError(`Order is ${o.status}.`, 'state', 409);

  let parentId = o.waiterOrder;
  if (!parentId) {
    const parent = await pb.collection('waiter_orders').create({
      orderType: 'preorder',
      tableNumber: o.orderNumber,
      orderStatus: 'open',
      placedBy: 'Online',
      placedByRole: 'online',
      channel: 'online',
      pickupOrder: o.id,
    });
    parentId = parent.id;
    await pb.collection('orders').update(o.id, { waiterOrder: parentId });
  }

  const stamp = Date.now().toString(36);
  const kotItems = [];
  (Array.isArray(o.items) ? o.items : []).forEach((it, li) => {
    const n = Math.max(1, Math.floor(Number(it.quantity) || 1));
    for (let u = 0; u < n; u += 1) {
      kotItems.push({
        id: it.id,
        name: it.nameEN || it.name,
        category: it.category,
        quantity: 1,
        price: Number(it.price) || 0,
        spiceLevel: 'None',
        cleared: false,
        lineId: `${it.id}-${li}-${u}-${stamp}`,
      });
    }
  });
  const d = o.pickupDate.split('-');
  const when = `${d[2]}.${d[1]}. ${o.pickupTime}`;
  const label = `Abholung ${o.orderNumber} · ${when} · ${o.customerName}`;
  const kot = await pb.collection('kitchen_orders').create({
    tableNumber: o.orderNumber,
    tableLabel: label,
    room: 'Abholung',
    items: kotItems,
    status: 'pending',
    totalPrice: o.totalPrice,
    placedBy: 'Online',
    placedByRole: 'online',
    notes: [`ABHOLUNG ${o.pickupTime}`, o.customerName, o.customerPhone, o.notes].filter(Boolean).join(' · '),
    parentOrder: parentId,
  });
  const log = Array.isArray(o.statusLog) ? o.statusLog : [];
  const updated = await pb.collection('orders').update(o.id, {
    kitchenOrder: kot.id,
    waiterOrder: parentId,
    status: 'in_kitchen',
    releasedAt: new Date().toISOString(),
    statusLog: [...log, { at: new Date().toISOString(), status: 'in_kitchen', by }],
  });
  logger.info(`[pickup] ${o.orderNumber} sent to kitchen (${by})`);
  return updated;
}

/* ---------- staff actions ---------- */

// What staff may change, from which state. The kitchen ticket and the till
// order follow along so the KDS, the waiter list and the guest page agree.
const STAFF_MOVES = {
  confirmed: ['received'],
  ready: ['confirmed', 'in_kitchen'],
  picked_up: ['confirmed', 'in_kitchen', 'ready'],
  no_show: ['confirmed', 'in_kitchen', 'ready'],
  cancelled: ['received', 'confirmed', 'in_kitchen', 'ready'],
};
const KOT_FOR = { ready: 'ready', picked_up: 'completed', no_show: 'completed', cancelled: 'cancelled' };

export async function staffSetStatus(orderId, { status, reason }, staff) {
  if (!STAFF_MOVES[status]) throw new PickupError('Unknown status.', 'status');
  if (status === 'cancelled' && staff.role === 'kds_users') throw new PickupError('Only service or admin can cancel.', 'forbidden', 403);
  return withLock(orderId, () => staffSetStatusNow(orderId, status, reason, staff));
}

async function staffSetStatusNow(orderId, status, reason, staff) {
  let o;
  try { o = await pb.collection('orders').getOne(orderId); } catch { throw new PickupError('Order not found.', 'not_found', 404); }
  if (o.orderType !== 'pickup') throw new PickupError('Not a pickup order.', 'state', 409);
  if (o.status === status) return o;
  if (!STAFF_MOVES[status].includes(o.status)) throw new PickupError(`Order is already ${o.status}.`, 'state', 409);
  // Ready or picked up before the kitchen hand-over: create the till order
  // and ticket first, so the order can still be paid with a receipt.
  if ((status === 'ready' || status === 'picked_up') && !o.kitchenOrder) {
    o = await releaseNow(o.id, staff.name);
  }

  if (o.kitchenOrder && KOT_FOR[status]) {
    try {
      const kot = await pb.collection('kitchen_orders').getOne(o.kitchenOrder);
      const target = KOT_FOR[status];
      const order = ['pending', 'preparing', 'ready', 'completed'];
      const forward = order.indexOf(target) > order.indexOf(kot.status);
      if (kot.status !== 'cancelled' && kot.status !== 'completed' && (target === 'cancelled' || forward)) {
        await pb.collection('kitchen_orders').update(kot.id, { status: target });
      }
    } catch (err) {
      if (err?.status !== 404) throw new PickupError(`Kitchen ticket could not be updated: ${err.message}`, 'kot', 409);
    }
  }
  // A cancelled or no-show order leaves nothing to pay: close the till order.
  if (o.waiterOrder && (status === 'cancelled' || status === 'no_show')) {
    try {
      const w = await pb.collection('waiter_orders').getOne(o.waiterOrder);
      if (w.paymentStatus !== 'paid' && w.orderStatus !== 'closed') {
        await pb.collection('waiter_orders').update(w.id, { orderStatus: 'closed', freed: true, endedAt: new Date().toISOString() });
      }
    } catch (err) {
      logger.warn(`[pickup] closing till order for ${o.orderNumber}: ${err.message}`);
    }
  }
  const log = Array.isArray(o.statusLog) ? o.statusLog : [];
  const patch = {
    status,
    statusLog: [...log, { at: new Date().toISOString(), status, by: staff.name }],
  };
  if (status === 'cancelled') patch.cancelReason = clean(reason, 300) || (o.lang === 'en' ? 'Cancelled by the restaurant' : 'Vom Restaurant storniert');
  const updated = await pb.collection('orders').update(o.id, patch);
  logger.info(`[pickup] ${o.orderNumber} -> ${status} (${staff.name})`);
  // Confirmed after its kitchen time already passed: send it now.
  if (status === 'confirmed' && o.releaseAt && new Date(o.releaseAt) <= new Date()) {
    try { return await releaseNow(o.id, staff.name); } catch (err) { logger.error(`[pickup] release after confirm: ${err.message}`); }
  }
  return updated;
}

export async function markSeen(orderId, staff) {
  return pb.collection('orders').update(orderId, { kitchenSeenAt: new Date().toISOString(), kitchenSeenBy: staff.name });
}

let timer = null;
// Kitchen ticket status flows back to the pickup order (guest page, admin,
// waiter). Done here because ticket updates run inside a database
// transaction that PocketBase hooks cannot join.
const KOT_TO_ORDER = { preparing: 'in_kitchen', ready: 'ready', completed: 'picked_up', cancelled: 'cancelled' };
export async function syncKitchenStatus(orders) {
  const list = orders || await pb.collection('orders').getFullList({
    filter: 'orderType = "pickup" && (status = "in_kitchen" || status = "ready") && kitchenOrder != ""',
  });
  for (const o of list) {
    if (!o.kitchenOrder || !['in_kitchen', 'ready'].includes(o.status)) continue;
    try {
      const kot = await pb.collection('kitchen_orders').getOne(o.kitchenOrder, { fields: 'id,status', $autoCancel: false });
      const next = KOT_TO_ORDER[kot.status];
      if (!next || next === o.status) continue;
      const log = Array.isArray(o.statusLog) ? o.statusLog : [];
      const updated = await pb.collection('orders').update(o.id, {
        status: next,
        statusLog: [...log, { at: new Date().toISOString(), status: next, by: 'Küche' }],
      }, { $autoCancel: false });
      Object.assign(o, updated);
    } catch (err) {
      if (err?.status === 404) continue;
      logger.warn(`[pickup] status sync ${o.orderNumber}: ${err.message}`);
    }
  }
}

export function startPickupScheduler(intervalMs = 20000) {
  if (timer) return;
  const tick = async () => {
    try {
      const due = await pb.collection('orders').getFullList({
        filter: pb.filter('orderType = "pickup" && status = "confirmed" && kitchenOrder = "" && releaseAt <= {:now}', { now: pbDate(new Date()) }),
        sort: 'releaseAt',
      });
      for (const o of due) {
        try { await releaseToKitchen(o.id, 'Automatisch'); } catch (err) { logger.error(`[pickup] release ${o.orderNumber} failed: ${err.message}`); }
      }
    } catch (err) {
      logger.warn(`[pickup] scheduler: ${err.message}`);
    }
    try { await syncKitchenStatus(); } catch (err) { logger.warn(`[pickup] status sync: ${err.message}`); }
  };
  timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  setTimeout(() => { void tick(); }, 5000).unref();
}
