import 'package:pocketbase/pocketbase.dart';

import 'store.dart';

/// A dish in the cart, with how many and how spicy.
class CartLine {
  CartLine(this.item, {this.qty = 1, this.spice = 'None', this.table = ''});
  final MenuItem item;
  int qty;
  String spice;

  /// For combined tables: the table this dish goes to.
  String table;
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
  Future<RecordModel> sendTicket({required String table, required String room, required List<CartLine> lines, String notes = '', String groupId = ''}) async {
    final parent = await _parentFor(table: table, groupId: groupId, shared: false);
    return _createTicket(parent, table, room, lines, notes, stamp: groupId.isNotEmpty);
  }

  /// Combined tables. Shared: one order, one ticket, each dish marked with
  /// its table. Linked: every table gets its own order and ticket. The
  /// combination is saved right before the first ticket, like the website.
  Future<void> sendCombined({
    required List<String> tables,
    required String mode,
    required String groupId,
    required String Function(String table) roomOf,
    required List<CartLine> lines,
    String notes = '',
  }) async {
    var gid = groupId;
    if (gid.isEmpty) gid = await createGroup(tables, mode);
    final primary = tables.first;
    String tableOf(CartLine l) => tables.contains(l.table) ? l.table : primary;
    if (mode == 'shared') {
      final parent = await _parentFor(table: primary, groupId: gid, shared: true);
      for (final l in lines) {
        l.table = tableOf(l);
      }
      final first = parent.getStringValue('tableNumber').isEmpty ? primary : parent.getStringValue('tableNumber');
      await _createTicket(parent, first, roomOf(first), lines, notes, stamp: true, label: 'Tables ${tables.join(' + ')}');
      return;
    }
    final byTable = <String, List<CartLine>>{};
    for (final l in lines) {
      byTable.putIfAbsent(tableOf(l), () => []).add(l);
    }
    for (final tn in tables) {
      final ls = byTable[tn];
      if (ls == null || ls.isEmpty) continue;
      final parent = await _parentFor(table: tn, groupId: gid, shared: false);
      await _createTicket(parent, tn, roomOf(tn), ls, notes, stamp: false, label: 'Tables ${tables.join(' + ')}');
      lines.removeWhere(ls.contains);
    }
  }

  /// Saves a combination of tables. Undone if a table cannot join.
  Future<String> createGroup(List<String> tables, String mode) async {
    final grp = await pb.collection('table_groups').create(body: {'mode': mode, 'status': 'active', 'label': 'Tables ${tables.join(' + ')}'});
    final made = <String>[];
    try {
      for (final tn in tables) {
        final m = await pb.collection('table_group_members').create(body: {'tableGroup': grp.id, 'tableNumber': tn, 'isActive': true});
        made.add(m.id);
      }
    } catch (_) {
      for (final id in made) {
        try {
          await pb.collection('table_group_members').update(id, body: {'isActive': false});
        } catch (_) {}
      }
      try {
        await pb.collection('table_groups').update(grp.id, body: {'status': 'closed'});
      } catch (_) {}
      rethrow;
    }
    return grp.id;
  }

  /// Splits a combination that has no open order.
  Future<void> separateGroup(String groupId) async {
    final live = await pb.collection('waiter_orders').getList(perPage: 1, filter: pb.filter('tableGroup = {:g} && freed != true && orderStatus = "open"', {'g': groupId}));
    if (live.items.isNotEmpty) throw Exception('These tables still have an open order. Free it first.');
    await _deactivate(groupId, null);
    await pb.collection('table_groups').update(groupId, body: {'status': 'closed'});
  }

  Future<void> _deactivate(String groupId, String? table) async {
    final filter = table == null
        ? pb.filter('tableGroup = {:g} && isActive = true', {'g': groupId})
        : pb.filter('tableGroup = {:g} && tableNumber = {:t} && isActive = true', {'g': groupId, 't': table});
    final ms = await pb.collection('table_group_members').getFullList(filter: filter);
    for (final m in ms) {
      try {
        await pb.collection('table_group_members').update(m.id, body: {'isActive': false});
      } catch (_) {}
    }
    final rest = await pb.collection('table_group_members').getList(perPage: 1, filter: pb.filter('tableGroup = {:g} && isActive = true', {'g': groupId}));
    if (rest.items.isEmpty) {
      try {
        await pb.collection('table_groups').update(groupId, body: {'status': 'closed'});
      } catch (_) {}
    }
  }

  /// Website rule: freeing a shared order frees all its tables; freeing a
  /// linked table frees that table, and the rest once none has an order.
  Future<void> _releaseCombination(Order o) async {
    final gid = o.groupId;
    if (gid.isEmpty) return;
    var mode = 'linked';
    try {
      mode = (await pb.collection('table_groups').getOne(gid)).getStringValue('mode');
    } catch (_) {}
    if (mode == 'shared') {
      await _deactivate(gid, null);
      try {
        await pb.collection('table_groups').update(gid, body: {'status': 'closed'});
      } catch (_) {}
      return;
    }
    await _deactivate(gid, o.table);
    final live = await pb.collection('waiter_orders').getList(perPage: 1, filter: pb.filter('tableGroup = {:g} && freed != true', {'g': gid}));
    if (live.items.isEmpty) await _deactivate(gid, null);
  }

  Future<RecordModel> _parentFor({required String table, required String groupId, required bool shared}) async {
    Future<RecordModel?> find() async {
      final r = await pb.collection('waiter_orders').getList(
            perPage: 1,
            sort: '-created',
            filter: shared ? pb.filter('tableGroup = {:g} && orderStatus = "open"', {'g': groupId}) : pb.filter('tableNumber = {:tn} && orderStatus = "open"', {'tn': table}),
          );
      return r.items.isEmpty ? null : r.items.first;
    }

    var parent = await find();
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
          if (groupId.isNotEmpty) 'tableGroup': groupId,
        });
      } on ClientException {
        // Another waiter opened this table at the same moment: use that order.
        parent = await find();
        if (parent == null) rethrow;
      }
    }
    return parent;
  }

  Future<RecordModel> _createTicket(RecordModel parent, String table, String room, List<CartLine> lines, String notes, {required bool stamp, String label = ''}) {
    final items = <Map<String, dynamic>>[];
    var ei = 0;
    final ts = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
    final perTable = <String, List<String>>{};
    for (final l in lines) {
      final tn = l.table.isEmpty ? table : l.table;
      if (stamp) perTable.putIfAbsent(tn, () => []).add('${l.qty}x ${l.item.nameEN}');
      for (var u = 0; u < l.qty; u++) {
        items.add({
          'id': l.item.id,
          'name': l.item.nameEN,
          'category': l.item.category,
          'quantity': 1,
          'price': l.item.price,
          'spiceLevel': l.spice,
          'cleared': false,
          'lineId': '${l.item.id}-$ei-$u-$ts',
          if (stamp) 'tableNumber': tn,
        });
      }
      ei++;
    }
    final total = items.fold<double>(0, (s, it) => s + toDouble(it['price']));
    final allNotes = [
      if (notes.trim().isNotEmpty) notes.trim(),
      if (perTable.length > 1)
        for (final k in (perTable.keys.toList()..sort(compareTableNames))) '$k: ${perTable[k]!.join(', ')}',
    ];
    return pb.collection('kitchen_orders').create(body: {
      'tableNumber': table,
      'tableLabel': label.contains('+') ? label : '',
      'room': room,
      'items': items,
      'status': 'pending',
      'totalPrice': total,
      'placedBy': staffName,
      'placedByRole': role,
      'notes': allNotes.join(' | '),
      'parentOrder': parent.id,
    });
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

  /// Serves every dish that is ready. The ticket completes only when no
  /// dish is left in the kitchen.
  Future<void> serveReady(Ticket t) async {
    if (t.status == 'ready') return markServed(t);
    final items = <Map<String, dynamic>>[];
    final statuses = <String, dynamic>{};
    for (var i = 0; i < t.items.length; i++) {
      final st = t.itemStatus(i);
      for (var u = 0; u < unitCount(t.items[i]); u++) {
        final idx = items.length;
        items.add({...t.items[i], 'quantity': 1});
        if (st == 'prepared' || st == 'pickedup') statuses['$idx'] = 'pickedup';
      }
    }
    final all = items.isNotEmpty && List.generate(items.length, (i) => statuses['$i'] == 'pickedup').every((x) => x);
    await pb.collection('kitchen_orders').update(t.id, body: {'items': items, 'itemStatuses': statuses, if (all) 'status': 'completed'});
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
  Future<void> freeTable(Order o) async {
    await pb.collection('waiter_orders').update(o.id, body: {
      'orderStatus': 'closed',
      'freed': true,
    });
    try {
      await _releaseCombination(o);
    } catch (_) {
      // The server's clean-up releases forgotten combinations later.
    }
  }
}
