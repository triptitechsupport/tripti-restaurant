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
  bool get isPickup => '${data['pickupOrder'] ?? ''}'.isNotEmpty || channel == 'pickup';
}

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
    } catch (e) {
      debugPrint('realtime: $e');
    }
  }

  Future<void> refreshAll() async {
    await Future.wait([refreshMenu(), refreshTables(), refreshLive()]);
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
