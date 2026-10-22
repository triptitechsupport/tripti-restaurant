/// <reference path="../pb_data/types.d.ts" />
// The kitchen manager confirms that a weekly request arrived in the kitchen
// (receivedAt/ByName), with an optional note about anything missing.
migrate((app) => {
  const c = app.findCollectionByNameOrId('stock_requests');
  if (!c.fields.getByName('receivedAt')) c.fields.add(new DateField({ name: 'receivedAt' }));
  if (!c.fields.getByName('receivedByName')) c.fields.add(new TextField({ name: 'receivedByName', max: 100 }));
  if (!c.fields.getByName('receivedNote')) c.fields.add(new TextField({ name: 'receivedNote', max: 1000 }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId('stock_requests');
  ['receivedAt', 'receivedByName', 'receivedNote'].forEach((name) => c.fields.removeByName(name));
  app.save(c);
});
