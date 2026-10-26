import React, { useRef, useState } from 'react';
import { FileUp, Loader2, CheckCircle2, AlertTriangle, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import apiServerClient from '@/lib/apiServerClient.js';
import pbDefault from '@/lib/pocketbaseClient.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Upload a supplier bill (PDF or photo): the server reads every line, turns
// cartons and packs into stock units (kg, l, pcs), matches the stock items
// and, after one check, books everything (new items, lots, history).
const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack', 'bottle', 'can'];

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const fmt = (n, d = 3) => (n == null || Number.isNaN(Number(n)) ? '' : String(Math.round(Number(n) * 10 ** d) / 10 ** d));

export default function StockBillUpload({ pb: pbProp, onBooked }) {
  const pb = pbProp || pbDefault;
  const { language } = useLanguage();
  const de = language !== 'en';
  const tr = (en, d) => (de ? d : en);
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bill, setBill] = useState(null);
  const [lines, setLines] = useState([]);
  const [duplicate, setDuplicate] = useState(null);
  const [done, setDone] = useState(null);

  const auth = () => ({ Authorization: `Bearer ${pb.authStore.token}`, 'Content-Type': 'application/json' });

  const pick = async (file) => {
    if (!file) return;
    const type = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type)) {
      toast.error(tr('Please choose a PDF or a photo (JPG/PNG).', 'Bitte ein PDF oder Foto (JPG/PNG) wählen.'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(tr('The file is larger than 20 MB.', 'Die Datei ist größer als 20 MB.'));
      return;
    }
    setReading(true);
    setDone(null);
    setBill(null);
    try {
      const data = await readAsBase64(file);
      const res = await apiServerClient.fetch('/stock-ai/bill/read', { method: 'POST', headers: auth(), body: JSON.stringify({ file: data, mediaType: type, fileName: file.name, lang: de ? 'de' : 'en' }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || `Error ${res.status}`);
      setBill(out.bill);
      setLines(out.lines || []);
      setDuplicate(out.duplicate || null);
    } catch (err) {
      toast.error(err.message || tr('The bill could not be read.', 'Die Rechnung konnte nicht gelesen werden.'));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const update = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const included = lines.filter((l) => l.include && Number(l.quantity) > 0);
  const newNames = [...new Set(included.filter((l) => l.isNew).map((l) => l.itemName.trim().toLowerCase()))];

  const book = async (force = false) => {
    setBooking(true);
    try {
      const res = await apiServerClient.fetch('/stock-ai/bill/book', { method: 'POST', headers: auth(), body: JSON.stringify({ ...bill, lines, force }) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 409 && out.code === 'duplicate') {
        setDuplicate({ date: '' });
        toast.error(out.message);
        return;
      }
      if (!res.ok) throw new Error(out.message || `Error ${res.status}`);
      setDone(out);
      setBill(null);
      setLines([]);
      toast.success(tr(`${out.booked.length} lines booked, ${out.created} new items.`, `${out.booked.length} Zeilen eingebucht, ${out.created} neue Artikel.`));
      onBooked?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="bg-card border-2 border-primary/40 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-serif font-bold text-primary flex items-center gap-2"><Sparkles className="h-4 w-4" /> {tr('Upload supplier bill (PDF)', 'Lieferantenrechnung hochladen (PDF)')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{tr('Upload the bill PDF (or a photo). Every line is read, cartons and packs are converted to kg / l / pieces and matched to your stock items. Check, then "Book all".', 'Rechnung als PDF (oder Foto) hochladen. Jede Zeile wird gelesen, Kartons und Packungen in kg / l / Stück umgerechnet und den Lagerartikeln zugeordnet. Prüfen, dann "Alles einbuchen".')}</p>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={reading || booking} className="h-11 shrink-0">
          {reading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
          {reading ? tr('Reading the bill…', 'Rechnung wird gelesen…') : tr('Upload bill', 'Rechnung hochladen')}
        </Button>
      </div>

      {done && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 p-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <div className="font-bold">{tr(`Bill ${done.billNumber} booked`, `Rechnung ${done.billNumber} eingebucht`)}</div>
            <div className="text-xs text-muted-foreground">{done.booked.map((b) => `${b.name} +${fmt(b.quantity)} ${b.unit} (= ${fmt(b.newQty)})`).join(' · ')}</div>
          </div>
          <button type="button" className="ml-auto" onClick={() => setDone(null)} aria-label="close"><X className="h-4 w-4" /></button>
        </div>
      )}

      {bill && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input value={bill.supplier} onChange={(e) => setBill({ ...bill, supplier: e.target.value })} placeholder={tr('Supplier', 'Lieferant')} className="h-10" />
            <Input value={bill.billNumber} onChange={(e) => setBill({ ...bill, billNumber: e.target.value })} placeholder={tr('Bill number', 'Rechnungsnr.')} className="h-10" />
            <Input type="date" value={bill.billDate || ''} onChange={(e) => setBill({ ...bill, billDate: e.target.value })} className="h-10" />
          </div>
          {duplicate && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <span>{tr(`This bill was already booked${duplicate.date ? ` on ${duplicate.date}` : ''}. Booking it again adds the stock twice.`, `Diese Rechnung wurde schon eingebucht${duplicate.date ? ` am ${duplicate.date}` : ''}. Nochmal einbuchen zählt die Ware doppelt.`)}</span>
            </div>
          )}
          {bill.note && <p className="text-xs text-muted-foreground">{bill.note}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2"></th>
                  <th className="py-2 pr-2">{tr('On the bill', 'Auf der Rechnung')}</th>
                  <th className="py-2 pr-2">{tr('Stock item', 'Lagerartikel')}</th>
                  <th className="py-2 pr-2 text-right">{tr('Adds', 'Zugang')}</th>
                  <th className="py-2 pr-2">{tr('Unit', 'Einheit')}</th>
                  <th className="py-2 pr-2 text-right">€/{tr('unit', 'Einh.')}</th>
                  <th className="py-2 text-right">{tr('Line €', 'Zeile €')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className={`border-b align-top ${l.include ? '' : 'opacity-40'}`}>
                    <td className="py-2 pr-2"><input type="checkbox" checked={l.include} onChange={(e) => update(l.key, { include: e.target.checked })} className="h-4 w-4 accent-primary" /></td>
                    <td className="py-2 pr-2 min-w-[180px]">
                      <div className="font-medium">{l.text}</div>
                      <div className="text-xs text-muted-foreground">{l.articleNo ? `${tr('Art.', 'Art.')} ${l.articleNo} · ` : ''}{l.packLabel}</div>
                    </td>
                    <td className="py-2 pr-2 min-w-[170px]">
                      <Input value={l.itemName} onChange={(e) => update(l.key, { itemName: e.target.value })} disabled={!l.isNew} className="h-9" />
                      <div className={`text-xs mt-0.5 ${l.isNew ? 'text-amber-700' : 'text-emerald-700'}`}>{l.isNew ? tr('new item', 'neuer Artikel') : tr('in stock', 'im Lager')}{l.category ? ` · ${l.category}` : ''}</div>
                    </td>
                    <td className="py-2 pr-2 w-24"><Input type="number" step="any" min="0" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className="h-9 text-right" /></td>
                    <td className="py-2 pr-2 w-24">
                      {l.isNew ? (
                        <select value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} className="h-9 rounded-md border-2 border-border bg-background px-1 text-sm">
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      ) : <span className="text-sm">{l.unit}</span>}
                    </td>
                    <td className="py-2 pr-2 w-24"><Input type="number" step="any" min="0" value={l.unitCost ?? ''} onChange={(e) => update(l.key, { unitCost: e.target.value })} className="h-9 text-right" /></td>
                    <td className="py-2 text-right whitespace-nowrap">{l.lineNet != null ? fmt(l.lineNet, 2) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-xs text-muted-foreground flex-1">
              {tr(`${included.length} of ${lines.length} lines · ${newNames.length} new items · lines total € ${fmt(bill.linesNet, 2)}`, `${included.length} von ${lines.length} Zeilen · ${newNames.length} neue Artikel · Zeilensumme € ${fmt(bill.linesNet, 2)}`)}
              {bill.totalNet ? tr(` · bill net € ${fmt(bill.totalNet, 2)}`, ` · Rechnung netto € ${fmt(bill.totalNet, 2)}`) : ''}
            </div>
            <Button type="button" variant="outline" onClick={() => { setBill(null); setLines([]); }} disabled={booking} className="h-11">{tr('Discard', 'Verwerfen')}</Button>
            <Button type="button" onClick={() => book(!!duplicate)} disabled={booking || !included.length} className={`h-11 ${duplicate ? 'bg-red-700 hover:bg-red-800' : ''}`}>
              {booking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {duplicate ? tr('Book again anyway', 'Trotzdem nochmal einbuchen') : tr(`Book all (${included.length})`, `Alles einbuchen (${included.length})`)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
