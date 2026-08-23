/// <reference path="../pb_data/types.d.ts" />

// Adds payment tracking fields to waiter_orders so an order's settlement
// state can be tracked across multiple KOTs:
//   paymentStatus    select unpaid | partial | paid (default unpaid)
//   totalAmount      number — sum of all item prices across all child KOTs
//   paidAmount       number — sum of cleared (paid) item prices (default 0)
//   outstandingAmount number — totalAmount - paidAmount (auto-calculated)
//
// The per-item "cleared" flag lives inside each kitchen_orders.items JSON
// array entry (no schema change needed for that json field). This migration
// only adds the aggregate payment fields on the parent order.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");

    // paymentStatus — drives the settlement workflow. Default "unpaid".
    if (!collection.fields.getByName("paymentStatus")) {
      collection.fields.add(
        new SelectField({
          name: "paymentStatus",
          required: false,
          maxSelect: 1,
          values: ["unpaid", "partial", "paid"],
        }),
      );
    }

    // totalAmount — aggregate of all KOT item totals for this parent.
    if (!collection.fields.getByName("totalAmount")) {
      collection.fields.add(
        new NumberField({
          name: "totalAmount",
          required: false,
          min: 0,
        }),
      );
    }

    // paidAmount — sum of cleared item prices. Defaults to 0.
    if (!collection.fields.getByName("paidAmount")) {
      collection.fields.add(
        new NumberField({
          name: "paidAmount",
          required: false,
          min: 0,
        }),
      );
    }

    // outstandingAmount — totalAmount - paidAmount. Defaults to 0.
    if (!collection.fields.getByName("outstandingAmount")) {
      collection.fields.add(
        new NumberField({
          name: "outstandingAmount",
          required: false,
          min: 0,
        }),
      );
    }

    app.save(collection);

    // Backfill existing waiter_orders records: set defaults so legacy rows
    // are valid. totalAmount/paidAmount/outstandingAmount stay 0 (no items
    // known at migration time) and paymentStatus defaults to unpaid.
    try {
      const records = app.db().newQuery(
        "SELECT id FROM waiter_orders WHERE (paymentStatus IS NULL OR paymentStatus = '')"
      ).all();
      for (const row of records) {
        app.db().newQuery(
          "UPDATE waiter_orders SET paymentStatus = 'unpaid', " +
          "paidAmount = 0, outstandingAmount = 0, totalAmount = COALESCE(totalAmount, 0) " +
          "WHERE id = {:id}"
        ).bind({ id: row.id }).execute();
      }
    } catch (e) {
      // Non-fatal: backfill is best-effort. New records get defaults from
      // the create path in the frontend.
      console.log("payment backfill skipped:", e.message);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");
    ["paymentStatus", "totalAmount", "paidAmount", "outstandingAmount"].forEach(
      (name) => {
        if (collection.fields.getByName(name)) {
          collection.fields.removeByName(name);
        }
      },
    );
    app.save(collection);
  },
);
