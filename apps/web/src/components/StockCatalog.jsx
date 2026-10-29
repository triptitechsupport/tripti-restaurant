import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, Search, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import apiServerClient from '@/lib/apiServerClient.js';
import pbDefault from '@/lib/pocketbaseClient.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Supplier product lists (e.g. AEKSHEA, 3,849 products). Search, tick the
// products you buy and add them as stock items with quantity 0. Their
// article numbers are saved, so that supplier's bills match them later.
const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack', 'bottle', 'can'];

export default function StockCatalog({ pb: pbProp, onAdded }) {
  const pb = pbProp || pbDefault;
  const { language } = useLanguage();
  const de = language !== 'en';
  const tr = (en, d) => (de ? d : en);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState({ items: [], total: 0, suppliers: [] });
  const [picked, setPicked] = useState({}); // articleNo -> {name, unit, ...}
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  const auth = () => ({ Authorization: `Bearer ${pb.authStore.token}`, 'Content-Type': 'application/json' });

  const search = async (text) => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await apiServerClient.fetch(`/stock-ai/catalog?limit=60&q=${encodeURIComponent(text)}`, { headers: auth() });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.message || `Error ${r.status}`);
      if (n === seq.current) setRes(out);
    } catch (err) {
      if (n === seq.current) toast.error(err.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => search(q), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const toggle = (e) => setPicked((p) => {
    const next = { ...p };
    if (next[e.articleNo]) delete next[e.articleNo];
    else next[e.articleNo] = { supplier: e.supplier, articleNo: e.articleNo, name: e.name, unit: e.unit, text: e.text, carton: e.carton };
    return next;
  });
  const edit = (a, patch) => setPicked((p) => ({ ...p, [a]: { ...p[a], ...patch } }));
  const list = Object.values(picked);

  const add = async () => {
    setAdding(true);
    try {
      const r = await apiServerClient.fetch('/stock-ai/catalog/add', { method: 'POST', headers: auth(), body: JSON.stringify({ items: list }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.message || `Error ${r.status}`);
      const linked = out.results.filter((x) => x.status === 'linked').length;
      const exists = out.results.filter((x) => x.status === 'exists').length;
      toast.success(tr(
        `${out.created} new stock items${linked ? `, ${linked} added to an existing item` : ''}${exists ? `, ${exists} were already in stock` : ''}.`,
        `${out.created} neue Lagerartikel${linked ? `, ${linked} zu bestehendem Artikel hinzugefügt` : ''}${exists ? `, ${exists} waren schon im Lager` : ''}.`,
      ));
      setPicked({});
      onAdded?.();
      search(q);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const sup = res.suppliers?.[0];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-11 shrink-0"><BookOpen className="h-4 w-4 mr-2" /> {tr('Supplier catalogue', 'Lieferanten-Katalog')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{tr('Supplier catalogue', 'Lieferanten-Katalog')}</DialogTitle>
            <DialogDescription>
              {sup ? tr(`${sup.supplier}: ${sup.count.toLocaleString()} products. `, `${sup.supplier}: ${sup.count.toLocaleString('de-AT')} Produkte. `) : ''}
              {tr('Tick the products you buy and add them to stock. Bills from this supplier then match them by article number.', 'Produkte ankreuzen, die ihr kauft, und ins Lager übernehmen. Rechnungen dieses Lieferanten werden dann über die Artikelnummer zugeordnet.')}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search name or article number (e.g. atta 5kg, ghee, 4832)', 'Name oder Artikelnr. suchen (z.B. atta 5kg, ghee, 4832)')} className="pl-9 h-11" />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">{res.total > res.items.length ? tr(`Showing ${res.items.length} of ${res.total}. Type more to narrow down.`, `${res.items.length} von ${res.total}. Genauer suchen zum Eingrenzen.`) : tr(`${res.total} found`, `${res.total} gefunden`)}</p>
          <div className="flex-1 overflow-y-auto border rounded-xl divide-y min-h-[160px]">
            {res.items.map((e) => {
              const inStock = !!e.stockItemId;
              const sel = !!picked[e.articleNo];
              return (
                <label key={`${e.supplier}-${e.articleNo}`} className={`flex items-start gap-3 p-3 ${inStock ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'} ${sel ? 'bg-primary/5' : ''}`}>
                  <input type="checkbox" disabled={inStock} checked={sel || inStock} onChange={() => toggle(e)} className="mt-1 h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">{e.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {tr('Art.', 'Art.')} {e.articleNo}{e.carton ? ` · ${tr('carton', 'Karton')} ${e.carton}` : ''}{!e.active ? ` · ${tr('not active at supplier', 'beim Lieferanten inaktiv')}` : ''}
                    </div>
                    {inStock && <div className="text-xs font-semibold text-green-700 flex items-center gap-1 mt-0.5"><Check className="h-3 w-3" /> {tr('In stock as', 'Im Lager als')} {e.stockItemName}</div>}
                  </div>
                </label>
              );
            })}
            {!loading && !res.items.length && <p className="p-6 text-center text-sm text-muted-foreground">{tr('Nothing found.', 'Nichts gefunden.')}</p>}
          </div>
          {list.length > 0 && (
            <div className="border rounded-xl p-3 space-y-2 max-h-[24vh] overflow-y-auto bg-muted/30 shrink-0">
              <p className="text-xs font-semibold">{tr('Stock name and unit (same name = one item for all pack sizes):', 'Lagername und Einheit (gleicher Name = ein Artikel für alle Packungsgrößen):')}</p>
              {list.map((p) => (
                <div key={p.articleNo} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-12 shrink-0">{p.articleNo}</span>
                  <Input value={p.name} onChange={(ev) => edit(p.articleNo, { name: ev.target.value })} className="h-9 flex-1" />
                  <select value={p.unit} onChange={(ev) => edit(p.articleNo, { unit: ev.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tr('Close', 'Schließen')}</Button>
            <Button disabled={!list.length || adding} onClick={add}>
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {tr(`Add to stock (${list.length})`, `Ins Lager übernehmen (${list.length})`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
