import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Phone, Mail, Clock, ChefHat, CheckCircle2, PackageCheck, XCircle, Eye, Send, Loader2, RefreshCw,
  UtensilsCrossed, StickyNote, UserX, History, Euro,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import {
  PICKUP_STATUS, TONE_CLASS, viennaToday, formatPickupDay, euro,
  staffRelease, staffSetStatus, staffMarkSeen,
} from '@/lib/pickupApi.js';

// One list of online pickup orders for admin, kitchen and service.
// role: 'admin' | 'kds' | 'waiter'. client: the signed-in PocketBase client.

const ACTIVE = ['received', 'confirmed', 'in_kitchen', 'ready'];

let audioCtx = null;
export function pickupChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'triangle';
      o.frequency.setValueAtTime([660, 880, 1320][i], audioCtx.currentTime + t);
      g.gain.setValueAtTime(0.001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.35);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.4);
    });
  } catch { /* no sound */ }
}

const viennaTime = (iso) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' }).format(new Date(iso.replace(' ', 'T')));
  } catch { return ''; }
};
const viennaDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso.replace(' ', 'T')));
  } catch { return ''; }
};
const dishName = (it, en) => (en ? (it.nameEN || it.name) : (it.nameDE || it.name)) || '?';

const QUICK_REASONS = {
  de: ['Küche ausgelastet', 'Gericht nicht verfügbar', 'Gast hat angerufen', 'Geschlossen'],
  en: ['Kitchen fully booked', 'Dish not available', 'Guest called', 'Closed'],
};

function tabsFor(role, previewDays, lang) {
  const en = lang === 'en';
  const tr = (de, e) => (en ? e : de);
  const today = viennaToday(0);
  if (role === 'kds') {
    const tabs = [{ key: 'preview', label: tr(`Alle (${previewDays + 1} Tage)`, `All (${previewDays + 1} days)`) }];
    for (let i = 0; i <= previewDays; i += 1) tabs.push({ key: `d:${viennaToday(i)}`, label: formatPickupDay(viennaToday(i), lang) });
    return tabs;
  }
  if (role === 'waiter') {
    return [{ key: `d:${today}`, label: tr('Heute', 'Today') }, { key: `d:${viennaToday(1)}`, label: tr('Morgen', 'Tomorrow') }, { key: 'upcoming', label: tr('Später', 'Later') }];
  }
  return [
    { key: 'open', label: tr('Offen', 'Open') },
    { key: `d:${today}`, label: tr('Heute', 'Today') },
    { key: `d:${viennaToday(1)}`, label: tr('Morgen', 'Tomorrow') },
    { key: 'upcoming', label: tr('Später', 'Later') },
    { key: 'past', label: tr('Vergangen', 'Past') },
  ];
}

function matchTab(o, tab) {
  const today = viennaToday(0);
  if (tab.startsWith('d:')) return o.pickupDate === tab.slice(2);
  if (tab === 'open') return o.status === 'received' || (ACTIVE.includes(o.status) && o.pickupDate >= today);
  if (tab === 'preview') return true;
  if (tab === 'upcoming') return o.pickupDate > viennaToday(1);
  if (tab === 'past') return o.pickupDate < today || !ACTIVE.includes(o.status);
  return true;
}

export default function PickupOrdersBoard({ client, role = 'admin', onActiveCount, onNewOrder, initialTab, silent = false }) {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const en = lang === 'en';
  const tr = (de, e) => (en ? e : de);
  const langRef = useRef(lang);
  langRef.current = lang;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewDays, setPreviewDays] = useState(2);
  const [tab, setTab] = useState(initialTab || (role === 'admin' ? 'open' : role === 'kds' ? 'preview' : `d:${viennaToday(0)}`));
  const [showDone, setShowDone] = useState(role === 'admin');
  const [busy, setBusy] = useState('');
  const [cancelFor, setCancelFor] = useState('');
  const [reason, setReason] = useState('');
  const [openLog, setOpenLog] = useState('');
  const known = useRef(null);
  const reloadTimer = useRef(null);

  const token = client?.authStore?.token;

  const busyLoad = useRef(false);
  const loadAgain = useRef(false);
  const load = useCallback(async () => {
    if (!client) return;
    if (busyLoad.current) { loadAgain.current = true; return; }
    busyLoad.current = true;
    try {
      const from = role === 'admin' ? viennaToday(-30) : viennaToday(0);
      const to = role === 'admin' ? viennaToday(90) : viennaToday(role === 'kds' ? previewDays : 14);
      const list = await client.collection('orders').getFullList({
        filter: client.filter('orderType = "pickup" && pickupDate >= {:from} && pickupDate <= {:to}', { from, to }),
        sort: 'pickupDate,pickupTime,created',
        $autoCancel: false,
      });
      if (known.current) {
        const fresh = list.filter((o) => !known.current.has(o.id) && ACTIVE.includes(o.status));
        if (fresh.length && !silent) {
          pickupChime();
          fresh.forEach((o) => toast(`${langRef.current === 'en' ? 'New pre-order' : 'Neue Vorbestellung'} ${o.orderNumber}: ${formatPickupDay(o.pickupDate, langRef.current)} ${o.pickupTime}`, { icon: '🛍️', duration: 10000 }));
        }
        if (fresh.length) onNewOrder?.(fresh);
      }
      known.current = new Set(list.map((o) => o.id));
      setOrders(list);
      setError('');
    } catch (err) {
      setError(err?.message || (langRef.current === 'en' ? 'Loading failed' : 'Laden fehlgeschlagen'));
    } finally {
      setLoading(false);
      busyLoad.current = false;
      if (loadAgain.current) { loadAgain.current = false; setTimeout(() => load(), 0); }
    }
  }, [client, role, previewDays, onNewOrder, silent]);

  useEffect(() => {
    if (!client) return;
    client.collection('pickup_settings').getList(1, 1, { $autoCancel: false })
      .then((r) => { const n = Number(r.items[0]?.previewDays); if (Number.isFinite(n)) setPreviewDays(Math.max(0, Math.min(14, n))); })
      .catch(() => {});
  }, [client]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    let unsub = null;
    let gone = false;
    client?.collection('orders').subscribe('*', (e) => {
      if (e.record?.orderType !== 'pickup') return;
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 400);
    }).then((u) => { if (gone) Promise.resolve(u()).catch(() => {}); else unsub = u; }).catch(() => {});
    return () => {
      gone = true;
      clearInterval(t);
      clearTimeout(reloadTimer.current);
      if (unsub) Promise.resolve(unsub()).catch(() => {});
    };
  }, [client, load]);

  const activeCount = useMemo(() => orders.filter((o) => ACTIVE.includes(o.status) && o.pickupDate >= viennaToday(0)).length, [orders]);
  useEffect(() => { onActiveCount?.(activeCount); }, [activeCount, onActiveCount]);

  const tabs = tabsFor(role, previewDays, lang);
  const shown = orders
    .filter((o) => matchTab(o, tab))
    .filter((o) => showDone || ACTIVE.includes(o.status))
    .sort((a, b) => (tab === 'past' ? -1 : 1) * `${a.pickupDate} ${a.pickupTime}`.localeCompare(`${b.pickupDate} ${b.pickupTime}`));

  const count = (key) => orders.filter((o) => matchTab(o, key) && ACTIVE.includes(o.status)).length;

  // Kitchen prep list: dishes to cook per day, all active orders together.
  const prep = useMemo(() => {
    if (role !== 'kds') return [];
    const days = new Map();
    shown.filter((o) => ACTIVE.includes(o.status) && o.status !== 'ready').forEach((o) => {
      if (!days.has(o.pickupDate)) days.set(o.pickupDate, new Map());
      const m = days.get(o.pickupDate);
      (o.items || []).forEach((it) => m.set(dishName(it, en), (m.get(dishName(it, en)) || 0) + (Number(it.quantity) || 1)));
    });
    return [...days.entries()].map(([d, m]) => ({ date: d, dishes: [...m.entries()].sort((a, b) => b[1] - a[1]) }));
  }, [shown, role, en]);

  const act = async (o, kind, extra) => {
    setBusy(`${o.id}:${kind}`);
    try {
      if (kind === 'release') await staffRelease(o.id, token);
      else if (kind === 'seen') await staffMarkSeen(o.id, token);
      else await staffSetStatus(o.id, kind, token, extra);
      const msg = {
        release: tr(`${o.orderNumber} ist jetzt in der Küche`, `${o.orderNumber} sent to the kitchen`),
        seen: tr(`${o.orderNumber} als gesehen markiert`, `${o.orderNumber} marked as seen`),
        confirmed: tr(`${o.orderNumber} bestätigt`, `${o.orderNumber} confirmed`),
        ready: tr(`${o.orderNumber} ist abholbereit`, `${o.orderNumber} is ready for pickup`),
        picked_up: tr(`${o.orderNumber} abgeholt`, `${o.orderNumber} picked up`),
        no_show: tr(`${o.orderNumber} als nicht abgeholt markiert`, `${o.orderNumber} marked as not picked up`),
        cancelled: tr(`${o.orderNumber} storniert`, `${o.orderNumber} cancelled`),
      }[kind];
      toast.success(msg);
      setCancelFor(''); setReason('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const B = ({ o, kind, icon: Icon, children, variant = 'outline', className = '' }) => (
    <Button size="sm" variant={variant} className={`h-9 ${className}`} disabled={!!busy} onClick={() => act(o, kind)}>
      {busy === `${o.id}:${kind}` ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Icon className="w-4 h-4 mr-1" />}
      {children}
    </Button>
  );

  const actions = (o) => {
    const s = o.status;
    const out = [];
    if (s === 'received' && role !== 'kds') out.push(<B key="c" o={o} kind="confirmed" icon={CheckCircle2} variant="default">{tr('Bestätigen', 'Confirm')}</B>);
    if ((s === 'confirmed' || s === 'received') && !o.kitchenOrder) {
      out.push(<B key="r" o={o} kind="release" icon={Send}>{role === 'kds' ? tr('Jetzt starten', 'Start now') : tr('Jetzt an Küche', 'Send to kitchen now')}</B>);
    }
    if (role === 'kds' && !o.kitchenSeenAt && ACTIVE.includes(s)) out.push(<B key="s" o={o} kind="seen" icon={Eye}>{tr('Gesehen', 'Seen')}</B>);
    if (s === 'in_kitchen' || (s === 'confirmed' && role !== 'kds')) out.push(<B key="y" o={o} kind="ready" icon={PackageCheck} variant={role === 'kds' ? 'default' : 'outline'}>{tr('Fertig', 'Ready')}</B>);
    if (role !== 'kds' && ['confirmed', 'in_kitchen', 'ready'].includes(s)) {
      out.push(<B key="p" o={o} kind="picked_up" icon={CheckCircle2} variant={s === 'ready' ? 'default' : 'outline'}>{tr('Abgeholt', 'Picked up')}</B>);
      if (o.pickupDate <= viennaToday(0)) out.push(<B key="n" o={o} kind="no_show" icon={UserX} className="text-amber-800">{tr('Nicht abgeholt', 'No-show')}</B>);
    }
    if (role !== 'kds' && ACTIVE.includes(s)) {
      out.push(
        <Button key="x" size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive" disabled={!!busy}
          onClick={() => { setCancelFor(cancelFor === o.id ? '' : o.id); setReason(''); }}>
          <XCircle className="w-4 h-4 mr-1" />{tr('Stornieren', 'Cancel')}
        </Button>,
      );
    }
    return out;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
          {tabs.map((t) => {
            const n = count(t.key);
            const on = tab === t.key;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
                {t.label}{n > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${on ? 'bg-white/25' : 'bg-primary/15 text-primary'}`}>{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {tr('Erledigte zeigen', 'Show finished')}
        </label>
        <Button size="sm" variant="ghost" onClick={load} aria-label={tr('Neu laden', 'Reload')}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{tr('Lade Vorbestellungen ...', 'Loading pre-orders ...')}</p>}

      {role === 'kds' && prep.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prep.map((p) => (
            <div key={p.date} className="rounded-xl border bg-amber-50 border-amber-200 p-3 text-amber-950">
              <p className="font-semibold mb-1.5 flex items-center gap-2"><UtensilsCrossed className="w-4 h-4" />{tr('Vorbereiten', 'To prepare')} · {formatPickupDay(p.date, lang, { long: true })}</p>
              <ul className="text-sm grid grid-cols-1 gap-0.5">
                {p.dishes.map(([n, q]) => <li key={n} className="flex justify-between gap-2"><span>{n}</span><strong className="tabular-nums">{q}×</strong></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && !shown.length && (
        <p className="text-sm text-muted-foreground py-6 text-center">{tr('Keine Vorbestellungen in dieser Ansicht.', 'No pre-orders in this view.')}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((o) => {
          const st = PICKUP_STATUS[o.status] || PICKUP_STATUS.received;
          const items = Array.isArray(o.items) ? o.items : [];
          const log = Array.isArray(o.statusLog) ? o.statusLog : [];
          const late = ACTIVE.includes(o.status) && o.status !== 'ready'
            && o.pickupDate === viennaToday(0) && o.pickupAt && new Date(o.pickupAt.replace(' ', 'T')) < new Date();
          return (
            <article key={o.id} className={`rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-3 ${o.status === 'received' ? 'ring-2 ring-amber-400' : ''} ${!ACTIVE.includes(o.status) ? 'opacity-70' : ''}`}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-bold tabular-nums flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />{o.pickupTime}
                    <span className="text-sm font-medium text-muted-foreground">{formatPickupDay(o.pickupDate, lang)}</span>
                  </p>
                  <p className="text-sm"><strong>{o.orderNumber}</strong> · {o.customerName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TONE_CLASS[st.tone]}`}>{st[lang]}</span>
                  {late && <span className="text-xs font-semibold text-red-700">{tr('Abholzeit vorbei', 'Pickup time passed')}</span>}
                </div>
              </header>

              <ul className="text-sm border rounded-lg divide-y">
                {items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                    <span><strong className="tabular-nums">{it.quantity}×</strong> {dishName(it, en)}</span>
                    {role !== 'kds' && <span className="text-muted-foreground whitespace-nowrap">{euro(it.price * it.quantity)}</span>}
                  </li>
                ))}
              </ul>

              {o.notes && (
                <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-950 px-3 py-2 flex gap-2">
                  <StickyNote className="w-4 h-4 mt-0.5 shrink-0" />{o.notes}
                </p>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                {role !== 'kds' && (
                  <p className="flex items-start gap-1.5">
                    <Euro className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong className="text-foreground whitespace-nowrap">{euro(o.totalPrice)}</strong>
                      {o.paymentStatus === 'completed' ? tr(' · bezahlt', ' · paid') : tr(' · zahlt bei Abholung', ' · pays at pickup')}
                      {o.paymentStatus !== 'completed' && o.kitchenOrder && role === 'waiter' && tr(` (Kasse: Aktiv → ${o.orderNumber})`, ` (till: Active → ${o.orderNumber})`)}
                    </span>
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5" />
                  {o.kitchenOrder
                    ? tr(`In der Küche seit ${viennaTime(o.releasedAt)}`, `In the kitchen since ${viennaTime(o.releasedAt)}`)
                    : ACTIVE.includes(o.status)
                      ? `${tr('Geht automatisch an die Küche um', 'Goes to the kitchen automatically at')} ${viennaTime(o.releaseAt)}${o.pickupDate !== viennaToday(0) ? ` (${formatPickupDay(o.pickupDate, lang)})` : ''}`
                      : '—'}
                  {o.prepMinutes ? tr(` · ${o.prepMinutes} Min. Zubereitung`, ` · ${o.prepMinutes} min prep`) : ''}
                </p>
                {o.kitchenSeenAt && <p className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{tr('Küche hat gesehen', 'Seen by kitchen')}: {o.kitchenSeenBy} {viennaDateTime(o.kitchenSeenAt)}</p>}
                {o.status === 'cancelled' && o.cancelReason && <p className="text-red-700">{tr('Grund', 'Reason')}: {o.cancelReason}</p>}
              </div>

              {role !== 'kds' && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {o.customerPhone && <a className="flex items-center gap-1 text-primary hover:underline" href={`tel:${o.customerPhone.replace(/[^\d+]/g, '')}`}><Phone className="w-4 h-4" />{o.customerPhone}</a>}
                  {role === 'admin' && o.customerEmail && <a className="flex items-center gap-1 text-primary hover:underline break-all" href={`mailto:${o.customerEmail}?subject=${encodeURIComponent(`${o.lang === 'en' ? 'Your order' : 'Ihre Bestellung'} ${o.orderNumber}`)}`}><Mail className="w-4 h-4" />{o.customerEmail}</a>}
                </div>
              )}

              {ACTIVE.includes(o.status) && <div className="flex flex-wrap gap-2">{actions(o)}</div>}

              {cancelFor === o.id && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-red-900">{tr('Grund für die Stornierung (der Gast bekommt ihn per E-Mail):', 'Reason for cancelling (the guest receives it by email):')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REASONS[lang].map((r) => (
                      <button key={r} type="button" onClick={() => setReason(r)} className={`text-xs rounded-full border px-2.5 py-1 ${reason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white'}`}>{r}</button>
                    ))}
                  </div>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={tr('Grund', 'Reason')} className="bg-white" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setCancelFor('')}>{tr('Zurück', 'Back')}</Button>
                    <Button size="sm" variant="destructive" disabled={!!busy || !reason.trim()} onClick={() => act(o, 'cancelled', reason.trim())}>
                      {busy === `${o.id}:cancelled` && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{tr('Stornieren', 'Cancel order')}
                    </Button>
                  </div>
                </div>
              )}

              {role === 'admin' && log.length > 0 && (
                <div>
                  <button type="button" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground" onClick={() => setOpenLog(openLog === o.id ? '' : o.id)}>
                    <History className="w-3.5 h-3.5" />{tr('Verlauf', 'History')} ({log.length})
                  </button>
                  {openLog === o.id && (
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {log.map((l, i) => <li key={i}>{viennaDateTime(l.at)} · {(PICKUP_STATUS[l.status] || {})[lang] || l.status} · {l.by}</li>)}
                      <li>{tr('Eingegangen', 'Received')}: {viennaDateTime(o.created)}</li>
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
