// apps/pocketbase/pb_migrations/1787696802_cleanup_stale_combined_tables_t1_t4.js
/// <reference path="../pb_data/types.d.ts" />

// One-time cleanup: deactivate stale active table_group_members for T1–T4
// (leftover test data from earlier combine-table operations) and for any
// members whose parent table_groups record is already closed, then close
// every table_groups record that has status='active' but no active members.
// Previous cleanup migrations (1787664000, 1787664233) already applied and
// will not re-run, so this forward migration handles the fresh stale data
// created by later combine-table testing.

migrate(
  (app) => {
    const targetTables = ["T1", "T2", "T3", "T4"];

    // Load all table_group_members (avoid boolean filter syntax issues by
    // filtering isActive in JS).
    let allMembers = [];
    try {
      allMembers = app.findRecordsByFilter("table_group_members", "id != ''");
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }

    // Load all table_groups once.
    let allGroups = [];
    try {
      allGroups = app.findRecordsByFilter("table_groups", "id != ''");
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }

    const groupStatusById = {};
    for (const g of allGroups) {
      groupStatusById[g.id] = g.getString("status");
    }

    // Step 1: Deactivate active members that are stale:
    //   - members of T1–T4 (user-reported stale test data), OR
    //   - members whose parent table_groups record is already closed.
    for (const m of allMembers) {
      if (!m.getBool("isActive")) continue;
      const tableNumber = m.getString("tableNumber");
      const groupId = m.getString("tableGroup");
      const groupClosed = groupStatusById[groupId] === "closed";
      if (targetTables.includes(tableNumber) || groupClosed) {
        m.set("isActive", false);
        app.save(m);
      }
    }

    // Step 2: Recompute active member counts after the deactivations and
    // close every table_groups record that is still 'active' but has zero
    // active members remaining.
    let updatedMembers = [];
    try {
      updatedMembers = app.findRecordsByFilter(
        "table_group_members",
        "id != ''",
      );
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }

    const activeCountByGroup = {};
    for (const m of updatedMembers) {
      if (m.getBool("isActive")) {
        const gid = m.getString("tableGroup");
        activeCountByGroup[gid] = (activeCountByGroup[gid] || 0) + 1;
      }
    }

    for (const g of allGroups) {
      if (g.getString("status") !== "active") continue;
      const count = activeCountByGroup[g.id] || 0;
      if (count === 0) {
        g.set("status", "closed");
        app.save(g);
      }
    }
  },
  (app) => {
    // One-way cleanup of stale test data; rollback is manual.
  },
);
