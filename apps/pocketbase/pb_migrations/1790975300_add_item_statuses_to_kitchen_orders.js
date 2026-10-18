/// <reference path="../pb_data/types.d.ts" />

// Adds per-item preparation/pickup tracking to kitchen_orders (KOTs).
//
// `itemStatuses` is a JSON object keyed by the item's index in the `items`
// array (as a string). Each value is one of:
//   "prepared"  — kitchen marked this individual item ready for pickup
//   "pickedup"  — waiter picked up this individual item
// An absent key means the item is still in progress (pending), inheriting
// the existing whole-ticket workflow. Legacy KOTs (created before this
// migration) have a null/empty field and behave exactly as before — the
// whole-ticket status remains the source of truth until the kitchen starts
// marking individual items.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    collection.fields.add(
      new JSONField({
        name: "itemStatuses",
        maxSize: 2000000,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    collection.fields.removeByName("itemStatuses");
    app.save(collection);
  },
);
