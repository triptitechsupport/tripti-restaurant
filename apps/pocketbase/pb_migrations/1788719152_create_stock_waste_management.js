/// <reference path="../pb_data/types.d.ts" />

// Stock & Waste Management — new authenticated staff surface.
// Mirrors the existing waiter_users / kds_users auth-collection pattern:
//   - closed sign-up (createRule: null) — only an admin can provision accounts
//   - independent auth store on the frontend (stockPb) so stock staff can be
//     logged in alongside waiters/KDS/admins without clobbering sessions
//   - admins reuse their own admin session to view the Stock Dashboard
//
// Collections created:
//   stock_users        (auth)  — stock/waste staff login
//   stock_items        (base)  — inventory items (optionally linked to menu_items)
//   stock_adjustments  (base)  — audit trail of every stock level change
//   waste_records      (base)  — recorded waste with reason / responsible user
//
// Existing menu_items records are reused, not duplicated: stock_items may
// optionally relation-link to a menu_items row so inventory tracks the real
// dish. No existing collection, rule, or record is modified.

migrate(
  (app) => {
    const adminOrStock =
      "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"stock_users\"";

    // ---- stock_users auth collection ----
    let stockUsers;
    try {
      stockUsers = app.findCollectionByNameOrId("stock_users");
    } catch (_) {
      stockUsers = new Collection({
        type: "auth",
        name: "stock_users",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: null, // closed sign-up — admin provisions accounts
        updateRule: "id = @request.auth.id",
        deleteRule: null,
        passwordAuth: { enabled: true, identityFields: ["email", "username"] },
        authAlert: { enabled: false },
        fields: [
          { name: "username", type: "text", required: true, max: 100 },
          { name: "displayName", type: "text", required: false, max: 100 },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_stock_username` ON `stock_users` (`username`)",
        ],
      });
      app.save(stockUsers);
    }

    // Seed a Stock staff demo account (credentials revealed only in the
    // final chat confirmation, never in the UI).
    try {
      app.findAuthRecordByEmail("stock_users", "stock001@stock.local");
    } catch (_) {
      const rec = new Record(stockUsers);
      rec.setEmail("stock001@stock.local");
      rec.setPassword("StockPass123!");
      rec.setVerified(true);
      rec.set("username", "stock001");
      rec.set("displayName", "Stock Manager");
      app.save(rec);
    }

    const menuItems = app.findCollectionByNameOrId("menu_items");

    // ---- stock_items (inventory) ----
    let stockItems;
    try {
      stockItems = app.findCollectionByNameOrId("stock_items");
    } catch (_) {
      stockItems = new Collection({
        type: "base",
        name: "stock_items",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: adminOrStock,
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          { name: "name", type: "text", required: true, max: 200 },
          { name: "category", type: "text", required: false, max: 100 },
          { name: "unit", type: "text", required: false, max: 50 },
          { name: "quantity", type: "number", required: false, min: 0 },
          { name: "minStock", type: "number", required: false, min: 0 },
          { name: "notes", type: "text", required: false, max: 1000 },
          {
            name: "menuItem",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: menuItems.id,
            cascadeDelete: false,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(stockItems);
    }

    // ---- stock_adjustments (audit trail) ----
    let stockAdjustments;
    try {
      stockAdjustments = app.findCollectionByNameOrId("stock_adjustments");
    } catch (_) {
      stockAdjustments = new Collection({
        type: "base",
        name: "stock_adjustments",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: "@request.auth.collectionName = \"admin_users\"",
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          {
            name: "stockItem",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: stockItems.id,
            cascadeDelete: false,
          },
          { name: "itemName", type: "text", required: false, max: 200 },
          {
            name: "adjustmentType",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["restock", "correction", "waste", "initial"],
          },
          { name: "delta", type: "number", required: false },
          { name: "previousQty", type: "number", required: false, min: 0 },
          { name: "newQty", type: "number", required: false, min: 0 },
          { name: "reason", type: "text", required: false, max: 300 },
          { name: "adjustedBy", type: "text", required: false, max: 100 },
          { name: "adjustedById", type: "text", required: false, max: 100 },
          { name: "adjustedByRole", type: "text", required: false, max: 50 },
          { name: "notes", type: "text", required: false, max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_stock_adjustments_item ON stock_adjustments (stockItem)",
        ],
      });
      app.save(stockAdjustments);
    }

    // ---- waste_records ----
    let wasteRecords;
    try {
      wasteRecords = app.findCollectionByNameOrId("waste_records");
    } catch (_) {
      wasteRecords = new Collection({
        type: "base",
        name: "waste_records",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: "@request.auth.collectionName = \"admin_users\"",
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          { name: "itemName", type: "text", required: true, max: 200 },
          { name: "category", type: "text", required: false, max: 100 },
          { name: "quantity", type: "number", required: true, min: 0 },
          { name: "unit", type: "text", required: false, max: 50 },
          {
            name: "reason",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "spoiled",
              "expired",
              "damaged",
              "over-preparation",
              "spill",
              "burnt",
              "customer-return",
              "other",
            ],
          },
          { name: "wasteDate", type: "date", required: true },
          { name: "responsibleUser", type: "text", required: false, max: 100 },
          { name: "responsibleUserId", type: "text", required: false, max: 100 },
          { name: "responsibleRole", type: "text", required: false, max: 50 },
          { name: "notes", type: "text", required: false, max: 1000 },
          {
            name: "stockItem",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: stockItems.id,
            cascadeDelete: false,
          },
          {
            name: "menuItem",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: menuItems.id,
            cascadeDelete: false,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_waste_records_date ON waste_records (wasteDate)",
          "CREATE INDEX idx_waste_records_reason ON waste_records (reason)",
        ],
      });
      app.save(wasteRecords);
    }
  },
  (app) => {
    for (const name of ["waste_records", "stock_adjustments", "stock_items", "stock_users"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {
        /* skip */
      }
    }
  },
);
