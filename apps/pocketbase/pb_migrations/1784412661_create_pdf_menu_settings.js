/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "pdf_menu_settings",
      listRule: "",
      viewRule: "",
      createRule: "@request.auth.collectionName = \"admin_users\"",
      updateRule: "@request.auth.collectionName = \"admin_users\"",
      deleteRule: "@request.auth.collectionName = \"admin_users\"",
      fields: [
        {
          name: "pdfMenuEnabled",
          type: "bool",
        },
        {
          name: "pdfMenuDE",
          type: "file",
          maxSelect: 1,
          maxSize: 20971520,
          mimeTypes: ["application/pdf"],
        },
        {
          name: "pdfMenuEN",
          type: "file",
          maxSelect: 1,
          maxSize: 20971520,
          mimeTypes: ["application/pdf"],
        },
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("pdf_menu_settings");
    app.delete(collection);
  },
);
