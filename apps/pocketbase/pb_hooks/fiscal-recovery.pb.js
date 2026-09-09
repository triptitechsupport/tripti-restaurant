// Only the backend can submit evidence obtained while holding its worker lock.
// Archive the failed attempt and release its business key/order atomically.
routerAdd('POST', '/api/fiscal/recover', (e) => {
  const body = e.requestInfo().body;
  let result;
  $app.runInTransaction((app) => {
    const record = app.findRecordById('fiskaly_transactions', body.id);
    if (record.getString('status') === 'superseded') { result = record; return; }
    const failure = JSON.parse(record.getString('failureDetails') || 'null');
    const fallback = JSON.parse(record.getString('fallbackReceipt') || 'null');
    if (record.getString('status') !== 'failed' || fallback || record.getString('qrCodeData') ||
        record.getString('fiskalyReceiptNumber') || !failure?.recoverable)
      throw new BadRequestError('Only a confirmed, unissued rejected receipt can be released.');
    const proof = body.proof;
    const register = app.findRecordById('cash_registers', record.getString('cashRegister'));
    const checkedAt = Date.parse(proof?.checkedAt || '');
    if (!proof || proof.code !== 'E_RECEIPT_NOT_FOUND' || proof.receiptId !== record.getString('fiskalyReceiptId') ||
        proof.registerId !== register.getString('fiskalyCashRegisterId') || proof.environment !== register.getString('environment') ||
        !Number.isFinite(checkedAt) || Date.now() - checkedAt > 60000 || checkedAt > Date.now() + 5000 ||
        body.expectedFailureAt !== failure.occurredAt || !String(body.reason || '').trim() || !body.actor)
      throw new BadRequestError('Fresh receipt absence verification and a recovery reason are required.');
    const oldKey = record.getString('businessReceiptKey');
    record.set('recoveryDetails', {actor: body.actor, reason: String(body.reason).trim().slice(0,500),
      recoveredAt: new Date().toISOString(), previousBusinessKey: oldKey, proof});
    record.set('businessReceiptKey', `SUPERSEDED:${record.id}`);
    record.set('status', 'superseded');
    record.set('nextRetryAt', '');
    app.save(record);
    if (record.getString('receiptType') === 'NORMAL' && !record.getString('settlement')) {
      const active = app.findRecordsByFilter('fiskaly_transactions',
        'order = {:order} && receiptType = "NORMAL" && status != "superseded"', '', 1, 0, {order: record.getString('order')});
      if (active.length) throw new BadRequestError('Another final receipt still protects this order.');
      const order = app.findRecordById('waiter_orders', record.getString('order'));
      order.set('fiscalLocked', false);
      app.save(order);
    }
    result = record;
  });
  return e.json(200, result);
}, $apis.requireSuperuserAuth());

onRecordUpdate((e) => {
  if (e.record.original().getString('status') === 'superseded')
    throw new BadRequestError('A superseded fiscal attempt is retained as immutable history.');
  e.next();
}, 'fiskaly_transactions');

onRecordDelete((e) => {
  if (e.record.getString('status') === 'superseded')
    throw new BadRequestError('Fiscal recovery history must be retained.');
  e.next();
}, 'fiskaly_transactions');
