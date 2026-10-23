import 'package:pocketbase/pocketbase.dart';

import 'store.dart';

/// A dish in the cart, with how many and how spicy.
class CartLine {
  CartLine(this.item, {this.qty = 1, this.spice = 'None'});
  final MenuItem item;
  int qty;
  String spice;
}

int unitCount(Map<String, dynamic> it) {
  final n = toDouble(it['quantity']).floor();
  return n > 0 ? n : 1;
}

/// Same as the website's splitForUnitStatus (lib/kotItemStatus.js): split
/// every line into single dishes, then set the status of one of them.
({List<Map<String, dynamic>> items, Map<String, dynamic> statuses}) splitForUnitStatus(
    Ticket t, int itemIndex, int unitIndex, String status) {
  final items = t.items;
  final statuses = t.itemStatuses;
  final nextItems = <Map<String, dynamic>>[];
  final nextStatuses = <String, dynamic>{};
  var flat = 0;
  for (var idx = 0; idx < items.length; idx++) {
    final n = unitCount(items[idx]);
    final st = statuses['$idx'];
    for (var u = 0; u < n; u++) {
      final newIdx = nextItems.length;
      if (idx == itemIndex && u == unitIndex) flat = newIdx;
      nextItems.add({...items[idx], 'quantity': 1});
      if (st == 'prepared' || st == 'pickedup') nextStatuses['$newIdx'] = st;
    }
  }
  if (status == 'pending') {
    nextStatuses.remove('$flat');
  } else {
    nextStatuses['$flat'] = status;
  }
  return (items: nextItems, statuses: nextStatuses);
}

class OrderActions {
  OrderActions(this.pb, {required this.staffName, required this.role});
  final PocketBase pb;
  final String staffName;
  final String role; // waiter / cashier

  /// Sends a ticket to the kitchen for a table. Adds it to the table's open
  /// order, or starts a new order. Returns the created ticket.
  Future<RecordModel> sendTicket({required String table, required String room, required List<CartLine> lines, String notes = ''}) async {
    final items = <Map<String, dynamic>>[];
    var ei = 0;
    final stamp = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
    for (final l in lines) {
      for (var u = 0; u < l.qty; u++) {
        items.add({
          'id': l.item.id,
          'name': l.item.nameEN,
          'category': l.item.category,
          'quantity': 1,
          'price': l.item.price,
          'spiceLevel': l.spice,
          'cleared': false,
          'lineId': '${l.item.id}-$ei-$u-$stamp',
        });
      }
      ei++;
    }
    final total = items.fold<double>(0, (s, it) => s + toDouble(it['price']));

    RecordModel? parent = await _openOrder(table);
    if (parent != null && parent.getStringValue('endedAt').isNotEmpty) {
      throw Exception('Order ${parent.getStringValue('orderId')} for table $table has been ended. Free the table before sending a new ticket.');
    }
    if (parent == null) {
      try {
        parent = await pb.collection('waiter_orders').create(body: {
          'orderType': 'walkin',
          'tableNumber': table,
          'orderStatus': 'open',
          'placedBy': staffName,
          'placedByRole': role,
        });
      } on ClientException {
        // Another waiter opened this table at the same moment: use that order.
        parent = await _openOrder(table);
        if (parent == null) rethrow;
      }
    }
    return pb.collection('kitchen_orders').create(body: {
      'tableNumber': table,
      'tableLabel': '',
      'room': room,
      'items': items,
      'status': 'pending',
      'totalPrice': total,
      'placedBy': staffName,
      'placedByRole': role,
      'notes': notes,
      'parentOrder': parent.id,
    });
  }

  Future<RecordModel?> _openOrder(String table) async {
    final r = await pb.collection('waiter_orders').getList(
          perPage: 1,
          sort: '-created',
          filter: pb.filter('tableNumber = {:tn} && orderStatus = "open"', {'tn': table}),
        );
    return r.items.isEmpty ? null : r.items.first;
  }

  /// Waiter picks up one dish. The last one completes the ticket.
  Future<bool> serveDish(Ticket t, int itemIndex, int unitIndex) async {
    final split = splitForUnitStatus(t, itemIndex, unitIndex, 'pickedup');
    final all = split.items.isNotEmpty && List.generate(split.items.length, (i) => split.statuses['$i'] == 'pickedup').every((x) => x);
    await pb.collection('kitchen_orders').update(t.id, body: {
      'items': split.items,
      'itemStatuses': split.statuses,
      if (all) 'status': 'completed',
    });
    return all;
  }

  Future<void> markServed(Ticket t) => pb.collection('kitchen_orders').update(t.id, body: {'status': 'completed'});

  Future<void> cancelTicket(Ticket t) => pb.collection('kitchen_orders').update(t.id, body: {'status': 'cancelled'});

  Future<void> requestBill(Order o) => pb.collection('waiter_orders').update(o.id, body: {
        'billRequestedAt': DateTime.now().toUtc().toIso8601String(),
        'billRequestedBy': staffName,
        'billReadyAt': '',
      });

  Future<void> askToEnd(Order o) => pb.collection('waiter_orders').update(o.id, body: {
        'endRequestedAt': DateTime.now().toUtc().toIso8601String(),
        'endRequestedBy': staffName,
      });

  /// Cashier only: end the order (all tickets served or cancelled).
  Future<void> endOrder(Order o) => pb.collection('waiter_orders').update(o.id, body: {
        'endedAt': DateTime.now().toUtc().toIso8601String(),
      });

  /// Frees the table: the order must be ended and fully paid.
  Future<void> freeTable(Order o) => pb.collection('waiter_orders').update(o.id, body: {
        'orderStatus': 'closed',
        'freed': true,
      });
}
