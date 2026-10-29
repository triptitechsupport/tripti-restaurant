/// <reference path="../pb_data/types.d.ts" />
// Restaurant rules for ending an order (checked here so no screen can skip them):
// - Nobody can ask for the bill, ask to end, end, close or free an order
//   while a ticket is still in the kitchen or not served yet (pending,
//   preparing or ready). Every dish has to be served first.
// - A waiter only asks the cashier to end the order (endRequestedAt); the
//   cashier or an admin confirms it by ending the order (endedAt).
// - A table is freed only after the order was ended.
// - Once the kitchen has started a ticket, only an admin or the kitchen
//   manager can cancel it.
// Only the cashier or an admin may still end or free an order older than
// 12 hours, so leftovers from an earlier day can be cleared. Waiters never
// skip the rules. (Helpers live inside each handler: PocketBase runs
// each handler in its own VM.)
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const auth = e.auth;
  const name = auth ? auth.collection().name : '';
  const cashier = name === 'admin_users' || (name === 'waiter_users' && auth.getString('role') === 'cashier');
  const rec = e.record;
  const old = rec.original();
  const created = new Date(String(old.getString('created')).replace(' ', 'T')).getTime();
  const stale = cashier && Number.isFinite(created) && Date.now() - created > 12 * 60 * 60 * 1000;
  const set = (field) => !!rec.getString(field) && !old.getString(field);
  const ending = set('endedAt');
  const asking = set('endRequestedAt');
  const billing = !!rec.getString('billRequestedAt') && rec.getString('billRequestedAt') !== old.getString('billRequestedAt');
  const closing = rec.getString('orderStatus') === 'closed' && old.getString('orderStatus') !== 'closed';
  const freeing = rec.getBool('freed') && !old.getBool('freed');
  const reopening = !rec.getString('endedAt') && !!old.getString('endedAt');

  if (!stale) {
    if (ending || asking || billing || closing || freeing) {
      const open = e.app.findRecordsByFilter('kitchen_orders',
        'parentOrder = {:id} && status != "completed" && status != "cancelled"', '', 0, 0, { id: rec.id });
      if (open.length > 0) {
        const what = billing && !(ending || asking || closing || freeing) ? 'The bill cannot be requested yet' : 'The order cannot be ended yet';
        throw new BadRequestError(`${what}: ${open.length} ticket${open.length > 1 ? 's are' : ' is'} still in the kitchen or not served. Serve all dishes first.`);
      }
    }
    if (ending && !cashier) throw new BadRequestError('Only the cashier can end an order. Ask the cashier to end it.');
    if (reopening && !cashier) throw new BadRequestError('Only the cashier can reopen an ended order.');
    if ((closing || freeing) && !rec.getString('endedAt')) throw new BadRequestError('End the order before freeing the table.');
  }
  e.next();
}, 'waiter_orders');

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const old = e.record.original();
  const before = old.getString('status');
  if (e.record.getString('status') === 'cancelled' && before !== 'cancelled' && before !== 'pending') {
    const auth = e.auth;
    const name = auth ? auth.collection().name : '';
    const allowed = name === 'admin_users' || (name === 'kds_users' && auth.getString('role') === 'kitchen_manager');
    if (!allowed) throw new BadRequestError('The kitchen has already started this ticket. Only the kitchen manager or an admin can cancel it now.');
  }
  e.next();
}, 'kitchen_orders');
