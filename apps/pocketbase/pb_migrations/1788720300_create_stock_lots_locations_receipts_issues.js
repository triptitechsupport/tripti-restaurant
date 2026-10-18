/// <reference path="../pb_data/types.d.ts" />

// Full stock workflow — lots, locations, receipts (goods-in), issues (FIFO),
// and numeric barcodes. Extends the existing stock_items / waste_records
// collections; preserves all existing records, rules, and the demo account.
//
// New collections:
//   stock_locations  — Room → Fridge/store → Rack → Box tree (self-relation)
//   stock_receipts   — supplier bills / goods-in headers
//   stock_lots       — one lot per receipt (qty, expiry, bill, location, barcode)
//   stock_issues     — issue records (staff ID first, then item+qty, FIFO)
//
// Extended collections:
//   stock_items  + barcode (numeric text), perishable (bool), unitCost (number)
//   waste_records + lot (optional relation to stock_lots) for traceability
//
// Audit principle: stock_issues and stock_receipts are append-only from the
// frontend (update/delete admin-only). Level changes always go through
// stock_adjustments — old records are never silently edited.

migrate(
  (app) => {
    const adminOrStock =
      "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"stock_users\"";
    const adminOnly = "@request.auth.collectionName = \"admin_users\"";

    const stockItems = app.findCollectionByNameOrId("stock_items");
    const wasteRecords = app.findCollectionByNameOrId("waste_records");

    // ---- stock_locations (Room → Fridge → Rack → Box) ----
    let stockLocations;
    try {
      stockLocations = app.findCollectionByNameOrId("stock_locations");
    } catch (_) {
      stockLocations = new Collection({
        type: "base",
        name: "stock_locations",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: adminOrStock,
        deleteRule: adminOnly,
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["room", "fridge", "rack", "box"],
          },
          { name: "description", type: "text", required: false, max: 300 },
          { name: "path", type: "text", required: false, max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(stockLocations);
    }
    // Add the self-relation `parent` if missing (declared after the collection
    // exists so we can reference its own id).
    if (!stockLocations.fields.getByName("parent")) {
      stockLocations.fields.add(
        new RelationField({
          name: "parent",
          required: false,
          maxSelect: 1,
          collectionId: stockLocations.id,
          cascadeDelete: false,
        }),
      );
      app.save(stockLocations);
    }

    // ---- stock_receipts (supplier bills / goods-in headers) ----
    let stockReceipts;
    try {
      stockReceipts = app.findCollectionByNameOrId("stock_receipts");
    } catch (_) {
      stockReceipts = new Collection({
        type: "base",
        name: "stock_receipts",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: adminOnly, // append-only from staff
        deleteRule: adminOnly,
        fields: [
          { name: "billNumber", type: "text", required: false, max: 100 },
          { name: "supplier", type: "text", required: false, max: 200 },
          { name: "billDate", type: "date", required: false },
          { name: "totalAmount", type: "number", required: false, min: 0 },
          { name: "notes", type: "text", required: false, max: 1000 },
          { name: "receivedBy", type: "text", required: false, max: 100 },
          { name: "receivedById", type: "text", required: false, max: 100 },
          { name: "receivedByRole", type: "text", required: false, max: 50 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(stockReceipts);
    }

    // ---- stock_lots (one lot per receipt line) ----
    let stockLots;
    try {
      stockLots = app.findCollectionByNameOrId("stock_lots");
    } catch (_) {
      stockLots = new Collection({
        type: "base",
        name: "stock_lots",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: adminOrStock, // remainingQty decremented on issue; status flips
        deleteRule: adminOnly,
        fields: [
          // Numeric-only barcode stored as text (leading zeros preserved).
          { name: "barcode", type: "text", required: false, max: 40 },
          {
            name: "stockItem",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: stockItems.id,
            cascadeDelete: false,
          },
          {
            name: "receipt",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: stockReceipts.id,
            cascadeDelete: true,
          },
          { name: "quantity", type: "number", required: true, min: 0 },
          { name: "remainingQty", type: "number", required: false, min: 0 },
          { name: "expiry", type: "date", required: false },
          {
            name: "location",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: stockLocations.id,
            cascadeDelete: false,
          },
          { name: "supplierBill", type: "text", required: false, max: 100 },
          { name: "unitCost", type: "number", required: false, min: 0 },
          { name: "perishable", type: "bool", required: false },
          {
            name: "status",
            type: "select",
            required: false,
            maxSelect: 1,
            values: ["active", "issued", "expired", "overridden"],
          },
          { name: "receivedDate", type: "date", required: false },
          { name: "overrideReason", type: "text", required: false, max: 300 },
          { name: "overriddenBy", type: "text", required: false, max: 100 },
          { name: "notes", type: "text", required: false, max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_stock_lots_item ON stock_lots (stockItem)",
          "CREATE INDEX idx_stock_lots_expiry ON stock_lots (expiry)",
          "CREATE INDEX idx_stock_lots_barcode ON stock_lots (barcode)",
        ],
      });
      app.save(stockLots);
    }

    // ---- stock_issues (FIFO issue records, append-only) ----
    let stockIssues;
    try {
      stockIssues = app.findCollectionByNameOrId("stock_issues");
    } catch (_) {
      stockIssues = new Collection({
        type: "base",
        name: "stock_issues",
        listRule: adminOrStock,
        viewRule: adminOrStock,
        createRule: adminOrStock,
        updateRule: adminOnly, // immutable from staff
        deleteRule: adminOnly,
        fields: [
          { name: "staffId", type: "text", required: true, max: 100 },
          { name: "staffName", type: "text", required: false, max: 120 },
          {
            name: "stockItem",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: stockItems.id,
            cascadeDelete: false,
          },
          {
            name: "lot",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: stockLots.id,
            cascadeDelete: false,
          },
          { name: "quantity", type: "number", required: true, min: 0 },
          { name: "issueDate", type: "date", required: true },
          {
            name: "location",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: stockLocations.id,
            cascadeDelete: false,
          },
          { name: "issuedByRole", type: "text", required: false, max: 50 },
          { name: "notes", type: "text", required: false, max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_stock_issues_item ON stock_issues (stockItem)",
          "CREATE INDEX idx_stock_issues_lot ON stock_issues (lot)",
          "CREATE INDEX idx_stock_issues_date ON stock_issues (issueDate)",
        ],
      });
      app.save(stockIssues);
    }

    // ---- Extend stock_items with barcode / perishable / unitCost ----
    const ensureItemField = (name, factory) => {
      if (!stockItems.fields.getByName(name)) {
        stockItems.fields.add(factory());
        app.save(stockItems);
      }
    };
    ensureItemField("barcode", () => new TextField({ name: "barcode", required: false, max: 40 }));
    ensureItemField("perishable", () => new BoolField({ name: "perishable", required: false }));
    ensureItemField("unitCost", () => new NumberField({ name: "unitCost", required: false, min: 0 }));

    // ---- Extend waste_records with optional lot relation ----
    if (!wasteRecords.fields.getByName("lot")) {
      wasteRecords.fields.add(
        new RelationField({
          name: "lot",
          required: false,
          maxSelect: 1,
          collectionId: stockLots.id,
          cascadeDelete: false,
        }),
      );
      app.save(wasteRecords);
    }
  },
  (app) => {
    for (const name of ["stock_issues", "stock_lots", "stock_receipts", "stock_locations"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {
        /* skip */
      }
    }
    // Best-effort removal of added fields on revert.
    try {
      const wasteRecords = app.findCollectionByNameOrId("waste_records");
      if (wasteRecords.fields.getByName("lot")) {
        wasteRecords.fields.removeByName("lot");
        app.save(wasteRecords);
      }
    } catch (_) { /* skip */ }
    try {
      const stockItems = app.findCollectionByNameOrId("stock_items");
      for (const f of ["barcode", "perishable", "unitCost"]) {
        if (stockItems.fields.getByName(f)) {
          stockItems.fields.removeByName(f);
        }
      }
      app.save(stockItems);
    } catch (_) { /* skip */ }
  },
);
