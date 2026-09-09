/// <reference path="../pb_data/types.d.ts" />

// Separates End Order from Free Table in the waiter table lifecycle.
//
// Before this migration, table occupancy was derived solely from
// `waiter_orders.orderStatus = "open"`. Closing an order (End Order) therefore
// immediately made the table appear free, making the separate Free Table
// action redundant.
//
// This adds a `freed` boolean to `waiter_orders` (default false). Occupancy is
// now derived from the latest order per table whose `freed` flag is NOT true,
// so a closed-but-not-freed order keeps the table occupied. The only action
// that releases the table is Free Table, which sets `freed = true` after
// verifying the order is closed and fully settled.
//
// Backfill: every existing CLOSED order was implicitly "freed" under the old
// semantics (closing the order released the table), so those records are
// marked `freed = true` to preserve current availability. Existing OPEN orders
// stay `freed = false` (still occupied), matching their current state.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");
    collection.fields.add(new BoolField({ name: "freed" }));
    app.save(collection);

    // Backfill: mark all already-closed orders as freed so their tables
    // remain available (preserving the previous "closed = free" behavior).
    app
      .db()
      .newQuery(
        "UPDATE waiter_orders SET freed = 1 WHERE orderStatus = 'closed'",
      )
      .execute();
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");
    collection.fields.removeByName("freed");
    app.save(collection);
  },
);
