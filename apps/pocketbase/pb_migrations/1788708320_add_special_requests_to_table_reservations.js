/// <reference path="../pb_data/types.d.ts" />

// Add a `specialRequests` text field to the `table_reservations` collection.
//
// The public reservation form (TableReservationPage) collects the guest's
// "Zusätzliche Wünsche" (additional wishes) textarea under the
// `specialRequests` form key and submits it on create. Until now that field
// did not exist on the collection, so PocketBase silently dropped the value
// — the guest's special requests were never persisted. This migration adds
// the column so the submitted text is actually stored and available to the
// admin. The field is optional (not every reservation includes wishes) and
// capped at 250 chars to match the form's max length validation.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("table_reservations");

    if (!collection.fields.getByName("specialRequests")) {
      collection.fields.add(
        new TextField({ name: "specialRequests", required: false, max: 250 }),
      );
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("table_reservations");
      if (collection.fields.getByName("specialRequests")) {
        collection.fields.removeByName("specialRequests");
        app.save(collection);
      }
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        return;
      }
      throw e;
    }
  },
);
