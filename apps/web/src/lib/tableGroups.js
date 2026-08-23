// Helpers for the Combine Tables feature (Linked Orders + Shared Order).
//
// The normalized `table_group_members` collection is the source of truth for
// which physical tables belong to a combination. `waiter_orders.tableNumber`
// is kept only as a backward-compatible primary/display value for single
// table and Linked Orders; for a Shared Order the full membership is read
// from table_group_members via the parent order's `tableGroup` relation.

// Extract a numeric table number from a table record's name (e.g. "5",
// "Table 7", "T3"). Returns NaN when no number is found.
export function parseTableNum(value) {
  if (value === null || value === undefined) return NaN;
  const m = String(value).match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

// Build a map: tableGroupId -> { id, mode, status, label, tables: [names] }
// from table_groups + table_group_members records. `tables` are sorted by
// numeric table number ascending so display order is stable (4 + 5 + 6).
export function buildGroupMap(groups, members) {
  const map = new Map();
  (groups || []).forEach((g) => {
    map.set(g.id, {
      id: g.id,
      mode: g.mode || 'linked',
      status: g.status || '',
      label: g.label || '',
      tables: [],
    });
  });
  (members || []).forEach((m) => {
    const gid = m.tableGroup;
    if (!gid) return;
    if (!map.has(gid)) {
      map.set(gid, { id: gid, mode: 'linked', status: '', label: '', tables: [] });
    }
    if (m.tableNumber) map.get(gid).tables.push(m.tableNumber);
  });
  map.forEach((g) => {
    g.tables.sort((a, b) => (parseTableNum(a) || 0) - (parseTableNum(b) || 0));
  });
  return map;
}

// Human-readable table label for a parent order (waiter_orders).
// For a Shared Order (tableGroup set + group mode 'shared' + 2+ member
// tables) returns "Tables 4 + 5 + 6". Otherwise returns the single
// tableNumber (single-table order or Linked Orders — each linked parent
// keeps its own tableNumber).
export function tableDisplayForParent(parent, groupMap) {
  if (!parent) return '';
  const gid = parent.tableGroup;
  if (gid && groupMap && groupMap.has(gid)) {
    const g = groupMap.get(gid);
    if (g.mode === 'shared' && g.tables && g.tables.length > 1) {
      return `Tables ${g.tables.join(' + ')}`;
    }
  }
  return parent.tableNumber || '';
}

// Resolve the table display for a kitchen_orders KOT, using its expanded
// parentOrder when available. Falls back to the KOT's own copied tableNumber
// for legacy unparented KOTs.
export function tableDisplayForKot(kot, groupMap) {
  const parent = (kot && kot.expand && kot.expand.parentOrder) || null;
  const label = tableDisplayForParent(parent, groupMap);
  if (label) return label;
  return (kot && kot.tableNumber) || '';
}

// Whether a parent order belongs to a Shared Order combination.
export function isSharedParent(parent, groupMap) {
  if (!parent || !parent.tableGroup) return false;
  const g = groupMap && groupMap.get(parent.tableGroup);
  return !!(g && g.mode === 'shared' && g.tables && g.tables.length > 1);
}

// Resolve the table_groups entry a parent order belongs to (or null).
export function groupForParent(parent, groupMap) {
  if (!parent || !parent.tableGroup) return null;
  return (groupMap && groupMap.get(parent.tableGroup)) || null;
}

// Whether a parent order belongs to any multi-table combination (Linked or
// Shared) with 2+ member tables. Used to decide whether to show combined-
// table information in the Admin KOTs view.
export function isCombinedParent(parent, groupMap) {
  const g = groupForParent(parent, groupMap);
  return !!(g && g.tables && g.tables.length > 1);
}

// Human-readable combination label for a parent order, e.g. "5 + 6 + 7".
// Returns '' when the parent is not part of a multi-table combination.
export function combinationLabel(parent, groupMap) {
  const g = groupForParent(parent, groupMap);
  if (!g || !g.tables || g.tables.length < 2) return '';
  return g.tables.join(' + ');
}

// Full display label for a parent order in the Admin KOTs view.
// - Shared Order (2+ tables): "Tables 4 + 5 + 6"
// - Linked Orders (2+ tables): the parent's own tableNumber (each linked
//   table keeps its own independent Order/KOT); the full combination is
//   exposed separately via combinationLabel() so the Admin view can show
//   "Linked: 4 + 5 + 6" alongside the primary table.
// - Single table: the parent's tableNumber.
export function adminTableLabel(parent, groupMap) {
  if (!parent) return '';
  if (isSharedParent(parent, groupMap)) {
    return tableDisplayForParent(parent, groupMap);
  }
  return parent.tableNumber || '';
}
