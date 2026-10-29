// Stock helpers: port of the website's lib/stockFifo.js and lib/stockIssue.js.
import 'package:pocketbase/pocketbase.dart';

import 'store.dart';

const expiryWarnDays = 7;

int? daysUntilExpiry(dynamic expiry, [DateTime? now]) {
  final t = parseDate(expiry);
  if (t == null) return null;
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final exp = DateTime(t.year, t.month, t.day);
  return exp.difference(today).inHours ~/ 24 + (exp.difference(today).inHours % 24 >= 12 ? 1 : 0);
}

/// none / expired / warning / ok
String expiryState(dynamic expiry, [DateTime? now]) {
  final d = daysUntilExpiry(expiry, now);
  if (d == null) return 'none';
  if (d < 0) return 'expired';
  if (d <= expiryWarnDays) return 'warning';
  return 'ok';
}

double lotRemaining(Map<String, dynamic> l) => toDouble(l['remainingQty'] ?? l['quantity']);

/// Usable lots of an item, earliest expiry first.
List<Map<String, dynamic>> fifoLots(Iterable<Map<String, dynamic>> lots, {bool allowExpired = false}) {
  final usable = lots.where((l) {
    if (lotRemaining(l) <= 0) return false;
    final st = '${l['status'] ?? ''}'.isEmpty ? 'active' : '${l['status']}';
    if (st != 'active' && st != 'overridden') return false;
    if (!allowExpired && expiryState(l['expiry']) == 'expired') return false;
    return true;
  }).toList();
  usable.sort((a, b) {
    final ae = parseDate(a['expiry']), be = parseDate(b['expiry']);
    if (ae == null && be == null) return 0;
    if (ae == null) return 1;
    if (be == null) return -1;
    return ae.compareTo(be);
  });
  return usable;
}

/// Takes stock out of the store: oldest-expiry lots first, with an issue
/// record and an audit adjustment for every lot touched. Updates
/// `item['quantity']` and the lots' `remainingQty` in place. Returns the
/// quantity actually issued.
Future<double> issueFromStock(
  PocketBase pb, {
  required Map<String, dynamic> item,
  required List<Map<String, dynamic>> lots,
  required double qty,
  required String staffId,
  required String staffName,
  required String role,
  required String byName,
  required String byId,
  required String reason,
  bool allowExpired = false,
}) async {
  if (qty <= 0) return 0;
  final itemLots = lots.where((l) => l['stockItem'] == item['id']).toList();
  var total = toDouble(item['quantity']);
  var issued = 0.0;

  Future<void> adjust(double delta, String note) async {
    final next = (total - delta) < 0 ? 0.0 : total - delta;
    await pb.collection('stock_items').update(item['id'], body: {'quantity': next});
    await pb.collection('stock_adjustments').create(body: {
      'stockItem': item['id'],
      'itemName': item['name'],
      'adjustmentType': 'correction',
      'delta': -delta,
      'previousQty': total,
      'newQty': next,
      'reason': reason,
      'adjustedBy': byName,
      'adjustedById': byId,
      'adjustedByRole': role,
      'notes': note,
    });
    total = next;
  }

  var remaining = qty;
  for (final lot in fifoLots(itemLots, allowExpired: allowExpired)) {
    if (remaining <= 1e-9) break;
    final avail = lotRemaining(lot);
    final take = avail < remaining ? avail : remaining;
    final left = avail - take < 0 ? 0.0 : avail - take;
    await pb.collection('stock_lots').update(lot['id'], body: {'remainingQty': left});
    lot['remainingQty'] = left;
    await pb.collection('stock_issues').create(body: {
      'staffId': staffId,
      'staffName': staffName,
      'stockItem': item['id'],
      'lot': lot['id'],
      'quantity': take,
      'issueDate': DateTime.now().toUtc().toIso8601String(),
      'location': '${lot['location'] ?? ''}'.isEmpty ? null : lot['location'],
      'issuedByRole': role,
      'notes': reason,
    });
    await adjust(take, 'Lot ${lot['id']}');
    issued += take;
    remaining -= take;
  }

  // Stock kept without a lot.
  final inLots = itemLots.fold<double>(0, (s, l) => s + (lotRemaining(l) > 0 ? lotRemaining(l) : 0));
  final free = total - inLots > 0 ? total - inLots : 0.0;
  final take = (qty - issued) < free ? qty - issued : free;
  if (take > 1e-9) {
    await pb.collection('stock_issues').create(body: {
      'staffId': staffId,
      'staffName': staffName,
      'stockItem': item['id'],
      'quantity': take,
      'issueDate': DateTime.now().toUtc().toIso8601String(),
      'issuedByRole': role,
      'notes': reason,
    });
    await adjust(take, '');
    issued += take;
  }
  item['quantity'] = total;
  return issued;
}

const wasteReasons = ['spoiled', 'expired', 'damaged', 'over-preparation', 'spill', 'burnt', 'customer-return', 'other'];
const adjustTypes = ['restock', 'correction', 'waste', 'initial'];

/// out / low / ok, from quantity and minimum stock.
String stockStatus(Map<String, dynamic> item) {
  final q = toDouble(item['quantity']), min = toDouble(item['minStock']);
  if (q <= 0) return 'out';
  if (min > 0 && q <= min) return 'low';
  return 'ok';
}

/// A fresh 12-digit numeric barcode.
String newBarcode() {
  final now = DateTime.now().microsecondsSinceEpoch.toString();
  return now.substring(now.length - 12);
}

/// Sets a new quantity and writes the audit record, like the website's
/// adjust dialog.
Future<void> adjustStock(
  PocketBase pb, {
  required Map<String, dynamic> item,
  required String type,
  required double newQty,
  required String reason,
  String notes = '',
  required String byName,
  required String byId,
  required String role,
}) async {
  final prev = toDouble(item['quantity']);
  final next = newQty < 0 ? 0.0 : newQty;
  await pb.collection('stock_items').update(item['id'], body: {'quantity': next});
  await pb.collection('stock_adjustments').create(body: {
    'stockItem': item['id'],
    'itemName': item['name'],
    'adjustmentType': type,
    'delta': next - prev,
    'previousQty': prev,
    'newQty': next,
    'reason': reason.trim().isEmpty ? type : reason.trim(),
    'adjustedBy': byName,
    'adjustedById': byId,
    'adjustedByRole': role,
    'notes': notes.trim(),
  });
  item['quantity'] = next;
}

/// Goods-in for one line: a new lot, the higher stock level, the latest
/// purchase price and an audit record (port of createLotAndAdjust).
Future<void> receiveLot(
  PocketBase pb, {
  required String itemId,
  required String itemName,
  required double quantity,
  String barcode = '',
  DateTime? expiry,
  double? unitCost,
  bool perishable = false,
  String supplierBill = '',
  String? receiptId,
  String notes = '',
  required String byName,
  required String byId,
  required String role,
}) async {
  var prev = 0.0;
  try {
    prev = toDouble((await pb.collection('stock_items').getOne(itemId)).toJson()['quantity']);
  } catch (_) {}
  final now = DateTime.now().toUtc();
  final lot = await pb.collection('stock_lots').create(body: {
    'barcode': barcode,
    'stockItem': itemId,
    'receipt': receiptId,
    'quantity': quantity,
    'remainingQty': quantity,
    'expiry': expiry?.toUtc().toIso8601String(),
    'preparedAt': now.toIso8601String(),
    'location': null,
    'supplierBill': supplierBill,
    'unitCost': unitCost,
    'perishable': perishable,
    'status': 'active',
    'receivedDate': now.toIso8601String().substring(0, 10),
    'notes': notes,
  });
  final next = prev + quantity;
  await pb.collection('stock_items').update(itemId, body: {'quantity': next, if (unitCost != null && unitCost > 0) 'unitCost': unitCost});
  await pb.collection('stock_adjustments').create(body: {
    'stockItem': itemId,
    'itemName': itemName,
    'adjustmentType': 'restock',
    'delta': quantity,
    'previousQty': prev,
    'newQty': next,
    'reason': 'Goods-in against bill ${supplierBill.isEmpty ? '-' : supplierBill}',
    'adjustedBy': byName,
    'adjustedById': byId,
    'adjustedByRole': role,
    'notes': 'Lot ${lot.id}${notes.isNotEmpty ? ' - $notes' : ''}',
  });
}
