import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CookingPot, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import api from '@/lib/apiServerClient.js';

// Kitchen manager: mark dishes as sold out for the rest of the day (or
// available again). Sold-out dishes disappear from the website menu.
export default function SoldOutButton({ client }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const tr = (de, e) => (en ? e : de);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, categories] = await Promise.all([
        client.collection('menu_items').getFullList({ fields: 'id,name,nameDE,nameEN,category,availability', sort: 'category,name', $autoCancel: false }),
        client.collection('categories').getFullList({ fields: 'name,name_de,display_order', sort: 'display_order,name', $autoCancel: false }).catch(() => []),
      ]);
      setItems(list);
      // menu_items.category holds the category's (English) name.
      setCats(Object.fromEntries(categories.map((c, i) => [c.name, { n: (en ? c.name : c.name_de) || c.name, o: i }])));
    } catch (err) {
      toast.error(err.message);
      setItems([]);
    }
  }, [client, en]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const soldOut = items ? items.filter((i) => !i.availability).length : 0;
  const groups = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    const by = new Map();
    items.forEach((i) => {
      const name = (en ? i.nameEN : i.nameDE) || i.name;
      if (needle && !`${name} ${i.name}`.toLowerCase().includes(needle)) return;
      const c = cats[i.category] || { n: tr('Sonstiges', 'Other'), o: 999 };
      if (!by.has(c.n)) by.set(c.n, { ...c, list: [] });
      by.get(c.n).list.push({ ...i, label: name });
    });
    return [...by.values()].sort((a, b) => a.o - b.o);
  }, [items, cats, q, en]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (item, available) => {
    setBusy(item.id);
    try {
      const res = await api.fetch(`/staff/menu/${item.id}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.authStore.token}` },
        body: JSON.stringify({ available }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, availability: available } : i)));
      toast.success(available ? tr(`${item.label} wieder verfügbar`, `${item.label} available again`) : tr(`${item.label} ausverkauft`, `${item.label} sold out`));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" className="touch-target px-2 sm:px-3" onClick={() => setOpen(true)} title={tr('Ausverkauft', 'Sold out')}>
        <CookingPot className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">{tr('Ausverkauft', 'Sold out')}</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{tr('Gerichte ausverkauft / verfügbar', 'Dishes sold out / available')}</SheetTitle>
            <SheetDescription>
              {tr('Ausgeschaltete Gerichte verschwinden von der Speisekarte auf der Website und können nicht online bestellt werden.',
                'Switched-off dishes disappear from the website menu and cannot be ordered online.')}
              {items && soldOut > 0 && <strong className="block mt-1 text-destructive">{tr(`${soldOut} ausverkauft`, `${soldOut} sold out`)}</strong>}
            </SheetDescription>
          </SheetHeader>
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Gericht suchen', 'Search dish')} className="pl-9 h-11" />
          </div>
          {!items ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{tr('Wird geladen ...', 'Loading ...')}</p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <section key={g.n}>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">{g.n}</h3>
                  <ul className="divide-y rounded-lg border">
                    {g.list.map((i) => (
                      <li key={i.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${i.availability ? '' : 'bg-destructive/5'}`}>
                        <span className={`min-w-0 ${i.availability ? '' : 'line-through text-muted-foreground'}`}>{i.label}</span>
                        <span className="flex items-center gap-2 shrink-0 text-sm">
                          {busy === i.id && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span className={i.availability ? 'text-emerald-700' : 'text-destructive font-semibold'}>{i.availability ? tr('Verfügbar', 'Available') : tr('Ausverkauft', 'Sold out')}</span>
                          <Switch checked={!!i.availability} disabled={!!busy} onCheckedChange={(v) => toggle(i, v)} aria-label={i.label} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
