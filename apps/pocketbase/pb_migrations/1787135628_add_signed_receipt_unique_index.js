/// <reference path="../pb_data/types.d.ts" />

// Fiskaly SIGN AT — Phase 3 duplicate protection.
//
// Enforces "at most ONE successful (SIGNED) fiscal receipt per order" at the
// database level. This is the server-side backstop that guarantees idempotency
// even under concurrent requests, double clicks, page refresh, network retries,
// or backend retries — none of which can produce a second SIGNED receipt for
// the same order. The application layer (fiscalize route) also short-circuits
// when a SIGNED receipt already exists, but this partial UNIQUE index is the
// hard guarantee required by the Generate Bill workflow.
//
// A partial index (WHERE status = 'SIGNED') is used deliberately: PENDING and
// FAILED rows are NOT unique per order, so a failed attempt can be retried by
// reusing/updating the existing row without colliding with history. Only the
// terminal SUCCESS state is constrained to one row per order_id.
//
// Additive — only adds an index to the existing fiscal_receipts collection.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("fiscal_receipts");
    collection.addIndex(
      "idx_fiscal_receipts_signed_order",
      true,
      "order_id",
      "status = 'SIGNED'",
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("fiscal_receipts");
    collection.removeIndex("idx_fiscal_receipts_signed_order");
    app.save(collection);
  },
);
