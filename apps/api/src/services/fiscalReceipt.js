import {FiscalError} from './fiskalyClient.js';
export const PAYMENT_TYPES = ['CASH', 'CARD', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'ONLINE', 'NEXI', 'ONLINEBON', 'PAYPAL'];
export const VAT_RATES = ['STANDARD', 'REDUCED_1', 'REDUCED_2', 'SPECIAL', 'ZERO'];
export const VAT_PERCENT = {STANDARD: 20, REDUCED_1: 10, REDUCED_2: 13, SPECIAL: 19, ZERO: 0};
export function sourceSnapshot(kots) {
  return kots.map(k => ({id: k.id, status: k.status, items: k.items})).sort((a,b) => a.id.localeCompare(b.id));
}
export function buildReceipt(kots, menu, paymentType, orderId, company, receiptType = 'NORMAL') {
  if (!PAYMENT_TYPES.includes(paymentType)) throw new FiscalError('Select a supported payment type.');
  const vatTotals = {}; let total = 0;
  const lines = [];
  for (const kot of kots.filter(k => k.status !== 'cancelled')) {
    if (!Array.isArray(kot.items)) throw new FiscalError('Invalid KOT items.');
    for (const item of kot.items) {
      const quantity = Number(item.quantity); const price = Number(item.price);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001)
        throw new FiscalError('Receipt items need positive whole quantities and non-negative prices with at most two decimals.');
      const vatRate = item.vat_Rate || menu.find(m => m.id === item.id)?.vat_Rate;
      if (!VAT_RATES.includes(vatRate)) throw new FiscalError(`Set VAT in Menu Management for ${item.name || item.id}.`);
      const cents = Math.round(price * 100) * quantity;
      if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(total + cents)) throw new FiscalError('Receipt amount exceeds the supported range.');
      total += cents; vatTotals[vatRate] = (vatTotals[vatRate] || 0) + cents;
      // Cleared means paid, not removed: paid items still belong on the final receipt.
      lines.push({text: String(item.name || item.nameEN || 'Item').slice(0,255), quantity: String(quantity),
        price_per_unit: price.toFixed(2), vatRate, vatPercent: VAT_PERCENT[vatRate]});
    }
  }
  if (!lines.length || total <= 0) throw new FiscalError('The order has no billable amount.');
  const standard = {amounts_per_vat_rate: Object.entries(vatTotals).map(([vat_rate,cents]) => ({vat_rate, amount: (cents/100).toFixed(2)})),
    amounts_per_payment_type: [{payment_type: paymentType === 'CASH' ? 'CASH' : 'NON_CASH', amount: (total/100).toFixed(2), currency_code: 'EUR'}],
    line_items: lines.map(({text,quantity,price_per_unit}) => ({text,quantity,price_per_unit}))};
  return {amount: total/100, requestPayload: {receipt_type: receiptType, schema: {standard_v1: standard}, metadata: {order_id: orderId}},
    receiptSnapshot: {company, lines, vatTotals: standard.amounts_per_vat_rate}};
}
export function cancellationPayload(original) {
  const payload = structuredClone(original.requestPayload);
  payload.receipt_type = 'CANCELLATION';
  payload.metadata = {...payload.metadata, original_receipt_id: original.fiskalyReceiptId};
  for (const entry of payload.schema.standard_v1.amounts_per_vat_rate) entry.amount = (-Number(entry.amount)).toFixed(2);
  for (const entry of payload.schema.standard_v1.amounts_per_payment_type) entry.amount = (-Number(entry.amount)).toFixed(2);
  for (const line of payload.schema.standard_v1.line_items) line.quantity = String(-Number(line.quantity));
  return payload;
}
