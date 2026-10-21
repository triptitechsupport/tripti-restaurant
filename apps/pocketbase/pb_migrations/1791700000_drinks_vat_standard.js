/// <reference path="../pb_data/types.d.ts" />
// The menu's drinks category is called "Drinks", which the earlier VAT
// backfill did not recognise, so drinks were billed at 10 %. In Austrian
// restaurants drinks are taxed at 20 % (STANDARD). Move drinks that still
// have the old 10 % default to 20 %. Other rates are left as the admin set them.
migrate((app) => {
  app.findRecordsByFilter('menu_items', "vat_Rate = 'REDUCED_1'", '', 0).forEach(record => {
    const category = String(record.get('category') || '').toLowerCase();
    if (!/beverage|drink|getränk|getraenk/.test(category)) return;
    record.set('vat_Rate', 'STANDARD');
    app.saveNoValidate(record);
  });
}, () => {
  // Keep the corrected rates on rollback.
});
