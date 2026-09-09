migrate((app) => {
  const collection = app.findCollectionByNameOrId('fiskaly_transactions');
  const status = collection.fields.getByName('status');
  status.values = [...status.values, 'superseded'];
  collection.fields.add(new JSONField({name: 'failureDetails', maxSize: 20000}));
  collection.fields.add(new JSONField({name: 'recoveryDetails', maxSize: 20000}));
  app.save(collection);
}, () => {
  throw new Error('Fiscal recovery history must be retained; automatic rollback is disabled.');
});
