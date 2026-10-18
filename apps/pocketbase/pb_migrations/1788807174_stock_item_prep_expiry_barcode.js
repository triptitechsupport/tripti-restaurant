/// <reference path="../pb_data/types.d.ts" />

// Stock items & lots: preparation datetime + item-level expiry.
// Barcode already exists on stock_items / stock_lots — no schema change for it.
// preparedAt / expiry on items let the stock manager record prep and use-by
// at item entry; preparedAt on lots records prep time at goods-in.

migrate(
  (app) => {
    const stockItems = app.findCollectionByNameOrId("stock_items");
    if (!stockItems.fields.getByName("preparedAt")) {
      stockItems.fields.add(
        new DateField({
          name: "preparedAt",
          required: false,
        }),
      );
    }
    if (!stockItems.fields.getByName("expiry")) {
      stockItems.fields.add(
        new DateField({
          name: "expiry",
          required: false,
        }),
      );
    }
    app.save(stockItems);

    const stockLots = app.findCollectionByNameOrId("stock_lots");
    if (!stockLots.fields.getByName("preparedAt")) {
      stockLots.fields.add(
        new DateField({
          name: "preparedAt",
          required: false,
        }),
      );
      app.save(stockLots);
    }
  },
  (app) => {
    try {
      const stockItems = app.findCollectionByNameOrId("stock_items");
      if (stockItems.fields.getByName("preparedAt")) {
        stockItems.fields.removeByName("preparedAt");
      }
      if (stockItems.fields.getByName("expiry")) {
        stockItems.fields.removeByName("expiry");
      }
      app.save(stockItems);
    } catch (_) { /* skip */ }
    try {
      const stockLots = app.findCollectionByNameOrId("stock_lots");
      if (stockLots.fields.getByName("preparedAt")) {
        stockLots.fields.removeByName("preparedAt");
        app.save(stockLots);
      }
    } catch (_) { /* skip */ }
  },
);
