/// <reference path="../pb_data/types.d.ts" />
// Austrian 7-year rule: order, ticket and online-order records are kept.
// No staff or admin login can delete them any more (cancel instead); only the
// automatic 8-year clean-up (retention-cleanup.pb.js) removes old rows.
migrate((app) => {
  for (const name of ['kitchen_orders', 'waiter_orders', 'orders']) {
    const col = app.findCollectionByNameOrId(name);
    col.deleteRule = null;
    app.save(col);
  }
}, (app) => {
  for (const name of ['kitchen_orders', 'waiter_orders', 'orders']) {
    const col = app.findCollectionByNameOrId(name);
    col.deleteRule = '@request.auth.collectionName = "admin_users"';
    app.save(col);
  }
});
