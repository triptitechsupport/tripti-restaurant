/// <reference path="../pb_data/types.d.ts" />

// Reconciles waiter_orders.orderStatus with the new order lifecycle.
//
// New lifecycle (this build):
//   - End Order  → sets `endedAt` only. orderStatus stays "open"; the table
//                  stays occupied. No more KOTs can be added (endedAt gates
//                  that), but the ORDER STATUS badge still reads "Open".
//   - Free Table → sets orderStatus = "closed" AND freed = true. This is the
//                  ONLY action that closes the order and releases the table.
//
// Before this build, End Order set orderStatus = "closed" (and endedAt), so
// "closed" meant "ended" rather than "freed". Under the new model "closed"
// means "freed". Existing records are reconciled to the new invariant:
//   - freed orders (freed = 1)        → orderStatus = "closed"
//   - every other order (not freed)   → orderStatus = "open"
// This re-opens any ended-but-not-freed order (old End Order had marked it
// closed) so its ORDER STATUS badge correctly reads "Open" until the waiter
// explicitly clicks Free Table. The `endedAt` marker is untouched, so End
// Order's "no new KOTs / Order ended" semantics are preserved.
migrate(
  (app) => {
    app
      .db()
      .newQuery("UPDATE waiter_orders SET orderStatus = 'closed' WHERE freed = 1")
      .execute();
    app
      .db()
      .newQuery(
        "UPDATE waiter_orders SET orderStatus = 'open' WHERE freed = 0 OR freed IS NULL",
      )
      .execute();
  },
  (app) => {
    // Best-effort down: restore the old convention where a ended order
    // (endedAt set) read as "closed", regardless of freed.
    app
      .db()
      .newQuery(
        "UPDATE waiter_orders SET orderStatus = 'closed' WHERE endedAt IS NOT NULL AND endedAt != ''",
      )
      .execute();
  },
);
