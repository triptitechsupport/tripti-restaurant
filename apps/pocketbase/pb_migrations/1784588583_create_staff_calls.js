/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("staff_calls");
    } catch (_) {
      const staffRule =
        '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"';
      collection = new Collection({
        type: "base",
        name: "staff_calls",
        listRule: staffRule,
        viewRule: staffRule,
        createRule: staffRule,
        updateRule: staffRule,
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          {
            name: "callerRole",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["admin", "waiter", "kds"],
          },
          {
            name: "calleeRole",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["admin", "waiter", "kds"],
          },
          { name: "callerName", type: "text", max: 100 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["ringing", "connected", "ended", "declined", "missed"],
          },
          { name: "offer", type: "json", maxSize: 200000 },
          { name: "answer", type: "json", maxSize: 200000 },
          { name: "durationSec", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_staff_calls_pair ON staff_calls (callerRole, calleeRole)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("staff_calls");
      app.delete(collection);
    } catch (_) {
      // already gone
    }
  }
);
