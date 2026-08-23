/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("staff_messages");

    // Add isAlert flag so quick-alert messages can be visually distinguished
    // from regular chat messages in the StaffChat panel.
    collection.fields.add(
      new Field({
        name: "isAlert",
        type: "bool",
      })
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("staff_messages");
    const field = collection.fields.getByName("isAlert");
    if (field) {
      collection.fields.remove(field.id);
      app.save(collection);
    }
  },
);
