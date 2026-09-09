/// <reference path="../pb_data/types.d.ts" />

// Adds fields needed by the Admin Gantt/timeline chart:
//   - endTime (text, "HH:MM") so reservation blocks have a duration that can
//     be resized. Backfilled from reservationTime + 90 min for existing rows.
//   - assignedTables (json array of table ids) so a large/combined party can
//     occupy multiple adjacent tables as one block. The legacy single
//     `assignedTable` field is preserved for backward compatibility.
// Also adds "Completed" to the status select so the Gantt can mark a
// reservation as fulfilled (seated + finished). Existing statuses are kept.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("table_reservations");

    // endTime text field (optional; backfilled below)
    if (!collection.fields.getByName("endTime")) {
      collection.fields.add(new TextField({ name: "endTime", max: 10 }));
    }

    // assignedTables json field (optional array of table ids)
    if (!collection.fields.getByName("assignedTables")) {
      collection.fields.add(new JSONField({ name: "assignedTables", maxSize: 2000 }));
    }

    // Add "Completed" to the status select values (additive, preserves existing)
    const statusField = collection.fields.getByName("status");
    if (statusField) {
      const vals = statusField.values || [];
      if (vals.indexOf("Completed") === -1) {
        statusField.values = ["Pending", "Approved", "Declined", "Completed"];
      }
    }

    app.save(collection);

    // Backfill endTime for existing rows that have a reservationTime but no endTime.
    const records = app.findRecordsByFilter(
      "table_reservations",
      "reservationTime != '' && endTime = ''",
    );
    for (const rec of records) {
      const t = rec.get("reservationTime") || "";
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) {
        // Unknown format — default to 90 min after 11:00
        rec.set("endTime", "12:30");
      } else {
        let mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + 90;
        // Wrap within a day; clamp to 21:00 max serving window end
        if (mins > 21 * 60) mins = 21 * 60;
        const hh = Math.floor(mins / 60);
        const mm = mins % 60;
        rec.set(
          "endTime",
          (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm,
        );
      }
      app.save(rec);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("table_reservations");

    const endTimeField = collection.fields.getByName("endTime");
    if (endTimeField) collection.fields.removeByName("endTime");

    const assignedTablesField = collection.fields.getByName("assignedTables");
    if (assignedTablesField) collection.fields.removeByName("assignedTables");

    const statusField = collection.fields.getByName("status");
    if (statusField) {
      statusField.values = ["Pending", "Approved", "Declined"];
    }

    app.save(collection);
  },
);
