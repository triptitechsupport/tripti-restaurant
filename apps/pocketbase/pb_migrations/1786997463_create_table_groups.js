/// <reference path="../pb_data/types.d.ts" />

// Table-combination architecture (step 1 of 3): the reusable combination
// concept — `table_groups`.
//
// This is the additive, backward-compatible foundation for the future
// "Combine Tables" feature. It is NOT exposed in any UI yet. Existing
// single-table order flow, Order ID / KOT suffix generation, occupancy
// protection, payment logic, End Order, Free Table, KDS, Admin, Waiter, and
// printing are completely untouched — this migration only creates a new,
// independent collection.
//
// A `table_groups` row represents one active combination of two or more
// physical tables. The `mode` field distinguishes the two future modes the
// architecture must support:
//   - "linked": each member table keeps its own parent Order / KOTs / bill;
//               the group only links them for display/coordination.
//   - "shared": one parent Order spans all member tables with a single bill;
//               individual order items may retain their originating table
//               number (stored inside the existing kitchen_orders.items JSON
//               array as an optional per-item field) for future item-level /
//               table-level payment settlement.
//
// `status` ("active" | "closed") is the group lifecycle marker. While
// "active", the member tables are considered in-use by this combination and
// the partial UNIQUE index on table_group_members (added in step 2) prevents
// any of those tables from joining a second active combination. Closing the
// group frees the tables.
//
// The actual table membership is stored as normalized rows in the companion
// `table_group_members` collection (step 2) — NOT as a JSON array — so a real
// SQL index can enforce the one-active-combination-per-table invariant.

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("table_groups");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "table_groups",
        // Staff-operational collection: kitchen / waiter / admin can read;
        // waiters and admins can create combinations; admin-only delete.
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
          // mode — distinguishes linked vs shared combination semantics.
          {
            name: "mode",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["linked", "shared"],
          },
          // status — group lifecycle. "active" while in use, "closed" once
          // released (frees the member tables for reuse).
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["active", "closed"],
          },
          // label — optional human-readable name, e.g. "Tables 5 + 6".
          { name: "label", type: "text", max: 200 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("table_groups");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
