/// <reference path="../pb_data/types.d.ts" />

// Fiskaly SIGN AT — fiscal cash register storage (Phase 2).
//
// Stores the single "Main POS" Fiskaly cash register provisioned for the
// restaurant, together with the Signature Creation Unit (SCU) it relies on
// and the FinanzOnline (FON) authentication state. This is operational
// configuration data owned by the restaurant admin — admin-only on every
// rule. One row represents one Fiskaly cash register; the application uses a
// single "Main POS" register unless a future requirement adds more.
//
// This collection is purely additive. No existing collection (waiter_orders,
// kitchen_orders, orders, etc.) is modified. Fiskaly is a POST-End-Order
// feature and is not referenced by any pre-End-Order workflow.

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("fiscal_cash_registers");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "fiscal_cash_registers",
        // Admin-only operational configuration.
        listRule: '@request.auth.collectionName = "admin_users"',
        viewRule: '@request.auth.collectionName = "admin_users"',
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          // Fiskaly cash register UUID (assigned at creation, immutable).
          {
            name: "fiskaly_cash_register_id",
            type: "text",
            required: true,
            max: 64,
          },
          // Fiskaly Signature Creation Unit UUID this register signs with.
          { name: "fiskaly_scu_id", type: "text", max: 64 },
          // Human-readable name, e.g. "Main POS".
          { name: "name", type: "text", required: true, max: 100 },
          // Free-form description.
          { name: "description", type: "text", max: 500 },
          // Fiskaly environment this register lives in.
          {
            name: "environment",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["TEST", "LIVE"],
          },
          // Mirrored Fiskaly cash register lifecycle state.
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "CREATED",
              "REGISTERED",
              "INITIALIZED",
              "DECOMMISSIONED",
              "OUTAGE",
              "DEFECTIVE",
            ],
          },
          // Mirrored Fiskaly SCU lifecycle state.
          {
            name: "scu_status",
            type: "select",
            maxSelect: 1,
            values: [
              "CREATED",
              "PENDING",
              "INITIALIZED",
              "DECOMMISSIONED",
              "OUTAGE",
              "DEFECTIVE",
            ],
          },
          // Fiskaly-issued cash register serial number (Kassenidentifikationsnummer).
          { name: "serial_number", type: "text", max: 100 },
          // Fiskaly-issued SCU certificate serial number.
          { name: "certificate_serial_number", type: "text", max: 200 },
          // Mirrored FinanzOnline authentication status.
          {
            name: "fon_status",
            type: "select",
            maxSelect: 1,
            values: ["AUTHENTICATED", "UNAUTHENTICATED", "ERROR_UNSPECIFIED"],
          },
          // ISO timestamp of the last successful provisioning/setup run.
          { name: "last_setup_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("fiscal_cash_registers");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
