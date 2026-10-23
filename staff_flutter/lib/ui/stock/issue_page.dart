import 'package:flutter/material.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'common.dart';

/// Give stock to a staff member: oldest expiry first, every lot recorded.
class IssuePage extends StatefulWidget {
  const IssuePage({super.key});

  @override
  State<IssuePage> createState() => _IssuePageState();
}

class _IssuePageState extends State<IssuePage> {
  List<Map<String, dynamic>> _items = [], _lots = [];
  final _staffId = TextEditingController(), _staffName = TextEditingController(), _qty = TextEditingController();
  Map<String, dynamic>? _item;
  bool _loading = true, _busy = false, _allowExpired = false;
  int _pickerKey = 0;
  String? _last;

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
        pb.collection('stock_lots').getFullList(sort: 'expiry,-created'),
      ]);
      if (!mounted) return;
      setState(() {
        _items = r[0].map((e) => e.toJson()).toList();
        _lots = r[1].map((e) => e.toJson()).toList();
        if (_item != null) _item = _items.where((i) => i['id'] == _item!['id']).firstOrNull;
      });
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  List<Map<String, dynamic>> get _itemLots => _item == null ? [] : _lots.where((l) => l['stockItem'] == _item!['id']).toList();

  double get _available {
    if (_item == null) return 0;
    final lots = _itemLots;
    final usable = fifoLots(lots, allowExpired: _allowExpired).fold<double>(0, (s, l) => s + lotRemaining(l));
    final inLots = lots.fold<double>(0, (s, l) => s + (lotRemaining(l) > 0 ? lotRemaining(l) : 0));
    final free = toDouble(_item!['quantity']) - inLots;
    return usable + (free > 0 ? free : 0);
  }

  Future<void> _issue() async {
    final qty = toDouble(_qty.text.replaceAll(',', '.'));
    if (_staffId.text.trim().isEmpty) {
      toast(context, tr(context, 'Enter who takes the stock (staff ID).', 'Eintragen, wer die Ware bekommt (Mitarbeiter-ID).'), error: true);
      return;
    }
    if (_item == null || qty <= 0) {
      toast(context, tr(context, 'Pick an item and a quantity.', 'Artikel und Menge wählen.'), error: true);
      return;
    }
    if (qty > _available + 1e-9) {
      toast(context, tr(context, 'Only ${fmtNum(_available)} ${_item!['unit'] ?? ''} can be given out.', 'Nur ${fmtNum(_available)} ${_item!['unit'] ?? ''} verfügbar.'), error: true);
      return;
    }
    final session = AppScope.read(context);
    final staff = _staffId.text.trim();
    final name = '${_item!['name']}';
    setState(() => _busy = true);
    var done = 0.0;
    final ok = await runAction(context, () async {
      done = await issueFromStock(session.pb,
          item: {..._item!},
          lots: _lots,
          qty: qty,
          staffId: staff,
          staffName: _staffName.text.trim().isEmpty ? staff : _staffName.text.trim(),
          role: 'stock',
          byName: session.displayName,
          byId: session.user?.id ?? '',
          reason: 'Issue to staff $staff${_allowExpired ? ' (expired override)' : ''}',
          allowExpired: _allowExpired);
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ok) {
        _last = tr(context, 'Gave ${fmtNum(done)} ${_item!['unit'] ?? ''} $name to $staff.', '${fmtNum(done)} ${_item!['unit'] ?? ''} $name an $staff ausgegeben.');
        _item = null;
        _qty.clear();
        _allowExpired = false;
        _pickerKey++;
      }
    });
    if (ok) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final lots = fifoLots(_itemLots, allowExpired: true);
    final expiredQty = _itemLots.where((l) => expiryState(l['expiry']) == 'expired').fold<double>(0, (s, l) => s + (lotRemaining(l) > 0 ? lotRemaining(l) : 0));
    return AbsorbPointer(
      absorbing: _busy,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
        PageIntro(Icons.outbox_outlined, tr(context, 'Give out', 'Ausgabe'), tr(context, 'Give stock to a staff member. The oldest expiry goes out first.', 'Ware an Mitarbeiter ausgeben. Was zuerst abläuft, geht zuerst raus.')),
        const SizedBox(height: 8),
        if (_last != null)
          Card(color: const Color(0xFFDCFCE7), child: ListTile(leading: const Icon(Icons.check_circle, color: TriptiColors.green), title: Text(_last!))),
        Row(children: [
          Expanded(child: TextField(controller: _staffId, decoration: InputDecoration(labelText: tr(context, 'Staff ID', 'Mitarbeiter-ID')))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: _staffName, decoration: InputDecoration(labelText: tr(context, 'Name (optional)', 'Name (optional)')))),
        ]),
        const SizedBox(height: 10),
        StockItemPicker(
          key: ValueKey(_pickerKey),
          items: _items,
          onSelected: (s) => setState(() {
            _item = s;
            _allowExpired = false;
          }),
        ),
        if (_item != null) ...[
          const SizedBox(height: 10),
          Text('${_item!['name']}: ${qtyText(_item!)} ${tr(context, 'in store', 'im Lager')}', style: const TextStyle(fontWeight: FontWeight.w700)),
          for (final l in lots)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '${tr(context, 'Lot', 'Charge')} ${'${l['barcode'] ?? ''}'.isNotEmpty ? l['barcode'] : '${l['id']}'.substring(0, 6)}: ${fmtNum(lotRemaining(l))} ${_item!['unit'] ?? ''}'
                '${parseDate(l['expiry']) != null ? ' · ${tr(context, 'exp.', 'Abl.')} ${dateText(parseDate(l['expiry'])!.toLocal())}' : ''}',
                style: TextStyle(fontSize: 12.5, color: switch (expiryState(l['expiry'])) { 'expired' => TriptiColors.red, 'warning' => TriptiColors.amber, _ => Colors.black87 }),
              ),
            ),
          if (expiredQty > 0)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(tr(context, 'Allow expired lots (${fmtNum(expiredQty)} ${_item!['unit'] ?? ''})', 'Abgelaufene Chargen erlauben (${fmtNum(expiredQty)} ${_item!['unit'] ?? ''})')),
              value: _allowExpired,
              onChanged: (v) => setState(() => _allowExpired = v),
            ),
          const SizedBox(height: 6),
          TextField(
            controller: _qty,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: '${tr(context, 'Quantity', 'Menge')} (${_item!['unit'] ?? ''})', helperText: '${tr(context, 'Available', 'Verfügbar')}: ${fmtNum(_available)} ${_item!['unit'] ?? ''}'),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _issue,
            icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.outbox_outlined),
            label: Text(tr(context, 'Give out', 'Ausgeben')),
          ),
        ],
      ]),
    );
  }
}
