/// <reference path="../pb_data/types.d.ts" />
// 1790979300_replace_menu_items recreates the menu without a VAT rate, and it
// sorts after the RKSV billing migration that first set one. Settlement refuses
// items without VAT, so give every dish that has none the same default:
// beverages 20% (STANDARD), everything else 10% (REDUCED_1). Existing rates stay.
migrate((app) => {
  app.findRecordsByFilter('menu_items', "vat_Rate = ''", '', 0).forEach(record => {
    const category = String(record.get('category') || '').toLowerCase();
    record.set('vat_Rate', /beverages|getränke|getraenke/.test(category) ? 'STANDARD' : 'REDUCED_1');
    app.saveNoValidate(record);
  });
}, (app) => {
  // Keep the rates. Rolling back must not leave dishes that cannot be billed.
});
