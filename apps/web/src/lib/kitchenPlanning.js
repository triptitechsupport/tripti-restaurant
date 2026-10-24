// Recipes and weekly stock planning for the kitchen manager. Pure helpers.

const UNIT_GROUPS = {
  g: ['mass', 1], gr: ['mass', 1], gram: ['mass', 1], kg: ['mass', 1000],
  ml: ['volume', 1], cl: ['volume', 10], dl: ['volume', 100], l: ['volume', 1000], lt: ['volume', 1000], ltr: ['volume', 1000],
  pc: ['count', 1], pcs: ['count', 1], stk: ['count', 1], 'stück': ['count', 1], st: ['count', 1], piece: ['count', 1], pieces: ['count', 1],
};

export const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

const norm = (u) => String(u || '').trim().toLowerCase().replace(/\.$/, '');

// Convert qty between units of the same kind (g/kg, ml/l, pcs). Null when
// the units do not match (e.g. g to pcs). Same or empty units pass through.
export function convertQty(qty, from, to) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return null;
  const a = norm(from); const b = norm(to);
  if (!a || !b || a === b) return n;
  const ga = UNIT_GROUPS[a]; const gb = UNIT_GROUPS[b];
  if (!ga || !gb || ga[0] !== gb[0]) return null;
  return (n * ga[1]) / gb[1];
}

export const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

// Monday 00:00 (local) of the week containing `d`.
export function weekStartOf(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

export function nextWeekStart(now = new Date()) {
  const x = weekStartOf(now);
  x.setDate(x.getDate() + 7);
  return x;
}

export function isoDay(d) {
  const x = d instanceof Date ? d : new Date(String(d).replace(' ', 'T'));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// ISO week number, for "Week 44".
export function weekNumber(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - yearStart) / 86400000 + 1) / 7);
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

// Stock item for a recipe line: the linked one, or one with the same name
// (so an item added to the stock list later still counts).
const nameIndex = new WeakMap();
export function stockFor(ing, stockById) {
  if (!stockById) return null;
  if (ing?.stockItem && stockById[ing.stockItem]) return stockById[ing.stockItem];
  const name = String(ing?.name || '').trim().toLowerCase();
  if (!name) return null;
  let idx = nameIndex.get(stockById);
  if (!idx) {
    idx = new Map();
    for (const s of Object.values(stockById)) idx.set(String(s.name || '').trim().toLowerCase(), s);
    nameIndex.set(stockById, idx);
  }
  return idx.get(name) || null;
}

// Menu price that gives the target food cost %.
export const priceForFoodCost = (cost, pct = 30) => (cost > 0 && pct > 0 ? Math.ceil((cost / (pct / 100)) * 10) / 10 : null);

// Scale a recipe amount from the recipe's yield to `portions`.
export function scaledQty(qty, yieldPortions, portions) {
  const y = Number(yieldPortions) > 0 ? Number(yieldPortions) : 1;
  const n = (Number(qty) || 0) * (Number(portions) || y) / y;
  return n >= 100 ? Math.round(n) : n >= 10 ? round(n, 1) : round(n, 2);
}

// Ingredients of one portion, with cost from the linked stock item.
export function recipeCost(recipe, stockById, price) {
  const yieldPortions = Number(recipe?.yieldPortions) > 0 ? Number(recipe.yieldPortions) : 1;
  let cost = 0; let missing = 0;
  for (const ing of parseJson(recipe?.ingredients, [])) {
    const item = stockFor(ing, stockById);
    const unitCost = Number(item?.unitCost);
    if (!item || !Number.isFinite(unitCost) || unitCost <= 0) { missing += 1; continue; }
    const q = convertQty(Number(ing.qty) / yieldPortions, ing.unit || item.unit, item.unit);
    if (q == null) { missing += 1; continue; }
    cost += q * unitCost;
  }
  const p = Number(price);
  return {
    perPortion: round(cost),
    foodCostPct: p > 0 && cost > 0 ? round((cost / p) * 100, 1) : null,
    missing,
  };
}

// Portions sold per menu item from kitchen tickets (cancelled ones skipped).
export function portionsSold(kots) {
  const out = {};
  for (const k of kots || []) {
    if (k.status === 'cancelled') continue;
    for (const it of parseJson(k.items, [])) {
      const id = it.id || it.menuItemId;
      if (!id) continue;
      out[id] = (out[id] || 0) + (Number(it.quantity) || 1);
    }
  }
  return out;
}

// Total ingredients for planned portions per dish. Lines are keyed by stock
// item (in the stock item's unit) or, without a stock item, by name + unit.
export function ingredientNeeds(recipes, plannedByMenuItem, stockById) {
  const lines = new Map();
  for (const r of recipes || []) {
    const portions = Number(plannedByMenuItem[r.menuItem]) || 0;
    if (portions <= 0) continue;
    const yieldPortions = Number(r.yieldPortions) > 0 ? Number(r.yieldPortions) : 1;
    for (const ing of parseJson(r.ingredients, [])) {
      const perPortion = (Number(ing.qty) || 0) / yieldPortions;
      if (perPortion <= 0) continue;
      const item = stockFor(ing, stockById);
      let unit = ing.unit || item?.unit || '';
      let qty = perPortion * portions;
      if (item) {
        const c = convertQty(qty, unit, item.unit);
        if (c != null) { qty = c; unit = item.unit || unit; }
      }
      const key = item ? `s:${item.id}:${norm(unit)}` : `n:${String(ing.name || '').trim().toLowerCase()}:${norm(unit)}`;
      if (!lines.has(key)) lines.set(key, { stockItem: item ? item.id : '', name: item ? item.name : String(ing.name || '').trim(), unit, qty: 0, dishes: [] });
      const line = lines.get(key);
      line.qty += qty;
      line.dishes.push(r.menuItem);
    }
  }
  return [...lines.values()].map((l) => ({ ...l, qty: round(l.qty, 2) })).sort((a, b) => a.name.localeCompare(b.name));
}

// Round a requested amount up to something sensible to hand out.
export function niceQty(qty, unit) {
  const n = Number(qty) || 0;
  const u = norm(unit);
  if (UNIT_GROUPS[u]?.[0] === 'count') return Math.ceil(n);
  if (u === 'g' || u === 'ml') {
    if (n <= 20) return Math.ceil(n);
    if (n <= 200) return Math.ceil(n / 5) * 5;
    return Math.ceil(n / 50) * 50;
  }
  if (n < 1) return Math.ceil(n * 10) / 10;
  return Math.ceil(n * 2) / 2;
}

export const REQUEST_STATUS = ['draft', 'submitted', 'in_progress', 'partial', 'fulfilled', 'cancelled'];
export const OPEN_FOR_STOCK = ['submitted', 'in_progress', 'partial'];
