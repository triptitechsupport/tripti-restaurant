import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Store, Phone, Loader2, ChefHat, PackageCheck, XCircle, MapPin, Copy } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getPickupOrder, cancelPickupOrder, formatPickupDay, euro, PICKUP_STATUS, TONE_CLASS } from '@/lib/pickupApi.js';

const PHONE = '+43 6641219289';
const PHONE_TEL = '+436641219289';
const ADDRESS = 'Italiener Straße 17, 9500 Villach';
const MAPS = 'https://www.google.com/maps/search/?api=1&query=Tripti+Genusswelt+Italiener+Stra%C3%9Fe+17+9500+Villach';

const TX = {
  de: {
    title: 'Ihre Vorbestellung',
    thanks: 'Danke für Ihre Bestellung!',
    number: 'Bestellnummer',
    pickup: 'Abholung',
    at: 'bei',
    route: 'Route',
    items: 'Bestellung',
    total: 'Gesamt',
    pay: 'Bezahlung bei Abholung, bar oder mit Karte.',
    paid: 'Bezahlt',
    notes: 'Anmerkung',
    save: 'Speichern Sie diese Seite, um den Status Ihrer Bestellung zu sehen.',
    copy: 'Link kopieren',
    copied: 'Link kopiert',
    cancel: 'Bestellung stornieren',
    cancelAsk: 'Bestellung wirklich stornieren?',
    cancelYes: 'Ja, stornieren',
    cancelNo: 'Nein',
    cancelled: 'Ihre Bestellung wurde storniert.',
    tooLate: 'Ihre Bestellung wird schon zubereitet. Für Änderungen rufen Sie uns bitte an.',
    call: 'Anrufen',
    notFound: 'Diese Bestellung wurde nicht gefunden.',
    noToken: 'Der Link zu Ihrer Bestellung ist unvollständig. Bitte öffnen Sie den Link aus Ihrer Bestätigungs-E-Mail.',
    menu: 'Zur Speisekarte',
    steps: { received: 'Eingegangen', confirmed: 'Bestätigt', in_kitchen: 'In der Küche', ready: 'Abholbereit', picked_up: 'Abgeholt' },
    hint: {
      received: 'Wir haben Ihre Bestellung erhalten und bestätigen sie in Kürze.',
      confirmed: 'Ihre Bestellung ist bestätigt. Wir beginnen rechtzeitig vor Ihrer Abholzeit mit dem Kochen.',
      in_kitchen: 'Unsere Küche bereitet Ihr Essen gerade frisch zu.',
      ready: 'Ihr Essen ist fertig und wartet auf Sie!',
      picked_up: 'Guten Appetit! Danke, dass Sie bei uns bestellt haben.',
      cancelled: 'Diese Bestellung wurde storniert.',
      no_show: 'Diese Bestellung wurde nicht abgeholt.',
    },
  },
  en: {
    title: 'Your pre-order',
    thanks: 'Thank you for your order!',
    number: 'Order number',
    pickup: 'Pickup',
    at: 'at',
    route: 'Directions',
    items: 'Order',
    total: 'Total',
    pay: 'Pay when you pick up, cash or card.',
    paid: 'Paid',
    notes: 'Note',
    save: 'Keep this page to check the status of your order.',
    copy: 'Copy link',
    copied: 'Link copied',
    cancel: 'Cancel order',
    cancelAsk: 'Really cancel this order?',
    cancelYes: 'Yes, cancel',
    cancelNo: 'No',
    cancelled: 'Your order has been cancelled.',
    tooLate: 'Your order is already being prepared. Please call us for changes.',
    call: 'Call',
    notFound: 'This order could not be found.',
    noToken: 'The link to your order is incomplete. Please open the link from your confirmation email.',
    menu: 'View menu',
    steps: { received: 'Received', confirmed: 'Confirmed', in_kitchen: 'Cooking', ready: 'Ready', picked_up: 'Picked up' },
    hint: {
      received: 'We have your order and will confirm it shortly.',
      confirmed: 'Your order is confirmed. We start cooking in time for your pickup.',
      in_kitchen: 'Our kitchen is preparing your food right now.',
      ready: 'Your food is ready and waiting for you!',
      picked_up: 'Enjoy your meal! Thank you for ordering with us.',
      cancelled: 'This order has been cancelled.',
      no_show: 'This order was not picked up.',
    },
  },
};

const FLOW = ['received', 'confirmed', 'in_kitchen', 'ready', 'picked_up'];
const ICONS = { received: CheckCircle2, confirmed: CheckCircle2, in_kitchen: ChefHat, ready: PackageCheck, picked_up: PackageCheck };

export default function OrderConfirmationPage() {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = TX[lang];
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setOrder(await getPickupOrder(id, token));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  // Refresh while the order is still moving, so "ready" shows up on its own.
  useEffect(() => {
    if (!order || ['picked_up', 'cancelled', 'no_show'].includes(order.status)) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(t);
  }, [order, load]);

  const doCancel = async () => {
    setBusy(true);
    try {
      setOrder(await cancelPickupOrder(id, token));
      toast.success(tx.cancelled);
    } catch (err) {
      toast.error(err.code === 'too_late' ? tx.tooLate : err.message);
      load();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(tx.copied); } catch { /* ignore */ }
  };

  const shell = (children) => (
    <>
      <Helmet><title>{`${tx.title} - Tripti Genusswelt`}</title></Helmet>
      <main className="py-10 md:py-16 bg-muted/10 min-h-[70vh]">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">{children}</div>
      </main>
    </>
  );

  if (!token || (error && error.status === 404)) {
    return shell(
      <div className="bg-card border rounded-3xl p-8 text-center shadow-sm">
        <XCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="font-medium mb-6">{token ? tx.notFound : tx.noToken}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild variant="outline"><a href={`tel:${PHONE_TEL}`}><Phone className="w-4 h-4 mr-2" />{PHONE}</a></Button>
          <Button asChild><Link to="/menu">{tx.menu}</Link></Button>
        </div>
      </div>,
    );
  }

  if (!order) {
    return shell(
      <div className="bg-card border rounded-3xl p-10 text-center shadow-sm">
        {error ? <p className="text-destructive">{error.message}</p> : <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />}
      </div>,
    );
  }

  const st = PICKUP_STATUS[order.status] || PICKUP_STATUS.received;
  const stopped = order.status === 'cancelled' || order.status === 'no_show';
  const stepIdx = FLOW.indexOf(order.status);
  const canCancel = order.status === 'received' || order.status === 'confirmed';

  return shell(
    <div className="bg-card border rounded-3xl p-6 sm:p-10 shadow-lg">
      <div className="text-center mb-6">
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${stopped ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'}`}>
          {stopped ? <XCircle className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold">{stopped ? tx.hint[order.status] : tx.thanks}</h1>
        <p className="text-muted-foreground mt-1">{tx.number}: <strong className="text-foreground tracking-wide">{order.orderNumber}</strong></p>
        <span className={`inline-block mt-3 text-sm font-semibold px-3 py-1 rounded-full border ${TONE_CLASS[st.tone]}`}>{st[lang]}</span>
      </div>

      {!stopped && (
        <ol className="grid grid-cols-5 gap-1 mb-4" aria-label="Status">
          {FLOW.map((s, i) => {
            const Icon = ICONS[s];
            const done = i <= stepIdx;
            return (
              <li key={s} className="flex flex-col items-center text-center">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 text-muted-foreground/50'}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className={`text-[11px] sm:text-xs mt-1 leading-tight ${done ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{tx.steps[s]}</span>
              </li>
            );
          })}
        </ol>
      )}
      {!stopped && <p className="text-center text-sm text-muted-foreground mb-6">{tx.hint[order.status]}</p>}
      {order.status === 'cancelled' && order.cancelReason && <p className="text-center text-sm text-muted-foreground mb-6">{order.cancelReason}</p>}

      <div className="rounded-2xl bg-muted/50 p-4 sm:p-5 mb-5 space-y-2">
        <p className="flex items-center gap-2 font-semibold text-lg">
          <Clock className="w-5 h-5 text-primary" />
          {tx.pickup}: {formatPickupDay(order.pickupDate, lang, { long: true })}, {order.pickupTime}
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Store className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Tripti Genusswelt, {ADDRESS} · <a className="underline" href={MAPS} target="_blank" rel="noreferrer"><MapPin className="w-3 h-3 inline" /> {tx.route}</a></span>
        </p>
      </div>

      <h2 className="font-semibold mb-2">{tx.items}</h2>
      <ul className="divide-y border rounded-xl mb-3">
        {order.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
            <span><strong>{it.quantity}×</strong> {(lang === 'de' ? it.nameDE : it.nameEN) || it.name}</span>
            <span className="whitespace-nowrap">{euro(it.price * it.quantity)}</span>
          </li>
        ))}
        <li className="flex justify-between px-4 py-3 font-bold">
          <span>{tx.total}</span><span className="text-primary">{euro(order.totalPrice)}</span>
        </li>
      </ul>
      {order.notes && <p className="text-sm text-muted-foreground mb-2"><strong>{tx.notes}:</strong> {order.notes}</p>}
      <p className="text-sm text-muted-foreground mb-6">{order.paymentStatus === 'completed' ? `✓ ${tx.paid}` : tx.pay}</p>

      <p className="text-xs text-muted-foreground mb-3">{tx.save}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={copyLink}><Copy className="w-4 h-4 mr-2" />{tx.copy}</Button>
        <Button asChild variant="outline"><a href={`tel:${PHONE_TEL}`}><Phone className="w-4 h-4 mr-2" />{tx.call}</a></Button>
        {canCancel && !asking && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAsking(true)}>{tx.cancel}</Button>
        )}
      </div>
      {asking && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-red-900 grow">{tx.cancelAsk}</span>
          <Button size="sm" variant="outline" onClick={() => setAsking(false)} disabled={busy}>{tx.cancelNo}</Button>
          <Button size="sm" variant="destructive" onClick={doCancel} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{tx.cancelYes}
          </Button>
        </div>
      )}
    </div>,
  );
}
