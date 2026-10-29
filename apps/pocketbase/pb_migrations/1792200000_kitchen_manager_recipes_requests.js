/// <reference path="../pb_data/types.d.ts" />

// Kitchen manager:
// - manages the menu and categories (like the admin)
// - keeps one recipe per dish (ingredients per portion, method)
// - sends the stock manager a weekly request for ingredients
// The stock manager sees the requests and fulfils them.
const ADMIN = '@request.auth.collectionName = "admin_users"';
const KM = '(@request.auth.collectionName = "kds_users" && @request.auth.role = "kitchen_manager")';
const KITCHEN = '@request.auth.collectionName = "kds_users"';
const STOCK = '@request.auth.collectionName = "stock_users"';

migrate(
  (app) => {
    for (const name of ['menu_items', 'categories']) {
      const c = app.findCollectionByNameOrId(name);
      c.createRule = `${ADMIN} || ${KM}`;
      c.updateRule = `${ADMIN} || ${KM}`;
      c.deleteRule = `${ADMIN} || ${KM}`;
      app.save(c);
    }

    // The kitchen manager can see what is in stock (read only).
    const stockItems = app.findCollectionByNameOrId('stock_items');
    stockItems.listRule = `${ADMIN} || ${STOCK} || ${KM}`;
    stockItems.viewRule = `${ADMIN} || ${STOCK} || ${KM}`;
    app.save(stockItems);

    const menu = app.findCollectionByNameOrId('menu_items');
    const autodates = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ];

    let hasRecipes = true;
    try { app.findCollectionByNameOrId('recipes'); } catch (_) { hasRecipes = false; }
    if (!hasRecipes) {
      app.save(new Collection({
        type: 'base',
        name: 'recipes',
        listRule: `${ADMIN} || ${KITCHEN} || ${STOCK}`,
        viewRule: `${ADMIN} || ${KITCHEN} || ${STOCK}`,
        createRule: `${ADMIN} || ${KM}`,
        updateRule: `${ADMIN} || ${KM}`,
        deleteRule: `${ADMIN} || ${KM}`,
        fields: [
          { name: 'menuItem', type: 'relation', collectionId: menu.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: 'yieldPortions', type: 'number', min: 0 },
          // [{ stockItem, name, qty, unit, note }] per batch of yieldPortions
          { name: 'ingredients', type: 'json', maxSize: 200000 },
          { name: 'steps', type: 'text', max: 20000 },
          { name: 'notes', type: 'text', max: 5000 },
          { name: 'updatedBy', type: 'text', max: 100 },
          ...autodates,
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_recipes_menu_item` ON `recipes` (`menuItem`)'],
      }));
    }

    let hasRequests = true;
    try { app.findCollectionByNameOrId('stock_requests'); } catch (_) { hasRequests = false; }
    if (!hasRequests) {
      app.save(new Collection({
        type: 'base',
        name: 'stock_requests',
        listRule: `${ADMIN} || ${KM} || ${STOCK}`,
        viewRule: `${ADMIN} || ${KM} || ${STOCK}`,
        createRule: `${ADMIN} || ${KM}`,
        updateRule: `${ADMIN} || ${KM} || ${STOCK}`,
        deleteRule: `${ADMIN} || (${KM} && status = "draft")`,
        fields: [
          { name: 'weekStart', type: 'date', required: true },
          { name: 'neededBy', type: 'date' },
          { name: 'status', type: 'select', maxSelect: 1, required: true, values: ['draft', 'submitted', 'in_progress', 'partial', 'fulfilled', 'cancelled'] },
          // [{ stockItem, name, unit, qty, note, fulfilledQty }]
          { name: 'items', type: 'json', maxSize: 500000 },
          { name: 'notes', type: 'text', max: 5000 },
          { name: 'requestedBy', type: 'text', max: 100 },
          { name: 'requestedByName', type: 'text', max: 100 },
          { name: 'submittedAt', type: 'date' },
          { name: 'startedAt', type: 'date' },
          { name: 'fulfilledAt', type: 'date' },
          { name: 'fulfilledBy', type: 'text', max: 100 },
          { name: 'fulfilledByName', type: 'text', max: 100 },
          { name: 'stockNote', type: 'text', max: 5000 },
          ...autodates,
        ],
        indexes: ['CREATE INDEX `idx_stock_requests_week` ON `stock_requests` (`weekStart`)'],
      }));
    }
  },
  (app) => {
    for (const name of ['menu_items', 'categories']) {
      const c = app.findCollectionByNameOrId(name);
      c.createRule = ADMIN; c.updateRule = ADMIN; c.deleteRule = ADMIN;
      app.save(c);
    }
    const stockItems = app.findCollectionByNameOrId('stock_items');
    stockItems.listRule = `${ADMIN} || ${STOCK}`;
    stockItems.viewRule = `${ADMIN} || ${STOCK}`;
    app.save(stockItems);
    for (const name of ['stock_requests', 'recipes']) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* gone */ }
    }
  },
);
