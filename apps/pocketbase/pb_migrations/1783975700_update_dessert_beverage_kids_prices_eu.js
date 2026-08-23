/// <reference path="../pb_data/types.d.ts" />

// Researched typical European (incl. Indian restaurants in Europe) pricing ranges:
// - Desserts: €4.50 - €7.50 (e.g. Gulab Jamun, Kheer, Kulfi at European Indian restaurants)
// - Beverages: €2.50 - €4.50 (soft drinks, juices, lassi)
// - Kids Menu: €6.90 - €9.90 (children's portions)
migrate(
  (app) => {
    const priceRanges = {
      Desserts: { min: 4.5, max: 7.5 },
      Beverages: { min: 2.5, max: 4.5 },
      'Kids Menu': { min: 6.9, max: 9.9 },
    };

    const randomPrice = (min, max) => {
      const value = min + Math.random() * (max - min);
      return Math.round(value * 100) / 100;
    };

    let totalUpdated = 0;
    for (const category of Object.keys(priceRanges)) {
      const { min, max } = priceRanges[category];
      let records;
      try {
        records = app.findRecordsByFilter(
          'menu_items',
          `category = '${category}'`,
        );
      } catch (e) {
        if (e.message && e.message.includes('no rows in result set')) {
          continue;
        }
        throw e;
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
        record.set('price', randomPrice(min, max));
        app.save(record);
        totalUpdated++;
      }
    }

    console.log(`Updated prices for ${totalUpdated} menu items (Desserts/Beverages/Kids Menu).`);
  },
  (app) => {
    // Prices are randomized and prior values weren't stored; rollback is a no-op.
    console.log('Rollback: previous prices not recoverable, no-op.');
  },
);
