import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Plus, ArrowLeft, Loader2, Send, Save, Trash2, XCircle, Calculator, PackageCheck,
  Play, Printer, AlertTriangle, CheckCircle2, ChefHat, Copy, Bell, PackagePlus, BarChart3, ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { pbDateFilter } from '@/lib/pbDateFilter.js';
import { printHtmlPage } from '@/lib/staffApp.js';
import { issueFromStock } from '@/lib/stockIssue.js';
import {
  weekStartOf, nextWeekStart, isoDay, weekNumber, parseJson, portionsSold, ingredientNeeds,
  niceQty, convertQty, round, OPEN_FOR_STOCK, RECIPE_UNITS, stockFor,
} from '@/lib/kitchenPlanning.js';

// Weekly ingredient requests. mode "kitchen": the kitchen manager plans the
// week (from recipes and last week's sales) and sends the list. mode "stock":
// the stock manager gives out what is in store and completes the request.

const T = {
  en: {
    title: 'Weekly stock requests', subKitchen: 'Plan next week\'s ingredients and send the list to the stock manager.',
    subStock: 'Requests from the kitchen manager. Give out what is in store and mark what you still need to buy.',
    newReq: 'New request', week: 'Week', neededBy: 'Needed by', status: {
      draft: 'Draft', submitted: 'Sent', in_progress: 'Being prepared', partial: 'Partly given', fulfilled: 'Done', cancelled: 'Cancelled',
    },
    lines: (n) => `${n} item${n === 1 ? '' : 's'}`, by: 'by', none: 'No requests yet.', open: 'Open', done: 'Earlier',
    back: 'Back', plan: 'Plan from recipes', planSub: 'Portions sold in the last 7 days. Change the plan, then calculate.',
    dish: 'Dish', sold: 'Sold', planned: 'Plan', growth: 'Extra', calc: 'Calculate ingredients', calcDone: (n) => `${n} ingredients added from recipes`,
    noRecipes: 'No recipes yet. Add recipes first to plan from sales.', noRecipeSold: (n) => `${n} dish${n === 1 ? '' : 'es'} sold last week ${n === 1 ? 'has' : 'have'} no recipe.`,
    item: 'Item', qty: 'Qty', unit: 'Unit', inStore: 'In store', note: 'Note', addLine: 'Add item', notes: 'Notes for the stock manager',
    saveDraft: 'Save draft', send: 'Send to stock manager', cancelReq: 'Cancel request', del: 'Delete draft', sent: 'Request sent to the stock manager',
    saved: 'Draft saved', cancelled: 'Request cancelled', deleted: 'Draft deleted', empty: 'Add at least one item.', failed: 'Could not save',
    locked: 'The stock manager is working on this request. Ask them for changes.',
    requested: 'Asked', given: 'Given', give: 'Give now', short: 'To buy', start: 'Start preparing', issue: 'Give out and finish',
    stockNote: 'Note for the kitchen', shopping: 'Shopping list', started: 'Marked as being prepared', issued: (n) => `Given out ${n} items. Stock updated.`,
    partialHint: 'Items still short stay open. You can give the rest later.', notLinked: 'not in stock list', allDone: 'Everything was given.',
    newOpen: (w) => `New stock request for week ${w}`, statusChanged: (w, s) => `Stock request week ${w}: ${s}`,
    confirmCancel: 'Cancel this request?', confirmDelete: 'Delete this draft?', requestedBy: 'Requested by', givenBy: 'Given by',
    copyLast: (w) => `Copy items from week ${w}`, copied: (n) => `${n} items copied. Check the amounts.`,
    remind: (w) => `The list for next week (week ${w}) has not been sent yet.`, remindDraft: (w) => `The draft for week ${w} has not been sent yet.`,
    startNow: 'Start it now', openDraft: 'Open draft',
    confirmTitle: 'Did everything arrive?', confirmHint: 'Confirm when the goods are in the kitchen. Write down anything missing or damaged.',
    receivedNote: 'Missing or damaged (optional)', confirmBtn: 'Confirm received', receivedOk: 'Receipt confirmed',
    receivedBy: (n, d) => `Received by ${n} on ${d}`, toConfirm: 'Confirm receipt',
    usage: 'Check use against sales', usageSub: (d) => `Expected use from ${d} of sales × recipes.`, used: 'Used', left: 'Left',
    usageNone: 'No sales with recipes in this week yet.',
    addStock: 'Add to stock list', linked: (n) => `${n} is now in the stock list`,
    allShopping: 'Shopping list (all open)', belowMin: 'Below minimum', topUp: 'top up to minimum', forKitchen: 'For the kitchen',
    nothingToBuy: 'Nothing to buy right now.',
    badUnit: (n) => `Not given, the unit does not match the stock list: ${n}`,
  },
  de: {
    title: 'Wöchentliche Lageranforderung', subKitchen: 'Zutaten für nächste Woche planen und die Liste an das Lager schicken.',
    subStock: 'Anforderungen der Küchenleitung. Vorhandenes ausgeben und notieren, was noch eingekauft werden muss.',
    newReq: 'Neue Anforderung', week: 'KW', neededBy: 'Benötigt bis', status: {
      draft: 'Entwurf', submitted: 'Gesendet', in_progress: 'In Vorbereitung', partial: 'Teilweise ausgegeben', fulfilled: 'Erledigt', cancelled: 'Storniert',
    },
    lines: (n) => `${n} Artikel`, by: 'von', none: 'Noch keine Anforderungen.', open: 'Offen', done: 'Frühere',
    back: 'Zurück', plan: 'Aus Rezepten planen', planSub: 'Verkaufte Portionen der letzten 7 Tage. Plan anpassen, dann berechnen.',
    dish: 'Gericht', sold: 'Verkauft', planned: 'Plan', growth: 'Zuschlag', calc: 'Zutaten berechnen', calcDone: (n) => `${n} Zutaten aus Rezepten übernommen`,
    noRecipes: 'Noch keine Rezepte. Zuerst Rezepte anlegen, um aus Verkäufen zu planen.', noRecipeSold: (n) => `${n} letzte Woche verkaufte${n === 1 ? 's Gericht hat' : ' Gerichte haben'} kein Rezept.`,
    item: 'Artikel', qty: 'Menge', unit: 'Einheit', inStore: 'Im Lager', note: 'Notiz', addLine: 'Artikel hinzufügen', notes: 'Notiz für das Lager',
    saveDraft: 'Entwurf speichern', send: 'An das Lager senden', cancelReq: 'Anforderung stornieren', del: 'Entwurf löschen', sent: 'Anforderung an das Lager gesendet',
    saved: 'Entwurf gespeichert', cancelled: 'Anforderung storniert', deleted: 'Entwurf gelöscht', empty: 'Mindestens einen Artikel eintragen.', failed: 'Speichern fehlgeschlagen',
    locked: 'Das Lager bearbeitet diese Anforderung bereits. Änderungen bitte mit dem Lager absprechen.',
    requested: 'Angefordert', given: 'Ausgegeben', give: 'Jetzt ausgeben', short: 'Einkaufen', start: 'Vorbereitung starten', issue: 'Ausgeben und abschließen',
    stockNote: 'Notiz für die Küche', shopping: 'Einkaufsliste', started: 'Als „in Vorbereitung“ markiert', issued: (n) => `${n} Artikel ausgegeben. Lager aktualisiert.`,
    partialHint: 'Fehlende Artikel bleiben offen und können später ausgegeben werden.', notLinked: 'nicht in der Lagerliste', allDone: 'Alles wurde ausgegeben.',
    newOpen: (w) => `Neue Lageranforderung für KW ${w}`, statusChanged: (w, s) => `Lageranforderung KW ${w}: ${s}`,
    confirmCancel: 'Diese Anforderung stornieren?', confirmDelete: 'Diesen Entwurf löschen?', requestedBy: 'Angefordert von', givenBy: 'Ausgegeben von',
    copyLast: (w) => `Artikel aus KW ${w} übernehmen`, copied: (n) => `${n} Artikel übernommen. Mengen bitte prüfen.`,
    remind: (w) => `Die Liste für nächste Woche (KW ${w}) ist noch nicht gesendet.`, remindDraft: (w) => `Der Entwurf für KW ${w} ist noch nicht gesendet.`,
    startNow: 'Jetzt anlegen', openDraft: 'Entwurf öffnen',
    confirmTitle: 'Ist alles angekommen?', confirmHint: 'Bestätigen, sobald die Ware in der Küche ist. Fehlendes oder Beschädigtes notieren.',
    receivedNote: 'Fehlt oder beschädigt (optional)', confirmBtn: 'Erhalt bestätigen', receivedOk: 'Erhalt bestätigt',
    receivedBy: (n, d) => `Erhalten von ${n} am ${d}`, toConfirm: 'Erhalt bestätigen',
    usage: 'Verbrauch mit Verkäufen vergleichen', usageSub: (d) => `Erwarteter Verbrauch aus den Verkäufen von ${d} × Rezepten.`, used: 'Verbraucht', left: 'Übrig',
    usageNone: 'In dieser Woche noch keine Verkäufe mit Rezept.',
    addStock: 'In Lagerliste aufnehmen', linked: (n) => `${n} ist jetzt in der Lagerliste`,
    allShopping: 'Einkaufsliste (alle offenen)', belowMin: 'Unter Mindestbestand', topUp: 'auf Mindestbestand auffüllen', forKitchen: 'Für die Küche',
    nothingToBuy: 'Derzeit nichts einzukaufen.',
    badUnit: (n) => `Nicht ausgegeben, Einheit passt nicht zur Lagerliste: ${n}`,
  },
};

const STATUS_TONE = {
  draft: 'bg-muted text-muted-foreground', submitted: 'bg-blue-600/10 text-blue-700', in_progress: 'bg-amber-500/15 text-amber-800',
  partial: 'bg-orange-500/15 text-orange-800', fulfilled: 'bg-green-600/10 text-green-700', cancelled: 'bg-destructive/10 text-destructive',
};

const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const fmtQty = (n) => { const v = round(n, 2); return Number.isInteger(v) ? String(v) : String(v); };

export default function StockRequests({ client, mode = 'kitchen', user = {} }) {
  const { language } = useLanguage();
  const de = language === 'de';
  const tx = T[de ? 'de' : 'en'];
  const isStock = mode === 'stock';
  const [requests, setRequests] = useState([]);
  const [stock, setStock] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(null); // request being viewed / edited
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null); // { rows, recipes, menu, missing }
  const [growth, setGrowth] = useState(0);
  const [usage, setUsage] = useState(null); // { byKey, days } expected use from sales

  const dateFmt = useCallback((d) => d.toLocaleDateString(de ? 'de-AT' : 'en-GB', { day: 'numeric', month: 'short' }), [de]);
  const weekLabel = useCallback((ws) => {
    const s = toDate(ws); if (!s) return '';
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return `${tx.week} ${weekNumber(s)} · ${dateFmt(s)} – ${dateFmt(e)}`;
  }, [tx, dateFmt]);

  const load = useCallback(async () => {
    const opts = { $autoCancel: false, requestKey: null };
    try {
      const since = pbDateFilter(new Date(Date.now() - 120 * 86400000));
      const [r, s, l] = await Promise.all([
        client.collection('stock_requests').getFullList({ ...opts, filter: `weekStart >= "${since}"`, sort: '-weekStart,-created' }),
        client.collection('stock_items').getFullList({ ...opts, sort: 'name', fields: 'id,name,unit,quantity,unitCost,minStock,category' }).catch(() => []),
        isStock ? client.collection('stock_lots').getFullList({ ...opts, fields: 'id,stockItem,quantity,remainingQty,expiry,status,location' }).catch(() => []) : Promise.resolve([]),
      ]);
      setRequests(r); setStock(s); setLots(l);
      return r;
    } catch (err) {
      console.error('[StockRequests] load failed', err);
      toast.error(de ? 'Anforderungen konnten nicht geladen werden' : 'Could not load requests');
      return [];
    } finally {
      setLoading(false);
    }
  }, [client, isStock, de]);

  useEffect(() => { load(); }, [load]);

  // Live updates: new requests for the stock manager, status changes for the kitchen.
  useEffect(() => {
    let unsub = null; let alive = true;
    client.collection('stock_requests').subscribe('*', (e) => {
      const r = e.record; const wk = weekNumber(toDate(r.weekStart) || new Date());
      if (isStock && e.action !== 'delete' && r.status === 'submitted' && !r.startedAt) toast(tx.newOpen(wk), { icon: '📦' });
      if (!isStock && e.action === 'update' && ['in_progress', 'partial', 'fulfilled'].includes(r.status)) toast(tx.statusChanged(wk, tx.status[r.status]), { icon: '📦' });
      load().then((list) => {
        setCurrent((c) => (c && c.id ? list.find((x) => x.id === c.id) || c : c));
      });
    }).then((fn) => { if (alive) unsub = fn; else fn(); }).catch(() => {});
    return () => { alive = false; if (unsub) unsub(); };
  }, [client, isStock, load, tx]);

  const stockById = useMemo(() => Object.fromEntries(stock.map((s) => [s.id, s])), [stock]);
  const stockByName = useMemo(() => Object.fromEntries(stock.map((s) => [String(s.name).trim().toLowerCase(), s])), [stock]);
  // The stock item for a line: linked, or found by name.
  const itemFor = useCallback((line) => stockFor(line, stockById), [stockById]);
  const inStore = useCallback((line) => {
    const item = itemFor(line);
    if (!item) return null;
    return convertQty(Number(item.quantity) || 0, item.unit, line.unit || item.unit);
  }, [itemFor]);

  const weekOptions = useMemo(() => {
    const out = []; const first = weekStartOf(new Date());
    for (let i = 0; i < 5; i += 1) { const d = new Date(first); d.setDate(d.getDate() + i * 7); out.push(isoDay(d)); }
    return out;
  }, []);

  // Most recent request with items, to copy from.
  const lastRequest = useMemo(() => requests
    .filter((r) => r.status !== 'cancelled' && r.id !== current?.id && parseJson(r.items, []).length)
    .sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)) || String(b.created).localeCompare(String(a.created)))[0] || null,
  [requests, current]);

  // From Thursday on, remind the kitchen manager to send next week's list.
  const reminder = useMemo(() => {
    if (isStock) return null;
    const now = new Date();
    if ((now.getDay() + 6) % 7 < 3) return null;
    const ws = isoDay(nextWeekStart(now));
    const forWeek = requests.filter((r) => isoDay(toDate(r.weekStart)) === ws && r.status !== 'cancelled');
    if (forWeek.some((r) => r.status !== 'draft')) return null;
    return { week: weekNumber(new Date(`${ws}T00:00:00`)), draft: forWeek[0] || null };
  }, [isStock, requests]);

  const startNew = () => {
    const ws = isoDay(nextWeekStart());
    setCurrent({ id: null, status: 'draft' });
    setForm({ weekStart: ws, neededBy: ws, items: [], notes: '' });
    setPlan(null);
  };

  const openRequest = (r) => {
    setCurrent(r);
    setForm({
      weekStart: isoDay(toDate(r.weekStart)),
      neededBy: r.neededBy ? isoDay(toDate(r.neededBy)) : '',
      items: parseJson(r.items, []).map((l) => ({ ...l, give: '' })),
      notes: r.notes || '',
      stockNote: r.stockNote || '',
      receivedNote: r.receivedNote || '',
    });
    setPlan(null);
    setUsage(null);
  };

  const close = () => { setCurrent(null); setForm(null); setPlan(null); setUsage(null); };

  const copyLast = () => {
    if (!lastRequest) return;
    const items = parseJson(lastRequest.items, []).map((l) => {
      const { fulfilledQty, give, ...rest } = l; void fulfilledQty; void give;
      return { ...rest, note: rest.note || '' };
    });
    setForm((f) => ({ ...f, items }));
    toast.success(tx.copied(items.length));
  };

  const editable = !isStock && current && ['draft', 'submitted'].includes(current.status || 'draft');
  const setLine = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const onItemName = (i, value) => {
    const m = stockByName[value.trim().toLowerCase()];
    if (m) setLine(i, { name: m.name, stockItem: m.id, unit: m.unit || 'pcs' });
    else setLine(i, { name: value, stockItem: '' });
  };

  // ---- planning from recipes ----
  const loadPlan = async () => {
    setBusy(true);
    try {
      const opts = { $autoCancel: false, requestKey: null };
      const since = pbDateFilter(new Date(Date.now() - 7 * 86400000));
      const [recipes, menu, kots] = await Promise.all([
        client.collection('recipes').getFullList(opts),
        client.collection('menu_items').getFullList({ ...opts, fields: 'id,name,nameEN,nameDE,category' }),
        client.collection('kitchen_orders').getFullList({ ...opts, filter: `created >= "${since}"`, fields: 'id,status,items' }),
      ]);
      const sold = portionsSold(kots);
      const withRecipe = new Set(recipes.map((r) => r.menuItem));
      const menuById = Object.fromEntries(menu.map((m) => [m.id, m]));
      const rows = recipes.map((r) => ({ id: r.menuItem, name: de ? menuById[r.menuItem]?.nameDE || menuById[r.menuItem]?.nameEN : menuById[r.menuItem]?.nameEN || menuById[r.menuItem]?.name, sold: sold[r.menuItem] || 0 }))
        .filter((r) => r.name).sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name));
      const missing = Object.keys(sold).filter((id) => menuById[id] && !withRecipe.has(id)).length;
      setPlan({ recipes, rows: rows.map((r) => ({ ...r, planned: r.sold })), missing });
      setGrowth(0);
    } catch (err) {
      toast.error(err?.message || tx.failed);
    } finally {
      setBusy(false);
    }
  };

  const applyGrowth = (g) => {
    setGrowth(g);
    setPlan((p) => ({ ...p, rows: p.rows.map((r) => ({ ...r, planned: Math.round(r.sold * (1 + g / 100)) })) }));
  };

  const calculate = () => {
    if (!plan) return;
    const planned = Object.fromEntries(plan.rows.map((r) => [r.id, Number(r.planned) || 0]));
    const needs = ingredientNeeds(plan.recipes, planned, stockById);
    setForm((f) => {
      const items = [...f.items];
      for (const n of needs) {
        const qty = niceQty(n.qty, n.unit);
        const i = items.findIndex((l) => (n.stockItem ? l.stockItem === n.stockItem : !l.stockItem && String(l.name).toLowerCase() === n.name.toLowerCase()));
        if (i >= 0) items[i] = { ...items[i], qty, unit: n.unit };
        else items.push({ stockItem: n.stockItem, name: n.name, unit: n.unit, qty, note: '' });
      }
      return { ...f, items: items.sort((a, b) => String(a.name).localeCompare(String(b.name))) };
    });
    toast.success(tx.calcDone(needs.length));
  };

  // ---- kitchen: save / send / cancel / delete ----
  const cleanItems = () => form.items
    .filter((l) => String(l.name || '').trim() && Number(l.qty) > 0)
    .map((l) => ({ stockItem: l.stockItem || '', name: String(l.name).trim(), unit: l.unit || '', qty: round(Number(l.qty), 3), note: l.note || '' }));

  const saveKitchen = async (status) => {
    const items = cleanItems();
    if (!items.length) { toast.error(tx.empty); return; }
    const data = {
      weekStart: pbDateFilter(new Date(`${form.weekStart}T00:00:00`)),
      neededBy: form.neededBy ? pbDateFilter(new Date(`${form.neededBy}T00:00:00`)) : '',
      items, notes: form.notes, status,
    };
    setBusy(true);
    try {
      const rec = current.id
        ? await client.collection('stock_requests').update(current.id, data, { $autoCancel: false })
        : await client.collection('stock_requests').create(data, { $autoCancel: false });
      toast.success(status === 'submitted' ? tx.sent : tx.saved);
      await load();
      if (status === 'submitted') close(); else openRequest(rec);
    } catch (err) {
      toast.error(`${tx.failed}: ${err?.message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async () => {
    if (!current?.id || !window.confirm(tx.confirmCancel)) return;
    setBusy(true);
    try {
      await client.collection('stock_requests').update(current.id, { status: 'cancelled' }, { $autoCancel: false });
      toast.success(tx.cancelled); await load(); close();
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };

  const deleteDraft = async () => {
    if (!current?.id || !window.confirm(tx.confirmDelete)) return;
    setBusy(true);
    try {
      await client.collection('stock_requests').delete(current.id, { $autoCancel: false });
      toast.success(tx.deleted); await load(); close();
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };

  // ---- stock: start / give out ----
  const remainingOf = (l) => Math.max(0, (Number(l.qty) || 0) - (Number(l.fulfilledQty) || 0));
  const defaultGive = (l) => {
    const rem = remainingOf(l);
    const have = inStore(l);
    // Not in the stock list: nothing to give from store until it is bought.
    return have == null ? 0 : Math.max(0, Math.min(rem, round(have, 3)));
  };

  const startPreparing = async () => {
    setBusy(true);
    try {
      const rec = await client.collection('stock_requests').update(current.id, { status: 'in_progress' }, { $autoCancel: false });
      toast.success(tx.started); await load(); openRequest(rec);
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };

  const giveOut = async () => {
    setBusy(true);
    try {
      // Lock the request first, so the kitchen manager cannot change or
      // cancel it while stock is going out.
      if (current.status === 'submitted') {
        await client.collection('stock_requests').update(current.id, { status: 'in_progress' }, { $autoCancel: false });
      }
      let count = 0;
      const reason = `Weekly request ${tx.week} ${weekNumber(toDate(current.weekStart))}`;
      const items = [];
      const badUnit = [];
      // Working copies: two lines for the same item must see each other's deductions.
      const liveItems = {};
      const liveLots = lots.map((x) => ({ ...x }));
      for (const l of form.items) {
        const giveRaw = l.give === '' ? defaultGive(l) : Number(l.give);
        let given = 0;
        if (giveRaw > 0) {
          const found = itemFor(l);
          if (found) {
            const item = liveItems[found.id] || (liveItems[found.id] = { ...found });
            const inItemUnit = convertQty(giveRaw, l.unit || item.unit, item.unit);
            if (inItemUnit == null) {
              badUnit.push(l.name);
            } else {
              const done = await issueFromStock(client, {
                item, lots: liveLots, qty: inItemUnit, staffId: current.requestedBy || 'kitchen', staffName: current.requestedByName || 'Kitchen',
                role: user.role || 'stock', byName: user.name || '', byId: user.id || '', reason,
              });
              given = convertQty(done, item.unit, l.unit || item.unit) ?? 0;
            }
          } else {
            given = giveRaw; // bought or handed over outside the stock list
          }
          if (given > 0) count += 1;
        }
        const { give, ...rest } = l; void give;
        const linked = !rest.stockItem ? itemFor(rest) : null;
        items.push({ ...rest, ...(linked ? { stockItem: linked.id } : {}), fulfilledQty: round((Number(l.fulfilledQty) || 0) + given, 3) });
      }
      if (badUnit.length) toast.error(tx.badUnit(badUnit.join(', ')));
      const complete = items.every((l) => (Number(l.fulfilledQty) || 0) + 1e-9 >= (Number(l.qty) || 0));
      const rec = await client.collection('stock_requests').update(current.id, {
        items, status: complete ? 'fulfilled' : 'partial', stockNote: form.stockNote || '',
      }, { $autoCancel: false });
      toast.success(tx.issued(count));
      await load();
      openRequest(rec);
    } catch (err) {
      toast.error(`${tx.failed}: ${err?.message || ''}`);
      load();
    } finally {
      setBusy(false);
    }
  };

  // ---- kitchen: confirm the goods arrived ----
  const confirmReceived = async () => {
    setBusy(true);
    try {
      const rec = await client.collection('stock_requests').update(current.id, { receivedNote: form.receivedNote || '' }, { $autoCancel: false });
      toast.success(tx.receivedOk); await load(); openRequest(rec);
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };

  // ---- kitchen: expected use in that week from sales × recipes ----
  const checkUsage = async () => {
    setBusy(true);
    try {
      const opts = { $autoCancel: false, requestKey: null };
      const start = toDate(current.weekStart);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const until = end < new Date() ? end : new Date();
      const [recipes, kots] = await Promise.all([
        client.collection('recipes').getFullList(opts),
        client.collection('kitchen_orders').getFullList({ ...opts, filter: `created >= "${pbDateFilter(start)}" && created < "${pbDateFilter(until)}"`, fields: 'id,status,items' }),
      ]);
      const byKey = {};
      for (const n of ingredientNeeds(recipes, portionsSold(kots), stockById)) {
        byKey[n.stockItem ? `s:${n.stockItem}` : `n:${n.name.toLowerCase()}`] = n;
      }
      setUsage({ byKey, days: Math.max(1, Math.round((until - start) / 86400000)), any: Object.keys(byKey).length > 0 });
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };
  const usedFor = (l) => {
    if (!usage) return null;
    const item = itemFor(l);
    const n = (item && usage.byKey[`s:${item.id}`]) || usage.byKey[`n:${String(l.name || '').trim().toLowerCase()}`];
    if (!n) return 0;
    return convertQty(n.qty, n.unit, l.unit || n.unit) ?? n.qty;
  };

  // ---- stock: put a line that is not in the stock list on it ----
  const addToStock = async (i) => {
    const l = form.items[i];
    setBusy(true);
    try {
      const opts = { $autoCancel: false };
      let item = itemFor(l);
      if (!item) {
        const u = String(l.unit || '').toLowerCase();
        item = await client.collection('stock_items').create({
          name: String(l.name).trim(), unit: u === 'g' ? 'kg' : u === 'ml' ? 'l' : (l.unit || 'pcs'), quantity: 0, category: 'Kitchen',
        }, opts);
      }
      const saved = parseJson(current.items, []).map((x, j) => (j === i ? { ...x, stockItem: item.id } : x));
      const rec = await client.collection('stock_requests').update(current.id, { items: saved }, opts);
      toast.success(tx.linked(item.name));
      await load();
      setCurrent(rec);
      setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, stockItem: item.id } : x)) }));
    } catch (err) { toast.error(err?.message || tx.failed); } finally { setBusy(false); }
  };

  // ---- stock: one shopping list for every open request plus low stock ----
  const printAllShopping = () => {
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const map = new Map();
    for (const r of requests.filter((x) => OPEN_FOR_STOCK.includes(x.status))) {
      for (const l of parseJson(r.items, [])) {
        const rem = remainingOf(l);
        if (rem <= 0) continue;
        const item = itemFor(l);
        const unit = item ? item.unit || l.unit : l.unit;
        const qty = item ? (convertQty(rem, l.unit || item.unit, unit) ?? rem) : rem;
        const key = item ? `s:${item.id}` : `n:${String(l.name).toLowerCase()}:${l.unit}`;
        const row = map.get(key) || { name: item ? item.name : l.name, unit, need: 0, have: item ? Number(item.quantity) || 0 : null, min: item ? Number(item.minStock) || 0 : 0, cost: item ? Number(item.unitCost) || 0 : 0, weeks: new Set() };
        row.need += qty; row.weeks.add(weekNumber(toDate(r.weekStart)));
        map.set(key, row);
      }
    }
    for (const it of stock) {
      const min = Number(it.minStock) || 0;
      if (!map.has(`s:${it.id}`) && min > 0 && (Number(it.quantity) || 0) < min) {
        map.set(`s:${it.id}`, { name: it.name, unit: it.unit, need: 0, have: Number(it.quantity) || 0, min, cost: Number(it.unitCost) || 0, weeks: new Set() });
      }
    }
    const rows = [...map.values()].map((r) => {
      const have = r.have ?? 0;
      const forKitchen = Math.max(0, r.need - have);
      const topUp = r.min > 0 ? Math.max(0, r.min - Math.max(0, have - r.need)) : 0;
      return { ...r, buy: round(forKitchen + topUp, 2), topUp };
    }).filter((r) => r.buy > 0).sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) { toast(tx.nothingToBuy); return; }
    const total = rows.reduce((a, r) => a + r.buy * r.cost, 0);
    const title = `${tx.allShopping} · ${dateFmt(new Date())}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:18px;font-size:13px}h1{font-size:18px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:4px;text-align:left}.r{text-align:right}.m{color:#666;font-size:11px}</style></head><body>
<h1>${esc(title)}</h1><table><tr><th>${tx.item}</th><th class="r">${tx.forKitchen}</th><th class="r">${tx.inStore}</th><th class="r">${tx.short}</th><th class="r">€</th></tr>
${rows.map((r) => `<tr><td>${esc(r.name)}${r.weeks.size ? `<div class="m">${tx.week} ${[...r.weeks].sort().join(', ')}</div>` : ''}${r.topUp > 0 ? `<div class="m">${tx.topUp} (${fmtQty(r.min)} ${esc(r.unit)})</div>` : ''}</td><td class="r">${r.need > 0 ? `${fmtQty(r.need)} ${esc(r.unit)}` : '—'}</td><td class="r">${r.have == null ? '—' : `${fmtQty(r.have)} ${esc(r.unit)}`}</td><td class="r"><b>${fmtQty(r.buy)} ${esc(r.unit)}</b></td><td class="r">${r.cost > 0 ? (r.buy * r.cost).toFixed(2) : ''}</td></tr>`).join('')}
</table>${total > 0 ? `<p class="r"><b>≈ €${total.toFixed(2)}</b></p>` : ''}</body></html>`;
    printHtmlPage(html, title);
  };

  const printList = (onlyShort) => {
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = form.items.map((l) => {
      const have = inStore(l); const rem = remainingOf(l);
      const buy = have == null ? rem : Math.max(0, rem - have);
      return { l, rem, have, buy };
    }).filter((r) => (onlyShort ? r.buy > 0 : true));
    const title = `${onlyShort ? tx.shopping : tx.title} · ${weekLabel(current.weekStart)}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:18px;font-size:13px}h1{font-size:18px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:4px;text-align:left}.r{text-align:right}</style></head><body>
<h1>${esc(title)}</h1><table><tr><th>${tx.item}</th><th class="r">${tx.requested}</th><th class="r">${tx.inStore}</th><th class="r">${tx.short}</th></tr>
${rows.map((r) => `<tr><td>${esc(r.l.name)}</td><td class="r">${fmtQty(r.rem)} ${esc(r.l.unit)}</td><td class="r">${r.have == null ? '—' : `${fmtQty(r.have)} ${esc(r.l.unit)}`}</td><td class="r"><b>${r.buy > 0 ? `${fmtQty(r.buy)} ${esc(r.l.unit)}` : ''}</b></td></tr>`).join('')}
</table>${form.notes ? `<p>${esc(form.notes)}</p>` : ''}</body></html>`;
    printHtmlPage(html, title);
  };

  // ---------------- render ----------------
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (current && form) {
    const status = current.status || 'draft';
    const lines = form.items;
    return (
      <div className="space-y-4">
        <button type="button" onClick={close} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" />{tx.back}</button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-serif font-bold text-primary">{weekLabel(form.weekStart)}</h2>
            <p className="text-xs text-muted-foreground">
              {current.requestedByName && <>{tx.requestedBy} {current.requestedByName}</>}
              {current.fulfilledByName && <> · {tx.givenBy} {current.fulfilledByName}</>}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[status]}`}>{tx.status[status]}</span>
        </div>

        {editable ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{tx.week}
              <select value={form.weekStart} onChange={(e) => setForm((f) => ({ ...f, weekStart: e.target.value, neededBy: e.target.value }))}
                className="mt-1 block h-11 w-full rounded-lg border-2 border-border bg-background px-2 text-sm">
                {[...new Set([form.weekStart, ...weekOptions])].sort().map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">{tx.neededBy}
              <input type="date" value={form.neededBy} onChange={(e) => setForm((f) => ({ ...f, neededBy: e.target.value }))}
                className="mt-1 block h-11 w-full rounded-lg border-2 border-border bg-background px-2 text-sm" />
            </label>
          </div>
        ) : (
          <p className="text-sm">{tx.neededBy}: <b>{form.neededBy ? dateFmt(new Date(`${form.neededBy}T00:00:00`)) : '—'}</b></p>
        )}

        {!isStock && !editable && status === 'in_progress' && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900">{tx.locked}</p>
        )}

        {editable && lastRequest && (
          <button type="button" onClick={copyLast} className="h-10 rounded-lg border-2 border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5">
            <Copy className="h-4 w-4" />{tx.copyLast(weekNumber(toDate(lastRequest.weekStart)))}
          </button>
        )}

        {editable && (
          <section className="rounded-2xl border-2 border-border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-primary flex items-center gap-2"><ChefHat className="h-4 w-4" />{tx.plan}</h3>
              {!plan && (
                <button type="button" onClick={loadPlan} disabled={busy} className="h-10 rounded-lg border-2 border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}{tx.plan}
                </button>
              )}
            </div>
            {plan && (
              plan.rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{tx.noRecipes}</p> : (
                <div className="mt-2 space-y-3">
                  <p className="text-xs text-muted-foreground">{tx.planSub}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{tx.growth}:</span>
                    {[0, 10, 20, 30].map((g) => (
                      <button key={g} type="button" onClick={() => applyGrowth(g)}
                        className={`h-8 rounded-full border-2 px-3 text-xs font-bold ${growth === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>+{g}%</button>
                    ))}
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-2 py-1.5 text-left">{tx.dish}</th><th className="px-2 py-1.5 text-right">{tx.sold}</th><th className="px-2 py-1.5 text-right">{tx.planned}</th></tr></thead>
                      <tbody>
                        {plan.rows.map((r, i) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="px-2 py-1">{r.name}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{r.sold}</td>
                            <td className="px-2 py-1 text-right">
                              <input type="number" min="0" inputMode="numeric" value={r.planned} aria-label={`${tx.planned} ${r.name}`}
                                onChange={(e) => setPlan((p) => ({ ...p, rows: p.rows.map((x, j) => (j === i ? { ...x, planned: e.target.value } : x)) }))}
                                className="h-9 w-20 rounded-md border-2 border-border bg-background px-2 text-right text-sm" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {plan.missing > 0 && <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{tx.noRecipeSold(plan.missing)}</p>}
                  <button type="button" onClick={calculate} className="h-11 rounded-xl bg-secondary px-4 text-sm font-bold text-secondary-foreground inline-flex items-center gap-2"><Calculator className="h-4 w-4" />{tx.calc}</button>
                </div>
              )
            )}
          </section>
        )}

        <section className="rounded-2xl border-2 border-border bg-card">
          <datalist id="request-stock-items">{stock.map((s) => <option key={s.id} value={s.name}>{s.unit}</option>)}</datalist>
          <ul className="divide-y divide-border">
            {lines.map((l, i) => {
              const have = inStore(l);
              const rem = remainingOf(l);
              const shortBy = have == null ? null : Math.max(0, rem - have);
              return (
                <li key={i} className="p-3">
                  {editable ? (
                    <>
                      <div className="flex gap-2">
                        <input list="request-stock-items" value={l.name} onChange={(e) => onItemName(i, e.target.value)} placeholder={tx.item} aria-label={tx.item}
                          className="h-10 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                        <button type="button" aria-label={tx.del} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                          className="h-10 w-10 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={tx.qty} placeholder={tx.qty}
                          className="h-10 w-24 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                        <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label={tx.unit}
                          className="h-10 rounded-lg border-2 border-border bg-background px-2 text-sm">
                          {[...new Set([l.unit, ...RECIPE_UNITS].filter(Boolean))].map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input value={l.note || ''} onChange={(e) => setLine(i, { note: e.target.value })} placeholder={tx.note} aria-label={tx.note}
                          className="h-10 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {have != null ? <>{tx.inStore}: <b className={shortBy > 0 ? 'text-destructive' : 'text-foreground'}>{fmtQty(have)} {l.unit}</b></> : (l.name ? tx.notLinked : '')}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {tx.requested}: <b className="text-foreground">{fmtQty(l.qty)} {l.unit}</b>
                          {Number(l.fulfilledQty) > 0 && <> · {tx.given}: <b className="text-green-700">{fmtQty(l.fulfilledQty)} {l.unit}</b></>}
                          {have != null && <> · {tx.inStore}: {fmtQty(have)} {l.unit}</>}
                          {l.note && <> · {l.note}</>}
                        </div>
                        {usage && (() => {
                          const used = usedFor(l); const got = Number(l.fulfilledQty) || 0;
                          return <div className="text-xs">{tx.used} ≈ <b>{fmtQty(used)} {l.unit}</b>{got > 0 && <> · {tx.left} ≈ <b className={got - used < 0 ? 'text-destructive' : 'text-foreground'}>{fmtQty(got - used)} {l.unit}</b></>}</div>;
                        })()}
                        {isStock && (shortBy ?? rem) > 0 && <div className="text-xs font-semibold text-destructive">{tx.short}: {fmtQty(shortBy ?? rem)} {l.unit}</div>}
                        {isStock && have == null && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {tx.notLinked}
                            {OPEN_FOR_STOCK.includes(status) && (
                              <button type="button" disabled={busy} onClick={() => addToStock(i)} className="h-8 rounded-md border border-border px-2 text-xs font-semibold text-foreground inline-flex items-center gap-1">
                                <PackagePlus className="h-3.5 w-3.5" />{tx.addStock}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {isStock && ['in_progress', 'partial', 'submitted'].includes(status) && rem > 0 && (
                        <label className="flex items-center gap-1.5 text-xs font-semibold">{tx.give}
                          <input type="number" min="0" step="any" inputMode="decimal" value={l.give === '' ? defaultGive(l) : l.give}
                            onChange={(e) => setLine(i, { give: e.target.value })} aria-label={`${tx.give} ${l.name}`}
                            className="h-10 w-24 rounded-lg border-2 border-border bg-background px-2 text-right text-sm" />
                          <span>{l.unit}</span>
                        </label>
                      )}
                      {isStock && rem <= 0 && <CheckCircle2 className="h-5 w-5 text-green-600" aria-label={tx.allDone} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="p-3 pt-0">
              <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { name: '', stockItem: '', qty: '', unit: 'kg', note: '' }] }))}
                className="h-10 rounded-lg border-2 border-dashed border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />{tx.addLine}</button>
            </div>
          )}
        </section>

        {editable ? (
          <label className="block text-sm font-semibold">{tx.notes}
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-2 border-border bg-background p-2 text-sm" />
          </label>
        ) : form.notes ? <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{form.notes}</p> : null}

        {isStock && ['submitted', 'in_progress', 'partial'].includes(status) ? (
          <label className="block text-sm font-semibold">{tx.stockNote}
            <textarea rows={2} value={form.stockNote || ''} onChange={(e) => setForm((f) => ({ ...f, stockNote: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-2 border-border bg-background p-2 text-sm" />
          </label>
        ) : current.stockNote ? <p className="rounded-lg bg-blue-600/5 p-3 text-sm whitespace-pre-wrap"><b>{tx.stockNote}:</b> {current.stockNote}</p> : null}

        {!isStock && status === 'fulfilled' && (
          current.receivedAt ? (
            <p className="rounded-lg bg-green-600/10 p-3 text-sm text-green-800">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />{tx.receivedBy(current.receivedByName || '—', dateFmt(toDate(current.receivedAt)))}
              {current.receivedNote && <span className="mt-1 block whitespace-pre-wrap text-foreground">{current.receivedNote}</span>}
            </p>
          ) : (
            <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
              <h3 className="font-bold text-primary">{tx.confirmTitle}</h3>
              <p className="text-xs text-muted-foreground">{tx.confirmHint}</p>
              <textarea rows={2} value={form.receivedNote || ''} onChange={(e) => setForm((f) => ({ ...f, receivedNote: e.target.value }))} placeholder={tx.receivedNote} aria-label={tx.receivedNote}
                className="block w-full rounded-lg border-2 border-border bg-background p-2 text-sm" />
              <button type="button" disabled={busy} onClick={confirmReceived} className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground inline-flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{tx.confirmBtn}
              </button>
            </section>
          )
        )}

        {!isStock && current.id && ['partial', 'fulfilled'].includes(status) && toDate(current.weekStart) <= new Date() && (
          <div className="space-y-1">
            <button type="button" disabled={busy} onClick={checkUsage} className="h-10 rounded-lg border-2 border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />{tx.usage}
            </button>
            {usage && <p className="text-xs text-muted-foreground">{usage.any ? tx.usageSub(de ? `${usage.days} Tagen` : `${usage.days} day${usage.days === 1 ? '' : 's'}`) : tx.usageNone}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <button type="button" disabled={busy} onClick={() => saveKitchen('submitted')} className="h-11 flex-1 sm:flex-none rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tx.send}
              </button>
              {status === 'draft' && (
                <button type="button" disabled={busy} onClick={() => saveKitchen('draft')} className="h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center gap-1.5"><Save className="h-4 w-4" />{tx.saveDraft}</button>
              )}
              {current.id && status === 'draft' && (
                <button type="button" disabled={busy} onClick={deleteDraft} className="h-11 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />{tx.del}</button>
              )}
              {current.id && status === 'submitted' && (
                <button type="button" disabled={busy} onClick={cancelRequest} className="h-11 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5"><XCircle className="h-4 w-4" />{tx.cancelReq}</button>
              )}
            </>
          )}
          {isStock && status === 'submitted' && (
            <button type="button" disabled={busy} onClick={startPreparing} className="h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center gap-1.5"><Play className="h-4 w-4" />{tx.start}</button>
          )}
          {isStock && OPEN_FOR_STOCK.includes(status) && (
            <button type="button" disabled={busy} onClick={giveOut} className="h-11 flex-1 sm:flex-none rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{tx.issue}
            </button>
          )}
          {current.id && (
            <>
              <button type="button" onClick={() => printList(true)} className="h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center gap-1.5"><Printer className="h-4 w-4" />{tx.shopping}</button>
              <button type="button" onClick={() => printList(false)} className="h-11 w-11 rounded-xl border-2 border-border inline-flex items-center justify-center" aria-label={`${tx.title} – print`}><Printer className="h-4 w-4" /></button>
            </>
          )}
        </div>
        {isStock && OPEN_FOR_STOCK.includes(status) && <p className="text-xs text-muted-foreground">{tx.partialHint}</p>}
      </div>
    );
  }

  const visible = isStock ? requests.filter((r) => r.status !== 'draft') : requests;
  const needsReceipt = (r) => !isStock && r.status === 'fulfilled' && !r.receivedAt;
  const open = visible.filter((r) => (isStock ? OPEN_FOR_STOCK : ['draft', 'submitted', 'in_progress', 'partial']).includes(r.status) || needsReceipt(r))
    .sort((a, b) => String(a.neededBy || a.weekStart).localeCompare(String(b.neededBy || b.weekStart)));
  const earlier = visible.filter((r) => !open.includes(r));

  const Card = ({ r }) => {
    const items = parseJson(r.items, []);
    return (
      <li>
        <button type="button" onClick={() => openRequest(r)} className="w-full text-left rounded-xl border-2 border-border bg-card p-3 hover:border-primary/50">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{weekLabel(r.weekStart)}</div>
              <div className="text-xs text-muted-foreground">
                {tx.lines(items.length)}{r.neededBy ? ` · ${tx.neededBy} ${dateFmt(toDate(r.neededBy))}` : ''}{r.requestedByName ? ` · ${tx.by} ${r.requestedByName}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>{tx.status[r.status]}</span>
              {needsReceipt(r) && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{tx.toConfirm}</span>}
            </div>
          </div>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-serif font-bold text-primary flex items-center gap-2"><ClipboardList className="h-5 w-5" />{tx.title}</h2>
          <p className="text-sm text-muted-foreground">{isStock ? tx.subStock : tx.subKitchen}</p>
        </div>
        {!isStock && (
          <button type="button" onClick={startNew} className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground inline-flex items-center gap-2"><Plus className="h-4 w-4" />{tx.newReq}</button>
        )}
        {isStock && (
          <button type="button" onClick={printAllShopping} className="h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center gap-2"><ShoppingCart className="h-4 w-4" />{tx.allShopping}</button>
        )}
      </div>
      {reminder && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          <Bell className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 font-semibold">{reminder.draft ? tx.remindDraft(reminder.week) : tx.remind(reminder.week)}</span>
          <button type="button" onClick={() => (reminder.draft ? openRequest(reminder.draft) : startNew())} className="h-9 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white">
            {reminder.draft ? tx.openDraft : tx.startNow}
          </button>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tx.none}</p>
      ) : (
        <>
          {open.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tx.open} ({open.length})</h3>
              <ul className="grid gap-2 lg:grid-cols-2">{open.map((r) => <Card key={r.id} r={r} />)}</ul>
            </div>
          )}
          {earlier.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tx.done}</h3>
              <ul className="grid gap-2 lg:grid-cols-2">{earlier.map((r) => <Card key={r.id} r={r} />)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Number of requests waiting for the stock manager (for a badge).
export function useOpenStockRequests(client, enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled || !client) return undefined;
    let alive = true; let unsub = null;
    const refresh = () => client.collection('stock_requests')
      .getList(1, 1, { filter: OPEN_FOR_STOCK.map((s) => `status = "${s}"`).join(' || '), $autoCancel: false, requestKey: null })
      .then((r) => { if (alive) setCount(r.totalItems); }).catch(() => {});
    refresh();
    client.collection('stock_requests').subscribe('*', refresh).then((fn) => { if (alive) unsub = fn; else fn(); }).catch(() => {});
    return () => { alive = false; if (unsub) unsub(); };
  }, [client, enabled]);
  return count;
}

// True from Thursday when next week's request has not been sent (for a dot on the KDS tab).
export function useWeeklyRequestDue(client, enabled = true) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!enabled || !client) return undefined;
    let alive = true; let unsub = null;
    const refresh = () => {
      const now = new Date();
      if ((now.getDay() + 6) % 7 < 3) { setDue(false); return; }
      const ws = nextWeekStart(now); const we = new Date(ws); we.setDate(we.getDate() + 7);
      client.collection('stock_requests').getList(1, 1, {
        filter: `weekStart >= "${pbDateFilter(ws)}" && weekStart < "${pbDateFilter(we)}" && status != "draft" && status != "cancelled"`,
        $autoCancel: false, requestKey: null,
      }).then((r) => { if (alive) setDue(r.totalItems === 0); }).catch(() => {});
    };
    refresh();
    client.collection('stock_requests').subscribe('*', refresh).then((fn) => { if (alive) unsub = fn; else fn(); }).catch(() => {});
    return () => { alive = false; if (unsub) unsub(); };
  }, [client, enabled]);
  return due;
}
