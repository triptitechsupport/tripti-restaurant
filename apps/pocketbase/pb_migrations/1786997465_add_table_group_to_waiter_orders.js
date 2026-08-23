/// <reference path="../pb_data/types.d.ts" />

// Table-combination architecture (step 3 of 3): optional link from a parent
// Order to its combination — adds `tableGroup` relation to `waiter_orders`.
//
// This optional relation connects a parent Order to a `table_groups`
// combination, enabling both future modes:
//   - Linked Orders: each member table's parent Order points to the same
//     table_groups row. Every table keeps its own Order / KOTs / bill; the
//     group only links them.
//   - Shared Order: the single parent Order spanning all member tables
//     points to the table_groups row.
//
// The field is OPTIONAL and defaults to null. All existing single-table
// Orders have no group, so their behavior is unchanged. The existing scalar
// `tableNumber` architecture remains the primary source of truth for normal
// orders and is NOT replaced — for a shared order, `tableNumber` may hold a
// representative/primary table while the full membership is read from
// `table_group_members`.
//
// cascadeDelete is intentionally FALSE: deleting a combination must never
// delete the member Orders. The existing waiter_orders <-> kitchen_orders
// parentOrder relationship, Order ID generation, KOT suffix generation,
// occupancy protection, payment fields, End Order, and Free Table are all
// untouched.

migrate(
  (app) => {
    const tableGroups = app.findCollectionByNameOrId("table_groups");
    const collection = app.findCollectionByNameOrId("waiter_orders");

    if (!collection.fields.getByName("tableGroup")) {
      collection.fields.add(
        new RelationField({
          name: "tableGroup",
          required: false,
          maxSelect: 1,
          minSelect: 0,
          collectionId: tableGroups.id,
          cascadeDelete: false,
        }),
      );
      app.save(collection);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");
    if (collection.fields.getByName("tableGroup")) {
      collection.fields.removeByName("tableGroup");
      app.save(collection);
    }
  },
);
