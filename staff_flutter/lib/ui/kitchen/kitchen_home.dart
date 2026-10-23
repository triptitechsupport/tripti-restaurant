import 'dart:async';

import 'package:flutter/material.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/actions.dart';
import '../../core/alert.dart';
import '../../core/kot_pdf.dart';
import '../../core/scope.dart';
import '../../core/session.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/pickups_page.dart';
import '../common/widgets.dart';
import '../home.dart';
import 'sold_out_page.dart';

const _active = ['pending', 'preparing', 'ready'];
const _delay = Duration(minutes: 5);

/// Kitchen display: open tickets oldest first. Start prints the KOT,
/// dishes can be marked done one by one, Ready tells the waiter.
class KitchenHome extends StatefulWidget {
  const KitchenHome({super.key});

  @override
  State<KitchenHome> createState() => _KitchenHomeState();
}

class _KitchenHomeState extends State<KitchenHome> {
  List<Ticket> _tickets = [];
  final Map<String, Map<String, dynamic>> _orders = {}; // parent id -> waiter_order
  Map<String, int?> _printOrder = {};
  Map<String, String> _catOfItem = {};
  bool _printAllowed = true;
  bool _sound = true;
  bool _autoPrint = true;
  bool _loaded = false;
  String? _error;
  int _tab = 0;
  final Set<String> _known = {};
  final Set<String> _busy = {};
  Timer? _poll, _tick;
  UnsubscribeFunc? _unsub;

  PocketBase get pb => AppScope.read(context).pb;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (!mounted) return;
      setState(() {
        _sound = p.getBool('kds_sound') ?? true;
        _autoPrint = p.getBool('kds_autoprint') ?? true;
      });
    });
    _loadRefs();
    _load(first: true);
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _load());
    // While a ticket waits 5+ minutes, beep every 30 s.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      setState(() {});
      if (_sound && _tickets.any(_delayed)) alertBeep();
    });
    pb.collection('kitchen_orders').subscribe('*', (_) => _load()).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    _unsub?.call();
    super.dispose();
  }

  bool _delayed(Ticket t) => t.status == 'pending' && t.created != null && DateTime.now().difference(t.created!) >= _delay;

  Future<void> _loadRefs() async {
    try {
      final r = await Future.wait([
        pb.collection('categories').getFullList(),
        pb.collection('menu_items').getFullList(fields: 'id,category'),
        pb.collection('print_settings').getFullList(),
      ]);
      _printOrder = {for (final c in r[0]) c.getStringValue('name'): (c.data['print_order'] is num ? (c.data['print_order'] as num).toInt() : null)};
      _catOfItem = {for (final m in r[1]) m.id: m.getStringValue('category')};
      _printAllowed = r[2].isEmpty || r[2].first.data['restaurantWidePrintEnabled'] != false;
    } catch (_) {}
  }

  Future<void> _load({bool first = false}) async {
    final cutoff = DateTime.now().toUtc().subtract(const Duration(hours: 5));
    String two(int v) => v.toString().padLeft(2, '0');
    final c = '${cutoff.year}-${two(cutoff.month)}-${two(cutoff.day)} ${two(cutoff.hour)}:${two(cutoff.minute)}:${two(cutoff.second)}';
    try {
      final list = await pb.collection('kitchen_orders').getFullList(
            sort: 'created',
            filter: '(${_active.map((s) => 'status = "$s"').join(' || ')}) && created > "$c"',
            expand: 'parentOrder',
          );
      if (!mounted) return;
      final fresh = <Ticket>[];
      for (final r in list) {
        final p = r.get<RecordModel?>('expand.parentOrder');
        if (p != null) _orders[p.id] = p.toJson();
        fresh.add(Ticket(r.toJson()));
      }
      final newOnes = fresh.where((t) => t.status == 'pending' && !_known.contains(t.id)).length;
      if (!first && newOnes > 0) {
        if (_sound) alertBeep();
        toast(context, tr(context, '$newOnes new ticket(s)', '$newOnes neue(s) Ticket(s)'));
      }
      _known.addAll(fresh.map((t) => t.id));
      setState(() {
        _tickets = fresh;
        _loaded = true;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    }
  }

  String _orderId(Ticket t) => '${_orders[t.parentId]?['orderId'] ?? ''}';

  Future<void> _print(Ticket t, {bool cut = false}) async {
    try {
      await printPdf(
        () => buildKotPdf(ticket: t, orderId: _orderId(t), printOrder: _printOrder, categoryOfItem: _catOfItem, cutBetweenCategories: cut, orderCreated: parseDate(_orders[t.parentId]?['created'])),
        'KOT ${_orderId(t)}',
      );
      await pb.collection('kitchen_orders').update(t.id, body: {
        'printedAt': DateTime.now().toUtc().toIso8601String(),
        'printCount': (toDouble(t.data['printCount']).toInt()) + 1,
      });
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
  }

  Future<void> _set(Ticket t, String status) async {
    if (_busy.contains(t.id)) return;
    setState(() => _busy.add(t.id));
    try {
      await pb.collection('kitchen_orders').update(t.id, body: {'status': status});
      if (status == 'preparing' && _autoPrint && _printAllowed) _print(t);
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    await _load();
    if (mounted) setState(() => _busy.remove(t.id));
  }

  Future<void> _toggleDish(Ticket t, int item, int unit) async {
    if (t.status != 'preparing' && t.status != 'ready') return;
    final next = t.itemStatus(item) == 'prepared' ? 'pending' : 'prepared';
    final split = splitForUnitStatus(t, item, unit, next);
    try {
      await pb.collection('kitchen_orders').update(t.id, body: {'items': split.items, 'itemStatuses': split.statuses});
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    await _load();
  }

  Future<void> _savePref(String k, bool v) async => (await SharedPreferences.getInstance()).setBool(k, v);

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    final manager = session.role == StaffRole.kitchenManager || session.role == StaffRole.admin;
    final delayed = _tickets.where(_delayed).length;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(manager ? tr(context, 'Kitchen Manager', 'Küchenchef') : tr(context, 'Kitchen', 'Küche')),
          Text(session.displayName, style: const TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w400)),
        ]),
        actions: [
          IconButton(
            icon: Icon(_sound ? Icons.volume_up : Icons.volume_off),
            tooltip: tr(context, 'Sound', 'Ton'),
            onPressed: () {
              setState(() => _sound = !_sound);
              _savePref('kds_sound', _sound);
            },
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _load()),
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () => showMoreSheet(context, extra: [
              StatefulBuilder(
                builder: (ctx, set) => SwitchListTile(
                  secondary: const Icon(Icons.print),
                  title: Text(tr(context, 'Print KOT when starting', 'KOT beim Starten drucken')),
                  subtitle: _printAllowed ? null : Text(tr(context, 'Printing is turned off by the admin.', 'Drucken ist vom Admin ausgeschaltet.')),
                  value: _autoPrint,
                  onChanged: (v) {
                    setState(() => _autoPrint = v);
                    set(() {});
                    _savePref('kds_autoprint', v);
                  },
                ),
              ),
            ]),
          ),
        ],
      ),
      body: Column(children: [
        if (_error != null)
          Material(color: const Color(0xFFFEF3C7), child: ListTile(dense: true, leading: const Icon(Icons.wifi_off, color: TriptiColors.amber), title: Text(_error!))),
        if (delayed > 0 && _tab == 0)
          Material(
            color: const Color(0xFFFEE2E2),
            child: ListTile(dense: true, leading: const Icon(Icons.timer, color: TriptiColors.red), title: Text(tr(context, '$delayed ticket(s) waiting over 5 minutes', '$delayed Ticket(s) warten über 5 Minuten'), style: const TextStyle(color: TriptiColors.red, fontWeight: FontWeight.w700))),
          ),
        Expanded(
          child: _tab == 1
              ? PickupsPage(kitchen: true, manager: manager)
              : _tab == 2 && manager
              ? const SoldOutPage()
              : !_loaded
                  ? const Center(child: CircularProgressIndicator())
                  : _tickets.isEmpty
                      ? EmptyState(Icons.soup_kitchen, tr(context, 'No open tickets.', 'Keine offenen Tickets.'))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: LayoutBuilder(builder: (context, c) {
                            final cols = (c.maxWidth / 360).floor().clamp(1, 4);
                            final w = (c.maxWidth - 20 - (cols - 1) * 10) / cols;
                            return ListView(padding: const EdgeInsets.all(10), children: [
                              Wrap(spacing: 10, runSpacing: 10, children: [for (final t in _tickets) SizedBox(width: w, child: _card(t))]),
                            ]);
                          }),
                        ),
        ),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: Badge(isLabelVisible: _tickets.isNotEmpty, label: Text('${_tickets.length}'), child: const Icon(Icons.receipt_long)), label: tr(context, 'Tickets', 'Tickets')),
          NavigationDestination(icon: const Icon(Icons.shopping_bag_outlined), label: tr(context, 'Pre-orders', 'Vorbestellungen')),
          if (manager) NavigationDestination(icon: const Icon(Icons.no_food_outlined), label: tr(context, 'Sold out', 'Ausverkauft')),
        ],
      ),
    );
  }

  Widget _card(Ticket t) {
    final (label, color) = ticketStatus(context, t.status);
    final late = _delayed(t);
    final age = t.created == null ? 0 : DateTime.now().difference(t.created!).inMinutes;
    final busy = _busy.contains(t.id);
    final items = t.items;
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: late ? TriptiColors.red : TriptiColors.border, width: late ? 2.5 : 1)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: TriptiColors.primary, borderRadius: BorderRadius.circular(8)),
              child: Text('${tr(context, 'Table', 'Tisch')} ${t.table}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(ticketLabel(t, _orders[t.parentId] == null ? null : Order(_orders[t.parentId]!)), style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.ink))),
            StatusPill(label, color),
          ]),
          const SizedBox(height: 4),
          Text('${timeOf(t.created)} · $age min · ${t.placedBy}', style: TextStyle(color: late ? TriptiColors.red : Colors.black54, fontSize: 12.5, fontWeight: late ? FontWeight.w700 : FontWeight.w400)),
          if (t.notes.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
              child: Text('${tr(context, 'Note', 'Notiz')}: ${t.notes}', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          const Divider(height: 18),
          for (var i = 0; i < items.length; i++)
            for (var u = 0; u < unitCount(items[i]); u++)
              InkWell(
                onTap: t.status == 'pending' ? null : () => _toggleDish(t, i, u),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(children: [
                    Icon(
                      t.itemStatus(i) == 'pickedup'
                          ? Icons.check_circle
                          : t.itemStatus(i) == 'prepared'
                              ? Icons.check_box
                              : Icons.check_box_outline_blank,
                      color: t.itemStatus(i) == 'pending' ? Colors.black38 : TriptiColors.green,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text.rich(TextSpan(children: [
                        TextSpan(text: '${items[i]['name'] ?? ''}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, decoration: t.itemStatus(i) == 'pickedup' ? TextDecoration.lineThrough : null)),
                        if ('${items[i]['spiceLevel'] ?? 'None'}' != 'None') TextSpan(text: '  ${items[i]['spiceLevel']}', style: const TextStyle(color: TriptiColors.amber, fontWeight: FontWeight.w700)),
                      ])),
                    ),
                  ]),
                ),
              ),
          const SizedBox(height: 10),
          Row(children: [
            IconButton(
              tooltip: tr(context, 'Print KOT', 'KOT drucken'),
              onPressed: !_printAllowed ? null : () => _printDialog(t),
              icon: const Icon(Icons.print),
            ),
            const Spacer(),
            if (t.status == 'pending')
              FilledButton.icon(
                onPressed: busy ? null : () => _set(t, 'preparing'),
                icon: const Icon(Icons.local_fire_department),
                label: Text(tr(context, 'Start', 'Starten')),
              ),
            if (t.status == 'preparing')
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: TriptiColors.green),
                onPressed: busy ? null : () => _set(t, 'ready'),
                icon: const Icon(Icons.room_service),
                label: Text(tr(context, 'Ready', 'Fertig')),
              ),
            if (t.status == 'ready')
              OutlinedButton(
                onPressed: busy ? null : () => _set(t, 'preparing'),
                child: Text(tr(context, 'Back to cooking', 'Zurück in Zubereitung')),
              ),
          ]),
        ]),
      ),
    );
  }

  void _printDialog(Ticket t) {
    var cut = false;
    final printed = toDouble(t.data['printCount']) > 0 || '${t.data['printedAt'] ?? ''}'.isNotEmpty;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(tr(context, 'Print KOT', 'KOT drucken')),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (printed) Text(tr(context, 'This ticket was printed before.', 'Dieses Ticket wurde schon gedruckt.'), style: const TextStyle(color: TriptiColors.amber)),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: cut,
              onChanged: (v) => set(() => cut = v == true),
              title: Text(tr(context, 'Separate categories for cutting', 'Kategorien zum Schneiden trennen')),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr(context, 'Cancel', 'Abbrechen'))),
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                _print(t, cut: cut);
              },
              child: Text(tr(context, 'Print', 'Drucken')),
            ),
          ],
        ),
      ),
    );
  }
}
