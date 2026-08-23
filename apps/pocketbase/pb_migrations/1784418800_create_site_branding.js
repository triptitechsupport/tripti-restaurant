/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "site_branding",
      listRule: "",
      viewRule: "",
      createRule: "@request.auth.collectionName = \"admin_users\"",
      updateRule: "@request.auth.collectionName = \"admin_users\"",
      deleteRule: "@request.auth.collectionName = \"admin_users\"",
      fields: [
        {
          name: "logo",
          type: "file",
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/svg+xml",
            "image/gif",
          ],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("site_branding");
    app.delete(collection);
  },
);
