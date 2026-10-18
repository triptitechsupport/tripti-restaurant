/// <reference path="../pb_data/types.d.ts" />

// Keeps admin password login open. A locked auth rule rejects every
// password, including a correct one, with the same message as a bad login.
// Does not change the admin password set by the earlier restore migration.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("admin_users");
    collection.authRule = "";
    collection.passwordAuth.enabled = true;
    if (!collection.passwordAuth.identityFields || collection.passwordAuth.identityFields.length === 0) {
      collection.passwordAuth.identityFields = ["email"];
    }
    app.save(collection);
  },
  (app) => {
    // Leave auth enabled. Rolling this back must not lock the dashboard out.
  },
);
