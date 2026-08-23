/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("guests");
  collection.indexes = collection.indexes.filter(idx => !idx.includes("idx_email_pbc_185270619"));
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("guests");
  collection.indexes.push("CREATE UNIQUE INDEX `idx_email_pbc_185270619` ON `guests` (`email`) WHERE `email` != ''");
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})