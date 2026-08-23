/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Create restaurant_hours collection (public read, admin write)
    let hoursCol;
    try {
      hoursCol = app.findCollectionByNameOrId("restaurant_hours");
    } catch (_) {
      hoursCol = new Collection({
        type: "base",
        name: "restaurant_hours",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.collectionName = \"admin_users\"",
        updateRule: "@request.auth.collectionName = \"admin_users\"",
        deleteRule: "@request.auth.collectionName = \"admin_users\"",
        fields: [
          { name: "closedWeekday", type: "number", min: 0, max: 6 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(hoursCol);
    }

    // Seed default record (Wednesday = 3) if none exists
    const existing = app.findRecordsByFilter("restaurant_hours", "id != ''", "", 1, 0);
    if (!existing || existing.length === 0) {
      const savedHours = app.findCollectionByNameOrId("restaurant_hours");
      const record = new Record(savedHours);
      record.set("closedWeekday", 3);
      app.save(record);
    }

    // 2. Update closed_dates to allow public read
    const closedDates = app.findCollectionByNameOrId("closed_dates");
    closedDates.listRule = "";
    closedDates.viewRule = "";
    app.save(closedDates);
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("restaurant_hours");
      app.delete(col);
    } catch (_) {}

    try {
      const closedDates = app.findCollectionByNameOrId("closed_dates");
      closedDates.listRule = "@request.auth.collectionName = \"admin_users\"";
      closedDates.viewRule = "@request.auth.collectionName = \"admin_users\"";
      app.save(closedDates);
    } catch (_) {}
  }
);
