/// <reference path="../pb_data/types.d.ts" />

// One-time cleanup: purge ALL order-related data so the app can start fresh.
// Deletes from: order_items, kitchen_orders, payments, table_group_members,
// table_groups, waiter_orders (plus kot_counters which depends on kitchen_orders).
// Master/menu/auth data is left intact.
migrate(
  (app) => {
    const deleteAll = (collectionName) => {
      // Skip collections that don't exist in this schema (e.g. order_items,
      // payments — items are stored as JSON on kitchen_orders/waiter_orders).
      try {
        app.findCollectionByNameOrId(collectionName);
      } catch (_) {
        console.log(`[purge] ${collectionName}: collection not found, skipping`);
        return 0;
      }

      let records;
      try {
        records = app.findRecordsByFilter(collectionName, "id != ''");
      } catch (e) {
        if (e.message && e.message.includes("no rows in result set")) {
          console.log(`[purge] ${collectionName}: already empty`);
          return 0;
        }
        throw e;
      }

      let count = 0;
      for (const r of records) {
        app.delete(r);
        count++;
      }
      console.log(`[purge] ${collectionName}: deleted ${count} records`);
      return count;
    };

    // Delete in dependency order to avoid foreign-key / cascade issues.
    deleteAll("order_items");        // no dependencies (may not exist)
    deleteAll("kot_counters");       // depends on kitchen_orders (parentOrder)
    deleteAll("kitchen_orders");     // depends on waiter_orders (parentOrder)
    deleteAll("payments");           // depends on waiter_orders (may not exist)
    deleteAll("table_group_members"); // depends on table_groups
    deleteAll("table_groups");       // depends on waiter_orders
    deleteAll("waiter_orders");      // parent table — last
  },
  (app) => {
    // Cannot recreate the deleted rows — original data is gone.
  },
);
