import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/stock_ai.dart';
import '../../core/theme.dart';

const _units = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack', 'bottle', 'can'];

/// Supplier product list (e.g. AEKSHEA): search, tick the products you buy
/// and add them as stock items. Their article numbers are saved, so that
/// supplier's bills match them later. Returns true when items were added.
class CatalogPage extends StatefulWidget {
  const CatalogPage({super.key});

  @override
  State<CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends State<CatalogPage> {
  final _q = TextEditingController();
  Timer? _debounce;
  bool _loading = true, _adding = false, _added = false;
  int _seq = 0, _total = 0;
  List<Map<String, dynamic>> _items = [];
  Map<String, dynamic>? _supplier;
  final Map<String, Map<String, dynamic>> _picked = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _search());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final n = ++_seq;
    final session = AppScope.read(context);
    setState(() => _loading = true);
    try {
      final out = await searchCatalog(token: session.pb.authStore.token, q: _q.text);
      if (!mounted || n != _seq) return;
      final sups = out['suppliers'] as List? ?? const [];
      setState(() {
        _items = [for (final e in (out['items'] as List? ?? const [])) Map<String, dynamic>.from(e as Map)];
        _total = (out['total'] as num?)?.toInt() ?? 0;
        _supplier = sups.isEmpty ? null : Map<String, dynamic>.from(sups.first as Map);
        _loading = false;
      });
    } catch (e) {
      if (!mounted || n != _seq) return;
      setState(() => _loading = false);
      toast(context, e is StockAiError ? e.message : tr(context, 'No connection to the server.', 'Keine Verbindung zum Server.'), error: true);
    }
  }

  void _toggle(Map<String, dynamic> e) => setState(() {
        final a = '${e['articleNo']}';
        if (_picked.remove(a) == null) _picked[a] = {'supplier': e['supplier'], 'articleNo': a, 'name': e['name'], 'unit': e['unit'], 'text': e['text']};
      });

  Future<void> _editPick(Map<String, dynamic> p) async {
    final name = TextEditingController(text: '${p['name']}');
    var unit = '${p['unit']}';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text('${p['text']}', style: const TextStyle(fontSize: 15)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: InputDecoration(labelText: tr(context, 'Stock name', 'Lagername'), helperText: tr(context, 'Same name = one item for all pack sizes', 'Gleicher Name = ein Artikel für alle Größen'))),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _units.contains(unit) ? unit : 'pcs',
              decoration: InputDecoration(labelText: tr(context, 'Unit', 'Einheit')),
              items: [for (final u in _units) DropdownMenuItem(value: u, child: Text(u))],
              onChanged: (v) => set(() => unit = v ?? unit),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
          ],
        ),
      ),
    );
    if (ok == true && name.text.trim().isNotEmpty) setState(() => p..['name'] = name.text.trim()..['unit'] = unit);
  }

  Future<void> _add() async {
    final session = AppScope.read(context);
    setState(() => _adding = true);
    try {
      final out = await addFromCatalog(token: session.pb.authStore.token, items: _picked.values.toList());
      if (!mounted) return;
      final res = (out['results'] as List? ?? const []).cast<Map>();
      final linked = res.where((r) => r['status'] == 'linked').length;
      final exists = res.where((r) => r['status'] == 'exists').length;
      toast(
          context,
          tr(context, '${out['created']} new stock items${linked > 0 ? ', $linked added to an existing item' : ''}${exists > 0 ? ', $exists already in stock' : ''}.',
              '${out['created']} neue Lagerartikel${linked > 0 ? ', $linked zu bestehendem Artikel' : ''}${exists > 0 ? ', $exists schon im Lager' : ''}.'));
      setState(() {
        _picked.clear();
        _adding = false;
        _added = true;
      });
      _search();
    } catch (e) {
      if (!mounted) return;
      setState(() => _adding = false);
      toast(context, e is StockAiError ? e.message : tr(context, 'No connection to the server.', 'Keine Verbindung zum Server.'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final picks = _picked.values.toList();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_added);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(tr(context, 'Supplier catalogue', 'Lieferanten-Katalog'))),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: TextField(
              controller: _q,
              decoration: InputDecoration(
                hintText: tr(context, 'Name or article no. (atta 5kg, ghee, 4832)', 'Name oder Art.-Nr. (atta 5kg, ghee, 4832)'),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _loading ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))) : null,
              ),
              onChanged: (_) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 300), _search);
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(
              '${_supplier == null ? '' : '${_supplier!['supplier']}: ${_supplier!['count']} ${tr(context, 'products', 'Produkte')} · '}${_total > _items.length ? tr(context, 'showing ${_items.length} of $_total', '${_items.length} von $_total') : tr(context, '$_total found', '$_total gefunden')}',
              style: const TextStyle(fontSize: 12, color: Colors.black54),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 120),
              itemCount: _items.length,
              itemBuilder: (_, i) {
                final e = _items[i];
                final a = '${e['articleNo']}';
                final inStock = e['stockItemId'] != null;
                final pick = _picked[a];
                final sub = [
                  'Art. $a',
                  if ('${e['carton'] ?? ''}'.isNotEmpty) '${tr(context, 'carton', 'Karton')} ${e['carton']}',
                  if (e['active'] == false) tr(context, 'not active at supplier', 'beim Lieferanten inaktiv'),
                ].join(' · ');
                return Card(
                  child: CheckboxListTile(
                    value: inStock || pick != null,
                    onChanged: inStock ? null : (_) => _toggle(e),
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text('${e['text']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Text(
                      inStock ? '$sub\n✓ ${tr(context, 'In stock as', 'Im Lager als')} ${e['stockItemName']}' : pick != null ? '$sub\n→ ${pick['name']} (${pick['unit']})' : sub,
                      style: TextStyle(fontSize: 12, color: inStock ? TriptiColors.green : pick != null ? TriptiColors.primary : Colors.black54),
                    ),
                    secondary: pick != null ? IconButton(icon: const Icon(Icons.edit, size: 20), tooltip: tr(context, 'Name and unit', 'Name und Einheit'), onPressed: () => _editPick(pick)) : null,
                  ),
                );
              },
            ),
          ),
        ]),
        bottomSheet: picks.isEmpty
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    onPressed: _adding ? null : _add,
                    icon: _adding ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.add),
                    label: Text(tr(context, 'Add to stock (${picks.length})', 'Ins Lager übernehmen (${picks.length})')),
                  ),
                ),
              ),
      ),
    );
  }
}
