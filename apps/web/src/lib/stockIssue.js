import { allocateFifo } from '@/lib/stockFifo.js';

// Take stock out of the store for the kitchen: oldest-expiry lots first,
// with an issue record and an audit adjustment for every lot touched.
// Items kept without lots just have their quantity lowered.
// Returns the quantity actually issued (may be less than asked).
export async function issueFromStock(pb, { item, lots, qty, staffId, staffName, role, byName, byId, reason }) {
  const wanted = Number(qty) || 0;
  if (!item || wanted <= 0) return 0;
  const opts = (key) => ({ $autoCancel: false, requestKey: key });
  const itemLots = (lots || []).filter((l) => l.stockItem === item.id);
  let total = Number(item.quantity) || 0;
  let issued = 0;

  const adjust = async (delta, note, key) => {
    const next = Math.max(0, total - delta);
    await pb.collection('stock_items').update(item.id, { quantity: next }, opts(`req-item-${key}`));
    await pb.collection('stock_adjustments').create({
      stockItem: item.id, itemName: item.name, adjustmentType: 'correction', delta: -delta,
      previousQty: total, newQty: next, reason, adjustedBy: byName, adjustedById: byId, adjustedByRole: role, notes: note,
    }, opts(`req-adj-${key}`));
    total = next;
  };

  const withStock = itemLots.filter((l) => (Number(l.remainingQty ?? l.quantity) || 0) > 0);
  if (withStock.length) {
    const { allocations } = allocateFifo(itemLots, wanted);
    for (const a of allocations) {
      const rem = Number(a.lot.remainingQty ?? a.lot.quantity) || 0;
      await pb.collection('stock_lots').update(a.lot.id, { remainingQty: Math.max(0, rem - a.qty) }, opts(`req-lot-${a.lot.id}`));
      await pb.collection('stock_issues').create({
        staffId, staffName, stockItem: item.id, lot: a.lot.id, quantity: a.qty, issueDate: new Date().toISOString(),
        location: a.lot.location || null, issuedByRole: role, notes: reason,
      }, opts(`req-issue-${a.lot.id}`));
      await adjust(a.qty, `Lot ${a.lot.id}`, `${item.id}-${a.lot.id}`);
      issued += a.qty;
    }
    return issued;
  }

  const take = Math.min(wanted, total);
  if (take > 0) {
    await pb.collection('stock_issues').create({
      staffId, staffName, stockItem: item.id, quantity: take, issueDate: new Date().toISOString(), issuedByRole: role, notes: reason,
    }, opts(`req-issue-${item.id}`));
    await adjust(take, '', item.id);
    issued = take;
  }
  return issued;
}
