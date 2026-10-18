/// <reference path="../pb_data/types.d.ts" />

// One-time cleanup: deactivate stale table_group_members rows that are still
// marked isActive=true even though their parent table_groups record is closed
// (status='closed') or the parent waiter_orders record has been freed
// (freed=true). This is test-data residue from before the SDK cleanup fix
// (releaseTableFromCombination) began deactivating members directly.
//
// The code fix ensures new orders won't leave stale active members; this
// migration clears the leftover rows so tables like T2 stop showing
// "COMBINED" in the selection dropdown.

migrate(
  (app) => {
    // Load all table_groups into a map for quick status lookup.
    const groups = app.findAllRecords("table_groups");
    const groupById = {};
    for (const g of groups) {
      groupById[g.id] = g;
    }

    // Load all waiter_orders that reference a tableGroup, map group id -> any
    // freed order exists. A group is considered "freed" if any parent order
    // tied to it has freed=true.
    const freedGroupIds = {};
    let orders = [];
    try {
      orders = app.findRecordsByFilter("waiter_orders", "tableGroup != ''");
    } catch (e) {
      if (!e.message || !e.message.includes("no rows in result set")) {
        // tableGroup column may be empty/missing filter results — treat as
        // no orders, continue with group-status-only cleanup.
      }
      orders = [];
    }
    for (const o of orders) {
      const tg = o.get("tableGroup");
      if (tg && o.getBool("freed") === true) {
        freedGroupIds[tg] = true;
      }
    }

    // Iterate all table_group_members and deactivate stale active ones.
    const members = app.findAllRecords("table_group_members");
    let deactivated = 0;

    for (const m of members) {
      if (m.getBool("isActive") !== true) continue;

      const tgId = m.get("tableGroup");
      const group = tgId ? groupById[tgId] : null;

      const groupClosed = group && group.getString("status") === "closed";
      const groupFreed = !!freedGroupIds[tgId];

      if (groupClosed || groupFreed) {
        m.set("isActive", false);
        app.save(m);
        deactivated++;
      }
    }

    console.log(
      "[cleanup_stale_table_group_members] deactivated " +
        deactivated +
        " stale active member row(s).",
    );
  },
  (app) => {
    // One-way data cleanup; rollback is manual. Re-activating stale test
    // rows would reintroduce the bug, so no automatic down.
  },
);
