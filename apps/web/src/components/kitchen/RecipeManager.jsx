import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Plus, Trash2, Loader2, CheckCircle2, CircleDashed, Save, Printer, Euro, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { printHtmlPage } from '@/lib/staffApp.js';
import { RECIPE_UNITS, recipeCost, parseJson, round, stockFor, priceForFoodCost, scaledQty } from '@/lib/kitchenPlanning.js';

// Recipes, one per dish: ingredients for a batch, how many portions it makes,
// the method, and the cost per portion from the stock prices.
// canEdit: kitchen manager / admin. Kitchen staff only read.

const T = {
  en: {
    title: 'Recipes', sub: 'One recipe per dish: ingredients, method and cost per portion.',
    search: 'Search dishes', all: 'All', missingOnly: 'Without recipe', withRecipe: (n, m) => `${n} of ${m} dishes have a recipe`,
    has: 'Recipe', none: 'No recipe', perPortion: 'per portion', food: 'food cost',
    yield: 'Portions this recipe makes', ingredients: 'Ingredients', ingredient: 'Ingredient', qty: 'Amount', unit: 'Unit',
    add: 'Add ingredient', method: 'Method', methodPh: '1. Heat oil…\n2. Add onions…', notes: 'Notes (plating, allergens, storage)',
    save: 'Save recipe', saving: 'Saving…', saved: 'Recipe saved', del: 'Delete recipe', deleted: 'Recipe deleted', print: 'Print',
    notStock: 'not in stock list', cost: 'Cost per portion', price: 'Menu price', margin: 'Food cost',
    noCost: (n) => `${n} ingredient${n === 1 ? ' has' : 's have'} no stock price, so the cost is not complete.`, failed: 'Could not save the recipe', empty: 'Add at least one ingredient.',
    readOnly: 'Only the kitchen manager can change recipes.', confirmDel: 'Delete this recipe?', noDishes: 'No dishes found.',
    sortName: 'A–Z', sortCost: 'Highest food cost', avg: (p) => `Average food cost ${p}%`, over: (n) => `${n} dish${n === 1 ? '' : 'es'} above 35%`,
    cookFor: 'Cook for', portions: 'portions', suggested: (p) => `Price for 30% food cost: €${p}`,
    out: 'none in store', low: (q, u) => `only ${q} ${u} in store`, inStore: (q, u) => `${q} ${u} in store`,
  },
  de: {
    title: 'Rezepte', sub: 'Ein Rezept pro Gericht: Zutaten, Zubereitung und Kosten pro Portion.',
    search: 'Gerichte suchen', all: 'Alle', missingOnly: 'Ohne Rezept', withRecipe: (n, m) => `${n} von ${m} Gerichten haben ein Rezept`,
    has: 'Rezept', none: 'Kein Rezept', perPortion: 'pro Portion', food: 'Wareneinsatz',
    yield: 'Portionen aus diesem Rezept', ingredients: 'Zutaten', ingredient: 'Zutat', qty: 'Menge', unit: 'Einheit',
    add: 'Zutat hinzufügen', method: 'Zubereitung', methodPh: '1. Öl erhitzen…\n2. Zwiebeln dazugeben…', notes: 'Notizen (Anrichten, Allergene, Lagerung)',
    save: 'Rezept speichern', saving: 'Speichert…', saved: 'Rezept gespeichert', del: 'Rezept löschen', deleted: 'Rezept gelöscht', print: 'Drucken',
    notStock: 'nicht in der Lagerliste', cost: 'Kosten pro Portion', price: 'Preis lt. Karte', margin: 'Wareneinsatz',
    noCost: (n) => `${n} Zutat${n === 1 ? ' hat' : 'en haben'} keinen Lagerpreis, die Kosten sind daher unvollständig.`, failed: 'Rezept konnte nicht gespeichert werden', empty: 'Mindestens eine Zutat eintragen.',
    readOnly: 'Nur die Küchenleitung kann Rezepte ändern.', confirmDel: 'Dieses Rezept löschen?', noDishes: 'Keine Gerichte gefunden.',
    sortName: 'A–Z', sortCost: 'Höchster Wareneinsatz', avg: (p) => `Wareneinsatz im Schnitt ${p}%`, over: (n) => `${n} Gericht${n === 1 ? '' : 'e'} über 35%`,
    cookFor: 'Kochen für', portions: 'Portionen', suggested: (p) => `Preis für 30% Wareneinsatz: €${p}`,
    out: 'nichts im Lager', low: (q, u) => `nur ${q} ${u} im Lager`, inStore: (q, u) => `${q} ${u} im Lager`,
  },
};

const costTone = (pct) => (pct == null ? 'text-muted-foreground' : pct > 35 ? 'text-destructive' : pct > 28 ? 'text-amber-700' : 'text-green-700');
const blankLine = () => ({ name: '', stockItem: '', qty: '', unit: 'g' });

export default function RecipeManager({ client, canEdit = false, userName = '' }) {
  const { language } = useLanguage();
  const de = language === 'de';
  const tx = T[de ? 'de' : 'en'];
  const [menu, setMenu] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [editing, setEditing] = useState(null); // { dish, recipe, form }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const opts = { $autoCancel: false, requestKey: null };
    try {
      const [m, r, s] = await Promise.all([
        client.collection('menu_items').getFullList({ ...opts, sort: 'category,nameEN', fields: 'id,name,nameEN,nameDE,category,price,availability' }),
        client.collection('recipes').getFullList(opts),
        canEdit ? client.collection('stock_items').getFullList({ ...opts, sort: 'name', fields: 'id,name,unit,unitCost,quantity,minStock,category' }).catch(() => []) : Promise.resolve([]),
      ]);
      setMenu(m); setRecipes(r); setStock(s);
    } catch (err) {
      console.error('[Recipes] load failed', err);
      toast.error(de ? 'Rezepte konnten nicht geladen werden' : 'Could not load recipes');
    } finally {
      setLoading(false);
    }
  }, [client, canEdit, de]);

  useEffect(() => { load(); }, [load]);

  const stockById = useMemo(() => Object.fromEntries(stock.map((s) => [s.id, s])), [stock]);
  const stockByName = useMemo(() => Object.fromEntries(stock.map((s) => [String(s.name).trim().toLowerCase(), s])), [stock]);
  const recipeByDish = useMemo(() => Object.fromEntries(recipes.map((r) => [r.menuItem, r])), [recipes]);
  const categories = useMemo(() => [...new Set(menu.map((m) => m.category).filter(Boolean))], [menu]);
  const dishName = useCallback((m) => (de ? m.nameDE || m.nameEN || m.name : m.nameEN || m.name), [de]);

  const costByDish = useMemo(() => {
    if (!canEdit) return {};
    const out = {};
    for (const m of menu) if (recipeByDish[m.id]) out[m.id] = recipeCost(recipeByDish[m.id], stockById, m.price);
    return out;
  }, [canEdit, menu, recipeByDish, stockById]);

  const costSummary = useMemo(() => {
    const pcts = Object.values(costByDish).map((c) => c.foodCostPct).filter((p) => p != null);
    if (!pcts.length) return null;
    return { avg: round(pcts.reduce((a, b) => a + b, 0) / pcts.length, 1), over: pcts.filter((p) => p > 35).length };
  }, [costByDish]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = menu.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      if (missingOnly && recipeByDish[m.id]) return false;
      return !q || `${m.name} ${m.nameEN} ${m.nameDE}`.toLowerCase().includes(q);
    });
    if (sortBy === 'cost') list.sort((a, b) => (costByDish[b.id]?.foodCostPct ?? -1) - (costByDish[a.id]?.foodCostPct ?? -1));
    return list;
  }, [menu, query, category, missingOnly, recipeByDish, sortBy, costByDish]);

  const open = (dish) => {
    const recipe = recipeByDish[dish.id] || null;
    const lines = parseJson(recipe?.ingredients, []).map((l) => ({ ...l, qty: l.qty ?? '' }));
    setEditing({
      dish,
      recipe,
      cookFor: recipe?.yieldPortions || 1,
      form: {
        yieldPortions: recipe?.yieldPortions || 1,
        ingredients: lines.length ? lines : (canEdit ? [blankLine()] : []),
        steps: recipe?.steps || '',
        notes: recipe?.notes || '',
      },
    });
  };

  const setForm = (patch) => setEditing((e) => ({ ...e, form: { ...e.form, ...patch } }));
  const setLine = (i, patch) => setEditing((e) => {
    const ingredients = e.form.ingredients.map((l, j) => (j === i ? { ...l, ...patch } : l));
    return { ...e, form: { ...e.form, ingredients } };
  });

  const onIngredientName = (i, value) => {
    const match = stockByName[value.trim().toLowerCase()];
    if (match) {
      // Recipes are written in small units: stock kept in kg is entered in g.
      const u = String(match.unit || '').trim().toLowerCase();
      setLine(i, { name: match.name, stockItem: match.id, unit: u === 'kg' ? 'g' : u === 'l' ? 'ml' : u || 'pcs' });
    }
    else setLine(i, { name: value, stockItem: '' });
  };

  const liveCost = useMemo(() => {
    if (!editing) return null;
    const lines = editing.form.ingredients.filter((l) => l.name && Number(l.qty) > 0);
    return recipeCost({ yieldPortions: editing.form.yieldPortions, ingredients: lines }, stockById, editing.dish.price);
  }, [editing, stockById]);

  const save = async () => {
    if (!editing) return;
    const ingredients = editing.form.ingredients
      .filter((l) => String(l.name || '').trim() && Number(l.qty) > 0)
      .map((l) => ({ name: String(l.name).trim(), stockItem: l.stockItem || '', qty: round(Number(l.qty), 3), unit: l.unit || '' }));
    if (!ingredients.length) { toast.error(tx.empty); return; }
    const data = {
      menuItem: editing.dish.id,
      yieldPortions: Math.max(1, Number(editing.form.yieldPortions) || 1),
      ingredients,
      steps: editing.form.steps,
      notes: editing.form.notes,
      updatedBy: userName,
    };
    setSaving(true);
    try {
      if (editing.recipe) await client.collection('recipes').update(editing.recipe.id, data, { $autoCancel: false });
      else await client.collection('recipes').create(data, { $autoCancel: false });
      toast.success(tx.saved);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(`${tx.failed}: ${err?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing?.recipe) return;
    if (!window.confirm(tx.confirmDel)) return;
    try {
      await client.collection('recipes').delete(editing.recipe.id, { $autoCancel: false });
      toast.success(tx.deleted);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err?.message || tx.failed);
    }
  };

  const printRecipe = () => {
    if (!editing) return;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const f = editing.form;
    const n = Number(editing.cookFor) || Number(f.yieldPortions) || 1;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(dishName(editing.dish))}</title>
<style>body{font-family:system-ui,sans-serif;margin:18px;font-size:14px}h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:10px 0}td{border-bottom:1px solid #ccc;padding:4px}.r{text-align:right}pre{white-space:pre-wrap;font-family:inherit}</style></head><body>
<h1>${esc(dishName(editing.dish))}</h1><p>${tx.cookFor}: <b>${esc(n)}</b> ${tx.portions}</p>
<table>${f.ingredients.filter((l) => l.name).map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${esc(scaledQty(l.qty, f.yieldPortions, n))} ${esc(l.unit)}</td></tr>`).join('')}</table>
${f.steps ? `<h3>${tx.method}</h3><pre>${esc(f.steps)}</pre>` : ''}${f.notes ? `<h3>${tx.notes}</h3><pre>${esc(f.notes)}</pre>` : ''}
</body></html>`;
    printHtmlPage(html, dishName(editing.dish));
  };

  const withRecipe = menu.filter((m) => recipeByDish[m.id]).length;

  const cookFor = editing ? (Number(editing.cookFor) || Number(editing.form.yieldPortions) || 1) : 1;
  const cookForInput = editing && (
    <label className="inline-flex items-center gap-2 text-sm font-semibold">
      <Users className="h-4 w-4 text-muted-foreground" />{tx.cookFor}
      <input type="number" min="1" step="1" inputMode="numeric" value={editing.cookFor}
        onChange={(e) => setEditing((x) => ({ ...x, cookFor: e.target.value }))}
        className="h-10 w-20 rounded-lg border-2 border-border bg-background px-2 text-base" />
      {tx.portions}
    </label>
  );

  const storeNote = (l) => {
    const item = stockFor(l, stockById);
    if (!item) return { text: l.name ? tx.notStock : '', tone: 'text-muted-foreground' };
    const q = Number(item.quantity) || 0;
    if (q <= 0) return { text: tx.out, tone: 'text-destructive font-semibold' };
    const min = Number(item.minStock) || 0;
    if (min > 0 && q <= min) return { text: tx.low(round(q, 2), item.unit || ''), tone: 'text-amber-700 font-semibold' };
    return { text: tx.inStore(round(q, 2), item.unit || ''), tone: 'text-green-700' };
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-serif font-bold text-primary flex items-center gap-2"><BookOpen className="h-5 w-5" />{tx.title}</h2>
        <p className="text-sm text-muted-foreground">{tx.sub}</p>
        {!loading && (
          <p className="mt-1 text-xs font-semibold text-foreground">
            {tx.withRecipe(withRecipe, menu.length)}
            {costSummary && <span className={`ml-2 ${costTone(costSummary.avg)}`}>· {tx.avg(costSummary.avg)}</span>}
            {costSummary?.over > 0 && <span className="ml-2 text-destructive">· {tx.over(costSummary.over)}</span>}
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx.search} aria-label={tx.search}
            className="h-11 w-full rounded-xl border-2 border-border bg-background pl-9 pr-3 text-sm" />
        </label>
        <button type="button" onClick={() => setMissingOnly((v) => !v)} aria-pressed={missingOnly}
          className={`h-11 shrink-0 rounded-xl border-2 px-4 text-sm font-semibold ${missingOnly ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
          {tx.missingOnly}
        </button>
        {canEdit && (
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort"
            className="h-11 shrink-0 rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold">
            <option value="name">{tx.sortName}</option>
            <option value="cost">{tx.sortCost}</option>
          </select>
        )}
      </div>
      <div className="app-chip-row flex gap-2 overflow-x-auto pb-1">
        {['all', ...categories].map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`shrink-0 h-9 rounded-full border-2 px-3.5 text-sm font-semibold ${category === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
            {c === 'all' ? tx.all : c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{tx.noDishes}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const r = recipeByDish[m.id];
            const c = costByDish[m.id] || null;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => open(m)} className="w-full text-left rounded-xl border-2 border-border bg-card p-3 hover:border-primary/50 active:scale-[0.99] transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold leading-tight truncate">{dishName(m)}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.category} · €{Number(m.price || 0).toFixed(2)}</div>
                    </div>
                    {r ? (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-[11px] font-bold text-green-700"><CheckCircle2 className="h-3 w-3" />{tx.has}</span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"><CircleDashed className="h-3 w-3" />{tx.none}</span>
                    )}
                  </div>
                  {c && c.perPortion > 0 && (
                    <div className="mt-1.5 text-xs">
                      <span className="font-semibold">€{c.perPortion.toFixed(2)}</span> {tx.perPortion}
                      {c.foodCostPct != null && <span className={`ml-2 font-semibold ${costTone(c.foodCostPct)}`}>{c.foodCostPct}% {tx.food}</span>}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !saving) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{dishName(editing.dish)}</DialogTitle>
                <DialogDescription>{editing.dish.category} · €{Number(editing.dish.price || 0).toFixed(2)}</DialogDescription>
              </DialogHeader>

              {!canEdit ? (
                editing.recipe ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">{tx.yield}: <b className="text-foreground">{editing.form.yieldPortions}</b></p>
                    {cookForInput}
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {editing.form.ingredients.map((l, i) => (
                        <li key={i} className="flex justify-between px-3 py-2"><span>{l.name}</span><span className="font-semibold tabular-nums">{scaledQty(l.qty, editing.form.yieldPortions, cookFor)} {l.unit}</span></li>
                      ))}
                    </ul>
                    {editing.form.steps && <div><h4 className="font-bold mb-1">{tx.method}</h4><p className="whitespace-pre-wrap">{editing.form.steps}</p></div>}
                    {editing.form.notes && <div><h4 className="font-bold mb-1">{tx.notes}</h4><p className="whitespace-pre-wrap">{editing.form.notes}</p></div>}
                    <button type="button" onClick={printRecipe} className="h-10 rounded-lg border-2 border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5"><Printer className="h-4 w-4" />{tx.print}</button>
                  </div>
                ) : <p className="text-sm text-muted-foreground">{tx.none}. {tx.readOnly}</p>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold">{tx.yield}
                    <input type="number" min="1" step="1" inputMode="numeric" value={editing.form.yieldPortions}
                      onChange={(e) => setForm({ yieldPortions: e.target.value })}
                      className="mt-1 block h-11 w-28 rounded-lg border-2 border-border bg-background px-3 text-base" />
                  </label>

                  <div>
                    <div className="mb-1.5 text-sm font-semibold">{tx.ingredients}</div>
                    <datalist id="recipe-stock-items">{stock.map((s) => <option key={s.id} value={s.name}>{s.unit}</option>)}</datalist>
                    <div className="space-y-2">
                      {editing.form.ingredients.map((l, i) => (
                        <div key={i} className="rounded-lg border border-border p-2">
                          <div className="flex gap-2">
                            <input list="recipe-stock-items" value={l.name} onChange={(e) => onIngredientName(i, e.target.value)} placeholder={tx.ingredient} aria-label={tx.ingredient}
                              className="h-10 min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                            <button type="button" onClick={() => setForm({ ingredients: editing.form.ingredients.filter((_, j) => j !== i) })} aria-label={tx.del}
                              className="h-10 w-10 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder={tx.qty} aria-label={tx.qty}
                              className="h-10 w-24 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                            <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label={tx.unit}
                              className="h-10 rounded-lg border-2 border-border bg-background px-2 text-sm">
                              {[...new Set([...RECIPE_UNITS, l.unit].filter(Boolean))].map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                            {(() => { const n = storeNote(l); return <span className={`text-[11px] leading-tight ${n.tone}`}>{n.text}</span>; })()}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setForm({ ingredients: [...editing.form.ingredients, blankLine()] })}
                      className="mt-2 h-10 rounded-lg border-2 border-dashed border-border px-3 text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />{tx.add}</button>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3 text-sm flex flex-wrap gap-x-5 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Euro className="h-4 w-4 text-muted-foreground" />{tx.cost}: <b>€{(liveCost?.perPortion || 0).toFixed(2)}</b></span>
                    <span>{tx.price}: <b>€{Number(editing.dish.price || 0).toFixed(2)}</b></span>
                    {liveCost?.foodCostPct != null && <span className={costTone(liveCost.foodCostPct)}>{tx.margin}: <b>{liveCost.foodCostPct}%</b></span>}
                    {liveCost?.perPortion > 0 && <span className="w-full text-xs text-muted-foreground">{tx.suggested(priceForFoodCost(liveCost.perPortion).toFixed(2))}</span>}
                    {liveCost && liveCost.missing > 0 && <span className="w-full text-xs text-muted-foreground">{tx.noCost(liveCost.missing)}</span>}
                  </div>

                  <label className="block text-sm font-semibold">{tx.method}
                    <textarea value={editing.form.steps} onChange={(e) => setForm({ steps: e.target.value })} rows={5} placeholder={tx.methodPh}
                      className="mt-1 block w-full rounded-lg border-2 border-border bg-background p-2 text-sm" />
                  </label>
                  <label className="block text-sm font-semibold">{tx.notes}
                    <textarea value={editing.form.notes} onChange={(e) => setForm({ notes: e.target.value })} rows={2}
                      className="mt-1 block w-full rounded-lg border-2 border-border bg-background p-2 text-sm" />
                  </label>

                  <div className="rounded-xl border border-border p-3 space-y-2">
                    {cookForInput}
                    {cookFor !== (Number(editing.form.yieldPortions) || 1) && (
                      <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {editing.form.ingredients.filter((l) => l.name && Number(l.qty) > 0).map((l, i) => (
                          <li key={i} className="flex justify-between gap-2"><span className="truncate">{l.name}</span><b className="tabular-nums">{scaledQty(l.qty, editing.form.yieldPortions, cookFor)} {l.unit}</b></li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={save} disabled={saving} className="h-11 flex-1 sm:flex-none rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? tx.saving : tx.save}
                    </button>
                    <button type="button" onClick={printRecipe} className="h-11 rounded-xl border-2 border-border px-4 text-sm font-semibold inline-flex items-center gap-1.5"><Printer className="h-4 w-4" />{tx.print}</button>
                    {editing.recipe && (
                      <button type="button" onClick={remove} className="h-11 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />{tx.del}</button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
