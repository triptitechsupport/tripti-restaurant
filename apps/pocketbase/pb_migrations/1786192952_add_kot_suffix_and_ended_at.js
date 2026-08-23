/// <reference path="../pb_data/types.d.ts" />

// Adds per-parent KOT suffix support (WI00123_001, _002, ...) and an
// order-ended timestamp on waiter_orders. Creates a kot_counters collection
// used by the kot-suffix hook for atomic, per-parent suffix generation.

migrate(
  (app) => {
    // 1. Add kotSuffix (e.g. "001") to kitchen_orders. Not required so
    //    legacy KOTs (created before this feature) remain valid.
    const kitchenOrders = app.findCollectionByNameOrId("kitchen_orders");
    if (!kitchenOrders.fields.getByName("kotSuffix")) {
      kitchenOrders.fields.add(
        new TextField({
          name: "kotSuffix",
          required: false,
          max: 3,
        }),
      );
      app.save(kitchenOrders);
    }

    // 2. Add endedAt timestamp to waiter_orders (set when an order is ended).
    const waiterOrders = app.findCollectionByNameOrId("waiter_orders");
    if (!waiterOrders.fields.getByName("endedAt")) {
      waiterOrders.fields.add(
        new DateField({
          name: "endedAt",
          required: false,
        }),
      );
      app.save(waiterOrders);
    }

    // 3. kot_counters — one row per parent order, holding the next suffix
    //    sequence. Only the JSVM hook (superuser-level) reads/writes this;
    //    all REST rules are null (nobody can touch it via the API).
    let kotCounters;
    try {
      kotCounters = app.findCollectionByNameOrId("kot_counters");
    } catch (_) {
      kotCounters = new Collection({
        type: "base",
        name: "kot_counters",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "parentOrder",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: waiterOrders.id,
            cascadeDelete: true,
          },
          { name: "nextSeq", type: "number" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_kot_counters_parent ON kot_counters (parentOrder)",
        ],
      });
      app.save(kotCounters);
    }
  },
  (app) => {
    try {
      const ko = app.findCollectionByNameOrId("kitchen_orders");
      if (ko.fields.getByName("kotSuffix")) {
        ko.fields.removeByName("kotSuffix");
        app.save(ko);
      }
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
    try {
      const wo = app.findCollectionByNameOrId("waiter_orders");
      if (wo.fields.getByName("endedAt")) {
        wo.fields.removeByName("endedAt");
        app.save(wo);
      }
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("kot_counters"));
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
  },
);
