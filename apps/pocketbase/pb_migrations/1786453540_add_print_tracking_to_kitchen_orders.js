/// <reference path="../pb_data/types.d.ts" />

// Add print-tracking fields to kitchen_orders so KOT reprints/resends can be
// tracked consistently across Waiter, KDS, and Admin. printedAt records the
// last time the ticket was printed/sent; printCount is the total number of
// print/send events. Both optional (existing rows stay valid with no value).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('kitchen_orders');
    collection.fields.add(
      new DateField({
        name: 'printedAt',
        required: false,
      }),
    );
    collection.fields.add(
      new NumberField({
        name: 'printCount',
        required: false,
        min: 0,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('kitchen_orders');
    collection.fields.removeByName('printedAt');
    collection.fields.removeByName('printCount');
    app.save(collection);
  },
);
