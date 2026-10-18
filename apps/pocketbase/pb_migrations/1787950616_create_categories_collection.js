/// <reference path="../pb_data/types.d.ts" />

// Create a dynamic `categories` collection and seed it with the existing
// hard-coded menu categories. The menu_items.category field is converted to a
// free-text field (see companion migration) whose dropdown options are sourced
// from this collection, so admins can add new categories without a schema
// change. Reads are public (the public menu / waiter views resolve category
// names from here); writes are admin-only.

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("categories");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "categories",
        listRule: "",
        viewRule: "",
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          { name: "name", type: "text", required: true, max: 100 },
          { name: "name_de", type: "text", required: true, max: 100 },
          { name: "description", type: "text", max: 500 },
          { name: "display_order", type: "number" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }

    // Seed the existing hard-coded categories (idempotent — skip names that
    // already exist so re-runs / preview+publish don't duplicate).
    const seeds = [
      { name: "Breakfast", name_de: "Frühstück", display_order: 1 },
      { name: "Appetizers", name_de: "Vorspeisen", display_order: 2 },
      { name: "Main Courses", name_de: "Hauptgerichte", display_order: 3 },
      { name: "Sides & Accompaniments", name_de: "Beilagen & Beigaben", display_order: 4 },
      { name: "Snacks", name_de: "Snacks", display_order: 5 },
      { name: "Desserts", name_de: "Desserts", display_order: 6 },
      { name: "Beverages", name_de: "Getränke", display_order: 7 },
      { name: "Kids Menu", name_de: "Kindermenü", display_order: 8 },
    ];

    for (const data of seeds) {
      let exists = false;
      try {
        app.findFirstRecordByFilter(
          "categories",
          `name = ${JSON.stringify(data.name)}`,
        );
        exists = true;
      } catch (_) {
        exists = false;
      }
      if (exists) continue;

      const r = new Record(collection);
      r.set("name", data.name);
      r.set("name_de", data.name_de);
      r.set("display_order", data.display_order);
      app.save(r);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("categories");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        console.log("categories collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
