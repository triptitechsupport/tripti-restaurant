import 'package:flutter/material.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'common.dart';

String wasteReasonLabel(BuildContext context, String r) => switch (r) {
      'spoiled' => tr(context, 'Spoiled', 'Verdorben'),
      'expired' => tr(context, 'Expired', 'Abgelaufen'),
      'damaged' => tr(context, 'Damaged', 'Beschädigt'),
      'over-preparation' => tr(context, 'Made too much', 'Zu viel zubereitet'),
      'spill' => tr(context, 'Spilled', 'Verschüttet'),
      'burnt' => tr(context, 'Burnt', 'Verbrannt'),
      'customer-return' => tr(context, 'Sent back by guest', 'Vom Gast zurück'),
      _ => tr(context, 'Other', 'Sonstiges'),
    };

/// Record waste (lowers the stock when linked) and see the waste log.
class WastePage extends StatefulWidget {
  const WastePage({super.key});

  @override
  State<WastePage> createState() => _WastePageState();
}

class _WastePageState extends State<WastePage> {
  List<Map<String, dynamic>> _items = [], _records = [];
  Map<String, dynamic>? _item;
  String _freeName = '', _reason = 'spoiled', _filter = 'all';
  final _qty = TextEditingController(), _unit = TextEditingController(), _notes = TextEditingController();
  bool _loading = true, _busy = false;
  int _pickerKey = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final pb = AppScope.read(context).pb;
    try {
      final r = await Future.wait([
        pb.collection('stock_items').getFullList(sort: 'name'),
        pb.collection('waste_records').getList(perPage: 200, sort: '-wasteDate,-created').then((x) => x.items),
      ]);
      if (!mounted) return;
      setState(() {
        _items = r[0].map((e) => e.toJson()).toList();
        _records = r[1].map((e) => e.toJson()).toList();
      });
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    final name = _item != null ? '${_item!['name']}' : _freeName.trim();
    final qty = toDouble(_qty.text.replaceAll(',', '.'));
    if (name.isEmpty || qty <= 0) {
      toast(context, tr(context, 'Enter the item and a quantity.', 'Artikel und Menge eintragen.'), error: true);
      return;
    }
    final session = AppScope.read(context);
    final pb = session.pb;
    final item = _item;
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      await pb.collection('waste_records').create(body: {
        'itemName': name,
        'category': '${item?['category'] ?? ''}',
        'quantity': qty,
        'unit': _unit.text.trim(),
        'reason': _reason,
        'wasteDate': DateTime.now().toUtc().toIso8601String(),
        'responsibleUser': session.displayName,
        'responsibleUserId': session.user?.id ?? '',
        'responsibleRole': 'stock',
        'notes': _notes.text.trim(),
        'stockItem': item?['id'],
        'menuItem': '${item?['menuItem'] ?? ''}'.isEmpty ? null : item!['menuItem'],
      });
      if (item != null) {
        final prev = toDouble(item['quantity']);
        final inItemUnit = convertQty(qty, _unit.text.trim(), '${item['unit'] ?? ''}') ?? qty;
        try {
          await adjustStock(pb,
              item: {...item},
              type: 'waste',
              newQty: round(prev - inItemUnit, 3),
              reason: 'Waste: $_reason',
              notes: _notes.text,
              byName: session.displayName,
              byId: session.user?.id ?? '',
              role: 'stock');
        } catch (_) {
          // The waste record is saved even if the stock change fails.
        }
      }
    }, done: tr(context, 'Waste recorded', 'Verlust erfasst'));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) {
        _item = null;
        _freeName = '';
        _qty.clear();
        _unit.clear();
        _notes.clear();
        _pickerKey++;
      }
    });
    if (ok) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final shown = _records.where((r) => _filter == 'all' || r['reason'] == _filter).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: AbsorbPointer(
        absorbing: _busy,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(tr(context, 'Record waste', 'Verlust erfassen'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text(tr(context, 'Pick a stock item to lower its quantity too, or type any name.', 'Lagerartikel wählen, damit auch der Bestand sinkt, oder einen Namen eintippen.'), style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
                const SizedBox(height: 6),
                StockItemPicker(
                  key: ValueKey(_pickerKey),
                  items: _items,
                  onSelected: (s) => setState(() {
                    _item = s;
                    _unit.text = '${s['unit'] ?? ''}';
                  }),
                  onText: (v) => setState(() {
                    _freeName = v;
                    if (_item != null && v != '${_item!['name']}') _item = null;
                  }),
                ),
                if (_item != null) Padding(padding: const EdgeInsets.fromLTRB(4, 4, 0, 8), child: Text('${tr(context, 'In store', 'Im Lager')}: ${qtyText(_item!)}', style: const TextStyle(fontSize: 12, color: Colors.black54))),
                Row(children: [
                  Expanded(child: TextField(controller: _qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Quantity', 'Menge')))),
                  const SizedBox(width: 10),
                  SizedBox(width: 90, child: TextField(controller: _unit, decoration: InputDecoration(labelText: tr(context, 'Unit', 'Einheit')))),
                ]),
                DropdownButtonFormField<String>(
                  initialValue: _reason,
                  decoration: InputDecoration(labelText: tr(context, 'Reason', 'Grund')),
                  items: [for (final r in wasteReasons) DropdownMenuItem(value: r, child: Text(wasteReasonLabel(context, r)))],
                  onChanged: (v) => setState(() => _reason = v ?? _reason),
                ),
                TextField(controller: _notes, decoration: InputDecoration(labelText: tr(context, 'Notes', 'Notizen'))),
                const SizedBox(height: 12),
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: TriptiColors.red, minimumSize: const Size.fromHeight(48)),
                  onPressed: _save,
                  icon: const Icon(Icons.delete_sweep_outlined),
                  label: Text(tr(context, 'Record waste', 'Verlust erfassen')),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: Text(tr(context, 'Waste log', 'Verlustliste'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
            DropdownButton<String>(
              value: _filter,
              items: [
                DropdownMenuItem(value: 'all', child: Text(tr(context, 'All reasons', 'Alle Gründe'))),
                for (final r in wasteReasons) DropdownMenuItem(value: r, child: Text(wasteReasonLabel(context, r))),
              ],
              onChanged: (v) => setState(() => _filter = v ?? 'all'),
            ),
          ]),
          if (shown.isEmpty) EmptyState(Icons.delete_outline, tr(context, 'No waste recorded.', 'Kein Verlust erfasst.')),
          for (final r in shown)
            Card(
              child: ListTile(
                dense: true,
                title: Text('${r['itemName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text([
                  wasteReasonLabel(context, '${r['reason']}'),
                  dateTimeText(parseDate(r['wasteDate'])?.toLocal()),
                  if ('${r['responsibleUser'] ?? ''}'.isNotEmpty) '${r['responsibleUser']}',
                  if ('${r['notes'] ?? ''}'.isNotEmpty) '${r['notes']}',
                ].join(' · ')),
                trailing: Text('${fmtNum(toDouble(r['quantity']))} ${r['unit'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.red)),
              ),
            ),
        ]),
      ),
    );
  }
}
