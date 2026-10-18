/// <reference path="../pb_data/types.d.ts" />

// Add a `print_order` number field to the `categories` collection so the
// admin can control the sequence in which categories appear on a printed
// Kitchen Order Ticket (KOT). This is independent of `display_order`
// (which controls the public menu / waiter ordering UI) — the kitchen
// print sequence commonly differs from the menu browse sequence
// (e.g. Appetizers first, Main Courses next, Bread & Staples after).
//
// Existing rows are backfilled from their `display_order` value so the
// initial print order matches the previous first-appearance behaviour as
// closely as possible. Rows with no `display_order` get a large value so
// they sort last (sensible handling for categories without an explicit
// order). The KOT printer treats a missing/null print_order as "last,
// sorted alphabetically".

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("categories");

    // Add the print_order field if it is not already present.
    if (!collection.fields.getByName("print_order")) {
      collection.fields.add(new NumberField({ name: "print_order" }));
      app.save(collection);
    }

    // Backfill: copy display_order -> print_order for every row that has a
    // display_order but no print_order. Rows without display_order get a
    // large sentinel so they sort after all explicitly-ordered categories.
    const rows = app.findAllRecords("categories");
    let maxOrder = 0;
    rows.forEach((r) => {
      const d = r.get("display_order");
      if (typeof d === "number" && !Number.isNaN(d)) {
        maxOrder = Math.max(maxOrder, d);
      }
    });
    const fallbackBase = maxOrder + 1000;
    rows.forEach((r) => {
      const existing = r.get("print_order");
      if (typeof existing === "number" && !Number.isNaN(existing)) return;
      const d = r.get("display_order");
      if (typeof d === "number" && !Number.isNaN(d)) {
        r.set("print_order", d);
      } else {
        r.set("print_order", fallbackBase);
      }
      app.save(r);
    });
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("categories");
      const field = collection.fields.getByName("print_order");
      if (field) {
        collection.fields.removeByName("print_order");
        app.save(collection);
      }
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        console.log("categories collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
