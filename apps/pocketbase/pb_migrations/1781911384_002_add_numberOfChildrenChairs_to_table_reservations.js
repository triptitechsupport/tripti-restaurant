/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("table_reservations");

  const existing = collection.fields.getByName("numberOfChildrenChairs");
  if (existing) {
    if (existing.type === "number") {
      return; // field already exists with correct type, skip
    }
    collection.fields.removeByName("numberOfChildrenChairs"); // exists with wrong type, remove first
  }

  collection.fields.add(new NumberField({
    name: "numberOfChildrenChairs",
    required: false,
    min: 0
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("table_reservations");
    collection.fields.removeByName("numberOfChildrenChairs");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})