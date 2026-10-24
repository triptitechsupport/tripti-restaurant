/// <reference path="../pb_data/types.d.ts" />
// Waiters ask the cashier for the bill (billRequestedAt/By); the cashier takes
// the payment, issues the RKSV receipt and marks the bill ready (billReadyAt).
migrate((app) => {
  const orders = app.findCollectionByNameOrId('waiter_orders');
  if (!orders.fields.getByName('billRequestedAt')) orders.fields.add(new DateField({name: 'billRequestedAt'}));
  if (!orders.fields.getByName('billRequestedBy')) orders.fields.add(new TextField({name: 'billRequestedBy', max: 100}));
  if (!orders.fields.getByName('billReadyAt')) orders.fields.add(new DateField({name: 'billReadyAt'}));
  app.save(orders);
}, (app) => {
  const orders = app.findCollectionByNameOrId('waiter_orders');
  ['billRequestedAt', 'billRequestedBy', 'billReadyAt'].forEach((name) => orders.fields.removeByName(name));
  app.save(orders);
});
