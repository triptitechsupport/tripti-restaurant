migrate(app => {
  const counters = app.findCollectionByNameOrId('settlement_counters');
  counters.fields.add(new RelationField({name: 'order', collectionId: app.findCollectionByNameOrId('waiter_orders').id, maxSelect: 1}));
  counters.indexes.push("CREATE UNIQUE INDEX idx_settlement_counter_order ON settlement_counters (`order`) WHERE `order` != ''");
  app.save(counters);
  const counts = {};
  // Only the display number changes; signed receipt snapshots and internal IDs stay intact.
  for (const record of app.findRecordsByFilter('payment_settlements', '', 'created,id', 0, 0)) {
    const order = app.findRecordById('waiter_orders', record.getString('order'));
    counts[order.id] = (counts[order.id] || 0) + 1;
    const number = order.getString('orderId') + '_S' + String(counts[order.id]).padStart(3, '0');
    app.db().newQuery('UPDATE payment_settlements SET settlementNumber = {:number} WHERE id = {:id}')
      .bind({number, id: record.id}).execute();
  }
  for (const id of Object.keys(counts)) {
    const counter = new Record(counters);
    counter.set('order', id);
    counter.set('lastValue', counts[id]);
    app.save(counter);
  }
}, () => { throw new Error('Order settlement numbering must be retained.'); });
