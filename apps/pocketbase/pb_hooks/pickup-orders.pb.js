/// <reference path="../pb_data/types.d.ts" />

// Online pickup orders.
// 1. Order number AB-0001, AB-0002 ... (atomic counter, like waiter orders).
// 2. A paid till order marks the pickup order as paid.

onRecordCreateRequest((e) => {
  if (e.record.getString("orderType") !== "pickup") {
    e.next();
    return;
  }
  const row = new DynamicModel({ nextSeq: 0 });
  $app
    .db()
    .newQuery("UPDATE order_counters SET nextSeq = nextSeq + 1 WHERE counterType = 'pickup' RETURNING nextSeq")
    .one(row);
  if (!row || !row.nextSeq) throw new BadRequestError("pickup order counter not initialized");
  e.record.set("orderNumber", "AB-" + String(parseInt(row.nextSeq, 10)).padStart(4, "0"));
  e.next();
}, "orders");

// Kitchen ticket status -> pickup order is synced by the API scheduler
// (apps/api/src/services/pickup.js), because ticket updates run inside a
// transaction that a hook here cannot query.

// A paid till order marks the pickup order as paid.
onRecordUpdate((e) => {
  e.next();
  try {
    if (e.record.getString("channel") !== "online") return;
    if (e.record.getString("paymentStatus") !== "paid") return;
    const id = e.record.getString("pickupOrder");
    if (!id) return;
    const order = e.app.findRecordById("orders", id);
    if (order.getString("paymentStatus") === "completed") return;
    order.set("paymentStatus", "completed");
    e.app.save(order);
  } catch (err) {
    console.log("pickup payment sync failed: " + err);
  }
}, "waiter_orders");
