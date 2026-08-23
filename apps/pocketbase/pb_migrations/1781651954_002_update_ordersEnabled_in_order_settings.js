/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("order_settings");
  const field = collection.fields.getByName("ordersEnabled");
  field.required = false;
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("order_settings");
  const field = collection.fields.getByName("ordersEnabled");
  if (!field) { console.log("Field not found, skipping revert"); return; }
  field.required = true;
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection or field not found, skipping revert");
      return;
    }
    throw e;
  }
})