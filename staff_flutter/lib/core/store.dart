import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:pocketbase/pocketbase.dart';

import 'session.dart';

/// "YYYY-MM-DD HH:MM:SS" (UTC) for local midnight: the date format
/// PocketBase filters understand.
String startOfTodayFilter() {
  final now = DateTime.now();
  final d = DateTime(now.year, now.month, now.day).toUtc();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
}

int? tableNum(String? v) {
  if (v == null) return null;
  final m = RegExp(r'\d+').firstMatch(v);
  return m == null ? null : int.tryParse(m.group(0)!);
}

double toDouble(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

DateTime? parseDate(dynamic v) {
  final s = '${v ?? ''}'.trim();
  if (s.isEmpty) return null;
  return DateTime.tryParse(s.replaceFirst(' ', 'T'))?.toLocal();
}

List<Map<String, dynamic>> jsonList(dynamic v) {
  if (v is String && v.isNotEmpty) {
    try {
      v = jsonDecode(v);
    } catch (_) {
      return [];
    }
  }
  if (v is List) return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  return [];
}

Map<String, dynamic> jsonMap(dynamic v) {
  if (v is String && v.isNotEmpty) {
    try {
      v = jsonDecode(v);
    } catch (_) {
      return {};
    }
  }
  return v is Map ? Map<String, dynamic>.from(v) : {};
}

class TableInfo {
  TableInfo(this.name, this.room, this.number);
  final String name;
  final String room;
  final int number;
}

/// One kitchen ticket (KOT).
class Ticket {
  Ticket(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] ?? '';
  String get status => data['status'] ?? 'pending';
  String get table => data['tableNumber'] ?? '';
  String get parentId => data['parentOrder'] ?? '';
  String get placedBy => data['placedBy'] ?? '';
  String get notes => data['notes'] ?? '';
  String get suffix => data['kotSuffix'] ?? '';
  DateTime? get created => parseDate(data['created']);
  List<Map<String, dynamic>> get items => jsonList(data['items']);
  Map<String, dynamic> get itemStatuses => jsonMap(data['itemStatuses']);
  bool get open => status != 'completed' && status != 'cancelled';
  double get total => items.fold(0.0, (s, it) => s + toDouble(it['price']) * (toDouble(it['quantity']) == 0 ? 1 : toDouble(it['quantity'])));

  /// Item status: pending / prepared / pickedup (see web lib/kotItemStatus.js).
  String itemStatus(int index) {
    final s = itemStatuses['$index'];
    return s == 'prepared' || s == 'pickedup' ? s : 'pending';
  }
}

/// One table visit (waiter_orders): the bill that collects its tickets.
class Order {
  Order(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] ?? '';
  String get orderId => data['orderId'] ?? '';
  String get table => data['tableNumber'] ?? '';
  bool get isOpen => data['orderStatus'] == 'open';
  bool get freed => data['freed'] == true;
  bool get ended => '${data['endedAt'] ?? ''}'.isNotEmpty;
  DateTime? get created => parseDate(data['created']);
  DateTime? get billRequestedAt => parseDate(data['billRequestedAt']);
  DateTime? get billReadyAt => parseDate(data['billReadyAt']);
  DateTime? get endRequestedAt => parseDate(data['endRequestedAt']);
  bool get billPending {
    final r = billRequestedAt;
    if (r == null) return false;
    final ready = billReadyAt;
    return ready == null || ready.isBefore(r);
  }

  bool get billReady {
    final r = billRequestedAt, ready = billReadyAt;
    return r != null && ready != null && !ready.isBefore(r);
  }

  bool get endPending => endRequestedAt != null && !ended && isOpen;
  String get paymentStatus => '${data['paymentStatus'] ?? ''}'.isEmpty ? 'unpaid' : data['paymentStatus'];
  double get total => toDouble(data['totalAmount']);
  double get outstanding => toDouble(data['outstandingAmount']);
  String get channel => data['channel'] ?? '';
  String get groupId => '${data['tableGroup'] ?? ''}';
  bool get isPickup => '${data['pickupOrder'] ?? ''}'.isNotEmpty || channel == 'pickup';
}

/// Combined tables (table_groups + active table_group_members).
/// shared: one order and one bill for all tables; linked: each table keeps
/// its own order and bill, the kitchen sees them together.
class TableGroup {
  TableGroup(this.id, this.mode, this.label, this.tables);
  final String id, mode, label;
  final List<String> tables;
  bool get shared => mode == 'shared';
  String get display => tables.join(' + ');
}

int compareTableNames(String a, String b) => (tableNum(a) ?? 0).compareTo(tableNum(b) ?? 0);

class MenuItem {
  MenuItem(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] ?? '';
  String nameFor(bool de) {
    final en = '${data['nameEN'] ?? ''}'.isNotEmpty ? data['nameEN'] : data['name'];
    if (de && '${data['nameDE'] ?? ''}'.isNotEmpty) return data['nameDE'];
    return '${en ?? ''}';
  }

  String get nameEN => '${('${data['nameEN'] ?? ''}'.isNotEmpty ? data['nameEN'] : data['name']) ?? ''}';
  String get category => data['category'] ?? '';
  double get price => toDouble(data['price']);
  bool get available => data['availability'] != false;
  bool get veg => data['isVegetarian'] == true;
}

class Category {
  Category(this.data);
  final Map<String, dynamic> data;
  String get name => data['name'] ?? '';
  String nameFor(bool de) => de && '${data['name_de'] ?? ''}'.isNotEmpty ? data['name_de'] : name;
  int get order => (data['display_order'] is num) ? (data['display_order'] as num).toInt() : 999;
}

/// Live restaurant data for the waiter and cashier screens: menu, tables,
/// today's orders and tickets (plus unfinished ones from earlier days).
/// Realtime updates arrive at once; a poll every 15 s catches anything a
/// dropped connection missed.
class LiveStore extends ChangeNotifier {
  LiveStore(this.session);
  final Session session;
  PocketBase get pb => session.pb;

  List<MenuItem> menu = [];
  List<Category> categories = [];
  List<TableInfo> tables = [];
  List<Order> orders = [];
  List<Ticket> tickets = [];
  Map<String, Map<String, dynamic>> groupRecs = {};
  List<Map<String, dynamic>> members = [];
  bool loaded = false;
  String? error;
  DateTime? lastSync;
  final _events = StreamController<RecordSubscriptionEvent>.broadcast();
  Stream<RecordSubscriptionEvent> get ticketEvents => _events.stream;
  final List<UnsubscribeFunc> _subs = [];
  Timer? _poll;
  bool _disposed = false;

  Future<void> start() async {
    await refreshAll();
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => refreshLive());
    try {
      _subs.add(await pb.collection('kitchen_orders').subscribe('*', (e) {
        final rec = e.record;
        if (rec == null) return;
        final t = Ticket(rec.toJson());
        final i = tickets.indexWhere((x) => x.id == t.id);
        if (e.action == 'delete') {
          if (i >= 0) tickets.removeAt(i);
        } else if (i >= 0) {
          tickets[i] = t;
        } else {
          tickets.insert(0, t);
        }
        _events.add(e);
        lastSync = DateTime.now();
        _notify();
      }));
      _subs.add(await pb.collection('waiter_orders').subscribe('*', (e) {
        final rec = e.record;
        if (rec == null) return;
        final o = Order(rec.toJson());
        final i = orders.indexWhere((x) => x.id == o.id);
        if (e.action == 'delete') {
          if (i >= 0) orders.removeAt(i);
        } else if (i >= 0) {
          orders[i] = o;
        } else {
          orders.insert(0, o);
        }
        lastSync = DateTime.now();
        _notify();
      }));
      _subs.add(await pb.collection('menu_items').subscribe('*', (_) => refreshMenu()));
      _subs.add(await pb.collection('table_groups').subscribe('*', (_) => refreshGroups()));
      _subs.add(await pb.collection('table_group_members').subscribe('*', (_) => refreshGroups()));
    } catch (e) {
      debugPrint('realtime: $e');
    }
  }

  Future<void> refreshAll() async {
    await Future.wait([refreshMenu(), refreshTables(), refreshLive(), refreshGroups()]);
    loaded = true;
    _notify();
  }

  Future<void> refreshMenu() async {
    try {
      final r = await Future.wait([
        pb.collection('menu_items').getFullList(sort: 'name'),
        pb.collection('categories').getFullList(sort: 'display_order'),
      ]);
      menu = r[0].map((e) => MenuItem(e.toJson())).toList();
      categories = r[1].map((e) => Category(e.toJson())).toList()..sort((a, b) => a.order.compareTo(b.order));
      _notify();
    } catch (e) {
      error = errorText(e);
      _notify();
    }
  }

  Future<void> refreshTables() async {
    try {
      final r = await Future.wait([
        pb.collection('table_configurations').getFullList(sort: 'name'),
        pb.collection('table_settings').getFullList(),
      ]);
      final max = r[1].isNotEmpty ? (toDouble(r[1].first.data['maxTableNumber']).toInt()) : 9;
      final limit = max > 0 ? max : 9;
      final list = <TableInfo>[];
      for (final t in r[0]) {
        if (t.data['isActive'] == false) continue;
        final n = tableNum(t.getStringValue('name'));
        if (n == null || n < 1 || n > limit) continue;
        list.add(TableInfo(t.getStringValue('name'), t.getStringValue('room'), n));
      }
      if (list.isEmpty) {
        for (var n = 1; n <= limit; n++) {
          list.add(TableInfo('$n', '', n));
        }
      }
      list.sort((a, b) => a.number.compareTo(b.number));
      tables = list;
      _notify();
    } catch (e) {
      error = errorText(e);
      _notify();
    }
  }

  Future<void> refreshGroups() async {
    try {
      final r = await Future.wait([
        pb.collection('table_groups').getFullList(filter: 'status = "active"'),
        pb.collection('table_group_members').getFullList(filter: 'isActive = true'),
      ]);
      groupRecs = {for (final g in r[0]) g.id: g.toJson()};
      members = r[1].map((e) => e.toJson()).toList();
      _notify();
    } catch (_) {}
  }

  /// Active combinations with 2+ tables.
  Map<String, TableGroup> get groups {
    final tables = <String, Set<String>>{};
    for (final m in members) {
      final gid = '${m['tableGroup'] ?? ''}', tn = '${m['tableNumber'] ?? ''}';
      if (gid.isEmpty || tn.isEmpty || !groupRecs.containsKey(gid)) continue;
      tables.putIfAbsent(gid, () => {}).add(tn);
    }
    return {
      for (final e in tables.entries)
        if (e.value.length > 1) e.key: TableGroup(e.key, '${groupRecs[e.key]?['mode'] ?? 'linked'}', '${groupRecs[e.key]?['label'] ?? ''}', e.value.toList()..sort(compareTableNames)),
    };
  }

  TableGroup? groupOf(String table) {
    for (final g in groups.values) {
      if (g.tables.contains(table)) return g;
    }
    return null;
  }

  /// Orders and tickets from today, plus orders from an earlier day that were
  /// never freed (their table is still taken and their bill still open).
  Future<void> refreshLive() async {
    final since = startOfTodayFilter();
    try {
      final r = await Future.wait([
        pb.collection('waiter_orders').getList(perPage: 200, sort: '-created', filter: 'created >= "$since" || (freed != true && orderStatus = "open")'),
        pb.collection('kitchen_orders').getList(perPage: 300, sort: '-created', filter: 'created >= "$since" || (parentOrder.freed != true && parentOrder.orderStatus = "open")'),
      ]);
      orders = r[0].items.map((e) => Order(e.toJson())).toList();
      tickets = r[1].items.map((e) => Ticket(e.toJson())).toList();
      error = null;
      lastSync = DateTime.now();
      _notify();
    } catch (e) {
      error = errorText(e);
      _notify();
    }
  }

  // ---------- derived ----------
  /// The latest order of each table that was not freed yet.
  Map<String, Order> get liveOrderByTable {
    final m = <String, Order>{};
    for (final o in orders) {
      if (o.table.isEmpty || o.isPickup) continue;
      final prev = m[o.table];
      if (prev == null || (o.created ?? DateTime(0)).isAfter(prev.created ?? DateTime(0))) m[o.table] = o;
    }
    m.removeWhere((_, o) => o.freed);
    // A shared order covers every table of its combination.
    for (final g in groups.values.where((g) => g.shared)) {
      final o = m.values.where((o) => o.groupId == g.id && o.isOpen).firstOrNull;
      if (o == null) continue;
      for (final t in g.tables) {
        m[t] ??= o;
      }
    }
    return m;
  }

  List<Ticket> ticketsOf(Order o) => tickets.where((t) => t.parentId == o.id).toList()
    ..sort((a, b) => (a.created ?? DateTime(0)).compareTo(b.created ?? DateTime(0)));

  Order? orderById(String id) {
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    for (final u in _subs) {
      u();
    }
    _events.close();
    super.dispose();
  }
}
