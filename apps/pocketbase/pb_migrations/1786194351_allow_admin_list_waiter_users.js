/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Allow admin_users to list/view all waiter_users records so the admin
    // dashboard can render per-waiter print settings. Waiters can still
    // only read their own record. Create/update/delete rules are unchanged.
    const collection = app.findCollectionByNameOrId('waiter_users');
    collection.listRule =
      'id = @request.auth.id || @request.auth.collectionName = "admin_users"';
    collection.viewRule =
      'id = @request.auth.id || @request.auth.collectionName = "admin_users"';
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('waiter_users');
    collection.listRule = 'id = @request.auth.id';
    collection.viewRule = 'id = @request.auth.id';
    app.save(collection);
  },
);
