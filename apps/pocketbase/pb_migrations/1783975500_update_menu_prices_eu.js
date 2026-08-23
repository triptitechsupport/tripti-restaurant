/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Random price ranges (inclusive) per category, rounded to 2 decimals.
    const ranges = {
      "Breakfast": [9.0, 12.0],
      "Appetizers": [4.99, 10.0],
      "Main Courses": [16.0, 20.0],
      "Sides & Accompaniments": [9.0, 12.0],
    };

    const randPrice = (min, max) => {
      const val = min + Math.random() * (max - min);
      return Math.round(val * 100) / 100;
    };

    for (const category of Object.keys(ranges)) {
      let records;
      try {
        records = app.findRecordsByFilter(
          "menu_items",
          `category = '${category}'`,
        );
      } catch (e) {
        if (e.message.includes("no rows in result set")) continue;
        throw e;
      }

      const [min, max] = ranges[category];
      for (const record of records) {
        // Use raw SQL to update only the price, bypassing full-record
        // validation (some rows have legacy blank nameEN/nameDE).
        app
          .db()
          .newQuery("UPDATE menu_items SET price = {:price} WHERE id = {:id}")
          .bind({ price: randPrice(min, max), id: record.id })
          .execute();
      }
    }
  },
  (app) => {
    // Prior prices are not recoverable; rollback is a no-op.
  },
);
