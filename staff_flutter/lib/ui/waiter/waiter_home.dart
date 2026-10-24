import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/actions.dart';
import '../../core/alert.dart';
import '../../core/scope.dart';
import '../../core/session.dart';
import '../../core/shift.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../home.dart';
import '../cashier/bills_page.dart';
import '../common/pickups_page.dart';
import '../common/team_chat.dart';
import '../cashier/receipts_page.dart';
import 'active_page.dart';
import 'tables_page.dart';
import '../common/assistant.dart';

/// Gives the waiter screens the live data and the order actions.
class StoreScope extends InheritedNotifier<LiveStore> {
  const StoreScope({super.key, required LiveStore store, required this.actions, required super.child}) : super(notifier: store);
  final OrderActions actions;

  static LiveStore of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<StoreScope>()!.notifier!;
  static OrderActions actionsOf(BuildContext context) => context.getInheritedWidgetOfExactType<StoreScope>()!.actions;
}

class WaiterHome extends StatefulWidget {
  const WaiterHome({super.key});

  @override
  State<WaiterHome> createState() => _WaiterHomeState();
}

class _WaiterHomeState extends State<WaiterHome> {
  late final LiveStore store;
  late final OrderActions actions;
  StreamSubscription? _sub;
  int _tab = 0;
  final Map<String, String> _seen = {}; // ticket id -> status|prepared count
  late final Shifts _shifts;
  Map<String, dynamic>? _shift;
  bool _shiftBusy = false;
  Timer? _shiftTick;

  @override
  void initState() {
    super.initState();
    final session = AppScope.read(context);
    store = LiveStore(session);
    actions = OrderActions(session.pb, staffName: session.displayName, role: session.role == StaffRole.cashier ? 'cashier' : 'waiter');
    store.start().then((_) {
      for (final t in store.tickets) {
        _seen[t.id] = _key(t);
      }
    });
    _sub = store.ticketEvents.listen((e) => _checkReady(e.record?.id));
    _shifts = Shifts(session.pb, session.user?.id ?? '');
    _shifts.active().then((a) {
      if (mounted) setState(() => _shift = a);
    });
    _shiftTick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted && _shift != null) setState(() {});
    });
  }

  int get _shiftMinutes {
    final start = parseDate(_shift?['clockIn']);
    return start == null ? 0 : DateTime.now().difference(start).inMinutes;
  }

  Future<void> _toggleShift() async {
    if (_shiftBusy) return;
    setState(() => _shiftBusy = true);
    final clockingIn = _shift == null;
    final ok = await runActionPlain(() async {
      if (clockingIn) {
        _shift = await _shifts.clockIn();
      } else {
        await _shifts.clockOut();
        _shift = null;
      }
    });
    if (!mounted) return;
    setState(() => _shiftBusy = false);
    toastShift(ok, clockingIn);
  }

  void toastShift(bool ok, bool clockingIn) {
    if (!ok) {
      toast(context, clockingIn ? tr(context, 'Could not clock in.', 'Einstempeln fehlgeschlagen.') : tr(context, 'Could not clock out.', 'Ausstempeln fehlgeschlagen.'), error: true);
    } else {
      toast(context, clockingIn ? tr(context, 'Clocked in. Have a good shift!', 'Eingestempelt. Gute Schicht!') : tr(context, 'Clocked out.', 'Ausgestempelt.'));
    }
  }

  Future<bool> runActionPlain(Future<void> Function() f) async {
    try {
      await f();
      return true;
    } catch (_) {
      return false;
    }
  }

  String _key(Ticket t) => '${t.status}|${List.generate(t.items.length, t.itemStatus).where((s) => s == 'prepared').length}';

  /// A ticket of mine became ready, or the kitchen finished another dish.
  void _checkReady(String? id) {
    if (id == null || !mounted) return;
    final t = store.tickets.where((x) => x.id == id).firstOrNull;
    if (t == null) return;
    final before = _seen[id];
    final now = _key(t);
    _seen[id] = now;
    if (before == null || before == now) return;
    final session = AppScope.read(context);
    if (t.placedBy != session.displayName) return;
    final prepared = int.tryParse(now.split('|')[1]) ?? 0;
    final wasPrepared = int.tryParse(before.split('|')[1]) ?? 0;
    final becameReady = t.status == 'ready' && !before.startsWith('ready');
    if (!becameReady && prepared <= wasPrepared) return;
    alertBeep();
    final msg = becameReady
        ? tr(context, 'Table ${t.table}: the ticket is ready to serve.', 'Tisch ${t.table}: Das Ticket ist fertig.')
        : tr(context, 'Table ${t.table}: a dish is ready to serve.', 'Tisch ${t.table}: Ein Gericht ist fertig.');
    final m = ScaffoldMessenger.of(context);
    m.clearMaterialBanners();
    m.showMaterialBanner(MaterialBanner(
      backgroundColor: const Color(0xFFDCFCE7),
      leading: const Icon(Icons.notifications_active, color: TriptiColors.green),
      content: Text(msg, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF14532D))),
      actions: [
        TextButton(
          onPressed: () {
            m.clearMaterialBanners();
            setState(() => _tab = AppScope.read(context).role == StaffRole.cashier ? 3 : 1);
          },
          child: Text(tr(context, 'Open', 'Öffnen')),
        ),
        TextButton(onPressed: m.clearMaterialBanners, child: const Text('OK')),
      ],
    ));
  }

  @override
  void dispose() {
    _sub?.cancel();
    _shiftTick?.cancel();
    store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    final cashier = session.role == StaffRole.cashier;
    return StoreScope(
      store: store,
      actions: actions,
      child: Builder(builder: (context) {
        final s = StoreScope.of(context);
        final readyCount = s.tickets.where((t) => t.placedBy == session.displayName && (t.status == 'ready' || List.generate(t.items.length, t.itemStatus).contains('prepared')) && t.open).length;
        final requests = s.liveOrders.where((o) => o.billPending || o.endPending).length;
        return Scaffold(
          appBar: AppBar(
            title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(cashier ? tr(context, 'Cashier', 'Kasse') : tr(context, 'Waiter', 'Kellner')),
              Text('${session.displayName} · ${_shift != null ? '${tr(context, 'Shift', 'Schicht')} ${formatShift(_shiftMinutes)}' : tr(context, 'not clocked in', 'nicht eingestempelt')}',
                  style: const TextStyle(fontSize: 12, color: Colors.white70, fontFamily: null, fontWeight: FontWeight.w400)),
            ]),
            actions: [
              AssistantButton(onScreen: (screen) {
                final keys = cashier ? const ['tables', 'bills', 'receipts', 'tickets'] : const ['tables', 'tickets'];
                final i = keys.indexOf(screen);
                if (screen == 'pickups') {
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: Text(tr(context, 'Pickups', 'Abholungen'))), body: const PickupsPage())));
                } else if (screen == 'chat') {
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TeamChatPage(role: 'waiter')));
                } else if (i >= 0) {
                  setState(() => _tab = i);
                }
              }),
              IconButton(
                icon: const Icon(Icons.shopping_bag_outlined),
                tooltip: tr(context, 'Pickups', 'Abholungen'),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => Scaffold(appBar: AppBar(title: Text(tr(context, 'Pickups', 'Abholungen'))), body: const PickupsPage()),
                )),
              ),
              const TeamChatButton(role: 'waiter'),
              IconButton(icon: const Icon(Icons.refresh), tooltip: tr(context, 'Refresh', 'Aktualisieren'), onPressed: s.refreshAll),
              IconButton(
                icon: const Icon(Icons.more_vert),
                onPressed: () => showMoreSheet(context, beforeSignOut: _shifts.clockOut, extra: [
                  ListTile(
                    leading: Icon(_shift != null ? Icons.timer_off_outlined : Icons.timer_outlined),
                    title: Text(_shift != null ? tr(context, 'Clock out', 'Ausstempeln') : tr(context, 'Clock in', 'Einstempeln')),
                    subtitle: Text(_shift != null ? '${tr(context, 'Shift', 'Schicht')} ${formatShift(_shiftMinutes)}' : tr(context, 'Not clocked in', 'Nicht eingestempelt')),
                    onTap: () {
                      Navigator.pop(context);
                      _toggleShift();
                    },
                  ),
                  ListTile(
                    leading: const Icon(Icons.sync),
                    title: Text(tr(context, 'Last update', 'Letzte Aktualisierung')),
                    subtitle: Text(s.lastSync == null ? '—' : '${DateTime.now().difference(s.lastSync!).inSeconds} s'),
                  ),
                ]),
              ),
            ],
          ),
          body: Column(children: [
            if (s.error != null)
              Material(
                color: const Color(0xFFFEF3C7),
                child: ListTile(
                  dense: true,
                  leading: const Icon(Icons.wifi_off, color: TriptiColors.amber),
                  title: Text(tr(context, 'Connection problem: ${s.error}', 'Verbindungsproblem: ${s.error}')),
                  trailing: TextButton(onPressed: s.refreshAll, child: Text(tr(context, 'Retry', 'Erneut'))),
                ),
              ),
            Expanded(child: !s.loaded ? const Center(child: CircularProgressIndicator()) : IndexedStack(index: _tab, children: cashier ? const [TablesPage(), BillsPage(), ReceiptsPage(), ActivePage()] : const [TablesPage(), ActivePage()])),
          ]),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              NavigationDestination(icon: const Icon(Icons.table_restaurant_outlined), selectedIcon: const Icon(Icons.table_restaurant), label: tr(context, 'Tables', 'Tische')),
              if (cashier) ...[
                NavigationDestination(
                  icon: Badge(isLabelVisible: requests > 0, label: Text('$requests'), child: const Icon(Icons.point_of_sale_outlined)),
                  selectedIcon: const Icon(Icons.point_of_sale),
                  label: tr(context, 'Bills', 'Rechnungen'),
                ),
                NavigationDestination(icon: const Icon(Icons.receipt_outlined), selectedIcon: const Icon(Icons.receipt), label: tr(context, 'Receipts', 'Belege')),
              ],
              NavigationDestination(
                icon: Badge(isLabelVisible: readyCount > 0, label: Text('$readyCount'), backgroundColor: TriptiColors.green, child: const Icon(Icons.receipt_long_outlined)),
                selectedIcon: const Icon(Icons.receipt_long),
                label: tr(context, 'Tickets', 'Tickets'),
              ),
            ],
          ),
        );
      }),
    );
  }
}
