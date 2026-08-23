/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("menu_items");
  const field = collection.fields.getByName("category");
  field.values = ["Breakfast", "Appetizers", "Beverages", "Main Courses", "Snacks", "Desserts", "Sides & Accompaniments", "Kids Menu"];
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("menu_items");
  const field = collection.fields.getByName("category");
  if (!field) { console.log("Field not found, skipping revert"); return; }
  field.values = ["Appetizers", "Main Courses", "Breads", "Desserts", "Beverages"];
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection or field not found, skipping revert");
      return;
    }
    throw e;
  }
})