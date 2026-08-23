/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.otp.enabled = true;
  collection.otp.duration = 300;
  collection.otp.length = 8;

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");

    collection.otp.enabled = false;

    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})