/// <reference path="../pb_data/types.d.ts" />

// Table-combination architecture (step 2 of 3): normalized table membership
// — `table_group_members`.
//
// One row per physical table that belongs to a `table_groups` combination.
// This is the source of truth for which tables are in which combination —
// stored as normalized rows (NOT a JSON array) so a real SQLite partial
// UNIQUE index can enforce the invariant: a table number may appear in at
// most ONE active combination at a time.
//
// `isActive` is a denormalized mirror of the parent group's
// status === "active". SQLite partial indexes cannot reference a column in
// another table, so the parent status is mirrored here and the partial
// UNIQUE index is built on this local boolean. The companion hook
// (pb_hooks/table-groups-sync.pb.js) keeps `isActive` in sync:
//   - on member create, isActive is set from the parent group's status;
//   - on parent group status change, all member rows are updated.
//
// When a group is closed (status -> "closed"), the hook flips every member's
// isActive to false, which removes those table numbers from the unique
// constraint and frees them to join a future combination. Historical member
// rows are retained for audit.
//
// This collection is purely additive. Existing single-table orders never
// create rows here, so the new index cannot conflict with the existing
// `idx_waiter_orders_open_table` occupancy protection — the two constraints
// are independent and both remain enforced.

migrate(
  (app) => {
    const tableGroups = app.findCollectionByNameOrId("table_groups");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("table_group_members");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "table_group_members",
        // Staff-operational: kitchen / waiter / admin can read; waiters and
        // admins can create members; admin-only delete.
        listRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"',
        viewRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"',
        createRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users"',
        updateRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          // tableGroup — the combination this table belongs to.
          {
            name: "tableGroup",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: tableGroups.id,
            cascadeDelete: true,
          },
          // tableNumber — the physical table identifier (matches
          // table_configurations.name). Required so the unique index is
          // meaningful.
          { name: "tableNumber", type: "text", required: true, max: 100 },
          // tableId — optional reference to the table_configurations record
          // id, kept for convenience lookups.
          { name: "tableId", type: "text", max: 20 },
          // isActive — denormalized mirror of parent group status === active.
          // Left optional (bool) so the default false is a valid value.
          { name: "isActive", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          // A table number may belong to at most one ACTIVE combination at a
          // time. Closed/inactive member rows are excluded so table numbers
          // can be reused in future combinations.
          "CREATE UNIQUE INDEX idx_tgm_active_table ON table_group_members (tableNumber) WHERE isActive = 1",
          // Fast lookup of all members of a given group.
          "CREATE INDEX idx_tgm_group ON table_group_members (tableGroup)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("table_group_members");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
