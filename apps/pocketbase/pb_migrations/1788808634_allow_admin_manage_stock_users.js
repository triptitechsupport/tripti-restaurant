/// <reference path="../pb_data/types.d.ts" />

// Open up stock_users management to admins so the Admin Dashboard can
// create, list, edit (e.g. reset password) and delete Stock Manager
// accounts — mirroring the existing waiter_users management permissions.
//
// Before this migration stock_users had createRule/deleteRule = null
// (nobody via REST) and list/view/update scoped to the record owner only,
// which meant no admin could provision Stock Manager accounts from the UI.
//
// Only the access rules change. No field, index, or existing record is
// touched. Stock Managers still log in with Username + Password and retain
// only their existing stock/waste permissions (stock_items, stock_lots,
// stock_adjustments, waste_records, etc.).

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("stock_users");
    collection.listRule =
      "id = @request.auth.id || @request.auth.collectionName = \"admin_users\"";
    collection.viewRule =
      "id = @request.auth.id || @request.auth.collectionName = \"admin_users\"";
    collection.createRule = "@request.auth.collectionName = \"admin_users\"";
    collection.updateRule =
      "id = @request.auth.id || @request.auth.collectionName = \"admin_users\"";
    collection.deleteRule = "@request.auth.collectionName = \"admin_users\"";
    app.save(collection);
  },
  (app) => {
    // Restore the original closed-sign-up / owner-only rules.
    const collection = app.findCollectionByNameOrId("stock_users");
    collection.listRule = "id = @request.auth.id";
    collection.viewRule = "id = @request.auth.id";
    collection.createRule = null;
    collection.updateRule = "id = @request.auth.id";
    collection.deleteRule = null;
    app.save(collection);
  },
);
