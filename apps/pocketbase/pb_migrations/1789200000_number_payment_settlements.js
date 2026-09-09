migrate(app => {
  const collection = app.findCollectionByNameOrId('payment_settlements');
  collection.fields.add(new TextField({name: 'settlementNumber', required: true}));
  app.save(collection);
  let sequence = 0;
  // Migration-only SQL preserves immutable business data and existing relations.
  for (const record of app.findRecordsByFilter('payment_settlements', '', 'created,id', 0, 0)) {
    const number = 'S' + String(++sequence).padStart(2, '0');
    app.db().newQuery('UPDATE payment_settlements SET settlementNumber = {:number} WHERE id = {:id}')
      .bind({number, id: record.id}).execute();
  }
  collection.indexes.push('CREATE UNIQUE INDEX idx_settlement_number ON payment_settlements (settlementNumber)');
  app.save(collection);
  const counters = new Collection({name: 'settlement_counters', type: 'base', fields: [
    {type: 'number', name: 'lastValue', onlyInt: true, min: 0},
  ]});
  app.save(counters);
  const counter = new Record(counters);
  counter.set('id', 'settlementseq01');
  counter.set('lastValue', sequence);
  app.save(counter);
}, () => { throw new Error('Settlement numbering must be retained.'); });
