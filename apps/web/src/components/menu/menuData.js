// Live menu data shared by the menu book popup and the /menu page.
// Dishes come from Admin > Menu Management, categories (and their order)
// from Admin > Categories.
import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient.js';

export const fmtPrice = (p, lang) => {
  const n = Number(p) || 0;
  return lang === 'de' ? `${n.toFixed(2).replace('.', ',')} €` : `€${n.toFixed(2)}`;
};

export function normalizeItem(r) {
  const alg = Array.isArray(r.allergens)
    ? r.allergens
    : (typeof r.allergens === 'string' && r.allergens ? r.allergens.split(',') : []);
  return {
    id: r.id,
    raw: r,
    de: r.nameDE || r.name || r.nameEN || '',
    en: r.nameEN || r.name || r.nameDE || '',
    descDe: r.descriptionDE || r.description || '',
    descEn: r.descriptionEN || r.description || '',
    price: Number(r.price) || 0,
    cat: r.category || '',
    veg: r.isVegetarian === true,
    alg: alg.map((a) => String(a).trim()).filter(Boolean),
  };
}

// Categories that have dishes, in the admin's order. Categories used by a
// dish but missing from Admin > Categories are added at the end.
export function buildCats(items, categories) {
  const used = new Set(items.map((i) => i.cat));
  const list = categories
    .filter((c) => used.has(c.name))
    .map((c) => ({ id: c.name, de: c.name_de || c.name, en: c.name }));
  const known = new Set(list.map((c) => c.id));
  [...used].filter((c) => c && !known.has(c)).forEach((c) => list.push({ id: c, de: c, en: c }));
  return list;
}

// One request per page load, shared by every component that needs the menu.
let cache = null;
function loadMenu() {
  if (!cache) {
    const opts = { $autoCancel: false };
    cache = Promise.allSettled([
      pb.collection('menu_items').getList(1, 500, { filter: 'availability = true', sort: 'category,nameEN', ...opts }),
      pb.collection('categories').getFullList({ sort: 'display_order,name', ...opts }),
    ]).then(([items, cats]) => {
      const ok = (r) => r.status === 'fulfilled';
      const result = {
        failed: !ok(items),
        items: ok(items) ? items.value.items.map(normalizeItem) : [],
        categories: ok(cats) ? cats.value : [],
      };
      if (result.failed) cache = null; // try again next time
      return result;
    });
  }
  return cache;
}

export function useMenuData(enabled = true) {
  const [state, setState] = useState({ loading: true, failed: false, items: [], categories: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadMenu().then((r) => { if (alive) setState({ loading: false, ...r }); });
    return () => { alive = false; };
  }, [enabled]);
  return state;
}
