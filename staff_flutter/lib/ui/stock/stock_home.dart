import 'package:flutter/material.dart';
import 'package:pocketbase/pocketbase.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../home.dart';
import '../kitchen/stock_requests_page.dart';
import 'goods_in_page.dart';
import 'history_page.dart';
import 'inventory_page.dart';
import 'issue_page.dart';
import 'waste_page.dart';
import '../common/assistant.dart';

/// Stock manager: stock list, kitchen requests, goods in, give out, waste.
class StockHome extends StatefulWidget {
  const StockHome({super.key});

  @override
  State<StockHome> createState() => _StockHomeState();
}

class _StockHomeState extends State<StockHome> {
  int _tab = 0, _openRequests = 0;
  UnsubscribeFunc? _unsub;

  PocketBase get pb => AppScope.read(context).pb;

  @override
  void initState() {
    super.initState();
    _count();
    pb.collection('stock_requests').subscribe('*', (_) => _count()).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _count() async {
    try {
      final r = await pb.collection('stock_requests').getList(perPage: 1, filter: openForStock.map((s) => 'status = "$s"').join(' || '));
      if (mounted) setState(() => _openRequests = r.totalItems);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr(context, 'Stock', 'Lager')),
          Text(session.displayName, style: const TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w400)),
        ]),
        actions: [
          AssistantButton(onScreen: (screen) {
            const keys = ['stock', 'requests', 'goodsin', 'giveout', 'waste'];
            final i = keys.indexOf(screen);
            if (screen == 'history') {
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StockHistoryPage()));
            } else if (i >= 0) {
              setState(() => _tab = i);
            }
          }),
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: tr(context, 'History', 'Verlauf'),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StockHistoryPage())),
          ),
          IconButton(icon: const Icon(Icons.more_vert), onPressed: () => showMoreSheet(context)),
        ],
      ),
      body: switch (_tab) {
        1 => const StockRequestsPage(stockMode: true),
        2 => const GoodsInPage(),
        3 => const IssuePage(),
        4 => const WastePage(),
        _ => const InventoryPage(),
      },
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), label: tr(context, 'Stock', 'Lager')),
          NavigationDestination(icon: Badge(isLabelVisible: _openRequests > 0, label: Text('$_openRequests'), child: const Icon(Icons.assignment_outlined)), label: tr(context, 'Requests', 'Anforderungen')),
          NavigationDestination(icon: const Icon(Icons.local_shipping_outlined), label: tr(context, 'Goods in', 'Wareneingang')),
          NavigationDestination(icon: const Icon(Icons.outbox_outlined), label: tr(context, 'Give out', 'Ausgabe')),
          NavigationDestination(icon: const Icon(Icons.delete_sweep_outlined), label: tr(context, 'Waste', 'Verlust')),
        ],
      ),
    );
  }
}
