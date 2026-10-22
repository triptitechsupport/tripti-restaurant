import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Loader2, Printer, Download, TrendingUp, TrendingDown, Minus, Lightbulb,
  Euro, ShoppingBag, Receipt, UtensilsCrossed, Ban, Timer, Wallet, Store,
  Clock, CalendarDays, Users, Table2, Percent, CalendarCheck, Globe,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import pb from '@/lib/pocketbaseClient.js';
import { pbDateFilter } from '@/lib/pbDateFilter.js';
import { recordsToCsv, downloadCsv } from '@/lib/csvUtils.js';
import { printHtmlPage } from '@/lib/staffApp.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { analyze, periodRange, previousRange, dayKey } from '@/lib/businessAnalysis.js';

// Business overview of the Analysis tab: sales, trends, payments, tax, menu,
// staff and tables for a chosen period, compared with the period before.

const T = {
  en: {
    title: 'Business overview', sub: 'Sales, trends, menu and staff for the chosen period, compared with the period before.',
    presets: { today: 'Today', yesterday: 'Yesterday', last7: '7 days', last30: '30 days', thisMonth: 'This month', lastMonth: 'Last month', thisYear: 'This year', custom: 'Custom' },
    from: 'From', to: 'To', refresh: 'Refresh', print: 'Print', csv: 'CSV', vsPrev: 'vs. previous period', noPrev: 'no data before',
    sales: 'Sales', orders: 'Orders', avgOrder: 'Average order', items: 'Dishes sold', paid: 'Payments taken',
    cancelled: 'Cancelled tickets', serve: 'Time to serve', pickup: 'Pickup share', perOrder: 'per order', min: 'min',
    insights: 'What stands out', daily: 'Sales per day', prevPeriod: 'Previous period', hours: 'Busiest hours', weekdays: 'Average sales per weekday',
    payments: 'Payments and receipts', cash: 'Cash', card: 'Card', other: 'Other', receipts: 'signed receipts',
    missing: (n, a) => `${n} payment${n === 1 ? '' : 's'} without a receipt (€${a})`, fiscalCancel: 'Receipt cancellations',
    vat: 'VAT (from dishes sold)', rate: 'Rate', gross: 'Gross', net: 'Net', tax: 'VAT',
    top: 'Best sellers', dish: 'Dish', qty: 'Qty', share: 'Share', categories: 'Categories', slow: 'Slow sellers', notSold: 'Not sold in this period',
    allSold: 'Every available dish sold at least once.', staff: 'Staff', waiter: 'Staff', hoursWorked: 'Hours', perHour: '€ / hour',
    tables: 'Tables', table: 'Table', channels: 'Dine-in and pickup', dineIn: 'Dine-in', pickupLabel: 'Pickup', online: 'Online orders',
    reservations: 'Reservations', guests: 'guests', declined: 'declined', none: 'No sales in this period yet.',
    failed: 'Could not load the analysis', note: 'Sales count every dish ordered and not cancelled (gross, incl. VAT). Payment method comes from the RKSV receipts.',
    more: (n) => `+${n} more`,
    ins: {
      up: (p) => `Sales are up ${p}% on the previous period.`,
      down: (p) => `Sales are down ${p}% on the previous period.`,
      flat: 'Sales are about the same as the previous period.',
      bestDay: (d, a) => `${d} is the strongest day (€${a} on average).`,
      peak: (h, a) => `Busiest hour: ${h} (€${a} in this period).`,
      top: (n, a, p) => `Best seller: ${n}, €${a} (${p}% of sales).`,
      cat: (c, p) => `${c} brings ${p}% of sales.`,
      notSold: (n) => `${n} dish${n === 1 ? '' : 'es'} on the menu did not sell. Check the list below to promote or remove them.`,
      cancel: (p, a) => `${p}% of tickets were cancelled (€${a}). Worth checking why.`,
      avg: (p, up) => `The average order is ${up ? 'up' : 'down'} ${p}%.`,
      pickup: (p) => `Pickup and online orders are ${p}% of sales.`,
      staff: (n, a) => `${n} took the most orders (€${a}).`,
      missing: (n) => `${n} payment${n === 1 ? ' has' : 's have'} no RKSV receipt yet. Open Receipts to fix this.`,
      serve: (m) => `Orders take ${m} min on average from ticket to served.`,
    },
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], wdLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
  de: {
    title: 'Geschäftsübersicht', sub: 'Umsatz, Verlauf, Speisekarte und Personal im gewählten Zeitraum, verglichen mit dem Zeitraum davor.',
    presets: { today: 'Heute', yesterday: 'Gestern', last7: '7 Tage', last30: '30 Tage', thisMonth: 'Dieser Monat', lastMonth: 'Letzter Monat', thisYear: 'Dieses Jahr', custom: 'Zeitraum' },
    from: 'Von', to: 'Bis', refresh: 'Aktualisieren', print: 'Drucken', csv: 'CSV', vsPrev: 'ggü. Vorzeitraum', noPrev: 'keine Vorwerte',
    sales: 'Umsatz', orders: 'Bestellungen', avgOrder: 'Ø Bestellung', items: 'Gerichte', paid: 'Kassiert',
    cancelled: 'Stornierte Bons', serve: 'Servierzeit', pickup: 'Abholung', perOrder: 'pro Bestellung', min: 'Min.',
    insights: 'Auffällig', daily: 'Umsatz pro Tag', prevPeriod: 'Vorzeitraum', hours: 'Stärkste Uhrzeiten', weekdays: 'Ø Umsatz pro Wochentag',
    payments: 'Zahlungen und Belege', cash: 'Bar', card: 'Karte', other: 'Sonstige', receipts: 'signierte Belege',
    missing: (n, a) => `${n} Zahlung${n === 1 ? '' : 'en'} ohne Beleg (€${a})`, fiscalCancel: 'Beleg-Stornos',
    vat: 'USt. (aus verkauften Gerichten)', rate: 'Satz', gross: 'Brutto', net: 'Netto', tax: 'USt.',
    top: 'Bestseller', dish: 'Gericht', qty: 'Menge', share: 'Anteil', categories: 'Kategorien', slow: 'Ladenhüter', notSold: 'In diesem Zeitraum nicht verkauft',
    allSold: 'Jedes verfügbare Gericht wurde mindestens einmal verkauft.', staff: 'Personal', waiter: 'Mitarbeiter', hoursWorked: 'Stunden', perHour: '€ / Std.',
    tables: 'Tische', table: 'Tisch', channels: 'Im Lokal und Abholung', dineIn: 'Im Lokal', pickupLabel: 'Abholung', online: 'Online-Bestellungen',
    reservations: 'Reservierungen', guests: 'Gäste', declined: 'abgelehnt', none: 'Noch keine Umsätze in diesem Zeitraum.',
    failed: 'Die Analyse konnte nicht geladen werden', note: 'Umsatz = alle bestellten, nicht stornierten Gerichte (brutto, inkl. USt.). Die Zahlungsart kommt aus den RKSV-Belegen.',
    more: (n) => `+${n} weitere`,
    ins: {
      up: (p) => `Der Umsatz liegt ${p}% über dem Vorzeitraum.`,
      down: (p) => `Der Umsatz liegt ${p}% unter dem Vorzeitraum.`,
      flat: 'Der Umsatz ist etwa gleich wie im Vorzeitraum.',
      bestDay: (d, a) => `${d} ist der stärkste Tag (Ø €${a}).`,
      peak: (h, a) => `Stärkste Uhrzeit: ${h} (€${a} im Zeitraum).`,
      top: (n, a, p) => `Bestseller: ${n}, €${a} (${p}% des Umsatzes).`,
      cat: (c, p) => `${c} bringt ${p}% des Umsatzes.`,
      notSold: (n) => `${n} Gericht${n === 1 ? '' : 'e'} der Karte wurde${n === 1 ? '' : 'n'} nicht verkauft. Liste unten prüfen: bewerben oder streichen.`,
      cancel: (p, a) => `${p}% der Bons wurden storniert (€${a}). Den Grund prüfen.`,
      avg: (p, up) => `Die Ø Bestellung ist um ${p}% ${up ? 'gestiegen' : 'gesunken'}.`,
      pickup: (p) => `Abholung und Online-Bestellungen sind ${p}% des Umsatzes.`,
      staff: (n, a) => `${n} hat den meisten Umsatz gebucht (€${a}).`,
      missing: (n) => `${n} Zahlung${n === 1 ? ' hat' : 'en haben'} noch keinen RKSV-Beleg. Unter „Belege“ erstellen.`,
      serve: (m) => `Von der Bestellung bis zum Servieren vergehen im Ø ${m} Min.`,
    },
    wd: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], wdLong: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  },
};

const PRESETS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'custom'];
const eur = (n) => (Number(n) || 0).toFixed(2);
const eur0 = (n) => String(Math.round(Number(n) || 0));
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const C1 = 'hsl(var(--primary))';
const C2 = 'hsl(var(--secondary))';

async function list(collection, options) {
  try {
    return await pb.collection(collection).getFullList({ $autoCancel: false, requestKey: null, ...options });
  } catch (err) {
    console.warn('[BusinessAnalysis]', collection, err?.message || err);
    return [];
  }
}

function Delta({ value, tx }) {
  if (value == null) return <span className="text-[11px] text-muted-foreground">{tx.noPrev}</span>;
  const Icon = value > 0.5 ? TrendingUp : value < -0.5 ? TrendingDown : Minus;
  const color = value > 0.5 ? 'text-green-700' : value < -0.5 ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${color}`} title={tx.vsPrev}>
      <Icon className="h-3 w-3" />{value > 0 ? '+' : ''}{value}%
    </span>
  );
}

function Tile({ icon: Icon, label, value, sub, delta, tx, tone }) {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${tone || 'text-primary'}`}>{value}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        {delta !== undefined && <Delta value={delta} tx={tx} />}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, right }) {
  return (
    <section className="rounded-2xl border-2 border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <h3 className="font-bold text-primary flex items-center gap-2 text-sm sm:text-base"><Icon className="h-4 w-4 shrink-0" />{title}</h3>
        {right}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function ShareBar({ value }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export default function BusinessAnalysis() {
  const { language } = useLanguage();
  const tx = T[language === 'de' ? 'de' : 'en'];
  const [preset, setPreset] = useState('last7');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [raw, setRaw] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAllNotSold, setShowAllNotSold] = useState(false);

  const range = useMemo(() => periodRange(preset, new Date(), custom), [preset, custom]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const prev = previousRange(range);
      const from = pbDateFilter(prev.from); const to = pbDateFilter(range.to);
      const parentFrom = pbDateFilter(new Date(prev.from.getTime() - 86400000));
      const created = `created >= "${from}" && created < "${to}"`;
      const [kots, orders, settlements, transactions, onlineOrders, reservations, timesheets, menu, staff] = await Promise.all([
        list('kitchen_orders', { filter: created, fields: 'id,created,updated,status,items,parentOrder,placedBy,tableNumber,room' }),
        list('waiter_orders', { filter: `created >= "${parentFrom}" && created < "${to}"`, fields: 'id,placedBy,tableNumber,orderType,channel' }),
        list('payment_settlements', { filter: created, fields: 'id,created,amount' }),
        list('fiskaly_transactions', { filter: created, fields: 'id,created,amount,paymentType,status,receiptType,settlement' }),
        list('orders', { filter: created, fields: 'id,created,status,totalPrice,orderType' }),
        list('table_reservations', { filter: `reservationDate >= "${pbDateFilter(range.from)}" && reservationDate < "${to}"`, fields: 'id,reservationDate,status,numberOfGuests,partySize' }),
        list('waiter_timesheets', { filter: `clockIn >= "${pbDateFilter(range.from)}" && clockIn < "${to}"`, fields: 'id,waiter,clockIn,clockOut' }),
        list('menu_items', { fields: 'id,name,nameEN,category,price,availability' }),
        list('waiter_users', { fields: 'id,username,name' }),
      ]);
      const parents = Object.fromEntries(orders.map((o) => [o.id, o]));
      const staffNames = Object.fromEntries(staff.filter((s) => s.username).map((s) => [s.username, s.name || s.username]));
      const staffIds = Object.fromEntries(staff.filter((s) => s.username).map((s) => [s.username, s.id]));
      setRaw({ kots, parents, settlements, transactions, onlineOrders, reservations, timesheets, menu, staffNames, staffIds });
    } catch (err) {
      console.error('[BusinessAnalysis] load failed', err);
      setError(tx.failed);
    } finally {
      setBusy(false);
    }
  }, [range, tx.failed]);

  useEffect(() => { load(); }, [load]);

  const a = useMemo(() => (raw ? analyze(raw, range) : null), [raw, range]);

  const dayLabel = useCallback((d) => {
    const days = a ? a.daily.length : 0;
    if (days <= 8) return tx.wd[d.getDay()] + ' ' + d.getDate() + '.';
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  }, [a, tx]);

  const insights = useMemo(() => {
    if (!a || !a.current.sales) return [];
    const out = [];
    const ch = a.change.sales;
    if (ch != null) out.push(ch > 2 ? tx.ins.up(ch) : ch < -2 ? tx.ins.down(Math.abs(ch)) : tx.ins.flat);
    const daysCovered = a.daily.length;
    if (daysCovered >= 7) {
      const best = [...a.weekdays].filter((w) => w.days).sort((x, y) => y.avg - x.avg)[0];
      if (best && best.avg) out.push(tx.ins.bestDay(tx.wdLong[best.wd], eur0(best.avg)));
    }
    const peak = [...a.hours].sort((x, y) => y.sales - x.sales)[0];
    if (peak && peak.sales) out.push(tx.ins.peak(`${hourLabel(peak.hour)}–${hourLabel(peak.hour + 1)}`, eur0(peak.sales)));
    if (a.items[0]) out.push(tx.ins.top(a.items[0].name, eur(a.items[0].sales), a.items[0].share));
    if (a.categories[0] && a.categories.length > 1) out.push(tx.ins.cat(a.categories[0].category, a.categories[0].share));
    if (a.change.avgOrder != null && Math.abs(a.change.avgOrder) >= 5) out.push(tx.ins.avg(Math.abs(a.change.avgOrder), a.change.avgOrder > 0));
    if (a.channel.pickup.sales > 0) out.push(tx.ins.pickup(a.channel.pickup.share));
    if (a.waiters.length > 1 && a.waiters[0].sales) out.push(tx.ins.staff(a.waiters[0].name, eur(a.waiters[0].sales)));
    if (a.serveAvg != null) out.push(tx.ins.serve(a.serveAvg));
    if (a.current.cancelRate >= 3) out.push(tx.ins.cancel(a.current.cancelRate, eur(a.current.cancelledValue)));
    if (a.notSold.length && daysCovered >= 7) out.push(tx.ins.notSold(a.notSold.length));
    if (a.payments.missing) out.push(tx.ins.missing(a.payments.missing));
    return out;
  }, [a, tx]);

  const periodText = useMemo(() => {
    const last = new Date(range.to.getTime() - 1);
    const f = (d) => d.toLocaleDateString(language === 'de' ? 'de-AT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return dayKey(range.from) === dayKey(last) ? f(range.from) : `${f(range.from)} – ${f(last)}`;
  }, [range, language]);

  const exportCsv = () => {
    if (!a) return;
    const daily = recordsToCsv(a.daily, [
      { key: 'day', label: 'Date' }, { key: 'sales', label: 'Sales EUR', format: eur }, { key: 'orders', label: 'Orders' },
      { key: 'prevSales', label: 'Previous period EUR', format: eur },
    ]);
    const items = recordsToCsv(a.items, [
      { key: 'name', label: 'Dish' }, { key: 'category', label: 'Category' }, { key: 'qty', label: 'Quantity' },
      { key: 'sales', label: 'Sales EUR', format: eur }, { key: 'share', label: 'Share %' },
    ]);
    const staff = recordsToCsv(a.waiters, [
      { key: 'name', label: 'Staff' }, { key: 'sales', label: 'Sales EUR', format: eur }, { key: 'orders', label: 'Orders' },
      { key: 'avgOrder', label: 'Average order EUR', format: eur }, { key: 'items', label: 'Dishes' }, { key: 'hours', label: 'Hours' },
      { key: 'cancelled', label: 'Cancelled tickets' },
    ]);
    downloadCsv(`tripti-analysis-${dayKey(range.from)}.csv`, `${daily}\r\n${items}\r\n${staff}`);
  };

  const print = () => {
    if (!a) return;
    const row = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`;
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${tx.title}</title>
<style>body{font-family:system-ui,sans-serif;font-size:12px;margin:16px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;margin:16px 0 4px}table{width:100%;border-collapse:collapse}td{padding:3px 4px;border-bottom:1px solid #ddd}.r{text-align:right}ul{padding-left:18px}</style></head><body>
<h1>Tripti Genusswelt · ${tx.title}</h1><p>${periodText}</p>
<table>${row([tx.sales, '€' + eur(a.current.sales)])}${row([tx.orders, a.current.orders])}${row([tx.avgOrder, '€' + eur(a.current.avgOrder)])}${row([tx.items, a.current.items])}${row([tx.paid, '€' + eur(a.current.paid)])}${row([tx.cash, '€' + eur(a.payments.CASH)])}${row([tx.card, '€' + eur(a.payments.CARD)])}${row([tx.cancelled, `${a.current.cancelled} (€${eur(a.current.cancelledValue)})`])}</table>
<h2>${tx.insights}</h2><ul>${insights.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
<h2>${tx.vat}</h2><table>${row([tx.rate, tx.gross, tx.net, tx.tax])}${a.vat.map((v) => row([v.pct + '%', eur(v.gross), eur(v.net), eur(v.tax)])).join('')}</table>
<h2>${tx.top}</h2><table>${a.items.slice(0, 15).map((i) => row([esc(i.name), i.qty, '€' + eur(i.sales), i.share + '%'])).join('')}</table>
<h2>${tx.staff}</h2><table>${a.waiters.map((w) => row([esc(w.name), w.orders, '€' + eur(w.sales)])).join('')}</table>
</body></html>`;
    printHtmlPage(html, tx.title);
  };

  const dailyData = a ? a.daily.map((d) => ({ ...d, label: dayLabel(d.date) })) : [];
  const hourData = a ? a.hours.map((h) => ({ ...h, label: String(h.hour).padStart(2, '0') })) : [];
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  const wdData = a ? wdOrder.map((i) => ({ ...a.weekdays[i], label: tx.wd[i] })) : [];
  const catData = a ? a.categories.slice(0, 8).map((c) => ({ name: c.category.length > 18 ? c.category.slice(0, 17) + '…' : c.category, sales: c.sales })) : [];
  const slow = a ? [...a.items].sort((x, y) => x.qty - y.qty || x.sales - y.sales).slice(0, 5) : [];
  const payTotal = a ? a.payments.CASH + a.payments.CARD + a.payments.OTHER : 0;
  const notSoldShown = a ? (showAllNotSold ? a.notSold : a.notSold.slice(0, 12)) : [];
  const tooltipEur = (v) => `€${eur(v)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">{tx.title}</h2>
          <p className="text-sm text-muted-foreground">{tx.sub}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={load} disabled={busy} className="h-10 px-3 rounded-lg border-2 border-border flex items-center gap-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50" aria-label={tx.refresh}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="hidden sm:inline">{tx.refresh}</span>
          </button>
          <button type="button" onClick={exportCsv} disabled={!a} className="h-10 px-3 rounded-lg border-2 border-border flex items-center gap-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50" aria-label={tx.csv}>
            <Download className="h-4 w-4" /><span className="hidden sm:inline">{tx.csv}</span>
          </button>
          <button type="button" onClick={print} disabled={!a} className="h-10 px-3 rounded-lg bg-primary text-primary-foreground flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50" aria-label={tx.print}>
            <Printer className="h-4 w-4" /><span className="hidden sm:inline">{tx.print}</span>
          </button>
        </div>
      </div>

      <div className="app-chip-row flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={preset === p} onClick={() => setPreset(p)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-semibold border-2 transition-colors ${preset === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
            {tx.presets[p]}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted-foreground">{tx.from}
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="mt-1 block h-10 rounded-lg border-2 border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">{tx.to}
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="mt-1 block h-10 rounded-lg border-2 border-border bg-background px-2 text-sm text-foreground" />
          </label>
        </div>
      )}
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted-foreground" />{periodText}</p>

      {error && <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
      {!a && busy && <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>}

      {a && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Tile icon={Euro} label={tx.sales} value={`€${eur(a.current.sales)}`} delta={a.change.sales} tx={tx} />
            <Tile icon={ShoppingBag} label={tx.orders} value={a.current.orders} delta={a.change.orders} tx={tx} />
            <Tile icon={Receipt} label={tx.avgOrder} value={`€${eur(a.current.avgOrder)}`} delta={a.change.avgOrder} tx={tx} />
            <Tile icon={UtensilsCrossed} label={tx.items} value={a.current.items} delta={a.change.items} tx={tx} sub={`${a.current.itemsPerOrder} ${tx.perOrder}`} />
            <Tile icon={Wallet} label={tx.paid} value={`€${eur(a.current.paid)}`} delta={a.change.paid} tx={tx} />
            <Tile icon={Ban} label={tx.cancelled} value={a.current.cancelled} tx={tx} tone={a.current.cancelRate >= 3 ? 'text-destructive' : undefined} sub={`€${eur(a.current.cancelledValue)} · ${a.current.cancelRate}%`} />
            <Tile icon={Timer} label={tx.serve} value={a.serveAvg != null ? `${a.serveAvg} ${tx.min}` : '—'} tx={tx} />
            <Tile icon={Store} label={tx.pickup} value={`${a.channel.pickup.share}%`} tx={tx} sub={`€${eur(a.channel.pickup.sales)} · ${a.channel.pickup.orders} ${tx.orders}`} />
          </div>

          {!a.current.sales ? (
            <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tx.none}</div>
          ) : (
            <>
              <Section icon={Lightbulb} title={tx.insights}>
                <ul className="space-y-2">
                  {insights.map((i) => (
                    <li key={i} className="flex gap-2 text-sm leading-snug"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />{i}</li>
                  ))}
                </ul>
              </Section>

              <Section icon={TrendingUp} title={tx.daily}>
                <div className="h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipEur} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="sales" name={tx.sales} fill={C1} radius={[4, 4, 0, 0]} />
                      <Line dataKey="prevSales" name={tx.prevPeriod} stroke={C2} strokeWidth={2} dot={false} type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section icon={Clock} title={tx.hours}>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={tooltipEur} labelFormatter={(l) => `${l}:00`} />
                        <Bar dataKey="sales" name={tx.sales} fill={C1} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
                <Section icon={CalendarDays} title={tx.weekdays}>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={wdData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={tooltipEur} />
                        <Bar dataKey="avg" name={tx.sales} fill={C2} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section icon={Wallet} title={tx.payments}>
                  <div className="grid grid-cols-3 gap-2">
                    {[['CASH', tx.cash, 'text-green-700'], ['CARD', tx.card, 'text-blue-700'], ['OTHER', tx.other, 'text-foreground']].map(([k, label, tone]) => (
                      <div key={k} className="rounded-xl bg-muted/50 p-3 min-w-0">
                        <div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div>
                        <div className={`text-lg font-bold tabular-nums ${tone}`}>€{eur(a.payments[k])}</div>
                        <div className="text-[11px] text-muted-foreground">{payTotal ? Math.round((a.payments[k] / payTotal) * 100) : 0}%</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{a.payments.receipts} {tx.receipts}{a.payments.cancellations ? ` · ${tx.fiscalCancel}: €${eur(a.payments.cancellations)}` : ''}</p>
                  {a.payments.missing > 0 && <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tx.missing(a.payments.missing, eur(a.payments.missingAmount))}</p>}
                </Section>
                <Section icon={Percent} title={tx.vat}>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-semibold">{tx.rate}</th><th className="py-1 text-right font-semibold">{tx.gross}</th><th className="py-1 text-right font-semibold">{tx.net}</th><th className="py-1 text-right font-semibold">{tx.tax}</th></tr></thead>
                    <tbody>
                      {a.vat.map((v) => (
                        <tr key={v.rate} className="border-t border-border"><td className="py-1.5 font-semibold">{v.pct}%</td><td className="py-1.5 text-right tabular-nums">€{eur(v.gross)}</td><td className="py-1.5 text-right tabular-nums">€{eur(v.net)}</td><td className="py-1.5 text-right tabular-nums">€{eur(v.tax)}</td></tr>
                      ))}
                      <tr className="border-t-2 border-border font-bold"><td className="py-1.5">Σ</td><td className="py-1.5 text-right tabular-nums">€{eur(a.vat.reduce((s, v) => s + v.gross, 0))}</td><td className="py-1.5 text-right tabular-nums">€{eur(a.vat.reduce((s, v) => s + v.net, 0))}</td><td className="py-1.5 text-right tabular-nums">€{eur(a.vat.reduce((s, v) => s + v.tax, 0))}</td></tr>
                    </tbody>
                  </table>
                </Section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section icon={UtensilsCrossed} title={tx.top}>
                  <ol className="space-y-2.5">
                    {a.items.slice(0, 10).map((i, n) => (
                      <li key={i.name + n} className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate"><span className="text-muted-foreground tabular-nums mr-1.5">{n + 1}.</span><span className="font-semibold">{i.name}</span></span>
                          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{i.qty}× · <span className="font-semibold text-foreground">€{eur(i.sales)}</span></span>
                        </div>
                        <div className="mt-1"><ShareBar value={a.items[0].sales ? (i.sales / a.items[0].sales) * 100 : 0} /></div>
                      </li>
                    ))}
                  </ol>
                </Section>
                <Section icon={Table2} title={tx.categories}>
                  <div style={{ height: Math.max(160, catData.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={tooltipEur} />
                        <Bar dataKey="sales" name={tx.sales} fill={C1} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section icon={TrendingDown} title={tx.slow}>
                  <ul className="divide-y divide-border text-sm">
                    {slow.map((i) => (
                      <li key={i.name} className="flex justify-between gap-2 py-1.5"><span className="truncate">{i.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{i.qty}× · €{eur(i.sales)}</span></li>
                    ))}
                  </ul>
                </Section>
                <Section icon={Ban} title={`${tx.notSold} (${a.notSold.length})`}>
                  {a.notSold.length === 0 ? <p className="text-sm text-muted-foreground">{tx.allSold}</p> : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {notSoldShown.map((m) => <span key={m.id} className="rounded-full bg-muted px-2.5 py-1 text-xs" title={m.category}>{m.name}</span>)}
                      </div>
                      {a.notSold.length > 12 && !showAllNotSold && (
                        <button type="button" onClick={() => setShowAllNotSold(true)} className="mt-2 text-xs font-semibold text-primary underline">{tx.more(a.notSold.length - 12)}</button>
                      )}
                    </>
                  )}
                </Section>
              </div>

              <Section icon={Users} title={tx.staff}>
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead><tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-1 font-semibold">{tx.waiter}</th><th className="px-2 py-1 text-right font-semibold">{tx.sales}</th><th className="px-2 py-1 text-right font-semibold">{tx.orders}</th><th className="px-2 py-1 text-right font-semibold">{tx.avgOrder}</th><th className="px-2 py-1 text-right font-semibold">{tx.hoursWorked}</th><th className="px-2 py-1 text-right font-semibold">{tx.perHour}</th><th className="px-3 py-1 text-right font-semibold"><Ban className="inline h-3.5 w-3.5" /></th>
                    </tr></thead>
                    <tbody>
                      {a.waiters.map((w) => (
                        <tr key={w.waiter} className="border-t border-border">
                          <td className="px-3 py-1.5 font-semibold">{w.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">€{eur(w.sales)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{w.orders}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">€{eur(w.avgOrder)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{w.hours || '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{w.perHour != null ? `€${eur(w.perHour)}` : '—'}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${w.cancelled ? 'text-destructive font-semibold' : ''}`}>{w.cancelled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <div className="grid gap-4 lg:grid-cols-3">
                <Section icon={Table2} title={tx.tables}>
                  <ul className="divide-y divide-border text-sm">
                    {a.tables.slice(0, 8).map((t) => (
                      <li key={t.table} className="flex justify-between gap-2 py-1.5"><span className="font-semibold">{tx.table} {t.table}</span><span className="tabular-nums text-muted-foreground">{t.orders} · €{eur(t.sales)}</span></li>
                    ))}
                  </ul>
                </Section>
                <Section icon={Store} title={tx.channels}>
                  {[[tx.dineIn, a.channel.dineIn], [tx.pickupLabel, a.channel.pickup]].map(([label, c]) => (
                    <div key={label} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular-nums">€{eur(c.sales)} · {c.share}%</span></div>
                      <div className="mt-1"><ShareBar value={c.share} /></div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{c.orders} {tx.orders}</div>
                    </div>
                  ))}
                </Section>
                <Section icon={CalendarCheck} title={`${tx.reservations} · ${tx.online}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{tx.reservations}</div>
                      <div className="text-lg font-bold">{a.reservations.count}</div>
                      <div className="text-[11px] text-muted-foreground">{a.reservations.guests} {tx.guests}{a.reservations.declined ? ` · ${a.reservations.declined} ${tx.declined}` : ''}</div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" />{tx.online}</div>
                      <div className="text-lg font-bold">{a.online.count}</div>
                      <div className="text-[11px] text-muted-foreground">€{eur(a.online.sales)}</div>
                    </div>
                  </div>
                </Section>
              </div>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">{tx.note}</p>
        </>
      )}
    </div>
  );
}

