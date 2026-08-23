/// <reference path="../pb_data/types.d.ts" />

// Linked Orders occupancy enforcement (Phase 2).
//
// The existing partial UNIQUE indexes enforce the within-constraint rules:
//   • idx_waiter_orders_open_table — at most one OPEN waiter_orders order
//     per table (one-open-order-per-table protection, NOT weakened).
//   • idx_tgm_active_table — a table number may appear in at most ONE
//     ACTIVE table_group_members combination at a time.
//
// This hook adds the two CROSS-constraint rules those indexes alone cannot
// express, so direct API calls and simultaneous submissions cannot bypass
// them:
//
//   1. waiter_orders create — a STANDALONE order (tableGroup empty/null)
//      may NOT be opened on a table that is already a member of an ACTIVE
//      table_group_members combination. A GROUP order (tableGroup set) is
//      allowed — that is the Linked Orders flow — but only when the table
//      is an ACTIVE member of THAT exact group.
//
//   2. table_group_members create — a table that already has an OPEN
//      STANDALONE waiter_orders order (tableGroup empty/null) may NOT be
//      added to a combination. (A table with an open GROUP order cannot be
//      added to a second combination because idx_tgm_active_table already
//      blocks a second active membership.)
//
// Together with the existing indexes this guarantees: a table is either
// free, has one standalone open order, or belongs to exactly one active
// combination (with its own linked open order) — never more than one of
// these at once.

// 1. waiter_orders create — standalone vs group order occupancy rules.
onRecordCreateRequest((e) => {
  const tableNumber = e.record.get("tableNumber");
  if (!tableNumber || String(tableNumber).trim() === "") {
    // The required-field check is enforced by the collection schema; let it
    // surface the validation error rather than duplicating it here.
    e.next();
    return;
  }

  const groupId = e.record.get("tableGroup");
  const tn = String(tableNumber);

  if (!groupId) {
    // Standalone order: reject if the table is in an ACTIVE combination.
    let activeMember = null;
    try {
      activeMember = $app.findFirstRecordByFilter(
        "table_group_members",
        "tableNumber = {:tn} && isActive = true",
        { tn },
      );
    } catch (_) {
      activeMember = null;
    }
    if (activeMember) {
      throw new BadRequestError(
        "Table " + tn + " is part of an active table combination. Close the combination before opening a standalone order.",
      );
    }
  } else {
    // Group order: the table must be an ACTIVE member of THAT group.
    let member = null;
    try {
      member = $app.findFirstRecordByFilter(
        "table_group_members",
        "tableGroup = {:gid} && tableNumber = {:tn} && isActive = true",
        { gid: String(groupId), tn },
      );
    } catch (_) {
      member = null;
    }
    if (!member) {
      throw new BadRequestError(
        "Table " + tn + " is not an active member of the referenced combination. Cannot create a linked order for it.",
      );
    }

    // Shared Order: only ONE open parent order may exist per shared group.
    // A Shared Order spans all member tables under a single parent Order /
    // Order ID / KOT stream / bill, so a second open parent for the same
    // shared group is rejected. Linked Orders intentionally allow multiple
    // parents per group (one per member table), so the check is scoped to
    // mode = "shared" only.
    let group = null;
    try {
      group = $app.findRecordById("table_groups", String(groupId));
    } catch (_) {
      group = null;
    }
    if (group && group.getString("mode") === "shared") {
      let existing = null;
      try {
        existing = $app.findFirstRecordByFilter(
          "waiter_orders",
          "tableGroup = {:gid} && orderStatus = 'open'",
          { gid: String(groupId) },
        );
      } catch (_) {
        existing = null;
      }
      if (existing) {
        throw new BadRequestError(
          "This shared order already has an open parent order (" +
            existing.getString("orderId") +
            "). Add items to the existing order instead of creating a new one.",
        );
      }
    }
  }

  e.next();
}, "waiter_orders");

// 2. table_group_members create — reject if the table already has an open
//    standalone order.
onRecordCreateRequest((e) => {
  const tableNumber = e.record.get("tableNumber");
  if (!tableNumber || String(tableNumber).trim() === "") {
    e.next();
    return;
  }
  const tn = String(tableNumber);

  let openStandalone = null;
  try {
    openStandalone = $app.findFirstRecordByFilter(
      "waiter_orders",
      "tableNumber = {:tn} && orderStatus = 'open' && (tableGroup = null || tableGroup = '')",
      { tn },
    );
  } catch (_) {
    openStandalone = null;
  }
  if (openStandalone) {
    throw new BadRequestError(
      "Table " + tn + " already has an open order and cannot be added to a combination.",
    );
  }

  e.next();
}, "table_group_members");
