/// <reference path="../pb_data/types.d.ts" />

// Existing combined-table KOTs created before tableLabel was persisted still
// show only the primary table on the KDS and kitchen print. Copy the group
// label onto those tickets. Payment totals, items, and statuses are untouched.
migrate(
  (app) => {
    let kots = [];
    try {
      kots = app.findRecordsByFilter("kitchen_orders", "id != ''", "", 0, 0);
    } catch (_) {
      kots = [];
    }
    for (const kot of kots) {
      const current = kot.getString("tableLabel") || "";
      if (current.indexOf("+") !== -1) continue;
      const parentId = kot.get("parentOrder");
      if (!parentId) continue;
      let parent;
      try {
        parent = app.findRecordById("waiter_orders", parentId);
      } catch (_) {
        continue;
      }
      const gid = parent.get("tableGroup");
      if (!gid) continue;
      let group;
      try {
        group = app.findRecordById("table_groups", gid);
      } catch (_) {
        continue;
      }
      const label = group.getString("label") || "";
      if (label.indexOf("+") === -1) continue;
      kot.set("tableLabel", label);
      app.save(kot);
    }
  },
  (app) => {
    // Display-only backfill. Leave labels in place on rollback so reprints
    // of historical combined tickets do not collapse to one table again.
  },
);
