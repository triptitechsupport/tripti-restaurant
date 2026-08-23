/// <reference path="../pb_data/types.d.ts" />

// Phase 4 — Free Table completion gating (server-side enforcement).
//
// A table may become FREE ONLY when ALL THREE conditions hold for its order:
//   1. End Order completed        — waiter_orders.orderStatus === "closed"
//   2. Payment completed          — every non-cancelled KOT item line is
//                                   cleared (outstandingAmount <= 0)
//   3. Fiscalization completed    — a fiscal_receipts row with
//                                   status = "SIGNED" exists for the order
//
// CAN_FREE_TABLE = END_ORDER_COMPLETED AND PAYMENT_COMPLETED
//                  AND FISCALIZATION_COMPLETED
//
// This hook enforces the rule server-side so direct API calls, stale
// frontend state, page refresh, race conditions, duplicate requests, and
// concurrent waiter actions cannot free a table prematurely. It guards the
// three DB operations that release a table:
//
//   A. waiter_orders create — reject opening a NEW order on a table that
//      still has an existing not-fully-completed order. The table remains
//      occupied until the prior order is fully completed (ended + paid +
//      signed). This is the server-side backstop for the frontend's
//      occupied-table gating.
//   B. table_group_members update (isActive true -> false) — reject
//      releasing a table from a combination before its order is fully
//      completed (Linked: that table's parent; Shared: the single group
//      parent).
//   C. table_groups update (status -> "closed") — reject closing a
//      combination before every member's order is fully completed.
//
// The existing Free Table implementation (frontend markAvailable /
// handleFreeTableGroup + releaseTableFromCombination) is PRESERVED — this
// hook only adds the completion guard that runs before those operations can
// take effect. No second competing Free Table system is introduced.
//
// Edge cases handled:
//   • Fiscalization FAILED + payment SUCCESS  -> table stays occupied,
//     retry allowed, customer never re-charged (this hook only READS
//     payment/fiscal state; it never mutates them).
//   • Payment FAILED + fiscalization SIGNED    -> table stays occupied.
//   • End Order NOT completed + paid + signed  -> table stays occupied
//     (orderStatus !== "closed" fails condition 1).
//
// File name sorts before "table-groups-sync.pb.js" so this guard's
// table_groups update hook runs before the sync hook's member propagation,
// guaranteeing a premature group close is rejected before any member is
// released.

// ---- shared helper: is a parent order fully completed? ----
// Reads orderStatus, recomputes payment from kitchen_orders (cleared flags),
// and checks for a SIGNED fiscal_receipts row. Never mutates any record.
function isOrderFullyCompleted(app, parent) {
  if (!parent) return false;
  if (parent.getString("orderStatus") !== "closed") return false;

  // Condition 2: payment — every non-cancelled KOT item line must be cleared.
  let total = 0;
  let paid = 0;
  try {
    const kots = app.findRecordsByFilter(
      "kitchen_orders",
      "parentOrder = {:pid}",
      "",
      0,
      0,
      { pid: parent.id },
    );
    for (const k of kots) {
      if (k.getString("status") === "cancelled") continue;
      let items = k.get("items");
      if (!items) continue;
      let arr = items;
      try {
        if (typeof arr === "string") arr = JSON.parse(arr);
        else arr = JSON.parse(JSON.stringify(arr));
      } catch (_) {
        arr = [];
      }
      if (!Array.isArray(arr)) continue;
      for (const it of arr) {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.price) || 0;
        total += qty * price;
        if (it.cleared === true) paid += qty * price;
      }
    }
  } catch (_) {
    return false;
  }
  if (paid < total) return false;

  // Condition 3: fiscalization — a SIGNED fiscal receipt must exist.
  let signed = null;
  try {
    signed = app.findFirstRecordByFilter(
      "fiscal_receipts",
      "order_id = {:oid} && status = 'SIGNED'",
      { oid: parent.id },
    );
  } catch (_) {
    signed = null;
  }
  if (!signed) return false;

  return true;
}

// A. waiter_orders create — a table with an existing not-fully-completed
//    order stays occupied; reject opening a new order on it.
onRecordCreateRequest((e) => {
  const tableNumber = e.record.get("tableNumber");
  if (!tableNumber || String(tableNumber).trim() === "") {
    // The required-field check is enforced by the collection schema; let it
    // surface the validation error rather than duplicating it here.
    e.next();
    return;
  }
  const tn = String(tableNumber);

  let existing = [];
  try {
    existing = $app.findRecordsByFilter(
      "waiter_orders",
      "tableNumber = {:tn}",
      "-created",
      0,
      0,
      { tn },
    );
  } catch (_) {
    existing = [];
  }
  for (const w of existing) {
    if (!isOrderFullyCompleted($app, w)) {
      throw new BadRequestError(
        "Table " + tn + " is still in use. Its order must be ended, paid, and fiscalized (bill signed) before a new order can be opened on it.",
      );
    }
  }

  e.next();
}, "waiter_orders");

// B. table_group_members update (isActive true -> false) — the Free Table
//    release. Reject before the associated order is fully completed.
onRecordUpdateRequest((e) => {
  const newActive = e.record.get("isActive");
  const oldActive =
    e.originalRecord && e.originalRecord.get
      ? e.originalRecord.get("isActive")
      : null;
  // Only gate the true -> false transition (the explicit Free Table release).
  if (newActive === false && oldActive !== false) {
    const gid = e.record.get("tableGroup");
    const tn = e.record.get("tableNumber");
    let group = null;
    try {
      group = $app.findRecordById("table_groups", String(gid));
    } catch (_) {
      group = null;
    }
    let parent = null;
    if (group && group.getString("mode") === "shared") {
      // Shared Order: one parent order spans the whole group.
      try {
        parent = $app.findFirstRecordByFilter(
          "waiter_orders",
          "tableGroup = {:gid}",
          { gid: String(gid) },
        );
      } catch (_) {
        parent = null;
      }
    } else if (tn) {
      // Linked Orders: the parent order for this specific table.
      try {
        parent = $app.findFirstRecordByFilter(
          "waiter_orders",
          "tableNumber = {:tn} && tableGroup = {:gid}",
          { tn: String(tn), gid: String(gid) },
        );
      } catch (_) {
        parent = null;
      }
    }
    if (!parent || !isOrderFullyCompleted($app, parent)) {
      throw new BadRequestError(
        "Cannot free table " + (tn || "") + ". Its order must be ended, paid, and fiscalized (bill signed) first.",
      );
    }
  }
  e.next();
}, "table_group_members");

// C. table_groups update (status -> "closed") — reject closing a combination
//    before every member's order is fully completed.
onRecordUpdateRequest((e) => {
  const newStatus = e.record.getString("status");
  const oldStatus =
    e.originalRecord && e.originalRecord.getString
      ? e.originalRecord.getString("status")
      : null;
  if (newStatus === "closed" && oldStatus !== "closed") {
    const gid = e.record.id;
    let parents = [];
    try {
      parents = $app.findRecordsByFilter(
        "waiter_orders",
        "tableGroup = {:gid}",
        "",
        0,
        0,
        { gid },
      );
    } catch (_) {
      parents = [];
    }
    for (const p of parents) {
      if (!isOrderFullyCompleted($app, p)) {
        throw new BadRequestError(
          "Cannot close this table combination. Order " + p.getString("orderId") + " must be ended, paid, and fiscalized (bill signed) first.",
        );
      }
    }
  }
  e.next();
}, "table_groups");
