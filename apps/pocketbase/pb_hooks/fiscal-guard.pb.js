// Reserve the receipt and freeze its source order in ONE database transaction.
// Only the authenticated backend may call this endpoint.
routerAdd('POST', '/api/fiscal/prepare', (e) => {
  const body = e.requestInfo().body;
  let result;
  $app.runInTransaction((app) => {
    const existing = app.findRecordsByFilter('fiskaly_transactions', 'businessReceiptKey = {:key}', '', 1, 0, {key: body.transaction.businessReceiptKey});
    if (existing.length) { result = existing[0]; return; }
    const order = app.findRecordById('waiter_orders', body.transaction.order);
    if (body.transaction.settlement && body.transaction.receiptType !== 'CANCELLATION') {
      const settlement = app.findRecordById('payment_settlements', body.transaction.settlement);
      if (settlement.getString('order') !== order.id || order.getBool('fiscalLocked')) throw new BadRequestError('Invalid settlement or whole-order receipt already exists.');
      if (body.transaction.businessReceiptKey !== `SETTLEMENT:${settlement.id}`) throw new BadRequestError('Invalid settlement receipt key.');
    } else if (body.transaction.receiptType !== 'CANCELLATION') {
      if (app.findRecordsByFilter('payment_settlements', 'order = {:id}', '', 1, 0, {id: order.id}).length)
        throw new BadRequestError('Generate bills per settlement for this order.');
      if (order.getBool('fiscalLocked')) throw new BadRequestError('This order is already finalized.');
      const kots = app.findRecordsByFilter('kitchen_orders', 'parentOrder = {:id}', 'id', 0, 0, {id: order.id});
      const source = kots.map(k => ({id: k.id, status: k.getString('status'), items: JSON.parse(k.getString('items') || '[]')}));
      // Request maps and JS object literals may enumerate keys differently.
      const canonical = value => {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === 'object') {
          const result = {}; Object.keys(value).sort().forEach(key => { result[key] = canonical(value[key]); }); return result;
        }
        return value;
      };
      if (JSON.stringify(canonical(source)) !== JSON.stringify(canonical(body.sourceKots))) throw new BadRequestError('Order items changed. Refresh and generate again.');
      if (body.transaction.receiptType === 'NORMAL') {
        order.set('fiscalLocked', true);
        app.save(order);
      }
    }
    result = new Record(app.findCollectionByNameOrId('fiskaly_transactions'));
    result.load(body.transaction);
    app.save(result);
  });
  return e.json(200, result);
}, $apis.requireSuperuserAuth());

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth() && e.record.getBool('fiscalLocked') !== e.record.original().getBool('fiscalLocked'))
    throw new ForbiddenError('Fiscal finalization is managed by the billing server.');
  e.next();
}, 'waiter_orders');

onRecordDelete((e) => {
  if (e.record.getBool('fiscalLocked')) throw new BadRequestError('A fiscalized order must be retained.');
  e.next();
}, 'waiter_orders');

onRecordCreate((e) => {
  e.app.runInTransaction(app => {
  e.app = app;
  const parent = e.record.getString('parentOrder');
  if (parent && e.app.findRecordById('waiter_orders', parent).getBool('fiscalLocked'))
    throw new BadRequestError('This order has a final receipt. Start a new order for additional items.');
  const items = JSON.parse(e.record.getString('items') || '[]');
  items.forEach(item => {
    if (!item.id) return;
    try { item.vat_Rate = e.app.findRecordById('menu_items', item.id).getString('vat_Rate'); } catch (_) {}
  });
  e.record.set('items', items);
  e.next();
  });
}, 'kitchen_orders');

onRecordUpdate((e) => {
  e.app.runInTransaction(app => {
  e.app = app;
  const old = e.record.original();
  const parentIds = [old.getString('parentOrder'), e.record.getString('parentOrder')];
  let locked = false;
  parentIds.forEach(id => { if (id && e.app.findRecordById('waiter_orders', id).getBool('fiscalLocked')) locked = true; });
  if (locked) {
    const billable = record => JSON.parse(record.getString('items') || '[]').map(item => {
      // Settlement metadata may change after finalization; receipt content may not.
      const copy = Object.assign({}, item); delete copy.cleared; delete copy.paidAt; delete copy.paymentMode;
      return copy;
    });
    if (parentIds[0] !== parentIds[1] || JSON.stringify(billable(old)) !== JSON.stringify(billable(e.record)) ||
        (old.getString('status') === 'cancelled') !== (e.record.getString('status') === 'cancelled'))
      throw new BadRequestError('Receipt already finalized. Use a fiscal cancellation instead of changing billable items.');
  }
  e.next();
  });
}, 'kitchen_orders');

onRecordDelete((e) => {
  e.app.runInTransaction(app => {
  e.app = app;
  const parent = e.record.getString('parentOrder');
  if (parent && e.app.findRecordById('waiter_orders', parent).getBool('fiscalLocked'))
    throw new BadRequestError('Items belonging to a fiscal receipt must be retained.');
  e.next();
  });
}, 'kitchen_orders');
