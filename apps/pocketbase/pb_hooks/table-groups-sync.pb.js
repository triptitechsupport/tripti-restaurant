/// <reference path="../pb_data/types.d.ts" />

// Table-combination architecture: keep `table_group_members.isActive` in sync
// with the parent `table_groups` status.
//
// The partial UNIQUE index `idx_tgm_active_table` on table_group_members
// (tableNumber) WHERE isActive = 1 enforces "a table may belong to at most
// one ACTIVE combination". Because SQLite partial indexes cannot reference a
// column in another table, `isActive` is a denormalized mirror of the parent
// group's status === "active". This hook maintains that mirror so the index
// stays accurate:
//
//   1. On member create — set isActive from the parent group's current
//      status, so a member added to an already-closed group does not
//      accidentally occupy its table number under the unique constraint.
//
//   2. On parent group update — when status changes, flip every member's
//      isActive to match. Closing the group (status -> "closed") releases
//      all member tables from the active constraint, freeing them for future
//      combinations while retaining the historical member rows for audit.
//
// This hook is additive and dormant until the future Combine Tables UI
// creates table_groups / table_group_members records. It does not touch
// waiter_orders, kitchen_orders, Order ID / KOT generation, occupancy,
// payment, End Order, Free Table, KDS, Admin, Waiter, or printing.

// 1. Member create — derive isActive from the parent group's status.
onRecordCreateRequest((e) => {
  const groupId = e.record.get("tableGroup");
  if (!groupId) {
    e.next();
    return;
  }
  try {
    const group = $app.findRecordById("table_groups", groupId);
    e.record.set("isActive", group.getString("status") === "active");
  } catch (_) {
    // If the parent group cannot be resolved, leave isActive unset (false-ish)
    // so the row never participates in the active-table unique constraint.
  }
  e.next();
}, "table_group_members");

// 2. Parent group update — propagate status changes to all member rows.
onRecordUpdateRequest((e) => {
  const newStatus = e.record.getString("status");
  const oldStatus =
    e.originalRecord && e.originalRecord.getString
      ? e.originalRecord.getString("status")
      : null;
  if (newStatus === oldStatus) {
    e.next();
    return;
  }
  const groupId = e.record.id;
  const active = newStatus === "active";
  try {
    const members = $app.findRecordsByFilter(
      "table_group_members",
      'tableGroup = {:groupId}',
      '',
      0,
      0,
      { groupId },
    );
    for (const m of members) {
      m.set("isActive", active);
      $app.save(m);
    }
  } catch (err) {
    console.log("table-groups-sync: member update skipped:", String(err));
  }
  e.next();
}, "table_groups");
