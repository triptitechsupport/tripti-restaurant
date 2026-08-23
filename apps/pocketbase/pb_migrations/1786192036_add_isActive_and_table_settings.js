/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---- 1. Add isActive flag to table_configurations ----
    const tables = app.findCollectionByNameOrId("table_configurations");

    if (!tables.fields.getByName("isActive")) {
      tables.fields.add(
        new BoolField({ name: "isActive", required: false })
      );
    }
    // Allow waiters & KDS to read table configurations so the waiter
    // order-placement selector can list active tables.
    tables.listRule =
      '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"';
    tables.viewRule =
      '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"';
    app.save(tables);

    // Backfill isActive = true for every existing table (default active set).
    const existing = app.findRecordsByFilter(
      "table_configurations",
      "id != ''",
      "created",
      500,
      0
    );
    for (const rec of existing) {
      if (rec.get("isActive") === undefined || rec.get("isActive") === null) {
        rec.set("isActive", true);
        app.save(rec);
      }
    }

    // ---- 2. Create table_settings collection with maxTableNumber ----
    let tableSettings;
    try {
      tableSettings = app.findCollectionByNameOrId("table_settings");
    } catch (_) {
      tableSettings = new Collection({
        type: "base",
        name: "table_settings",
        listRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"',
        viewRule:
          '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"',
        createRule: '@request.auth.collectionName = "admin_users"',
        updateRule: '@request.auth.collectionName = "admin_users"',
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          {
            name: "maxTableNumber",
            type: "number",
            required: true,
            min: 1,
            onlyInt: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(tableSettings);
    }

    // Ensure the maxTableNumber field exists on the collection (idempotent).
    if (!tableSettings.fields.getByName("maxTableNumber")) {
      tableSettings.fields.add(
        new NumberField({
          name: "maxTableNumber",
          required: true,
          min: 1,
          onlyInt: true,
        })
      );
      app.save(tableSettings);
    }

    // Seed a default settings record (maxTableNumber = 9) if none exists.
    const STAFF_RULE =
      '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "waiter_users" || @request.auth.collectionName = "kds_users"';
    let seeded = app.findRecordsByFilter(
      "table_settings",
      "id != ''",
      "created",
      1,
      0
    );
    if (!seeded || seeded.length === 0) {
      const rec = new Record(tableSettings);
      rec.set("maxTableNumber", 9);
      app.save(rec);
    }
  },
  (app) => {
    try {
      const tables = app.findCollectionByNameOrId("table_configurations");
      if (tables.fields.getByName("isActive")) {
        tables.fields.removeByName("isActive");
      }
      // Restore original admin-only rules.
      tables.listRule = '@request.auth.collectionName = "admin_users"';
      tables.viewRule = '@request.auth.collectionName = "admin_users"';
      app.save(tables);
    } catch (_) { /* skip */ }

    try {
      const ts = app.findCollectionByNameOrId("table_settings");
      app.delete(ts);
    } catch (_) { /* skip */ }
  }
);
