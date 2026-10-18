// Helpers for the Combine Tables feature (Linked Orders + Shared Order).
//
// The normalized `table_group_members` collection is the source of truth for
// which physical tables belong to a combination. `waiter_orders.tableNumber`
// is kept only as a backward-compatible primary/display value for single
// table and Linked Orders; for a Shared Order the full membership is read
// from table_group_members via the parent order's `tableGroup` relation.

// Extract a numeric table number from a table record's name (e.g. "5",
// "Table 7", "T3"). Returns NaN when no number is found.
// Relation fields may arrive as an id string, a one-element array, or an
// expanded record. Always reduce to the id before map lookups.
export function relationId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return relationId(value[0]);
  if (typeof value === 'object' && value.id) return String(value.id);
  return '';
}

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
    const gid = relationId(m.tableGroup);
    if (!gid) return;
    if (!map.has(gid)) {
      map.set(gid, { id: gid, mode: 'linked', status: '', label: '', tables: [] });
    }
    if (m.tableNumber) map.get(gid).tables.push(m.tableNumber);
  });
  map.forEach((g) => {
    const seen = new Set();
    g.tables = g.tables.filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
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
  const gid = relationId(parent.tableGroup);
  if (gid && groupMap && groupMap.has(gid)) {
    const g = groupMap.get(gid);
    if (g.mode === 'shared' && g.tables && g.tables.length > 1) {
      return `Tables ${g.tables.join(' + ')}`;
    }
  }
  return parent.tableNumber || '';
}

// Label used on the KDS screen and kitchen print. Shared AND linked
// combinations show every member table. A persisted tableLabel wins so a
// missed group lookup cannot collapse the ticket back to one table.
export function kdsTableLabel(kot, groupMap) {
  if (!kot) return '';
  // A persisted combined label wins. A single-table label must NOT short-circuit
  // group lookup — older tickets stored only the primary table and would hide
  // the rest of a Shared/Linked combination on the KDS screen and kitchen print.
  const persisted = kot.tableLabel && String(kot.tableLabel).trim();
  if (persisted && String(persisted).includes('+')) return String(persisted).trim();
  if (kot.tableDisplay && String(kot.tableDisplay).includes('+')) return String(kot.tableDisplay).trim();
  const parent = (kot.expand && kot.expand.parentOrder) || null;
  const expandedGroup = parent && parent.expand && parent.expand.tableGroup;
  if (expandedGroup && expandedGroup.status !== 'closed' && expandedGroup.label && String(expandedGroup.label).includes('+')) {
    return String(expandedGroup.label).trim();
  }
  const gid = relationId(parent && parent.tableGroup) || relationId(expandedGroup);
  if (gid && groupMap && groupMap.has(gid)) {
    const g = groupMap.get(gid);
    if (g.status !== 'closed' && g.tables && g.tables.length > 1) {
      return `Tables ${g.tables.join(' + ')}`;
    }
  }
  const tn = (parent && parent.tableNumber) || kot.tableNumber || '';
  if (tn && groupMap) {
    for (const g of groupMap.values()) {
      if (g.status !== 'active') continue;
      if (g.tables && g.tables.length > 1 && g.tables.indexOf(tn) !== -1) {
        return `Tables ${g.tables.join(' + ')}`;
      }
    }
  }
  if (persisted) return String(persisted).trim();
  return tn;
}

// Resolve the table display for a kitchen_orders KOT, using its expanded
// parentOrder when available. Falls back to the KOT's own copied tableNumber
// for legacy unparented KOTs.
export function tableDisplayForKot(kot, groupMap) {
  return kdsTableLabel(kot, groupMap);
}

// Whether a parent order belongs to a Shared Order combination.
export function isSharedParent(parent, groupMap) {
  if (!parent || !relationId(parent.tableGroup)) return false;
  const g = groupMap && groupMap.get(relationId(parent.tableGroup));
  return !!(g && g.mode === 'shared' && g.tables && g.tables.length > 1);
}

// Resolve the table_groups entry a parent order belongs to (or null).
export function groupForParent(parent, groupMap) {
  const gid = relationId(parent && parent.tableGroup);
  if (!gid) return null;
  return (groupMap && groupMap.get(gid)) || null;
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
