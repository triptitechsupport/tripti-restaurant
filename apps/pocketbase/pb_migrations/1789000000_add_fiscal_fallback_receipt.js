migrate((app) => {
  const transactions = app.findCollectionByNameOrId('fiskaly_transactions');
  transactions.fields.add(new JSONField({name: 'fallbackReceipt', maxSize: 5000000}));
  app.save(transactions);
}, () => {
  throw new Error('Outage receipt copies must be retained; this migration cannot be reverted automatically.');
});
