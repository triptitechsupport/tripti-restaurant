/// <reference path="../pb_data/types.d.ts" />

// Atomically generates waiter_orders.orderId (WI00001 / PO00001 ...) using a
// single SQLite UPDATE...RETURNING statement. SQLite serializes the single
// UPDATE on the counter row, so two concurrent creates can never receive the
// same sequence number. Independent counters are maintained for walk-in (WI)
// and pre-order (PO) order types.
onRecordCreateRequest((e) => {
  const orderType = e.record.get("orderType");
  if (!orderType) {
    throw new BadRequestError("orderType is required");
  }
  const prefix = orderType === "walkin" ? "WI" : orderType === "preorder" ? "PO" : "";
  if (!prefix) {
    throw new BadRequestError("invalid orderType: " + orderType);
  }

  // Atomic read-increment-write in one SQL statement. RETURNING yields the
  // new (post-increment) nextSeq value, which is the sequence for THIS order.
  const row = new DynamicModel({ nextSeq: 0 });
  $app
    .db()
    .newQuery(
      "UPDATE order_counters SET nextSeq = nextSeq + 1 WHERE counterType = {:type} RETURNING nextSeq",
    )
    .bind({ type: orderType })
    .one(row);

  if (!row || !row.nextSeq) {
    throw new BadRequestError(
      "order counter not initialized for orderType: " + orderType,
    );
  }

  const seq = parseInt(row.nextSeq, 10);
  const orderId = prefix + String(seq).padStart(5, "0");
  e.record.set("orderId", orderId);

  // Default orderStatus to "open" if the caller did not set it.
  if (!e.record.get("orderStatus")) {
    e.record.set("orderStatus", "open");
  }

  e.next();
}, "waiter_orders");
