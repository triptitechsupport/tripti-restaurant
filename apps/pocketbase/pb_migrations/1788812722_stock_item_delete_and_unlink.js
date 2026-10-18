/// <reference path="../pb_data/types.d.ts" />

// Allow stock managers (and admins) to delete stock_items.
// Linked audit/history rows keep their denormalized itemName and are
// unlinked (stockItem made optional) so deleting an item never cascades
// away adjustments, lots, issues, or waste records.

migrate(
  (app) => {
    const adminOrStock =
      '@request.auth.collectionName = "admin_users" || @request.auth.collectionName = "stock_users"';

    const stockItems = app.findCollectionByNameOrId("stock_items");
    stockItems.deleteRule = adminOrStock;
    app.save(stockItems);

    // stock_adjustments.stockItem — optional so history survives item delete
    try {
      const adj = app.findCollectionByNameOrId("stock_adjustments");
      const f = adj.fields.getByName("stockItem");
      if (f) f.required = false;
      // stock managers may update adjustments to clear the link on item delete
      adj.updateRule = adminOrStock;
      app.save(adj);
    } catch (_) { /* collection missing in odd envs */ }

    // stock_lots.stockItem — optional; preserve lot history
    try {
      const lots = app.findCollectionByNameOrId("stock_lots");
      const f = lots.fields.getByName("stockItem");
      if (f) f.required = false;
      lots.updateRule = adminOrStock;
      lots.deleteRule = adminOrStock;
      app.save(lots);
    } catch (_) { /* ignore */ }

    // stock_issues.stockItem — optional
    try {
      const issues = app.findCollectionByNameOrId("stock_issues");
      const f = issues.fields.getByName("stockItem");
      if (f) f.required = false;
      issues.updateRule = adminOrStock;
      app.save(issues);
    } catch (_) { /* ignore */ }

    // waste already optional; ensure stock can clear link
    try {
      const waste = app.findCollectionByNameOrId("waste_records");
      waste.updateRule = adminOrStock;
      app.save(waste);
    } catch (_) { /* ignore */ }
  },
  (app) => {
    const adminOnly = '@request.auth.collectionName = "admin_users"';
    try {
      const stockItems = app.findCollectionByNameOrId("stock_items");
      stockItems.deleteRule = adminOnly;
      app.save(stockItems);
    } catch (_) { /* ignore */ }
  },
);
