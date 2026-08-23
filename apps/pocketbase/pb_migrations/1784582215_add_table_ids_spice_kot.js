/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---- table_configurations: add tableId + isReserved ----
    const tables = app.findCollectionByNameOrId("table_configurations");

    if (!tables.fields.getByName("tableId")) {
      tables.fields.add(
        new TextField({ name: "tableId", required: false, max: 20 })
      );
    }
    if (!tables.fields.getByName("isReserved")) {
      tables.fields.add(new BoolField({ name: "isReserved", required: false }));
    }
    if (!tables.fields.getByName("reservedInfo")) {
      tables.fields.add(
        new TextField({ name: "reservedInfo", required: false, max: 200 })
      );
    }
    app.save(tables);

    // Backfill sequential unique IDs (T001, T002, ...) for tables missing one
    const existing = app.findRecordsByFilter(
      "table_configurations",
      "id != ''",
      "created",
      500,
      0
    );
    let counter = 1;
    for (const rec of existing) {
      if (!rec.get("tableId")) {
        rec.set("tableId", "T" + String(counter).padStart(3, "0"));
        app.save(rec);
      }
      counter++;
    }

    // ---- kitchen_orders: add tableId field ----
    const orders = app.findCollectionByNameOrId("kitchen_orders");
    if (!orders.fields.getByName("tableId")) {
      orders.fields.add(
        new TextField({ name: "tableId", required: false, max: 20 })
      );
    }
    app.save(orders);
  },
  (app) => {
    try {
      const tables = app.findCollectionByNameOrId("table_configurations");
      tables.fields.removeByName("tableId");
      tables.fields.removeByName("isReserved");
      tables.fields.removeByName("reservedInfo");
      app.save(tables);
    } catch (_) { /* skip */ }
    try {
      const orders = app.findCollectionByNameOrId("kitchen_orders");
      orders.fields.removeByName("tableId");
      app.save(orders);
    } catch (_) { /* skip */ }
  }
);
