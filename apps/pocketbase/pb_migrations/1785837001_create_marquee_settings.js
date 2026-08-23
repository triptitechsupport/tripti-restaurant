/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "marquee_settings",
      listRule: "",
      viewRule: "",
      createRule: "@request.auth.collectionName = \"admin_users\"",
      updateRule: "@request.auth.collectionName = \"admin_users\"",
      deleteRule: "@request.auth.collectionName = \"admin_users\"",
      fields: [
        { name: "enabled", type: "bool" },
        { name: "text", type: "text", max: 1000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("marquee_settings");
    app.delete(collection);
  },
);
