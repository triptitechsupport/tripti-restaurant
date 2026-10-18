/// <reference path="../pb_data/types.d.ts" />

// Convert menu_items.category from a fixed `select` field to a free-text
// field so the dropdown can be sourced dynamically from the `categories`
// collection (admins can add categories without a schema change).
//
// The column data (string values) is preserved by snapshotting via raw SQL
// before the field is dropped, then writing the values back with a raw SQL
// UPDATE after the new text field is created. Raw SQL is used for the
// backfill (not app.save(record)) because some legacy menu_items rows have
// empty nameDE/nameEN values that would trip required-field validation on
// save — the category column itself is the only thing we need to restore.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("menu_items");

    // 1. Snapshot existing category values via the wrapper. Records are
    //    valid at this point (no schema change yet), so r.get("category")
    //    returns the stored select string reliably.
    const existing = app.findAllRecords(collection);
    const snapshot = {};
    existing.forEach((r) => {
      snapshot[r.id] = r.get("category") || "";
    });

    // 2. Remove the old select field (drops the column).
    collection.fields.removeByName("category");
    app.save(collection);

    // 3. Add a text field with the same name (creates a new empty column).
    collection.fields.add(
      new TextField({ name: "category", required: true, max: 100 }),
    );
    app.save(collection);

    // 4. Restore the saved category values via a raw SQL UPDATE. Raw SQL is
    //    used instead of app.save(record) because some legacy menu_items
    //    rows have empty nameDE/nameEN values that would trip required-field
    //    validation on save; the category column is the only thing we need
    //    to restore, and a direct UPDATE bypasses per-record validation.
    const db = app.db();
    Object.keys(snapshot).forEach((id) => {
      db.newQuery("UPDATE menu_items SET category = {:cat} WHERE id = {:id}")
        .bind({ cat: snapshot[id], id: id })
        .execute();
    });
  },
  (app) => {
    // Best-effort revert: turn the text field back into a select with the
    // original allowed values. The column data (strings) is preserved, so
    // only the field definition needs swapping back.
    const collection = app.findCollectionByNameOrId("menu_items");
    collection.fields.removeByName("category");
    app.save(collection);
    collection.fields.add(
      new SelectField({
        name: "category",
        required: true,
        maxSelect: 1,
        values: [
          "Breakfast",
          "Appetizers",
          "Beverages",
          "Main Courses",
          "Snacks",
          "Desserts",
          "Sides & Accompaniments",
          "Kids Menu",
        ],
      }),
    );
    app.save(collection);
  },
);
