import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Store, Clock, CalendarDays, Phone, AlertTriangle } from 'lucide-react';
import { useCart } from '@/hooks/useCart.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { pickupOptions, placePickupOrder, formatPickupDay, euro } from '@/lib/pickupApi.js';

const PHONE = '+43 6641219289';
const PHONE_TEL = '+436641219289';
const ADDRESS = 'Italiener Straße 17, 9500 Villach';

const TX = {
  de: {
    title: 'Vorbestellen & abholen',
    intro: 'Wählen Sie Tag und Uhrzeit. Wir kochen frisch und Sie holen Ihr Essen bei uns ab.',
    where: 'Abholung bei',
    step1: 'Abholzeit wählen',
    step2: 'Ihre Angaben',
    day: 'Tag',
    time: 'Uhrzeit',
    closed: 'Ruhetag',
    full: 'voll',
    none: 'keine Zeit mehr',
    noSlots: 'An diesem Tag sind keine Abholzeiten mehr frei.',
    lunch: 'Mittag',
    dinner: 'Abend',
    lead: (m) => `Für diese Bestellung brauchen wir mindestens ${m} Minuten Vorlauf.`,
    notice: (h) => `Einige Gerichte müssen ${h} Stunden im Voraus bestellt werden.`,
    name: 'Name',
    email: 'E-Mail (für die Bestätigung)',
    phone: 'Telefon (falls wir Rückfragen haben)',
    notes: 'Anmerkungen (Allergien, Schärfe, ...)',
    notesPh: 'z. B. bitte wenig scharf',
    pay: 'Bezahlung bei Abholung, bar oder mit Karte.',
    summary: 'Ihre Bestellung',
    total: 'Gesamt',
    pickupAt: 'Abholung',
    choose: 'Bitte Abholzeit wählen',
    place: 'Verbindlich vorbestellen',
    sending: 'Wird gesendet ...',
    off: 'Online-Bestellungen sind gerade nicht möglich.',
    offHint: 'Rufen Sie uns gerne an, wir nehmen Ihre Bestellung telefonisch auf.',
    unavailable: 'Nicht alle Gerichte im Warenkorb sind online bestellbar.',
    back: 'Zurück zum Warenkorb',
    loading: 'Abholzeiten werden geladen ...',
    error: 'Die Abholzeiten konnten nicht geladen werden.',
    retry: 'Erneut versuchen',
    errName: 'Bitte Namen angeben.',
    errEmail: 'Bitte eine gültige E-Mail angeben.',
    errPhone: 'Bitte Telefonnummer angeben.',
    agree: 'Mit der Bestellung akzeptieren Sie unsere',
    terms: 'AGB',
    and: 'und',
    privacy: 'Datenschutzerklärung',
    ok: 'Danke! Ihre Bestellung ist eingegangen.',
  },
  en: {
    title: 'Pre-order & pick up',
    intro: 'Choose a day and time. We cook fresh and you collect your food at the restaurant.',
    where: 'Pickup at',
    step1: 'Choose pickup time',
    step2: 'Your details',
    day: 'Day',
    time: 'Time',
    closed: 'Closed',
    full: 'full',
    none: 'none left',
    noSlots: 'No pickup times left on this day.',
    lunch: 'Lunch',
    dinner: 'Dinner',
    lead: (m) => `This order needs at least ${m} minutes to prepare.`,
    notice: (h) => `Some dishes must be ordered ${h} hours in advance.`,
    name: 'Name',
    email: 'Email (for the confirmation)',
    phone: 'Phone (in case we have a question)',
    notes: 'Notes (allergies, spice level, ...)',
    notesPh: 'e.g. mild please',
    pay: 'Pay when you pick up, cash or card.',
    summary: 'Your order',
    total: 'Total',
    pickupAt: 'Pickup',
    choose: 'Please choose a pickup time',
    place: 'Place pre-order',
    sending: 'Sending ...',
    off: 'Online ordering is not available right now.',
    offHint: 'Please call us and we will take your order by phone.',
    unavailable: 'Not every dish in your cart can be ordered online.',
    back: 'Back to cart',
    loading: 'Loading pickup times ...',
    error: 'Pickup times could not be loaded.',
    retry: 'Try again',
    errName: 'Please enter your name.',
    errEmail: 'Please enter a valid email.',
    errPhone: 'Please enter a phone number.',
    agree: 'By ordering you accept our',
    terms: 'terms',
    and: 'and',
    privacy: 'privacy policy',
    ok: 'Thank you! Your order has been received.',
  },
};

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function CheckoutPage() {
  const { cartItems, getCartTotal, clearCart } = useCart();
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = TX[lang];
  const navigate = useNavigate();

  const [opts, setOpts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const placed = useRef(false);

  const cartKey = cartItems.map((i) => `${i.id}:${i.quantity}`).join(',');
  const total = getCartTotal();

  useEffect(() => {
    if (!cartItems.length && !placed.current) navigate('/cart', { replace: true });
  }, [cartItems.length, navigate]);

  useEffect(() => {
    if (!cartKey) return undefined;
    let alive = true;
    setLoadError(null);
    pickupOptions(cartItems)
      .then((data) => {
        if (!alive) return;
        setOpts(data);
        const firstOpen = data.days.find((d) => d.anyOpen);
        setDay((cur) => (cur && data.days.some((d) => d.date === cur && d.anyOpen) ? cur : (firstOpen ? firstOpen.date : '')));
      })
      .catch((err) => { if (alive) setLoadError(err); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, reload]);

  const dayInfo = useMemo(() => opts && opts.days.find((d) => d.date === day), [opts, day]);
  useEffect(() => {
    if (!dayInfo) return;
    if (!dayInfo.slots.some((s) => s.time === time && s.ok)) setTime('');
  }, [dayInfo, time]);

  const groups = useMemo(() => {
    if (!dayInfo) return [];
    const lunch = dayInfo.slots.filter((s) => toMin(s.time) < 15 * 60);
    const dinner = dayInfo.slots.filter((s) => toMin(s.time) >= 15 * 60);
    return [
      { key: 'lunch', label: tx.lunch, slots: lunch },
      { key: 'dinner', label: tx.dinner, slots: dinner },
    ].filter((g) => g.slots.length);
  }, [dayInfo, tx]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: null })); setSubmitError(''); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = tx.errName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errs.email = tx.errEmail;
    if (form.phone.replace(/\D/g, '').length < 6) errs.phone = tx.errPhone;
    setErrors(errs);
    setSubmitError('');
    const firstBad = ['name', 'email', 'phone'].find((k) => errs[k]);
    if (firstBad) {
      // The button sits beside or above the form, so bring the problem into view.
      const el = document.getElementById(`co-${firstBad}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
      setSubmitError(errs[firstBad]);
      toast.error(errs[firstBad]);
      return;
    }
    if (!day || !time) { toast.error(tx.choose); setSubmitError(tx.choose); return; }
    setSending(true);
    try {
      const res = await placePickupOrder({
        ...form,
        date: day,
        time,
        lang,
        items: cartItems.map((i) => ({ id: i.id, quantity: i.quantity })),
      });
      placed.current = true;
      clearCart();
      toast.success(tx.ok);
      navigate(`/order-confirmation/${res.id}?t=${res.token}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
      setSubmitError(err.message);
      if (err.code === 'slot_taken') { setTime(''); setReload((n) => n + 1); }
    } finally {
      setSending(false);
    }
  };

  if (!cartItems.length) return null;

  const unavailable = loadError && loadError.code === 'unavailable';
  const disabled = opts && !opts.enabled;

  return (
    <>
      <Helmet>
        <title>{`${tx.title} - Tripti Genusswelt`}</title>
      </Helmet>
      <main className="py-10 md:py-16 bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">{tx.title}</h1>
          <p className="text-muted-foreground mb-2">{tx.intro}</p>
          <p className="text-sm text-muted-foreground mb-8 flex items-center gap-2">
            <Store className="w-4 h-4 text-primary shrink-0" /> {tx.where} Tripti Genusswelt, {ADDRESS}
          </p>

          {(disabled || unavailable) && (
            <div className="bg-card border border-amber-300 rounded-2xl p-6 mb-8 flex gap-4 items-start">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{unavailable ? tx.unavailable : tx.off}</p>
                <p className="text-sm text-muted-foreground mt-1">{unavailable ? loadError.message : tx.offHint}</p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button asChild variant="outline"><Link to="/cart">{tx.back}</Link></Button>
                  <Button asChild><a href={`tel:${PHONE_TEL}`}><Phone className="w-4 h-4 mr-2" />{PHONE}</a></Button>
                </div>
              </div>
            </div>
          )}

          {!disabled && !unavailable && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
              <form id="checkout-form" onSubmit={submit} className="lg:col-span-2 space-y-6" noValidate>
                <section className="bg-card border rounded-2xl p-5 sm:p-7 shadow-sm">
                  <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-sm">1</span>
                    {tx.step1}
                  </h2>

                  {!opts && !loadError && (
                    <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{tx.loading}</p>
                  )}
                  {loadError && !unavailable && (
                    <div className="text-sm">
                      <p className="text-destructive mb-3">{tx.error} {loadError.message}</p>
                      <Button type="button" variant="outline" onClick={() => setReload((n) => n + 1)}>{tx.retry}</Button>
                    </div>
                  )}

                  {opts && (
                    <>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2"><CalendarDays className="w-4 h-4" />{tx.day}</p>
                      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x" role="radiogroup" aria-label={tx.day}>
                        {opts.days.map((d) => {
                          const active = d.date === day;
                          const off = !d.anyOpen;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={off}
                              onClick={() => setDay(d.date)}
                              className={`snap-start shrink-0 min-w-[84px] rounded-xl border px-3 py-2 text-center transition-colors ${
                                active ? 'border-primary bg-primary text-primary-foreground shadow'
                                  : off ? 'opacity-45 cursor-not-allowed bg-muted/40'
                                    : 'hover:border-primary/60 bg-background'}`}
                            >
                              <span className="block text-sm font-semibold">{formatPickupDay(d.date, lang)}</span>
                              <span className="block text-xs opacity-80">
                                {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.
                              </span>
                              {off && (
                                <span className="block text-[11px] mt-0.5">
                                  {d.closed
                                    ? (d.reason && !['weekly', 'closed'].includes(d.reason) ? d.reason : tx.closed)
                                    : (d.slots.some((x) => x.full) ? tx.full : tx.none)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {(opts.leadMinutes > (opts.settings?.minLeadMinutes || 0) || opts.noticeHours > 0) && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {opts.noticeHours > 0 ? tx.notice(opts.noticeHours) : tx.lead(opts.leadMinutes)}
                        </p>
                      )}

                      <p className="text-sm font-medium mt-5 mb-2 flex items-center gap-2"><Clock className="w-4 h-4" />{tx.time}</p>
                      {dayInfo && !dayInfo.anyOpen && <p className="text-sm text-muted-foreground">{tx.noSlots}</p>}
                      {groups.map((g) => (
                        <div key={g.key} className="mb-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{g.label}</p>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="radiogroup" aria-label={`${tx.time} ${g.label}`}>
                            {g.slots.map((s) => {
                              const active = s.time === time;
                              return (
                                <button
                                  key={s.time}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  disabled={!s.ok}
                                  title={s.full ? tx.full : undefined}
                                  onClick={() => setTime(s.time)}
                                  className={`rounded-lg border py-2 text-sm font-medium tabular-nums transition-colors ${
                                    active ? 'border-primary bg-primary text-primary-foreground shadow'
                                      : !s.ok ? 'opacity-40 cursor-not-allowed line-through bg-muted/40'
                                        : 'hover:border-primary/60 bg-background'}`}
                                >
                                  {s.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </section>

                <section className="bg-card border rounded-2xl p-5 sm:p-7 shadow-sm">
                  <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-sm">2</span>
                    {tx.step2}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="co-name">{tx.name}</Label>
                      <Input id="co-name" autoComplete="name" value={form.name} onChange={set('name')} maxLength={80} aria-invalid={!!errors.name} />
                      {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="co-email">{tx.email}</Label>
                      <Input id="co-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} maxLength={120} aria-invalid={!!errors.email} />
                      {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="co-phone">{tx.phone}</Label>
                      <Input id="co-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={30} aria-invalid={!!errors.phone} />
                      {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="co-notes">{tx.notes}</Label>
                      <Textarea id="co-notes" rows={3} value={form.notes} onChange={set('notes')} maxLength={500} placeholder={tx.notesPh} />
                    </div>
                  </div>
                </section>
              </form>

              <aside className="lg:col-span-1">
                <div className="bg-card border rounded-2xl p-6 shadow-sm lg:sticky lg:top-24">
                  <h2 className="text-xl font-semibold mb-4">{tx.summary}</h2>
                  <ul className="space-y-3 mb-5 max-h-[280px] overflow-y-auto pr-1">
                    {cartItems.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">{item.quantity}×</span>{' '}
                          {(lang === 'de' ? item.nameDE : item.nameEN) || item.name}
                        </span>
                        <span className="font-medium whitespace-nowrap">{euro(item.price * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{tx.total}</span>
                      <span className="text-2xl font-bold text-primary">{euro(total)}</span>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3 text-sm">
                      <p className="font-medium">{tx.pickupAt}</p>
                      <p className="text-muted-foreground">
                        {day && time ? `${formatPickupDay(day, lang, { long: true })}, ${time}` : tx.choose}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(lang === 'en' ? opts?.settings?.noteEN : opts?.settings?.noteDE) || tx.pay}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    form="checkout-form"
                    disabled={sending || !opts || !day || !time}
                    className="w-full h-12 mt-5 text-base rounded-xl shadow-md"
                  >
                    {sending
                      ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />{tx.sending}</>
                      : <><CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />{day && time ? tx.place : tx.choose}</>}
                  </Button>
                  {submitError && (
                    <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {submitError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    {tx.agree} <Link className="underline" to="/terms-of-service">{tx.terms}</Link> {tx.and}{' '}
                    <Link className="underline" to="/privacy-policy">{tx.privacy}</Link>.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
