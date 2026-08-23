/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("table_reservations");

  const existing = collection.fields.getByName("numberOfKidsUnder4");
  if (existing) {
    if (existing.type === "number") {
      return; // field already exists with correct type, skip
    }
    collection.fields.removeByName("numberOfKidsUnder4"); // exists with wrong type, remove first
  }

  collection.fields.add(new NumberField({
    name: "numberOfKidsUnder4",
    required: false,
    min: 0
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("table_reservations");
    collection.fields.removeByName("numberOfKidsUnder4");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})