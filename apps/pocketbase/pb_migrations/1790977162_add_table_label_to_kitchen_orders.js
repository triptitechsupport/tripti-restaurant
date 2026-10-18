/// <reference path="../pb_data/types.d.ts" />

// Persists the full combined-table designation on each KOT so the KDS
// screen and kitchen print do not depend on a second lookup that can miss
// the group (and fall back to the primary table only). Single-table KOTs
// leave this empty and keep showing tableNumber.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    collection.fields.add(
      new TextField({
        name: "tableLabel",
        max: 300,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("kitchen_orders");
    collection.fields.removeByName("tableLabel");
    app.save(collection);
  },
);
