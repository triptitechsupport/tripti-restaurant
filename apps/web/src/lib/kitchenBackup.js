// Backup and restore of kitchen and stock data as one CSV file.
// Used by the web app (kitchen manager, stock manager, admin) and by
// deploy/bootstrap.mjs, so it has no imports and runs in the browser and Node.
//
// File format: one row per record, columns table,id,data. "data" is the
// record as JSON. Restoring matches records by id, then by name, so a backup
// also fits a fresh database whose seeded dishes have new ids.

export const BACKUP_VERSION = 1;

// Restore order matters: a table is restored after the tables it points to.
export const BACKUP_TABLES = [
  { name: 'categories', key: (r) => r.name, mirror: true },
  { name: 'menu_items', key: (r) => r.nameEN || r.name, skip: ['image'], mirror: true },
  { name: 'stock_locations', key: (r) => r.name, refs: { parent: 'stock_locations' }, mirror: true },
  { name: 'stock_items', key: (r) => r.name, refs: { menuItem: 'menu_items' }, mirror: true },
  { name: 'stock_lots', refs: { stockItem: 'stock_items', location: 'stock_locations' }, skip: ['receipt'] },
  { name: 'recipes', key: (r) => r.menuItem, refs: { menuItem: 'menu_items' }, jsonRefs: { ingredients: 'stock_items' }, mirror: true },
  { name: 'stock_requests', jsonRefs: { items: 'stock_items' } },
];

// Which tables each role keeps a backup of (the ones it may also write).
export const ROLE_TABLES = {
  kitchen_manager: ['categories', 'menu_items', 'recipes', 'stock_requests'],
  stock: ['stock_locations', 'stock_items', 'stock_lots'],
  admin: BACKUP_TABLES.map((t) => t.name),
};

// Tables a role's backup points to without restoring them. Their ids and
// names are written to the file ("#ref:" rows) so a restore into a fresh
// database, where these records have new ids, can still link to them.
export const ROLE_REFS = {
  kitchen_manager: ['stock_items'],
  stock: ['menu_items'],
  admin: [],
};
const tableDef = (name) => BACKUP_TABLES.find((t) => t.name === name);

const SYSTEM = ['created', 'updated', 'collectionId', 'collectionName', 'expand'];
const norm = (v) => String(v ?? '').trim().toLowerCase();
const same = (a, b) => {
  const parse = (v) => { if (typeof v === 'string' && /^[[{]/.test(v)) { try { return JSON.parse(v); } catch (_) { return v; } } return v; };
  const x = parse(a); const y = parse(b);
  if ((x == null || x === '') && (y == null || y === '')) return true;
  return typeof x === 'object' || typeof y === 'object' ? JSON.stringify(x) === JSON.stringify(y) : String(x) === String(y);
};

// ---------- CSV ----------
const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// ---------- full backup ----------
export async function collectBackup(pb, tables) {
  const data = {};
  for (const t of BACKUP_TABLES.filter((x) => tables.includes(x.name))) {
    try { data[t.name] = await pb.collection(t.name).getFullList({ $autoCancel: false, requestKey: null }); }
    catch (_) { data[t.name] = null; } // no access: left out of the file
  }
  return data;
}

// Ids and names of the referenced tables (see ROLE_REFS).
export async function collectRefs(pb, tables) {
  const refs = {};
  for (const name of tables || []) {
    try { refs[name] = await pb.collection(name).getFullList({ $autoCancel: false, requestKey: null }); }
    catch (_) { /* no access: links to this table stay as they are */ }
  }
  return refs;
}

export function backupToCsv(data, meta = {}, refs = {}) {
  const rows = [['table', 'id', 'data']];
  rows.push(['#backup', '', JSON.stringify({ version: BACKUP_VERSION, savedAt: new Date().toISOString(), ...meta })]);
  for (const [name, list] of Object.entries(refs)) {
    const t = tableDef(name);
    for (const r of list || []) rows.push([`#ref:${name}`, r.id, JSON.stringify({ id: r.id, key: t?.key ? t.key(r) || '' : '' })]);
  }
  for (const t of BACKUP_TABLES) {
    for (const r of data[t.name] || []) {
      const clean = {};
      for (const [k, v] of Object.entries(r)) if (!SYSTEM.includes(k) && !(t.skip || []).includes(k)) clean[k] = v;
      rows.push([t.name, r.id, JSON.stringify(clean)]);
    }
  }
  return toCsv(rows);
}

export function parseBackupCsv(text) {
  const rows = parseCsv(text);
  const head = (rows[0] || []).map(norm);
  if (head[0] !== 'table' || head[2] !== 'data') throw new Error('This is not a Tripti backup file (columns table,id,data).');
  const out = { meta: {}, tables: {}, refs: {} };
  for (const [table, id, json] of rows.slice(1)) {
    if (table === '#backup') { try { out.meta = JSON.parse(json); } catch (_) { /* ignore */ } continue; }
    if (table.startsWith('#ref:')) {
      try { const r = JSON.parse(json); (out.refs[table.slice(5)] = out.refs[table.slice(5)] || []).push({ id: r.id || id, key: r.key || '' }); } catch (_) { /* ignore */ }
      continue;
    }
    if (!BACKUP_TABLES.some((t) => t.name === table)) continue;
    let rec;
    try { rec = JSON.parse(json); } catch (_) { continue; }
    (out.tables[table] = out.tables[table] || []).push({ ...rec, id: rec.id || id });
  }
  return out;
}

export function countBackup(parsed) {
  return Object.fromEntries(Object.entries(parsed.tables).map(([k, v]) => [k, v.length]));
}

// Restore records into the database.
// mode "merge": create missing, update the rest; nothing is deleted.
// mode "mirror": like merge, and records missing from the file are deleted
//   (only tables marked mirror, i.e. menu, categories, recipes, stock list).
// mode "missing": only create what is missing.
// idMap (table -> { oldId: newId }) can be shared between several restores,
// e.g. a kitchen file and a stock file restored one after the other.
export async function restoreBackup(pb, parsed, { tables, mode = 'merge', onProgress, idMap = {} } = {}) {
  const summary = {};
  const opts = { $autoCancel: false, requestKey: null };
  const mapId = (table, id) => (id ? (idMap[table]?.[id] ?? id) : id);

  // Link old ids to the records now in the database for tables this restore
  // only points to: listed as "#ref:" rows, or in the file but not restored.
  const linkOnly = { ...(parsed.refs || {}) };
  for (const [name, list] of Object.entries(parsed.tables || {})) {
    if (tables && !tables.includes(name)) linkOnly[name] = list.map((r) => ({ id: r.id, key: tableDef(name)?.key ? tableDef(name).key(r) || '' : '' }));
  }
  for (const [name, list] of Object.entries(linkOnly)) {
    let existing;
    try { existing = await pb.collection(name).getFullList(opts); } catch (_) { continue; }
    const t = tableDef(name);
    const ids = new Set(existing.map((r) => r.id));
    const byKey = new Map(existing.filter((r) => t?.key && t.key(r)).map((r) => [norm(t.key(r)), r.id]));
    idMap[name] = idMap[name] || {};
    for (const r of list) {
      if (ids.has(r.id)) idMap[name][r.id] = r.id;
      else if (r.key && byKey.has(norm(r.key))) idMap[name][r.id] = byKey.get(norm(r.key));
    }
  }

  for (const t of BACKUP_TABLES) {
    const list = parsed.tables[t.name];
    if (!list || (tables && !tables.includes(t.name))) continue;
    const s = { created: 0, updated: 0, kept: 0, deleted: 0, failed: 0, errors: [] };
    summary[t.name] = s;
    idMap[t.name] = idMap[t.name] || {};
    let existing;
    try { existing = await pb.collection(t.name).getFullList(opts); }
    catch (err) { s.failed = list.length; s.errors.push(err?.message || 'no access'); continue; }
    const byId = new Map(existing.map((r) => [r.id, r]));
    const keyOf = (r) => (t.key ? norm(t.key(r)) : '');
    const byKey = new Map(existing.filter((r) => keyOf(r)).map((r) => [keyOf(r), r]));
    const touched = new Set();

    // A table that points to itself (locations inside locations): parents first.
    const selfRef = Object.entries(t.refs || {}).find(([, target]) => target === t.name)?.[0];
    let ordered = list;
    if (selfRef) {
      const inFile = new Set(list.map((r) => r.id));
      const placed = new Set();
      ordered = [];
      let rest = list;
      while (rest.length) {
        const ready = rest.filter((r) => !r[selfRef] || !inFile.has(r[selfRef]) || placed.has(r[selfRef]));
        if (!ready.length) { ordered.push(...rest); break; } // a loop: keep file order
        ready.forEach((r) => { ordered.push(r); placed.add(r.id); });
        rest = rest.filter((r) => !placed.has(r.id));
      }
    }

    for (const src of ordered) {
      const rec = { ...src };
      for (const f of t.skip || []) delete rec[f];
      for (const f of SYSTEM) delete rec[f];
      for (const [f, target] of Object.entries(t.refs || {})) {
        if (!rec[f]) continue;
        rec[f] = Array.isArray(rec[f]) ? rec[f].map((x) => mapId(target, x)) : mapId(target, rec[f]);
      }
      for (const [f, target] of Object.entries(t.jsonRefs || {})) {
        let v = rec[f];
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = []; } }
        if (Array.isArray(v)) rec[f] = v.map((x) => (x && x.stockItem ? { ...x, stockItem: mapId(target, x.stockItem) } : x));
      }
      const match = byId.get(src.id) || (keyOf(rec) ? byKey.get(keyOf(rec)) : null);
      try {
        if (match) {
          idMap[t.name][src.id] = match.id;
          touched.add(match.id);
          if (mode === 'missing') { s.kept += 1; continue; }
          const { id, ...body } = rec; void id;
          // Nothing changed: leave it alone (also avoids locked records,
          // such as a request the stock manager is already working on).
          if (Object.entries(body).every(([k, v]) => same(v, match[k]))) { s.kept += 1; continue; }
          await pb.collection(t.name).update(match.id, body, opts);
          s.updated += 1;
        } else {
          const created = await pb.collection(t.name).create(rec, opts);
          idMap[t.name][src.id] = created.id;
          touched.add(created.id);
          s.created += 1;
        }
      } catch (err) {
        s.failed += 1;
        if (s.errors.length < 5) s.errors.push(`${t.key ? t.key(src) || src.id : src.id}: ${err?.message || err}`);
      }
      if (onProgress) onProgress(t.name, s);
    }

    if (mode === 'mirror' && t.mirror) {
      for (const r of existing) {
        if (touched.has(r.id)) continue;
        try { await pb.collection(t.name).delete(r.id, opts); s.deleted += 1; }
        catch (err) { if (s.errors.length < 5) s.errors.push(`delete ${t.key ? t.key(r) : r.id}: ${err?.message || err}`); }
      }
    }
  }
  return summary;
}

// ---------- recipes as an easy-to-edit CSV ----------
// One row per dish. Ingredients: "Basmati rice 600 g; Chicken 800 g".
export const RECIPE_CSV_HEADER = ['Dish', 'Category', 'Portions', 'Ingredients', 'Method', 'Notes'];

export function recipesToCsv(recipes, menuById) {
  const rows = [RECIPE_CSV_HEADER];
  for (const r of recipes) {
    const dish = menuById[r.menuItem];
    if (!dish) continue;
    let ings = r.ingredients;
    if (typeof ings === 'string') { try { ings = JSON.parse(ings); } catch (_) { ings = []; } }
    rows.push([
      dish.nameEN || dish.name, dish.category || '', r.yieldPortions || 1,
      (ings || []).map((i) => `${i.name} ${i.qty} ${i.unit || ''}`.trim()).join('; '),
      r.steps || '', r.notes || '',
    ]);
  }
  return toCsv(rows);
}

// "Basmati rice 600 g" -> { name, qty, unit }
export function parseIngredient(text) {
  const m = String(text || '').trim().match(/^(.*?)[\s:]+(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜß.]*)$/);
  if (!m) return null;
  return { name: m[1].trim(), qty: Number(m[2].replace(',', '.')), unit: (m[3] || '').toLowerCase().replace(/\.$/, '') };
}

// Returns { rows: [{ menuItem, dishName, data }], errors: [] }.
export function parseRecipesCsv(text, menu, stock) {
  const rows = parseCsv(text);
  const head = (rows[0] || []).map(norm);
  const col = (n) => head.indexOf(n);
  const ci = { dish: col('dish'), portions: col('portions'), ing: col('ingredients'), method: col('method'), notes: col('notes') };
  if (ci.dish < 0 || ci.ing < 0) throw new Error('The recipe file needs the columns Dish and Ingredients.');
  const dishByName = new Map();
  for (const m of menu) for (const n of [m.nameEN, m.name, m.nameDE]) if (n) dishByName.set(norm(n), m);
  const stockByName = new Map(stock.map((s) => [norm(s.name), s]));
  const out = []; const errors = [];
  rows.slice(1).forEach((r, i) => {
    const name = r[ci.dish];
    const dish = dishByName.get(norm(name));
    if (!dish) { errors.push(`Row ${i + 2}: dish "${name}" is not on the menu`); return; }
    const ingredients = [];
    for (const part of String(r[ci.ing] || '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
      const p = parseIngredient(part);
      if (!p || !(p.qty > 0)) { errors.push(`Row ${i + 2}: cannot read "${part}" (write e.g. "Rice 600 g")`); continue; }
      const st = stockByName.get(norm(p.name));
      ingredients.push({ name: st ? st.name : p.name, stockItem: st ? st.id : '', qty: p.qty, unit: p.unit || st?.unit || 'pcs' });
    }
    if (!ingredients.length) { errors.push(`Row ${i + 2}: "${name}" has no ingredients`); return; }
    out.push({
      menuItem: dish.id, dishName: dish.nameEN || dish.name,
      data: {
        menuItem: dish.id, yieldPortions: Math.max(1, Number(r[ci.portions]) || 1), ingredients,
        steps: ci.method >= 0 ? r[ci.method] || '' : '', notes: ci.notes >= 0 ? r[ci.notes] || '' : '',
      },
    });
  });
  return { rows: out, errors };
}
