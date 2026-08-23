/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "notification_settings",
      // Publicly readable so the admin UI (and hook) can load it; only admins can write.
      listRule: "",
      viewRule: "",
      createRule: "@request.auth.collectionName = \"admin_users\"",
      updateRule: "@request.auth.collectionName = \"admin_users\"",
      deleteRule: "@request.auth.collectionName = \"admin_users\"",
      fields: [
        {
          name: "whatsappEnabled",
          type: "bool",
          required: false,
        },
        {
          name: "whatsappNumber",
          type: "text",
          required: false,
          max: 30,
        },
        {
          name: "whatsappApiKey",
          type: "text",
          required: false,
          max: 100,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("notification_settings");
    app.delete(collection);
  },
);
