routerAdd('POST', '/api/payment-settlements/confirm', e => {
  if (!e.auth || !['waiter_users', 'admin_users'].includes(e.auth.collection().name)) throw new ForbiddenError('Staff sign-in required.');
  const body = e.requestInfo().body;
  if (!/^[0-9a-f-]{36}$/i.test(body.requestKey || '') || !Array.isArray(body.selections) || !body.selections.length)
    throw new BadRequestError('A payment reference and selected items are required.');
  let result;
  $app.runInTransaction(app => {
    const canonical = value => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') { const out = {}; Object.keys(value).sort().forEach(key => { out[key] = canonical(value[key]); }); return out; }
      return value;
    };
    const existing = app.findRecordsByFilter('payment_settlements', 'requestKey = {:key}', '', 1, 0, {key: body.requestKey});
    if (existing.length) {
      if (existing[0].getString('actor') !== e.auth.id || existing[0].getString('order') !== body.order)
        throw new BadRequestError('Payment reference already used.');
      result = existing[0]; return;
    }
    const order = app.findRecordById('waiter_orders', body.order);
    if (!app.canAccessRecord(order, e.requestInfo(), order.collection().updateRule)) throw new ForbiddenError('Cannot settle this order.');
    // Legacy full-order receipts remain authoritative. Do not allocate their items again.
    if (order.getBool('fiscalLocked')) throw new BadRequestError('This order already has a whole-order fiscal receipt. Use the legacy payment workflow.');
    const selected = [], seen = {};
    let cents = 0;
    body.selections.forEach(selection => {
      if (seen[selection.kot]) throw new BadRequestError('Duplicate KOT selection.');
      seen[selection.kot] = true;
      const kot = app.findRecordById('kitchen_orders', selection.kot);
      if (kot.getString('parentOrder') !== order.id || kot.getString('status') === 'cancelled') throw new BadRequestError('Order changed. Refresh before settling.');
      const items = JSON.parse(kot.getString('items') || '[]');
      const indices = {};
      if (!Array.isArray(selection.lines) || !selection.lines.length) throw new BadRequestError('Select items.');
      selection.lines.forEach(line => {
        const item = items[line.index];
        if (!Number.isInteger(line.index) || indices[line.index] || !item || item.cleared || item.settlementId)
          throw new BadRequestError('An item was already settled or changed. Refresh before settling.');
        indices[line.index] = true;
        if (JSON.stringify(canonical(item)) !== JSON.stringify(canonical(line.expected))) throw new BadRequestError('Selected items changed. Refresh before settling.');
        const price = Number(item.price), quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001)
          throw new BadRequestError('Invalid item amount.');
        let vat = item.vat_Rate;
        if (!vat && item.id) vat = app.findRecordById('menu_items', item.id).getString('vat_Rate');
        if (!['STANDARD','REDUCED_1','REDUCED_2','SPECIAL','ZERO'].includes(vat)) throw new BadRequestError('Configure item VAT before settlement.');
        cents += Math.round(price * 100) * quantity;
        selected.push(Object.assign({}, item, {vat_Rate: vat, sourceKot: kot.id, sourceIndex: line.index}));
      });
    });
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new BadRequestError('Select a positive settlement amount.');
    const settlement = new Record(app.findCollectionByNameOrId('payment_settlements'));
    settlement.load({order: order.id, orderId: order.getString('orderId'), tableNumber: order.getString('tableNumber'),
      actor: e.auth.id, requestKey: body.requestKey, items: selected, amount: cents / 100});
    app.save(settlement);
    body.selections.forEach(selection => {
      const kot = app.findRecordById('kitchen_orders', selection.kot);
      const items = JSON.parse(kot.getString('items') || '[]');
      selection.lines.forEach(line => { items[line.index].cleared = true; items[line.index].settlementId = settlement.id; });
      kot.set('items', items); app.save(kot);
    });
    let total = 0, paid = 0;
    app.findRecordsByFilter('kitchen_orders', 'parentOrder = {:id} && status != "cancelled"', '', 0, 0, {id: order.id}).forEach(kot => {
      JSON.parse(kot.getString('items') || '[]').forEach(item => {
        const amount = Math.round(Number(item.price) * 100) * Number(item.quantity);
        total += amount; if (item.cleared === true) paid += amount;
      });
    });
    order.set('totalAmount', total / 100); order.set('paidAmount', paid / 100);
    order.set('outstandingAmount', Math.max(0, total - paid) / 100);
    order.set('paymentStatus', paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
    app.save(order); result = settlement;
  });
  return e.json(200, result);
}, $apis.requireAuth());

onRecordUpdate(e => { throw new BadRequestError('Payment settlements are immutable.'); }, 'payment_settlements');
onRecordDelete(e => { throw new BadRequestError('Payment settlements must be retained.'); }, 'payment_settlements');
onRecordUpdate(e => {
  const old = e.record.original();
  const before = JSON.parse(old.getString('items') || '[]');
  const after = JSON.parse(e.record.getString('items') || '[]');
  before.forEach((item, index) => {
    if (item.settlementId && (JSON.stringify(item) !== JSON.stringify(after[index]) ||
      old.getString('parentOrder') !== e.record.getString('parentOrder') || e.record.getString('status') === 'cancelled'))
      throw new BadRequestError('Settled items cannot be changed or cancelled. Use a fiscal cancellation.');
  });
  e.next();
}, 'kitchen_orders');
onRecordDelete(e => {
  if (JSON.parse(e.record.getString('items') || '[]').some(item => item.settlementId)) throw new BadRequestError('Settled items must be retained.');
  e.next();
}, 'kitchen_orders');

onRecordUpdateRequest(e => {
  const before = JSON.parse(e.record.original().getString('items') || '[]');
  const after = JSON.parse(e.record.getString('items') || '[]');
  const parent = e.record.getString('parentOrder');
  const legacy = parent && e.app.findRecordById('waiter_orders', parent).getBool('fiscalLocked');
  after.forEach((item, index) => {
    if ((item.settlementId || '') !== (before[index]?.settlementId || '') ||
      (!legacy && item.cleared === true && before[index]?.cleared !== true))
      throw new BadRequestError('Confirm payment through the settlement endpoint.');
  });
  e.next();
}, 'kitchen_orders');
onRecordCreateRequest(e => {
  if (JSON.parse(e.record.getString('items') || '[]').some(item => item.settlementId || item.cleared === true))
    throw new BadRequestError('New items must be unpaid.');
  e.next();
}, 'kitchen_orders');
onRecordDelete(e => {
  if (e.app.findRecordsByFilter('payment_settlements', 'order = {:id}', '', 1, 0, {id:e.record.id}).length)
    throw new BadRequestError('Orders with payment settlements must be retained.');
  e.next();
}, 'waiter_orders');
