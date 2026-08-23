/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("feedback");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "feedback",
        // Public can read only approved feedback; admin can read all.
        listRule:
          "status = 'Approved' || @request.auth.collectionName = 'admin_users'",
        viewRule:
          "status = 'Approved' || @request.auth.collectionName = 'admin_users'",
        // Anyone (anonymous visitors) can submit feedback.
        createRule: "",
        // Only admin can change status / edit.
        updateRule: "@request.auth.collectionName = 'admin_users'",
        // Only admin can delete.
        deleteRule: "@request.auth.collectionName = 'admin_users'",
        fields: [
          { name: "name", type: "text", required: true, max: 200 },
          { name: "message", type: "text", required: true, max: 2000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["Pending", "Approved", "Declined"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("feedback");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("feedback collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
