/// <reference path="../pb_data/types.d.ts" />
// Waiters ask the cashier to end an order (endRequestedAt/By); the cashier
// confirms it by ending the order (endedAt).
migrate((app) => {
  const orders = app.findCollectionByNameOrId('waiter_orders');
  if (!orders.fields.getByName('endRequestedAt')) orders.fields.add(new DateField({name: 'endRequestedAt'}));
  if (!orders.fields.getByName('endRequestedBy')) orders.fields.add(new TextField({name: 'endRequestedBy', max: 100}));
  app.save(orders);
}, (app) => {
  const orders = app.findCollectionByNameOrId('waiter_orders');
  ['endRequestedAt', 'endRequestedBy'].forEach((name) => orders.fields.removeByName(name));
  app.save(orders);
});
