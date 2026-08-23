/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "email_templates",
      // Public read so the admin email composer can load templates;
      // only admins can create/update.
      listRule: "",
      viewRule: "",
      createRule: "@request.auth.collectionName = \"admin_users\"",
      updateRule: "@request.auth.collectionName = \"admin_users\"",
      deleteRule: "@request.auth.collectionName = \"admin_users\"",
      fields: [
        { name: "approvedSubject", type: "text", required: false, max: 300 },
        { name: "approvedBody", type: "text", required: false, max: 10000 },
        { name: "declinedSubject", type: "text", required: false, max: 300 },
        { name: "declinedBody", type: "text", required: false, max: 10000 },
        { name: "pendingSubject", type: "text", required: false, max: 300 },
        { name: "pendingBody", type: "text", required: false, max: 10000 },
        { name: "restaurantPhone", type: "text", required: false, max: 50 },
        { name: "restaurantEmail", type: "text", required: false, max: 200 },
        { name: "restaurantWebsite", type: "text", required: false, max: 200 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("email_templates");
    app.delete(collection);
  },
);
