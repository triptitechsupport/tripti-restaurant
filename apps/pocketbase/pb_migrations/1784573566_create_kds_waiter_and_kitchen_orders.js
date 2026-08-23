/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---- KDS auth collection ----
    let kds;
    try {
      kds = app.findCollectionByNameOrId("kds_users");
    } catch (_) {
      kds = new Collection({
        type: "auth",
        name: "kds_users",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: null,
        updateRule: "id = @request.auth.id",
        deleteRule: null,
        passwordAuth: { enabled: true, identityFields: ["email", "username"] },
        authAlert: { enabled: false },
        fields: [
          { name: "username", type: "text", required: true, max: 100 },
          { name: "displayName", type: "text", required: false, max: 100 },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_kds_username` ON `kds_users` (`username`)"],
      });
      app.save(kds);
    }

    // Seed a KDS account
    try {
      app.findAuthRecordByEmail("kds_users", "kitchen@kds.local");
    } catch (_) {
      const rec = new Record(kds);
      rec.setEmail("kitchen@kds.local");
      rec.setPassword("Kitchen2026!");
      rec.setVerified(true);
      rec.set("username", "kitchen");
      rec.set("displayName", "Kitchen Display");
      app.save(rec);
    }

    // ---- Waiter auth collection ----
    let waiter;
    try {
      waiter = app.findCollectionByNameOrId("waiter_users");
    } catch (_) {
      waiter = new Collection({
        type: "auth",
        name: "waiter_users",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: null,
        updateRule: "id = @request.auth.id",
        deleteRule: null,
        passwordAuth: { enabled: true, identityFields: ["email", "username"] },
        authAlert: { enabled: false },
        fields: [
          { name: "username", type: "text", required: true, max: 100 },
          { name: "displayName", type: "text", required: false, max: 100 },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_waiter_username` ON `waiter_users` (`username`)"],
      });
      app.save(waiter);
    }

    // Seed a Waiter account
    try {
      app.findAuthRecordByEmail("waiter_users", "waiter@waiter.local");
    } catch (_) {
      const rec = new Record(waiter);
      rec.setEmail("waiter@waiter.local");
      rec.setPassword("Waiter2026!");
      rec.setVerified(true);
      rec.set("username", "waiter");
      rec.set("displayName", "Waiter");
      app.save(rec);
    }

    // ---- Shared kitchen orders collection ----
    const staffRule =
      "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\"";
    const createRule =
      "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"waiter_users\"";

    let orders;
    try {
      orders = app.findCollectionByNameOrId("kitchen_orders");
    } catch (_) {
      orders = new Collection({
        type: "base",
        name: "kitchen_orders",
        listRule: staffRule,
        viewRule: staffRule,
        createRule: createRule,
        updateRule: staffRule,
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          { name: "tableNumber", type: "text", required: true, max: 100 },
          { name: "room", type: "text", required: false, max: 100 },
          { name: "items", type: "json", required: true, maxSize: 2000000 },
          {
            name: "status",
            type: "select",
            required: false,
            maxSelect: 1,
            values: ["pending", "preparing", "ready", "completed"],
          },
          { name: "totalPrice", type: "number", required: false, min: 0 },
          { name: "placedBy", type: "text", required: false, max: 100 },
          { name: "placedByRole", type: "text", required: false, max: 50 },
          { name: "notes", type: "text", required: false, max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(orders);
    }
  },
  (app) => {
    for (const name of ["kitchen_orders", "kds_users", "waiter_users"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {
        /* skip */
      }
    }
  },
);
