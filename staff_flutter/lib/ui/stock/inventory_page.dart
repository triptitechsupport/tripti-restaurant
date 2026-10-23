import 'dart:async';

import 'package:flutter/material.dart';
import 'package:pocketbase/pocketbase.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'common.dart';

/// The stock list: search, low-stock filter, counts, adjust and edit.
class InventoryPage extends StatefulWidget {
  const InventoryPage({super.key});

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true, _lowOnly = false;
  String _q = '';
  UnsubscribeFunc? _unsub;
  Timer? _debounce;

  PocketBase get pb => AppScope.read(context).pb;

  @override
  void initState() {
    super.initState();
    _load();
    pb.collection('stock_items').subscribe('*', (_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 400), _load);
    }).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _unsub?.call();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await pb.collection('stock_items').getFullList(sort: 'name');
      if (!mounted) return;
      setState(() {
        _items = r.map((e) => e.toJson()).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      toast(context, errorMessage(e), error: true);
    }
  }

  Future<void> _edit([Map<String, dynamic>? item]) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => StockItemEditor(item: item, taken: {for (final i in _items) '${i['barcode'] ?? ''}'})));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final q = _q.trim().toLowerCase();
    final shown = _items.where((it) {
      if (_lowOnly && stockStatus(it) == 'ok') return false;
      if (q.isEmpty) return true;
      return '${it['name']}'.toLowerCase().contains(q) || '${it['category'] ?? ''}'.toLowerCase().contains(q) || '${it['barcode'] ?? ''}'.contains(q);
    }).toList();
    final low = _items.where((i) => stockStatus(i) == 'low').length;
    final out = _items.where((i) => stockStatus(i) == 'out').length;
    final expiring = _items.where((i) => ['warning', 'expired'].contains(expiryState(i['expiry']))).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
        LayoutBuilder(builder: (context, c) {
          final cols = c.maxWidth >= 560 ? 4 : 2;
          final w = (c.maxWidth - 8 * (cols - 1)) / cols;
          return Wrap(spacing: 8, runSpacing: 8, children: [
            _stat(w, Icons.inventory_2_outlined, tr(context, 'Items', 'Artikel'), '${_items.length}', TriptiColors.ink),
            _stat(w, Icons.trending_down, tr(context, 'Low', 'Knapp'), '$low', TriptiColors.amber),
            _stat(w, Icons.remove_shopping_cart_outlined, tr(context, 'Out', 'Leer'), '$out', TriptiColors.red),
            _stat(w, Icons.event_busy, tr(context, 'Expiring', 'Läuft ab'), '$expiring', TriptiColors.blue),
          ]);
        }),
        const SizedBox(height: 10),
        TextField(
          decoration: InputDecoration(hintText: tr(context, 'Search name, category or barcode', 'Name, Kategorie oder Barcode suchen'), prefixIcon: const Icon(Icons.search)),
          onChanged: (v) => setState(() => _q = v),
        ),
        const SizedBox(height: 8),
        Row(children: [
          FilterChip(label: Text(tr(context, 'Low and out only', 'Nur knapp und leer')), selected: _lowOnly, onSelected: (v) => setState(() => _lowOnly = v)),
          const Spacer(),
          FilledButton.icon(onPressed: () => _edit(), icon: const Icon(Icons.add), label: Text(tr(context, 'New item', 'Neuer Artikel'))),
        ]),
        const SizedBox(height: 6),
        if (shown.isEmpty) EmptyState(Icons.inventory_2_outlined, _items.isEmpty ? tr(context, 'No stock items yet.', 'Noch keine Lagerartikel.') : tr(context, 'Nothing matches.', 'Keine Treffer.')),
        for (final it in shown) _tile(it),
      ]),
    );
  }

  Widget _stat(double width, IconData icon, String label, String value, Color color) => Container(
        width: width,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: TriptiColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: TriptiColors.border)),
        child: Row(children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: color)),
            Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ]),
        ]),
      );

  Widget _tile(Map<String, dynamic> it) {
    final exp = expiryState(it['expiry']);
    final days = daysUntilExpiry(it['expiry']);
    final sub = [
      if ('${it['category'] ?? ''}'.isNotEmpty) '${it['category']}',
      if (toDouble(it['minStock']) > 0) '${tr(context, 'min', 'min')} ${fmtNum(toDouble(it['minStock']))}',
      if (toDouble(it['unitCost']) > 0) '${euro(toDouble(it['unitCost']))}/${it['unit'] ?? ''}',
      if (exp == 'expired') tr(context, 'expired', 'abgelaufen'),
      if (exp == 'warning') tr(context, 'expires in $days d', 'läuft in $days T ab'),
    ].join(' · ');
    return Card(
      child: ListTile(
        onTap: () => _sheet(it),
        title: Text('${it['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: sub.isEmpty ? null : Text(sub, style: TextStyle(color: exp == 'expired' ? TriptiColors.red : null)),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(qtyText(it), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 3),
          stockPill(context, it),
        ]),
      ),
    );
  }

  void _sheet(Map<String, dynamic> it) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: TriptiColors.card,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${it['name']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: TriptiColors.ink)),
            const SizedBox(height: 4),
            Text('${tr(context, 'In store', 'Im Lager')}: ${qtyText(it)}${'${it['barcode'] ?? ''}'.isNotEmpty ? ' · ${it['barcode']}' : ''}'),
            if (parseDate(it['expiry']) != null) Text('${tr(context, 'Expiry', 'Ablauf')}: ${dateText(parseDate(it['expiry'])?.toLocal())}'),
            if ('${it['notes'] ?? ''}'.isNotEmpty) Text('${it['notes']}', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 14),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () {
                Navigator.pop(ctx);
                _adjust(it);
              },
              icon: const Icon(Icons.exposure),
              label: Text(tr(context, 'Change quantity', 'Menge ändern')),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                _edit(it);
              },
              icon: const Icon(Icons.edit_outlined),
              label: Text(tr(context, 'Edit item', 'Artikel bearbeiten')),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _adjust(Map<String, dynamic> it) async {
    final session = AppScope.read(context);
    var type = 'restock';
    final delta = TextEditingController(), newQty = TextEditingController(text: fmtNum(toDouble(it['quantity']))), reason = TextEditingController(), notes = TextEditingController();
    final prev = toDouble(it['quantity']);
    double computed() {
      final d = toDouble(delta.text.replaceAll(',', '.')).abs();
      return switch (type) {
        'restock' => prev + d,
        'waste' => (prev - d) < 0 ? 0 : prev - d,
        _ => toDouble(newQty.text.replaceAll(',', '.')),
      };
    }

    String typeLabel(String t) => switch (t) {
          'restock' => tr(context, 'Add (restock)', 'Zugang'),
          'waste' => tr(context, 'Remove (waste)', 'Abgang (Verlust)'),
          'correction' => tr(context, 'Set counted amount', 'Gezählte Menge setzen'),
          _ => tr(context, 'Initial count', 'Erstzählung'),
        };

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text('${it['name']}'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: type,
                decoration: InputDecoration(labelText: tr(context, 'Type', 'Art')),
                items: [for (final t in adjustTypes) DropdownMenuItem(value: t, child: Text(typeLabel(t)))],
                onChanged: (v) => set(() => type = v ?? type),
              ),
              const SizedBox(height: 8),
              if (type == 'restock' || type == 'waste')
                TextField(controller: delta, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: '${tr(context, 'Amount', 'Menge')} (${it['unit'] ?? ''})'), onChanged: (_) => set(() {}))
              else
                TextField(controller: newQty, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: '${tr(context, 'New quantity', 'Neue Menge')} (${it['unit'] ?? ''})'), onChanged: (_) => set(() {})),
              TextField(controller: reason, decoration: InputDecoration(labelText: tr(context, 'Reason', 'Grund'))),
              TextField(controller: notes, decoration: InputDecoration(labelText: tr(context, 'Notes', 'Notizen'))),
              const SizedBox(height: 10),
              Text('${fmtNum(prev)} → ${fmtNum(computed())} ${it['unit'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Cancel', 'Abbrechen'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Save', 'Speichern'))),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    if ((type == 'restock' || type == 'waste') && !(toDouble(delta.text.replaceAll(',', '.')) > 0)) {
      toast(context, tr(context, 'Enter an amount above 0.', 'Menge über 0 eingeben.'), error: true);
      return;
    }
    if ((type == 'correction' || type == 'initial') && newQty.text.trim().isEmpty) {
      toast(context, tr(context, 'Enter the new quantity.', 'Neue Menge eingeben.'), error: true);
      return;
    }
    final ok2 = await runAction(
      context,
      () => adjustStock(pb, item: it, type: type, newQty: round(computed(), 3), reason: reason.text, notes: notes.text, byName: session.displayName, byId: session.user?.id ?? '', role: 'stock'),
      done: tr(context, 'Quantity saved', 'Menge gespeichert'),
    );
    if (ok2) _load();
  }
}

/// New or existing stock item.
class StockItemEditor extends StatefulWidget {
  const StockItemEditor({super.key, this.item, this.taken = const {}});
  final Map<String, dynamic>? item;
  final Set<String> taken;

  @override
  State<StockItemEditor> createState() => _StockItemEditorState();
}

class _StockItemEditorState extends State<StockItemEditor> {
  late final TextEditingController _name, _category, _unit, _qty, _min, _cost, _notes, _barcode;
  DateTime? _expiry;
  bool _perishable = false, _busy = false;

  Map<String, dynamic>? get it => widget.item;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: '${it?['name'] ?? ''}');
    _category = TextEditingController(text: '${it?['category'] ?? ''}');
    _unit = TextEditingController(text: '${it?['unit'] ?? 'kg'}');
    _qty = TextEditingController(text: it == null ? '' : fmtNum(toDouble(it!['quantity'])));
    _min = TextEditingController(text: it == null || toDouble(it!['minStock']) == 0 ? '' : fmtNum(toDouble(it!['minStock'])));
    _cost = TextEditingController(text: it == null || toDouble(it!['unitCost']) == 0 ? '' : '${it!['unitCost']}');
    _notes = TextEditingController(text: '${it?['notes'] ?? ''}');
    _barcode = TextEditingController(text: '${it?['barcode'] ?? ''}'.isEmpty ? newBarcode() : '${it!['barcode']}');
    _expiry = parseDate(it?['expiry'])?.toLocal();
    _perishable = it?['perishable'] == true;
  }

  Future<void> _save() async {
    final session = AppScope.read(context);
    final pb = session.pb;
    final name = _name.text.trim();
    final bc = _barcode.text.trim();
    if (name.isEmpty) {
      toast(context, tr(context, 'Enter a name.', 'Namen eingeben.'), error: true);
      return;
    }
    if (bc.isNotEmpty && !RegExp(r'^\d{1,40}$').hasMatch(bc)) {
      toast(context, tr(context, 'Barcode must be digits only.', 'Barcode nur aus Ziffern.'), error: true);
      return;
    }
    if (bc.isNotEmpty && bc != '${it?['barcode'] ?? ''}' && widget.taken.contains(bc)) {
      toast(context, tr(context, 'This barcode belongs to another item.', 'Dieser Barcode gehört schon zu einem anderen Artikel.'), error: true);
      return;
    }
    if (_perishable && _expiry == null) {
      toast(context, tr(context, 'Perishable items need an expiry date.', 'Verderbliche Artikel brauchen ein Ablaufdatum.'), error: true);
      return;
    }
    final cost = toDouble(_cost.text.replaceAll(',', '.'));
    final body = {
      'name': name,
      'category': _category.text.trim(),
      'unit': _unit.text.trim(),
      'minStock': toDouble(_min.text.replaceAll(',', '.')),
      'unitCost': cost > 0 ? cost : null,
      'notes': _notes.text.trim(),
      'barcode': bc,
      'perishable': _perishable,
      'expiry': _expiry?.toUtc().toIso8601String(),
      if (it == null) 'preparedAt': DateTime.now().toUtc().toIso8601String(),
      if (it == null) 'quantity': toDouble(_qty.text.replaceAll(',', '.')),
    };
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      if (it != null) {
        await pb.collection('stock_items').update(it!['id'], body: body);
      } else {
        final created = await pb.collection('stock_items').create(body: body);
        final q = toDouble(created.toJson()['quantity']);
        await pb.collection('stock_adjustments').create(body: {
          'stockItem': created.id,
          'itemName': name,
          'adjustmentType': 'initial',
          'delta': q,
          'previousQty': 0,
          'newQty': q,
          'reason': bc.isNotEmpty ? 'Initial count · barcode $bc' : 'Initial count',
          'adjustedBy': session.displayName,
          'adjustedById': session.user?.id ?? '',
          'adjustedByRole': 'stock',
        });
      }
    }, done: tr(context, 'Item saved', 'Artikel gespeichert'));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop(true);
  }

  Future<void> _delete() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(title: Text(tr(context, 'Delete ${it!['name']}?', '${it!['name']} löschen?')), actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: TriptiColors.red), onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Delete', 'Löschen'))),
      ]),
    );
    if (yes != true || !mounted) return;
    final pb = AppScope.read(context).pb;
    final ok = await runAction(context, () => pb.collection('stock_items').delete(it!['id']), done: tr(context, 'Item deleted', 'Artikel gelöscht'));
    if (ok && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    const units = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack', 'bottle', 'can'];
    return Scaffold(
      appBar: AppBar(
        title: Text(it == null ? tr(context, 'New item', 'Neuer Artikel') : '${it!['name']}'),
        actions: [if (it != null) IconButton(icon: const Icon(Icons.delete_outline), tooltip: tr(context, 'Delete', 'Löschen'), onPressed: _delete)],
      ),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          TextField(controller: _name, decoration: InputDecoration(labelText: tr(context, 'Name', 'Name'))),
          TextField(controller: _category, decoration: InputDecoration(labelText: tr(context, 'Category', 'Kategorie'))),
          Row(children: [
            Expanded(child: TextField(controller: _unit, decoration: InputDecoration(labelText: tr(context, 'Unit', 'Einheit')))),
            PopupMenuButton<String>(
              icon: const Icon(Icons.arrow_drop_down),
              onSelected: (u) => setState(() => _unit.text = u),
              itemBuilder: (_) => [for (final u in units) PopupMenuItem(value: u, child: Text(u))],
            ),
          ]),
          if (it == null) TextField(controller: _qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Quantity in store now', 'Menge jetzt im Lager'))),
          if (it != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('${tr(context, 'In store', 'Im Lager')}: ${qtyText(it!)} (${tr(context, 'change it with "Change quantity"', 'über "Menge ändern" ändern')})', style: const TextStyle(color: Colors.black54)),
            ),
          TextField(controller: _min, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Minimum stock (warn below)', 'Mindestbestand (Warnung darunter)'))),
          TextField(controller: _cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Price per unit (€)', 'Preis pro Einheit (€)'))),
          Row(children: [
            Expanded(child: TextField(controller: _barcode, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr(context, 'Barcode', 'Barcode')))),
            IconButton(icon: const Icon(Icons.autorenew), tooltip: tr(context, 'New barcode', 'Neuer Barcode'), onPressed: () => setState(() => _barcode.text = newBarcode())),
          ]),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(tr(context, 'Perishable', 'Verderblich')), value: _perishable, onChanged: (v) => setState(() => _perishable = v)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(tr(context, 'Expiry date', 'Ablaufdatum')),
            subtitle: Text(_expiry == null ? tr(context, 'none', 'keins') : dateText(_expiry)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              if (_expiry != null) IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() => _expiry = null)),
              const Icon(Icons.calendar_month),
            ]),
            onTap: () async {
              final d = await pickDate(context, _expiry);
              if (d != null) setState(() => _expiry = DateTime(d.year, d.month, d.day, 23, 59));
            },
          ),
          TextField(controller: _notes, maxLines: 2, decoration: InputDecoration(labelText: tr(context, 'Notes', 'Notizen'))),
          const SizedBox(height: 20),
          FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _save, icon: const Icon(Icons.save), label: Text(tr(context, 'Save', 'Speichern'))),
        ]),
      ),
    );
  }
}
