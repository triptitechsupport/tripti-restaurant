/// <reference path="../pb_data/types.d.ts" />

// Fiskaly SIGN AT — fiscal receipt storage (Phase 2).
//
// One row per fiscalized receipt (per signed order). Stores the Fiskaly
// receipt reference, the RKSV QR-code payload, receipt number, signature
// timestamp, cash register serial number, totals, VAT breakdown, payment
// type, and a fiscalization status that is INDEPENDENT of payment status.
//
// Fiscalization state machine: PENDING -> SIGNED | FAILED.
//   - PENDING: signing in progress / attempted.
//   - SIGNED:  Fiskaly returned a signed receipt (qr_code_data present).
//   - FAILED:  signing failed; error_message holds the reason. Recoverable.
//
// Payment state (unpaid/partial/paid on waiter_orders) and fiscalization
// state are deliberately separate concepts. A Fiskaly failure must NEVER
// cause a customer to be charged again, so this collection never mutates
// waiter_orders payment fields.
//
// Admin-only. Additive — no existing collection is modified.

migrate(
  (app) => {
    const fiscalRegisters = app.findCollectionByNameOrId("fiscal_cash_registers");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("fiscal_receipts");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "fiscal_receipts",
        listRule: '@request.auth.collectionName = "admin_users"',
        viewRule: '@request.auth.collectionName = "admin_users"',
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          // waiter_orders record id this receipt fiscalizes.
          { name: "order_id", type: "text", required: true, max: 64 },
          // Human-readable order number, e.g. WI00041 (denormalized for display).
          { name: "order_number", type: "text", max: 64 },
          // Fiskaly receipt UUID returned by the sign operation.
          { name: "fiskaly_receipt_id", type: "text", max: 64 },
          // Which fiscal cash register signed this receipt.
          {
            name: "cash_register",
            type: "relation",
            maxSelect: 1,
            collectionId: fiscalRegisters.id,
            cascadeDelete: false,
          },
          // Fiskaly receipt type.
          {
            name: "receipt_type",
            type: "select",
            maxSelect: 1,
            values: [
              "NORMAL",
              "CANCELLATION",
              "TRAINING",
              "INITIALIZATION",
              "DECOMMISSION",
              "MONTHLY_CLOSE",
              "YEARLY_CLOSE",
              "SIGNATURE_CREATION_UNIT_FAULT_CLEARANCE",
            ],
          },
          // RKSV receipt number (strictly monotonic per cash register).
          { name: "receipt_number", type: "text", max: 64 },
          // Cash register serial number printed on the receipt.
          { name: "cash_register_serial_number", type: "text", max: 100 },
          // Signature timestamp (unix seconds) — printed on the receipt.
          { name: "time_signature", type: "number" },
          // RKSV QR-code payload string to be rendered on the printed receipt.
          { name: "qr_code_data", type: "text", max: 2000 },
          // Gross total amount of the receipt (EUR).
          { name: "total_amount", type: "number" },
          // Payment type used for this receipt.
          {
            name: "payment_type",
            type: "select",
            maxSelect: 1,
            values: ["CASH", "NON_CASH"],
          },
          // VAT breakdown snapshot (amounts per VAT rate container).
          { name: "vat_data", type: "json", maxSize: 200000 },
          // Fiscalization status — INDEPENDENT of payment status.
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["PENDING", "SIGNED", "FAILED"],
          },
          // Failure reason when status = FAILED.
          { name: "error_message", type: "text", max: 2000 },
          // Fiskaly error code when status = FAILED (e.g. E_INITIAL_RECEIPT_MISSING).
          { name: "error_code", type: "text", max: 100 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_fiscal_receipts_order ON fiscal_receipts (order_id)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("fiscal_receipts");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
