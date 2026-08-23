/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("menu_items");

  const existing = collection.fields.getByName("allergens");
  if (existing) {
    if (existing.type === "select") {
      return; // field already exists with correct type, skip
    }
    collection.fields.removeByName("allergens"); // exists with wrong type, remove first
  }

  collection.fields.add(new SelectField({
    name: "allergens",
    required: false,
    values: ["A", "B", "C", "D", "E", "F", "G", "H", "L", "M", "N", "O", "P", "R"],
    maxSelect: 14
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("menu_items");
    collection.fields.removeByName("allergens");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})