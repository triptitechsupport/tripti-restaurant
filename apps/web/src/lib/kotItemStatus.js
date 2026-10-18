// Shared per-item preparation/pickup status helpers for KOTs (kitchen_orders).
//
// A KOT's `itemStatuses` JSON field maps an item's index in its `items`
// array (as a string) to a status string. This is the SINGLE source of truth
// for item-level preparation across KDS, Waiter, and Admin — every interface
// reads and writes the same field so changes persist across devices and
// refreshes via the existing kitchen_orders realtime stream.
//
// Statuses:
//   "pending"   — in progress / not yet prepared (absent key = pending)
//   "prepared"  — kitchen marked this individual item ready for pickup
//   "pickedup"  — waiter picked up this individual item
//
// The existing whole-ticket status (pending/preparing/ready/completed/
// cancelled) is preserved and remains the lifecycle source of truth.
// Item-level tracking is additive: it lets the kitchen mark a single item
// prepared and the waiter pick up that specific item while other items in
// the same KOT remain in progress. Legacy KOTs without the field behave
// exactly as before (all items inherit the ticket status).

export const ITEM_STATUS = {
  PENDING: 'pending',
  PREPARED: 'prepared',
  PICKEDUP: 'pickedup',
};

// Return the raw itemStatuses object ({} when absent/invalid). Never throws.
export function getItemStatuses(kot) {
  const raw = kot && kot.itemStatuses;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

// Status of a single item by its index in the items array. Defaults to
// "pending" when untracked (legacy orders and not-yet-marked items).
export function getItemStatus(kot, index) {
  const statuses = getItemStatuses(kot);
  const s = statuses[String(index)];
  if (s === ITEM_STATUS.PREPARED || s === ITEM_STATUS.PICKEDUP) return s;
  return ITEM_STATUS.PENDING;
}

// Counts per status for a KOT's items.
export function countItemStatuses(kot) {
  const items = (kot && kot.items) || [];
  const statuses = getItemStatuses(kot);
  let prepared = 0;
  let pickedup = 0;
  let pending = 0;
  items.forEach((_, i) => {
    const s = statuses[String(i)];
    if (s === ITEM_STATUS.PREPARED) prepared += 1;
    else if (s === ITEM_STATUS.PICKEDUP) pickedup += 1;
    else pending += 1;
  });
  return { total: items.length, prepared, pickedup, pending };
}

// True when every item in the KOT has been picked up by the waiter. Used to
// auto-complete the ticket once the last prepared item is picked up.
export function allItemsPickedUp(kot) {
  const items = (kot && kot.items) || [];
  if (items.length === 0) return false;
  const statuses = getItemStatuses(kot);
  return items.every((_, i) => statuses[String(i)] === ITEM_STATUS.PICKEDUP);
}

// True when at least one item is marked prepared (ready for the waiter to
// pick up) but not yet picked up.
export function hasPreparedReady(kot) {
  const statuses = getItemStatuses(kot);
  return Object.values(statuses).some((s) => s === ITEM_STATUS.PREPARED);
}

// Build the next itemStatuses object after setting one item's status.
// Returns a NEW plain object (immutable) safe to persist. Preserves every
// existing entry so concurrent per-item changes from other devices are not
// clobbered (the realtime merge keeps the rest of the object current).
export function withItemStatus(kot, index, status) {
  const next = { ...getItemStatuses(kot) };
  const key = String(index);
  if (status === ITEM_STATUS.PENDING) {
    delete next[key];
  } else {
    next[key] = status;
  }
  return next;
}

// How many individually selectable units a stored line represents.
// Legacy lines may carry quantity > 1 (same dish merged). New orders store
// quantity 1 per line so each order keeps its own identity.
export function unitCount(it) {
  const n = Math.floor(Number(it && it.quantity) || 0);
  return n > 0 ? n : 1;
}

// Virtual units for display. A quantity-N line becomes N rows that share
// the line's current status until an action splits them in storage.
export function listUnits(kot) {
  const items = (kot && kot.items) || [];
  const out = [];
  items.forEach((it, itemIndex) => {
    const n = unitCount(it);
    for (let unitIndex = 0; unitIndex < n; unitIndex += 1) {
      out.push({
        item: it,
        itemIndex,
        unitIndex,
        status: getItemStatus(kot, itemIndex),
        key: `${kot && kot.id ? kot.id : 'kot'}-${itemIndex}-${unitIndex}`,
      });
    }
  });
  return out;
}

function copyStatus(statuses, fromIndex) {
  const st = statuses[String(fromIndex)];
  if (st === ITEM_STATUS.PREPARED || st === ITEM_STATUS.PICKEDUP) {
    return st;
  }
  return '';
}

// Split every line into quantity-1 lines (totals unchanged) and optionally
// patch one unit. Item statuses move with their original line so existing
// prepared/picked-up marks are not attached to the wrong dish.
export function splitKotUnits(kot, itemIndex, unitIndex, patchUnit) {
  const items = (kot && kot.items) || [];
  const statuses = getItemStatuses(kot);
  const nextItems = [];
  const nextStatuses = {};
  items.forEach((it, idx) => {
    const n = unitCount(it);
    const st = copyStatus(statuses, idx);
    for (let u = 0; u < n; u += 1) {
      const newIdx = nextItems.length;
      let line = { ...it, quantity: 1 };
      if (patchUnit && idx === itemIndex && u === unitIndex) {
        line = patchUnit(line) || line;
        line.quantity = 1;
      }
      nextItems.push(line);
      if (st) nextStatuses[String(newIdx)] = st;
    }
  });
  return { items: nextItems, itemStatuses: nextStatuses };
}

// Flat index of a unit after a quantity-1 split, used to set that unit's
// preparation/pickup status without changing its siblings.
export function flatUnitIndex(kot, itemIndex, unitIndex) {
  const items = (kot && kot.items) || [];
  let flat = 0;
  for (let i = 0; i < itemIndex; i += 1) flat += unitCount(items[i]);
  return flat + (unitIndex || 0);
}

export function splitForUnitStatus(kot, itemIndex, unitIndex, status) {
  const split = splitKotUnits(kot);
  const flat = flatUnitIndex(kot, itemIndex, unitIndex);
  const next = { ...split.itemStatuses };
  if (!status || status === ITEM_STATUS.PENDING) delete next[String(flat)];
  else next[String(flat)] = status;
  return { items: split.items, itemStatuses: next };
}

// Payment confirm: every unit becomes its own line. Selected units are
// cleared; unselected units stay unpaid. Quantity and money are preserved.
export function splitForPayment(kot, selectedKeys) {
  const keys = selectedKeys || new Set();
  const items = (kot && kot.items) || [];
  const statuses = getItemStatuses(kot);
  const nextItems = [];
  const nextStatuses = {};
  items.forEach((it, idx) => {
    const n = unitCount(it);
    const st = copyStatus(statuses, idx);
    for (let u = 0; u < n; u += 1) {
      const newIdx = nextItems.length;
      const picked = it.cleared === true || keys.has(`${idx}:${u}`);
      nextItems.push({ ...it, quantity: 1, cleared: !!picked });
      if (st) nextStatuses[String(newIdx)] = st;
    }
  });
  return { items: nextItems, itemStatuses: nextStatuses };
}
