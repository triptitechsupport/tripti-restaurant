/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("staff_messages");
    } catch (_) {
      const staffRule =
        '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "kds_users" || @request.auth.collectionName = "waiter_users"';
      collection = new Collection({
        type: "base",
        name: "staff_messages",
        listRule: staffRule,
        viewRule: staffRule,
        createRule: staffRule,
        updateRule: staffRule,
        deleteRule: '@request.auth.collectionName = "admin_users"',
        fields: [
          {
            name: "senderRole",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["admin", "waiter", "kds"],
          },
          {
            name: "recipientRole",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["admin", "waiter", "kds"],
          },
          { name: "senderName", type: "text", max: 100 },
          { name: "content", type: "text", required: true, max: 2000 },
          { name: "read", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_staff_messages_pair ON staff_messages (senderRole, recipientRole)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("staff_messages");
      app.delete(collection);
    } catch (_) {
      // already gone
    }
  }
);
