// Supplier bills (PDF or photo) -> goods-in.
// Claude reads the bill into raw lines (cartons, pieces per carton, pack size,
// net line total). This file turns them into stock quantities, matches them to
// stock items and books them, so the arithmetic never depends on the model.
import crypto from 'node:crypto';

const PACK_UNITS = ['g', 'kg', 'ml', 'l', 'pcs', null];

export const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supplier', 'billNumber', 'billDate', 'totalNet', 'lines', 'note'],
  properties: {
    supplier: { type: ['string', 'null'], description: 'Company that issued the bill (the seller, not Tripti).' },
    billNumber: { type: ['string', 'null'], description: 'Invoice / delivery note number (Rechnung, Lieferschein).' },
    billDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    totalNet: { type: ['number', 'null'], description: 'Net total of the bill (before VAT) in EUR, if printed.' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pos', 'articleNo', 'text', 'itemName', 'brand', 'category', 'count', 'countUnit', 'perCarton', 'packSize', 'packUnit', 'lineNet', 'perishable', 'matchId'],
        properties: {
          pos: { type: ['string', 'null'] },
          articleNo: { type: ['string', 'null'], description: 'Supplier article number (Artikelnr.).' },
          text: { type: 'string', description: 'Product text as printed, including a second description line.' },
          itemName: { type: 'string', description: 'Generic stock name without brand and pack size, e.g. "Chickpeas Jumbo", "Toor Dal", "Sona Masoori rice", "Cumin powder". Different pack sizes of the same product get the same name.' },
          brand: { type: ['string', 'null'] },
          category: { type: 'string', description: 'Stock category; reuse an existing one when it fits (e.g. Lentils & beans, Rice, Spices, Flour, Snacks).' },
          count: { type: 'number', description: 'Quantity ordered in the bill\'s unit (Menge).' },
          countUnit: { type: 'string', enum: ['carton', 'piece'], description: 'carton for Ktn/Karton/Kiste/Box/Tray, piece for Stk/Pkg/single packs, kg or l sold loose.' },
          perCarton: { type: ['number', 'null'], description: 'Packs per carton (Stk/Ktn), null for pieces.' },
          packSize: { type: ['number', 'null'], description: 'Content of one pack, e.g. 2 for "2kg", 500 for "500g". For loose goods sold by kg/l: 1.' },
          packUnit: { type: ['string', 'null'], enum: PACK_UNITS, description: 'Unit of packSize. pcs when the pack is counted (e.g. 30 eggs). null if no size is printed.' },
          lineNet: { type: ['number', 'null'], description: 'Net amount of this line in EUR after line discounts (Gesamtpreis minus "abzgl." discount).' },
          perishable: { type: 'boolean', description: 'Fresh, chilled or frozen food.' },
          matchId: { type: ['string', 'null'], description: 'id of the existing stock item that is the same product (any pack size), else null.' },
        },
      },
    },
    note: { type: 'string', description: 'One short sentence: anything unreadable, deposits/fees skipped, or to check.' },
  },
};

export const BILL_PROMPT = `This is a supplier bill or delivery note for the restaurant's stock. List every product line (all pages) as it is printed, in order. Skip deposit (Pfand), freight, delivery fee, subtotal (Übertrag), VAT and total lines. Do not add lines that are not on the bill.
For each line give the raw numbers exactly as printed: count and its unit, packs per carton, the pack size from the product text, and the net line amount after any line discount. Do not convert units yourself.`;

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(String(v ?? '').replace(',', '.')) || 0);

/** Stock unit, quantity and cost for one bill line. */
export function lineToStock(l) {
  const count = num(l.count);
  const pieces = l.countUnit === 'carton' ? count * (num(l.perCarton) || 1) : count;
  const size = num(l.packSize);
  let unit = 'pcs';
  let perPiece = 1;
  if (l.packUnit === 'g' || l.packUnit === 'kg') {
    unit = 'kg';
    perPiece = size > 0 ? (l.packUnit === 'g' ? size / 1000 : size) : 0;
  } else if (l.packUnit === 'ml' || l.packUnit === 'l') {
    unit = 'l';
    perPiece = size > 0 ? (l.packUnit === 'ml' ? size / 1000 : size) : 0;
  } else if (l.packUnit === 'pcs' && size > 0) {
    perPiece = size;
  }
  // Size missing: count packs instead.
  if (perPiece <= 0) { unit = 'pcs'; perPiece = 1; }
  const quantity = round(pieces * perPiece, 3);
  const lineNet = num(l.lineNet);
  const unitCost = lineNet > 0 && quantity > 0 ? round(lineNet / quantity, 4) : null;
  const sizeLabel = size > 0 && l.packUnit ? `${size} ${l.packUnit}` : '';
  const packLabel = l.countUnit === 'carton'
    ? `${count} × ${num(l.perCarton) || 1}${sizeLabel ? ` × ${sizeLabel}` : ''}`
    : `${count}${sizeLabel ? ` × ${sizeLabel}` : ''}`;
  return { unit, quantity, pieces, unitCost, lineNet: lineNet || null, packLabel };
}

/** Converts a quantity from the bill's unit into the item's own unit. */
export function toItemUnit(stock, itemUnit) {
  const u = String(itemUnit || '').toLowerCase();
  const out = { ...stock };
  const scale = (f) => { out.quantity = round(stock.quantity * f, 3); out.unitCost = stock.unitCost == null ? null : round(stock.unitCost / f, 4); out.unit = u; };
  if (stock.unit === 'kg' && u === 'g') scale(1000);
  else if (stock.unit === 'l' && u === 'ml') scale(1000);
  else if ((stock.unit === 'kg' || stock.unit === 'l') && u && !['kg', 'l', 'g', 'ml'].includes(u)) {
    // Item counted in packs: use the number of packs.
    out.quantity = stock.pieces;
    out.unitCost = stock.lineNet && stock.pieces ? round(stock.lineNet / stock.pieces, 4) : null;
    out.unit = u;
  } else if (u) out.unit = u;
  return out;
}

const articlesOf = (item) => String(item.supplierArticles || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Bill lines -> preview rows matched to stock items (new items where none fits). */
export function matchBill(lines, items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [norm(i.name), i]));
  return lines.map((l, idx) => {
    const art = String(l.articleNo || '').trim();
    let item = (art && items.find((i) => articlesOf(i).includes(art))) || null;
    if (!item && l.matchId && byId.has(l.matchId)) item = byId.get(l.matchId);
    if (!item) item = byName.get(norm(l.itemName)) || null;
    const base = lineToStock(l);
    const stock = item ? toItemUnit(base, item.unit) : base;
    return {
      key: `${idx}`,
      pos: l.pos || String(idx + 1),
      articleNo: art,
      text: String(l.text || '').trim(),
      itemId: item ? item.id : null,
      itemName: item ? item.name : String(l.itemName || l.text || '').trim(),
      isNew: !item,
      category: item ? item.category || '' : String(l.category || '').trim(),
      brand: l.brand || '',
      perishable: item ? !!item.perishable : !!l.perishable,
      unit: stock.unit,
      quantity: stock.quantity,
      unitCost: stock.unitCost,
      lineNet: base.lineNet,
      packLabel: base.packLabel,
      include: stock.quantity > 0,
    };
  });
}

const newBarcode = () => String(Date.now()).slice(-8) + String(crypto.randomInt(0, 10000)).padStart(4, '0');

export class BillError extends Error {
  constructor(message, status = 400, code = '') { super(message); this.status = status; this.code = code; }
}

/** Finds an earlier booking of the same bill. */
export async function findDuplicate(pb, supplier, billNumber) {
  const no = String(billNumber || '').trim();
  if (!no) return null;
  const list = await pb.collection('stock_receipts').getList(1, 5, { filter: pb.filter('billNumber = {:no}', { no }), sort: '-created' });
  const s = norm(supplier);
  return list.items.find((r) => !s || !norm(r.supplier) || norm(r.supplier) === s) || null;
}

/**
 * Books the checked bill: creates missing items (one per new name), one
 * receipt, a lot per line, raises the quantities and writes the history.
 */
export async function bookBill(pb, staff, bill) {
  const lines = (Array.isArray(bill.lines) ? bill.lines : []).filter((l) => l && l.include !== false && num(l.quantity) > 0);
  if (!lines.length) throw new BillError('Nothing to book: no line has a quantity.');
  const billNumber = String(bill.billNumber || '').trim().slice(0, 100);
  const supplier = String(bill.supplier || '').trim().slice(0, 200);
  if (!bill.force) {
    const dup = await findDuplicate(pb, supplier, billNumber);
    if (dup) throw new BillError(`Bill ${billNumber} was already booked on ${String(dup.created).slice(0, 10)}.`, 409, 'duplicate');
  }
  const items = await pb.collection('stock_items').getFullList({ batch: 500 });
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [norm(i.name), i]));
  const nowIso = new Date().toISOString();
  const by = { adjustedBy: staff.name, adjustedById: staff.id, adjustedByRole: staff.role };

  const receipt = await pb.collection('stock_receipts').create({
    billNumber: billNumber || `GRN-${Date.now()}`,
    supplier,
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(String(bill.billDate || '')) ? `${bill.billDate} 12:00:00.000Z` : nowIso,
    totalAmount: num(bill.totalNet) > 0 ? num(bill.totalNet) : null,
    notes: String(bill.note || '').slice(0, 1000),
    receivedBy: staff.name,
    receivedById: staff.id,
    receivedByRole: staff.role,
    sourceFile: String(bill.fileName || '').slice(0, 200),
  });

  let created = 0;
  const booked = [];
  for (const l of lines) {
    let item = l.itemId ? byId.get(l.itemId) : null;
    if (!item) item = byName.get(norm(l.itemName)) || null;
    const qty = round(num(l.quantity), 3);
    const cost = num(l.unitCost) > 0 ? round(num(l.unitCost), 4) : null;
    if (!item) {
      const name = String(l.itemName || l.text || 'Item').trim().slice(0, 200);
      item = await pb.collection('stock_items').create({
        name,
        category: String(l.category || '').slice(0, 100),
        unit: String(l.unit || 'pcs').slice(0, 50),
        quantity: 0,
        minStock: 0,
        unitCost: cost,
        barcode: newBarcode(),
        perishable: !!l.perishable,
        preparedAt: nowIso,
        supplier,
        supplierArticles: l.articleNo || '',
        notes: [l.brand ? `Brand: ${l.brand}` : '', l.text ? `Bill text: ${l.text}` : ''].filter(Boolean).join('\n').slice(0, 1000),
      });
      byId.set(item.id, item);
      byName.set(norm(item.name), item);
      created++;
      await pb.collection('stock_adjustments').create({ stockItem: item.id, itemName: item.name, adjustmentType: 'initial', delta: 0, previousQty: 0, newQty: 0, reason: `New item from bill ${receipt.billNumber}`, ...by });
    } else if (l.articleNo && !articlesOf(item).includes(l.articleNo)) {
      const list = [...articlesOf(item), l.articleNo].join(',').slice(0, 500);
      item = await pb.collection('stock_items').update(item.id, { supplierArticles: list, ...(supplier && !item.supplier ? { supplier } : {}) });
      byId.set(item.id, item);
    }
    const fresh = await pb.collection('stock_items').getOne(item.id);
    const prev = num(fresh.quantity);
    const lot = await pb.collection('stock_lots').create({
      barcode: '',
      stockItem: item.id,
      receipt: receipt.id,
      quantity: qty,
      remainingQty: qty,
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(String(l.expiry || '')) ? `${l.expiry} 21:59:00.000Z` : null,
      preparedAt: nowIso,
      supplierBill: receipt.billNumber,
      unitCost: cost,
      perishable: !!fresh.perishable,
      status: 'active',
      receivedDate: nowIso.slice(0, 10),
      notes: [l.packLabel, l.text].filter(Boolean).join(' · ').slice(0, 1000),
    });
    const next = round(prev + qty, 3);
    await pb.collection('stock_items').update(item.id, { quantity: next, ...(cost ? { unitCost: cost } : {}) });
    await pb.collection('stock_adjustments').create({ stockItem: item.id, itemName: fresh.name, adjustmentType: 'restock', delta: qty, previousQty: prev, newQty: next, reason: `Goods-in against bill ${receipt.billNumber}`, notes: `Lot ${lot.id}`, ...by });
    booked.push({ itemId: item.id, name: fresh.name, quantity: qty, unit: fresh.unit || l.unit, newQty: next });
  }
  return { receiptId: receipt.id, billNumber: receipt.billNumber, booked, created };
}
