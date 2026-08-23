/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("otps");
  const field = collection.fields.getByName("otp_code");
  field.pattern = "^[0-9]{6}$";
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("otps");
  const field = collection.fields.getByName("otp_code");
  if (!field) { console.log("Field not found, skipping revert"); return; }
  field.pattern = "";
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection or field not found, skipping revert");
      return;
    }
    throw e;
  }
})