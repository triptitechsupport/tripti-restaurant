// FIFO + expiry helpers for stock lots.

export const EXPIRY_WARN_DAYS = 7;

/** Days until expiry (negative if already expired). Null if no expiry set. */
export function daysUntilExpiry(expiry, now = new Date()) {
  if (!expiry) return null;
  const t = new Date(expiry).getTime();
  if (!Number.isFinite(t)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const expDay = new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();
  return Math.round((expDay - today) / 86400000);
}

/** Classify a lot's expiry state. */
export function expiryState(expiry, now = new Date()) {
  const d = daysUntilExpiry(expiry, now);
  if (d == null) return 'none';
  if (d < 0) return 'expired';
  if (d <= EXPIRY_WARN_DAYS) return 'warning';
  return 'ok';
}

/**
 * Select active lots for an item in FIFO order (earliest-expiring first).
 * Expired lots are excluded unless `allowExpired` is true.
 * Returns lots sorted by expiry asc (null-expiry last), only those with
 * remainingQty > 0 and status active/overridden.
 */
export function fifoLots(lots, { allowExpired = false, now = new Date() } = {}) {
  const usable = (lots || []).filter((l) => {
    if (!l) return false;
    const remaining = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
    if (remaining <= 0) return false;
    const st = (l.status || 'active').toString();
    if (st !== 'active' && st !== 'overridden') return false;
    if (!allowExpired && expiryState(l.expiry, now) === 'expired') return false;
    return true;
  });
  return usable.sort((a, b) => {
    const ae = a.expiry ? new Date(a.expiry).getTime() : Infinity;
    const be = b.expiry ? new Date(b.expiry).getTime() : Infinity;
    return ae - be;
  });
}

/**
 * Allocate `needed` qty across FIFO lots. Returns { allocations, short, blocked }.
 * allocations: [{ lot, qty }]; short: qty that couldn't be filled; blocked:
 * qty blocked by expired lots (only when allowExpired=false).
 */
export function allocateFifo(lots, needed, { allowExpired = false, now = new Date() } = {}) {
  const usable = fifoLots(lots, { allowExpired, now });
  const allocations = [];
  let remaining = Number(needed) || 0;
  for (const lot of usable) {
    if (remaining <= 0) break;
    const avail = Number(lot.remainingQty != null ? lot.remainingQty : lot.quantity) || 0;
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    allocations.push({ lot, qty: take });
    remaining -= take;
  }
  // Blocked = expired lots with stock that were skipped.
  let blocked = 0;
  if (!allowExpired) {
    (lots || []).forEach((l) => {
      const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
      if (rem > 0 && expiryState(l.expiry, now) === 'expired') {
        const st = (l.status || 'active').toString();
        if (st === 'active' || st === 'overridden') blocked += rem;
      }
    });
  }
  return { allocations, short: Math.max(0, remaining), blocked };
}

/** Sum remaining across all lots for an item. */
export function totalRemaining(lots) {
  return (lots || []).reduce((s, l) => {
    const r = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
    return s + Math.max(0, r);
  }, 0);
}
