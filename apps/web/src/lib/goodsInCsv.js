// CSV import/export config for goods-in (receiving against a supplier bill).
// Each row = one lot line: barcode, item name, qty, expiry, unit cost, location.
import { parseNumber } from '@/lib/csvUtils.js';

export const goodsInExportColumns = [
  { key: 'barcode', label: 'Barcode' },
  { key: 'itemName', label: 'Item Name' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'expiry', label: 'Expiry (YYYY-MM-DD)' },
  { key: 'unitCost', label: 'Unit Cost' },
  { key: 'locationName', label: 'Location' },
  { key: 'perishable', label: 'Perishable', format: (v) => (v ? 'true' : 'false') },
  { key: 'supplierBill', label: 'Supplier Bill' },
  { key: 'notes', label: 'Notes' },
];

// Import is handled by the Goods-In page directly (it must create receipts +
// lots + adjust stock levels atomically), so this config documents the
// expected columns and provides a parser/validator.
export const goodsInImportFields = {
  barcode: 'barcode',
  itemName: 'itemName',
  quantity: 'quantity',
  expiry: 'expiry',
  unitCost: 'unitCost',
  locationName: 'locationName',
  perishable: 'perishable',
  supplierBill: 'supplierBill',
  notes: 'notes',
};

/** Parse a single CSV row object into a normalized goods-in line. */
export function parseGoodsInRow(row) {
  const get = (keys) => {
    for (const k of keys) {
      if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
  };
  const barcode = get(['barcode', 'Barcode', 'BARCODE']);
  const itemName = get(['itemName', 'Item Name', 'item', 'Item', 'name', 'Name']);
  const quantity = get(['quantity', 'Quantity', 'qty', 'Qty']);
  const expiry = get(['expiry', 'Expiry', 'Expiry (YYYY-MM-DD)', 'expiryDate', 'Expiry Date']);
  const unitCost = get(['unitCost', 'Unit Cost', 'cost', 'Cost']);
  const locationName = get(['locationName', 'Location', 'Location Name']);
  const perishableRaw = get(['perishable', 'Perishable']);
  const supplierBill = get(['supplierBill', 'Supplier Bill', 'bill', 'Bill', 'Bill Number']);
  const notes = get(['notes', 'Notes']);

  const errors = [];
  if (!itemName) errors.push('Item name is required');
  const qty = parseNumber(quantity);
  if (!quantity) errors.push('Quantity is required');
  else if (qty <= 0) errors.push('Quantity must be greater than 0');
  if (barcode && !/^\d+$/.test(barcode)) errors.push('Barcode must be numeric only');
  let expiryNorm = '';
  if (expiry) {
    const m = String(expiry).match(/(\d{4}-\d{2}-\d{2})/);
    expiryNorm = m ? m[1] : '';
    if (!expiryNorm) errors.push('Expiry must be YYYY-MM-DD');
  }
  const perishable = ['true', 'yes', '1', 'y', 't', 'x'].includes(perishableRaw.toLowerCase());

  return {
    line: {
      barcode: barcode || '',
      itemName,
      quantity: qty,
      expiry: expiryNorm,
      unitCost: unitCost ? parseNumber(unitCost) : null,
      locationName,
      perishable,
      supplierBill,
      notes,
    },
    errors,
  };
}
