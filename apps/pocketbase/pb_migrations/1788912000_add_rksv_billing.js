migrate((app) => {
  const admin = '@request.auth.collectionName = "admin_users"';
  const timestamps = () => [({type: 'autodate', name: 'created', onCreate: true}), ({type: 'autodate', name: 'updated', onCreate: true, onUpdate: true})];
  const text = (name) => ({type: 'text', name});
  const registers = new Collection({name: 'cash_registers', type: 'base', listRule: admin, viewRule: admin,
    fields: ['name', 'serialNumber', 'fiskalyCashRegisterId', 'scuId', 'vatId', 'status', 'environment'].map(text).concat(timestamps()),
    indexes: ['CREATE UNIQUE INDEX idx_fiscal_register ON cash_registers (fiskalyCashRegisterId)']});
  app.save(registers);
  const orders = app.findCollectionByNameOrId('waiter_orders');
  orders.fields.add(new BoolField({name: 'fiscalLocked'}));
  app.save(orders);
  const transactions = new Collection({name: 'fiskaly_transactions', type: 'base', listRule: admin, viewRule: admin,
    fields: [
      ({type: 'relation', name: 'order', collectionId: orders.id, maxSelect: 1, required: true, cascadeDelete: false}),
      ({type: 'relation', name: 'cashRegister', collectionId: registers.id, maxSelect: 1, required: true, cascadeDelete: false}),
      ...['orderId', 'businessReceiptKey', 'fiskalyReceiptId', 'fiskalyReceiptNumber', 'scuId', 'paymentType', 'qrCodeData', 'errorMessage', 'originalTransaction', 'createdBy'].map(text),
      ({type: 'select', name: 'receiptType', values: ['NORMAL', 'TRAINING', 'CANCELLATION'], maxSelect: 1, required: true}),
      ({type: 'select', name: 'status', values: ['pending', 'queued', 'signed', 'outage', 'failed'], maxSelect: 1, required: true}),
      ({type: 'number', name: 'amount'}), ({type: 'number', name: 'retryCount', min: 0, onlyInt: true}),
      ({type: 'date', name: 'signedAt'}), ({type: 'date', name: 'nextRetryAt'}), ({type: 'date', name: 'lastRetryAttemptAt'}),
      ...['requestPayload', 'responsePayload', 'receiptSnapshot', 'validationResult'].map(name => ({type: 'json', name, maxSize: 5000000})),
      ...timestamps()
    ], indexes: ['CREATE UNIQUE INDEX idx_fiscal_business_key ON fiskaly_transactions (businessReceiptKey)',
      'CREATE UNIQUE INDEX idx_fiscal_receipt_id ON fiskaly_transactions (fiskalyReceiptId)',
      'CREATE INDEX idx_fiscal_queue ON fiskaly_transactions (status, nextRetryAt)']});
  app.save(transactions);
  const menu = app.findCollectionByNameOrId('menu_items');
  menu.fields.add(new SelectField({name: 'vat_Rate', values: ['STANDARD', 'REDUCED_1', 'REDUCED_2', 'SPECIAL', 'ZERO'], maxSelect: 1}));
  app.save(menu);
  app.findRecordsByFilter('menu_items', 'id != ""', '', 0).forEach(record => {
    const category = String(record.get('category') || '').toLowerCase();
    record.set('vat_Rate', /beverages|getränke|getraenke/.test(category) ? 'STANDARD' : 'REDUCED_1');
    // Legacy menu rows may predate mandatory bilingual names. Only backfill VAT.
    app.saveNoValidate(record);
  });
}, (app) => {
  // Fiscal data is deliberately retained. A rollback must never erase issued receipts.
  throw new Error('RKSV migration cannot be reverted automatically: retain fiscal records and restore a verified backup if needed.');
});

