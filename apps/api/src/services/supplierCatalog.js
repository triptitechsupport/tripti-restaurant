// Supplier product lists (e.g. the AEKSHEA stock list). They ship with the
// app in src/data/catalog/*.json, so they survive the test site's database
// resets. Staff search them and add only the products they buy as stock items.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog');

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const num = (s) => Number(String(s).replace(',', '.')) || 0;

const UNIT = { kg: 'kg', kgs: 'kg', g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g', gr: 'g', grm: 'g', ml: 'ml', l: 'l', lt: 'l', ltr: 'l', litre: 'l', liter: 'l', pcs: 'pcs', pc: 'pcs', stk: 'pcs', st: 'pcs', pieces: 'pcs', pkt: 'pcs', pkts: 'pcs', paket: 'pcs', packet: 'pcs', tab: 'pcs', tabs: 'pcs', set: 'pcs', sets: 'pcs', oz: 'oz' };
const U = '(kgs?|gms?|grams?|grm|gr|g|ml|ltr|litre|liter|lt|l|pcs|pc|stk|pieces|pkts?|paket|packet|tabs?|sets?|oz)';
// "500PCSX650ML": cartons of 500 containers -> counted in pieces.
const COUNT_FIRST = /(\d+)\s*(?:pcs|pc|sets?|stk)\s*[x×*]/i;
const MULTI = new RegExp(`(\\d+)\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*${U}(?![a-z])`, 'i');
const MULTI_REV = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${U}\\s*[x×*]\\s*(\\d+)(?![a-z0-9])`, 'i');
const SINGLE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${U}(?![a-z])`, 'i');

// Ounces: use the gram size printed next to it, else convert.
function fixOz(p, t) {
  if (p.packUnit !== 'oz') return p;
  const g = t.match(/\((\d+(?:[.,]\d+)?)\s*g\)/i);
  // No grams printed (e.g. "250X10OZ" cups): count pieces.
  if (!g) return { ...p, packSize: 1, packUnit: 'pcs' };
  return { ...p, packSize: num(g[1]), packUnit: 'g', match: t.slice(t.indexOf(p.match), t.indexOf(g[0]) + g[0].length) };
}

/** "AEKSHEA AMCHUR POWDER 20 X 100 G" -> 20 packs of 100 g per carton. */
export function parsePack(text) {
  const t = String(text || '');
  let m = t.match(COUNT_FIRST);
  if (m) return { perCarton: Number(m[1]), packSize: 1, packUnit: 'pcs', match: t.slice(m.index).match(/^\S+/)[0] };
  m = t.match(MULTI);
  if (m) return fixOz({ perCarton: Number(m[1]), packSize: num(m[2]), packUnit: UNIT[m[3].toLowerCase()], match: m[0] }, t);
  m = t.match(MULTI_REV);
  if (m) return { perCarton: Number(m[3]), packSize: num(m[1]), packUnit: UNIT[m[2].toLowerCase()], match: m[0] };
  m = t.match(SINGLE);
  if (m) return { perCarton: null, packSize: num(m[1]), packUnit: UNIT[m[2].toLowerCase()], match: m[0] };
  return { perCarton: null, packSize: null, packUnit: null, match: '' };
}

const smallWords = new Set(['and', 'with', 'of', 'in', 'the', 'for']);
function tidyName(text, packMatch) {
  let s = String(text || '');
  if (packMatch) s = s.replace(packMatch, ' ');
  s = s.replace(/\((?:export|india|jar|[^)]*\d[^)]*|\s*)\)/gi, ' ').replace(/\bpack\b\s*$/i, ' ').replace(/\s+/g, ' ').replace(/[\s,;:+-]+$/, '').trim();
  // Shouting names -> Title Case; keep mixed-case names as they are.
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().split(' ').map((w, i) => (i > 0 && smallWords.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  return s.slice(0, 120) || String(text || '').trim().slice(0, 120);
}

/** Stock unit, a readable carton label and a suggested item name. */
export function describe(entry) {
  const p = parsePack(entry.n);
  const unit = p.packUnit === 'g' || p.packUnit === 'kg' ? 'kg' : p.packUnit === 'ml' || p.packUnit === 'l' ? 'l' : 'pcs';
  const size = p.packSize ? `${String(p.packSize).replace('.', ',')} ${p.packUnit}` : '';
  const carton = p.packUnit === 'pcs' && p.packSize === 1 ? `${p.perCarton || 1} pcs` : p.perCarton ? `${p.perCarton} × ${size || 'pcs'}` : size;
  // Content of one carton in the stock unit (for ordering hints).
  let perCartonQty = null;
  if (p.packSize && p.packUnit) {
    const each = p.packUnit === 'g' || p.packUnit === 'ml' ? p.packSize / 1000 : p.packSize;
    perCartonQty = Math.round(each * (p.perCarton || 1) * 1000) / 1000;
  }
  return { articleNo: entry.a, text: entry.n, name: tidyName(entry.n, p.match), unit, carton, perCartonQty, packSize: p.packSize, packUnit: p.packUnit, perCarton: p.perCarton, active: !entry.off };
}

let cache = null;
export function catalogs() {
  if (cache) return cache;
  cache = [];
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { files = []; }
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const items = (d.items || []).map((e) => ({ ...e, supplier: d.supplier, key: norm(`${e.a} ${e.n}`) }));
      cache.push({ supplier: d.supplier, source: d.source || f, count: items.length, items });
    } catch { /* skip a broken file */ }
  }
  return cache;
}

/** Search all lists; every word must appear (article number or name). */
export function searchCatalog(q, { supplier = '', limit = 40 } = {}) {
  const words = norm(q).split(' ').filter(Boolean);
  const out = [];
  let total = 0;
  for (const c of catalogs()) {
    if (supplier && c.supplier.toLowerCase() !== supplier.toLowerCase()) continue;
    for (const e of c.items) {
      if (words.length && !words.every((w) => e.key.includes(w))) continue;
      total++;
      if (out.length < limit) out.push({ supplier: c.supplier, ...describe(e) });
    }
  }
  // Exact article number first, then active products.
  const qa = String(q || '').trim();
  out.sort((x, y) => (y.articleNo === qa) - (x.articleNo === qa) || (y.active - x.active));
  return { total, items: out };
}

export function findArticle(supplier, articleNo) {
  for (const c of catalogs()) {
    if (supplier && c.supplier.toLowerCase() !== String(supplier).toLowerCase()) continue;
    const e = c.items.find((i) => i.a === String(articleNo).trim());
    if (e) return { supplier: c.supplier, ...describe(e) };
  }
  return null;
}
