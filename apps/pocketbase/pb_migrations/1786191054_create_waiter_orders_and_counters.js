/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---------------------------------------------------------------
    // 1. order_counters collection — stores the atomic sequence counters
    //    used to generate waiter_orders.orderId (WI00001 / PO00001 ...).
    //    Only the JSVM hook (superuser-level) mutates these; admins read.
    // ---------------------------------------------------------------
    let counters;
    try {
      counters = app.findCollectionByNameOrId("order_counters");
    } catch (_) {
      counters = new Collection({
        type: "base",
        name: "order_counters",
        listRule: "@request.auth.collectionName = \"admin_users\"",
        viewRule: "@request.auth.collectionName = \"admin_users\"",
        createRule: "@request.auth.collectionName = \"admin_users\"",
        updateRule: "@request.auth.collectionName = \"admin_users\"",
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          {
            name: "counterType",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["walkin", "preorder"],
          },
          { name: "nextSeq", type: "number" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_order_counters_type ON order_counters (counterType)",
        ],
      });
      app.save(counters);
    }

    // Seed the two independent counters (start at 0; the hook increments
    // atomically and uses the returned value, so the first order is 00001).
    const seedCounter = (type) => {
      try {
        app.findFirstRecordByFilter("order_counters", "counterType = '" + type + "'");
      } catch (_) {
        const rec = new Record(counters, { counterType: type, nextSeq: 0 });
        app.save(rec);
      }
    };
    seedCounter("walkin");
    seedCounter("preorder");

    // ---------------------------------------------------------------
    // 2. waiter_orders collection — the parent order record. orderId is
    //    generated atomically server-side by the waiter_orders_id hook.
    // ---------------------------------------------------------------
    let waiterOrders;
    try {
      waiterOrders = app.findCollectionByNameOrId("waiter_orders");
    } catch (_) {
      waiterOrders = new Collection({
        type: "base",
        name: "waiter_orders",
        listRule:
          "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\"",
        viewRule:
          "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\"",
        createRule:
          "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"waiter_users\"",
        updateRule:
          "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\"",
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          { name: "orderId", type: "text", required: true, max: 20 },
          {
            name: "orderType",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["walkin", "preorder"],
          },
          { name: "tableNumber", type: "text", required: true, max: 100 },
          {
            name: "orderStatus",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["open", "closed"],
          },
          { name: "placedBy", type: "text", max: 100 },
          { name: "placedByRole", type: "text", max: 50 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_waiter_orders_orderId ON waiter_orders (orderId)",
        ],
      });
      app.save(waiterOrders);
    }

    // ---------------------------------------------------------------
    // 3. Add parentOrder relation to kitchen_orders (links each KOT to its
    //    parent waiter_orders record). Not marked `required` at the DB level
    //    so existing KOT rows (created before this feature) can still be
    //    updated; the frontend always sends parentOrder on new creates.
    // ---------------------------------------------------------------
    const kitchenOrders = app.findCollectionByNameOrId("kitchen_orders");
    if (!kitchenOrders.fields.getByName("parentOrder")) {
      kitchenOrders.fields.add(
        new RelationField({
          name: "parentOrder",
          required: false,
          maxSelect: 1,
          collectionId: waiterOrders.id,
          cascadeDelete: true,
        }),
      );
      app.save(kitchenOrders);
    }
  },
  (app) => {
    // Down: remove parentOrder field, drop waiter_orders + order_counters.
    try {
      const kitchenOrders = app.findCollectionByNameOrId("kitchen_orders");
      if (kitchenOrders.fields.getByName("parentOrder")) {
        kitchenOrders.fields.removeByName("parentOrder");
        app.save(kitchenOrders);
      }
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("waiter_orders"));
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("order_counters"));
    } catch (e) {
      if (!e.message.includes("no rows")) throw e;
    }
  },
);
