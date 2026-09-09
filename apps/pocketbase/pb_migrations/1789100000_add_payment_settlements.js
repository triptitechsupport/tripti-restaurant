migrate(app => {
  const orders = app.findCollectionByNameOrId('waiter_orders');
  const settlements = new Collection({name: 'payment_settlements', type: 'base',
    listRule: '@request.auth.collectionName = "admin_users"', viewRule: '@request.auth.collectionName = "admin_users"',
    fields: [
      {type: 'relation', name: 'order', collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: false},
      ...['orderId', 'requestKey', 'actor', 'tableNumber'].map(name => ({type: 'text', name})),
      {type: 'json', name: 'items', maxSize: 5000000}, {type: 'number', name: 'amount'},
      {type: 'autodate', name: 'created', onCreate: true},
    ], indexes: ['CREATE UNIQUE INDEX idx_settlement_request ON payment_settlements (requestKey)']});
  app.save(settlements);
  const tx = app.findCollectionByNameOrId('fiskaly_transactions');
  tx.fields.add(new RelationField({name: 'settlement', collectionId: settlements.id, maxSelect: 1, cascadeDelete: false}));
  app.save(tx);
}, () => { throw new Error('Settlements and fiscal history must be retained.'); });
