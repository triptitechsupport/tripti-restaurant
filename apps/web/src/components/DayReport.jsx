import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer, ShieldCheck, ShieldAlert, Loader2, Banknote, CreditCard, Receipt } from 'lucide-react';
import { billingApi } from '@/lib/billingApi.js';
import { printHtmlPage } from '@/lib/staffApp.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// End-of-day report: what was taken today (cash / card), and the RKSV check
// that every payment has its signed receipt. For the cashier and the admin.
const T = {
  en: {
    title: 'Day report', today: 'Today', total: 'Taken', cash: 'Cash', card: 'Card', other: 'Other', payments: 'Payments',
    cancel: 'Cancellations', open: 'Open orders', due: 'still to collect', ok: (n) => `RKSV check: all ${n} payment${n === 1 ? ' has' : 's have'} a signed receipt.`,
    none: 'RKSV check: no payments yet.', missing: (n, a) => `${n} payment${n === 1 ? '' : 's'} without a receipt (€${a}).`,
    notSigned: (n) => `${n} receipt${n === 1 ? ' is' : 's are'} not signed yet.`, fix: 'Open Receipts to create or retry them.',
    outage: (n) => `${n} receipt${n === 1 ? '' : 's'} issued during a fiskaly outage (sent later automatically).`,
    print: 'Print', failed: 'Could not load the report', prev: 'Previous day', next: 'Next day',
  },
  de: {
    title: 'Tagesbericht', today: 'Heute', total: 'Einnahmen', cash: 'Bar', card: 'Karte', other: 'Sonstige', payments: 'Zahlungen',
    cancel: 'Stornos', open: 'Offene Bestellungen', due: 'noch zu kassieren', ok: (n) => `RKSV-Prüfung: alle ${n} Zahlungen haben einen signierten Beleg.`,
    none: 'RKSV-Prüfung: noch keine Zahlungen.', missing: (n, a) => `${n} Zahlung${n === 1 ? '' : 'en'} ohne Beleg (€${a}).`,
    notSigned: (n) => `${n} Beleg${n === 1 ? ' ist' : 'e sind'} noch nicht signiert.`, fix: 'Unter „Belege“ erstellen oder erneut senden.',
    outage: (n) => `${n} Beleg${n === 1 ? '' : 'e'} im fiskaly-Ausfall erstellt (wird automatisch nachgereicht).`,
    print: 'Drucken', failed: 'Bericht konnte nicht geladen werden', prev: 'Vortag', next: 'Nächster Tag',
  },
};
const eur = (v) => `€${Number(v || 0).toFixed(2)}`;
const dayBounds = (offset) => {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() + offset);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  return { from, to };
};

export default function DayReport({ client }) {
  const { language } = useLanguage();
  const tx = T[language === 'de' ? 'de' : 'en'];
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { from, to } = dayBounds(offset);
    try {
      const data = await billingApi(`/day-report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, undefined, client);
      setReport(data.report);
      setError('');
    } catch (err) {
      setError(err.message || tx.failed);
    } finally {
      setBusy(false);
    }
  }, [offset, client, tx.failed]);

  useEffect(() => {
    load();
    if (offset !== 0) return undefined;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, offset]);

  const { from } = dayBounds(offset);
  const dateLabel = offset === 0 ? tx.today : from.toLocaleDateString(language === 'de' ? 'de-AT' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const r = report;
  const types = r ? r.byPaymentType || {} : {};
  const other = Object.entries(types).filter(([k]) => k !== 'CASH' && k !== 'CARD').reduce((s, [, v]) => s + v, 0);
  const problems = r ? r.receipts.missing + r.receipts.notSigned : 0;

  const print = () => {
    if (!r) return;
    const longDate = from.toLocaleDateString(language === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const row = (k, v) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${tx.title}</title>
<style>body{font-family:sans-serif;width:72mm;margin:0 auto;font-size:13px}h1{font-size:17px;margin:8px 0 2px}table{width:100%;border-collapse:collapse}td{padding:3px 0;border-bottom:1px dashed #999}.b td{font-weight:bold;font-size:15px}p{margin:8px 0}</style></head><body>
<h1>Tripti Genusswelt · ${tx.title}</h1><p>${longDate}<br>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
<table>${row(tx.cash, eur(types.CASH))}${row(tx.card, eur(types.CARD))}${other ? row(tx.other, eur(other)) : ''}${r.cancellations ? row(tx.cancel, eur(r.cancellations)) : ''}<tr class="b"><td>${tx.total}</td><td style="text-align:right">${eur(r.paid)}</td></tr>${row(tx.payments, r.payments)}${row(tx.open, `${r.orders.open} · ${eur(r.orders.due)}`)}</table>
<p><b>${problems ? `${r.receipts.missing ? tx.missing(r.receipts.missing, r.receipts.missingAmount.toFixed(2)) : ''} ${r.receipts.notSigned ? tx.notSigned(r.receipts.notSigned) : ''}` : r.payments ? tx.ok(r.payments) : tx.none}</b></p>
</body></html>`;
    printHtmlPage(html, tx.title);
  };

  return (
    <section className="rounded-xl border-2 border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h3 className="font-bold text-primary flex items-center gap-2 whitespace-nowrap"><CalendarDays className="h-4 w-4" />{tx.title}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted" onClick={() => setOffset((o) => o - 1)} aria-label={tx.prev}><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold min-w-[5.5rem] text-center">{dateLabel}</span>
          <button type="button" className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label={tx.next}><ChevronRight className="h-4 w-4" /></button>
          <button type="button" className="h-9 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-sm font-semibold border-2 border-border hover:bg-muted disabled:opacity-40" disabled={!r} onClick={print} aria-label={tx.print}><Printer className="h-4 w-4" /><span className="hidden sm:inline">{tx.print}</span></button>
        </div>
      </div>
      {!r ? (
        <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{error || ''}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              [tx.total, eur(r.paid), Receipt, 'text-primary'],
              [tx.cash, eur(types.CASH), Banknote, 'text-emerald-700'],
              [tx.card, eur(types.CARD), CreditCard, 'text-sky-700'],
            ].map(([label, value, Icon, cls]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</p>
                <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tx.payments}: <b className="text-foreground">{r.payments}</b>
            {other ? <> · {tx.other}: <b className="text-foreground">{eur(other)}</b></> : null}
            {r.cancellations ? <> · {tx.cancel}: <b className="text-foreground">{eur(r.cancellations)}</b></> : null}
            {' · '}{tx.open}: <b className="text-foreground">{r.orders.open}</b> ({eur(r.orders.due)} {tx.due})
          </p>
          <div className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${problems ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`} role="status">
            {problems ? <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" /> : <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />}
            <span>
              {problems ? (
                <>
                  {r.receipts.missing ? `${tx.missing(r.receipts.missing, r.receipts.missingAmount.toFixed(2))} ` : ''}
                  {r.receipts.notSigned ? `${tx.notSigned(r.receipts.notSigned)} ` : ''}
                  <b>{tx.fix}</b>
                </>
              ) : r.payments ? tx.ok(r.payments) : tx.none}
              {r.receipts.outage ? <span className="block text-xs mt-0.5 opacity-80">{tx.outage(r.receipts.outage)}</span> : null}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
