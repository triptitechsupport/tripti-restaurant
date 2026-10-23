import 'package:flutter/material.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'common.dart';

/// Every stock change (goods in, give out, counts, waste), newest first.
class StockHistoryPage extends StatefulWidget {
  const StockHistoryPage({super.key});

  @override
  State<StockHistoryPage> createState() => _StockHistoryPageState();
}

class _StockHistoryPageState extends State<StockHistoryPage> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String _q = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await AppScope.read(context).pb.collection('stock_adjustments').getList(perPage: 300, sort: '-created');
      if (mounted) setState(() => _rows = r.items.map((e) => e.toJson()).toList());
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  String _type(String t) => switch (t) {
        'restock' => tr(context, 'In', 'Zugang'),
        'waste' => tr(context, 'Waste', 'Verlust'),
        'initial' => tr(context, 'First count', 'Erstzählung'),
        _ => tr(context, 'Change', 'Korrektur'),
      };

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final shown = _rows.where((r) => q.isEmpty || '${r['itemName']} ${r['reason']} ${r['adjustedBy']}'.toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Stock history', 'Lagerverlauf'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
                TextField(decoration: InputDecoration(hintText: tr(context, 'Search item, reason or person', 'Artikel, Grund oder Person suchen'), prefixIcon: const Icon(Icons.search)), onChanged: (v) => setState(() => _q = v)),
                const SizedBox(height: 8),
                if (shown.isEmpty) EmptyState(Icons.history, tr(context, 'No changes yet.', 'Noch keine Änderungen.')),
                for (final r in shown)
                  Card(
                    child: ListTile(
                      dense: true,
                      title: Text('${r['itemName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text([
                        _type('${r['adjustmentType']}'),
                        dateTimeText(parseDate(r['created'])?.toLocal()),
                        if ('${r['adjustedBy'] ?? ''}'.isNotEmpty) '${r['adjustedBy']}',
                        if ('${r['reason'] ?? ''}'.isNotEmpty) '${r['reason']}',
                      ].join(' · ')),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('${toDouble(r['delta']) > 0 ? '+' : ''}${fmtNum(toDouble(r['delta']))}',
                            style: TextStyle(fontWeight: FontWeight.w800, color: toDouble(r['delta']) < 0 ? TriptiColors.red : TriptiColors.green)),
                        Text('${fmtNum(toDouble(r['previousQty']))} → ${fmtNum(toDouble(r['newQty']))}', style: const TextStyle(fontSize: 11.5, color: Colors.black54)),
                      ]),
                    ),
                  ),
              ]),
            ),
    );
  }
}
