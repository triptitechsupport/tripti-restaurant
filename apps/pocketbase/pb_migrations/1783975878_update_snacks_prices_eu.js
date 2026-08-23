/// <reference path="../pb_data/types.d.ts" />

// Researched typical European (incl. Indian restaurants in Europe) pricing for
// Snacks (e.g. Samosas, Pakoras, Papdi Chaat, Bhel Puri): €5.50 - €9.50
migrate(
  (app) => {
    const priceRange = { min: 5.5, max: 9.5 };

    const randomPrice = (min, max) => {
      const value = min + Math.random() * (max - min);
      return Math.round(value * 100) / 100;
    };

    let totalUpdated = 0;
    let records;
    try {
      records = app.findRecordsByFilter('menu_items', "category = 'Snacks'");
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) {
        records = [];
      } else {
        throw e;
      }
    }

    for (const record of records) {
      // Some legacy rows have blank nameEN/nameDE which are required fields;
      // backfill them from the base `name` so re-saving doesn't fail validation.
      if (!record.get('nameEN')) {
        record.set('nameEN', record.get('name'));
      }
      if (!record.get('nameDE')) {
        record.set('nameDE', record.get('name'));
      }
      record.set('price', randomPrice(priceRange.min, priceRange.max));
      app.save(record);
      totalUpdated++;
    }

    console.log(`Updated prices for ${totalUpdated} Snacks menu items.`);
  },
  (app) => {
    // Prices are randomized and prior values weren't stored; rollback is a no-op.
    console.log('Rollback: previous prices not recoverable, no-op.');
  },
);
