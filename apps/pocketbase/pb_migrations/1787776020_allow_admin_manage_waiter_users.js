/// <reference path="../pb_data/types.d.ts" />

// Allow admin_users to create and delete waiter_users accounts via the REST
// API (needed for the Admin Panel → Waiter Management create/delete flows).
// Previously both rules were `null` (nobody could create/delete through the
// API), so the Admin UI could not provision waiter accounts. List/view rules
// already allow admin_users; update rule stays owner-only.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_users");
    collection.createRule = '@request.auth.collectionName = "admin_users"';
    collection.deleteRule = '@request.auth.collectionName = "admin_users"';
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("waiter_users");
    collection.createRule = null;
    collection.deleteRule = null;
    app.save(collection);
  },
);
