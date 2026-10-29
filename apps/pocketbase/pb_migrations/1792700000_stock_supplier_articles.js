/// <reference path="../pb_data/types.d.ts" />
// Supplier article numbers on stock items (comma separated, e.g. "72367,0701"),
// so the next bill from the same supplier finds the item again by itself.
// stock_receipts gets the file name of an uploaded bill.
migrate((app) => {
  const items = app.findCollectionByNameOrId('stock_items');
  if (!items.fields.getByName('supplierArticles')) items.fields.add(new TextField({ name: 'supplierArticles', max: 500 }));
  if (!items.fields.getByName('supplier')) items.fields.add(new TextField({ name: 'supplier', max: 200 }));
  app.save(items);
  const receipts = app.findCollectionByNameOrId('stock_receipts');
  if (!receipts.fields.getByName('sourceFile')) receipts.fields.add(new TextField({ name: 'sourceFile', max: 200 }));
  app.save(receipts);
}, (app) => {
  const items = app.findCollectionByNameOrId('stock_items');
  ['supplierArticles', 'supplier'].forEach((n) => items.fields.removeByName(n));
  app.save(items);
  const receipts = app.findCollectionByNameOrId('stock_receipts');
  receipts.fields.removeByName('sourceFile');
  app.save(receipts);
});
