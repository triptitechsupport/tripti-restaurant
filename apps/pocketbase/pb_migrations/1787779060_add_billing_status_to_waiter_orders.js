/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_orders");

    // Idempotent: skip if the field already exists with the right type.
    const existing = collection.fields.getByName("billingStatus");
    if (existing) {
      if (existing.type === "select") return; // correct type already, skip
      collection.fields.removeByName("billingStatus"); // wrong type, replace
    }

    collection.fields.add(
      new SelectField({
        name: "billingStatus",
        required: false,
        maxSelect: 1,
        values: ["not_completed", "completed"],
      }),
    );
    app.save(collection);

    // Backfill every existing waiter_orders row to the default billing
    // status so the Admin Billing tab shows "Not Completed" for all orders
    // created before this field existed.
    const records = app.findRecordsByFilter(
      "waiter_orders",
      "billingStatus = null || billingStatus = ''",
    );
    records.forEach((rec) => {
      rec.set("billingStatus", "not_completed");
      app.save(rec);
    });
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("waiter_orders");
      collection.fields.removeByName("billingStatus");
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
