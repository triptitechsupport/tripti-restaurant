/// <reference path="../pb_data/types.d.ts" />
// Only the cashier or an admin takes payments. The waiter screen still writes
// an order's totals after sending a ticket, so for waiters the server works
// out the payment figures from the tickets instead of trusting them, and a
// waiter cannot close or free a table that still owes money.
// (Helpers live inside the handler: PocketBase runs each handler in its own VM.)
onRecordUpdateRequest((e) => {
  const auth = e.auth;
  const name = auth ? auth.collection().name : '';
  const trusted = e.hasSuperuserAuth() || name === 'admin_users' ||
    (name === 'waiter_users' && auth.getString('role') === 'cashier');
  if (!trusted) {
    let total = 0;
    let paid = 0;
    e.app.findRecordsByFilter('kitchen_orders', 'parentOrder = {:id} && status != "cancelled"', '', 0, 0, { id: e.record.id })
      .forEach((kot) => {
        let items = [];
        try { items = JSON.parse(kot.getString('items') || '[]'); } catch (_) { items = []; }
        items.forEach((item) => {
          const amount = Math.round(Number(item.price || 0) * 100) * (Number(item.quantity) || 0);
          total += amount;
          if (item.cleared === true) paid += amount;
        });
      });
    e.record.set('totalAmount', total / 100);
    e.record.set('paidAmount', paid / 100);
    e.record.set('outstandingAmount', Math.max(0, total - paid) / 100);
    e.record.set('paymentStatus', paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
    const original = e.record.original();
    const freeing = e.record.getBool('freed') && !original.getBool('freed');
    const closing = e.record.getString('orderStatus') === 'closed' && original.getString('orderStatus') !== 'closed';
    if ((freeing || closing) && total > paid)
      throw new BadRequestError('This table still has an open bill. The cashier must take the payment first.');
  }
  e.next();
}, 'waiter_orders');
