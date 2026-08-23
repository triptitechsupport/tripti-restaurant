/// <reference path="../pb_data/types.d.ts" />

// Adds "cancelled" to the kitchen_orders status select field so a child
// KOT ticket can be cancelled (status = cancelled) without deleting the
// record. Existing values pending, preparing, ready, completed are
// preserved; the new full set is pending, preparing, ready, completed,
// cancelled.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    const field = collection.fields.getByName("status");
    field.values = ["pending", "preparing", "ready", "completed", "cancelled"];
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    const field = collection.fields.getByName("status");
    field.values = ["pending", "preparing", "ready", "completed"];
    app.save(collection);
  },
);
