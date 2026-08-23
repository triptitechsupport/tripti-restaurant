/// <reference path="../pb_data/types.d.ts" />

// One open Order per table — DB-level enforcement.
//
// Table occupancy is now derived solely from waiter_orders.orderStatus =
// "open" (the single source of truth). To guarantee that two waiters
// submitting the same table simultaneously can never create two open parent
// Orders, this migration adds a partial UNIQUE index on waiter_orders
// (tableNumber) restricted to rows where orderStatus = "open".
//
// Before adding the index, any pre-existing duplicate open orders per table
// are reconciled: for each tableNumber that has more than one open order,
// the newest (max created) is kept open and the older duplicates are closed
// (orderStatus -> "closed", endedAt set). This one-time cleanup establishes
// the invariant the index then enforces. Historical KOTs are never touched.
//
// The frontend handleSubmit also handles the concurrent-create race: when the
// create is rejected by this unique constraint, it re-queries for the
// now-existing open order and attaches the KOT to it (the existing additional
// -KOT reuse path) instead of failing.

migrate(
  (app) => {
    // 1. Reconcile any duplicate open orders per table so the unique partial
    //    index can be created. Keep the newest open order per tableNumber;
    //    close the older duplicates.
    try {
      app
        .db()
        .newQuery(
          "UPDATE waiter_orders SET orderStatus = 'closed', endedAt = datetime('now') " +
            "WHERE orderStatus = 'open' AND created < (" +
            "SELECT MAX(created) FROM waiter_orders w2 " +
            "WHERE w2.tableNumber = waiter_orders.tableNumber AND w2.orderStatus = 'open'" +
            ")",
        )
        .execute();
    } catch (err) {
      // Non-fatal: if there are no duplicates the UPDATE is a no-op; if it
      // fails for another reason we still attempt the index below, which will
      // surface a real duplicate-data error if one exists.
      console.log("open-table duplicate cleanup skipped:", String(err));
    }

    // 2. Add the partial unique index: at most one open order per table.
    const col = app.findCollectionByNameOrId("waiter_orders");
    col.addIndex(
      "idx_waiter_orders_open_table",
      true,
      "tableNumber",
      "orderStatus = 'open'",
    );
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("waiter_orders");
    col.removeIndex("idx_waiter_orders_open_table");
    app.save(col);
  },
);
