import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pocketbase/pocketbase.dart';
import 'package:printing/printing.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';

Color _costColor(double? p) => p == null ? Colors.black54 : p > 35 ? TriptiColors.red : p > 28 ? TriptiColors.amber : TriptiColors.green;

/// One recipe per dish: ingredients, portions, method and cost per portion.
/// canEdit: kitchen manager / admin. Kitchen staff only read.
class RecipesPage extends StatefulWidget {
  const RecipesPage({super.key, required this.canEdit});
  final bool canEdit;

  @override
  State<RecipesPage> createState() => _RecipesPageState();
}

class _RecipesPageState extends State<RecipesPage> {
  List<Map<String, dynamic>> _menu = [], _recipes = [];
  Map<String, Map<String, dynamic>> _stock = {};
  bool _loading = true;
  final _q = TextEditingController();
  String _cat = '';
  bool _missingOnly = false;
  bool _byCost = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final pb = AppScope.read(context).pb;
    try {
      final r = await Future.wait([
        pb.collection('menu_items').getFullList(sort: 'category,nameEN', fields: 'id,name,nameEN,nameDE,category,price,availability'),
        pb.collection('recipes').getFullList(),
        if (widget.canEdit) pb.collection('stock_items').getFullList(sort: 'name', fields: 'id,name,unit,unitCost,quantity,minStock,category').catchError((_) => <RecordModel>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _menu = r[0].map((e) => e.toJson()).toList();
        _recipes = r[1].map((e) => e.toJson()).toList();
        _stock = widget.canEdit ? {for (final s in r[2]) s.id: s.toJson()} : {};
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        toast(context, errorMessage(e), error: true);
      }
    }
  }

  Map<String, dynamic>? _recipeOf(String dishId) => _recipes.where((r) => r['menuItem'] == dishId).firstOrNull;

  String _name(Map<String, dynamic> m, bool de) =>
      '${de ? ('${m['nameDE'] ?? ''}'.isNotEmpty ? m['nameDE'] : ('${m['nameEN'] ?? ''}'.isNotEmpty ? m['nameEN'] : m['name'])) : ('${m['nameEN'] ?? ''}'.isNotEmpty ? m['nameEN'] : m['name'])}';

  @override
  Widget build(BuildContext context) {
    final de = AppScope.of(context).de;
    if (_loading) return const Center(child: CircularProgressIndicator());
    final q = _q.text.trim().toLowerCase();
    final cats = _menu.map((m) => '${m['category'] ?? ''}').where((c) => c.isNotEmpty).toSet().toList();
    final costs = <String, ({double perPortion, double? foodCostPct, int missing})>{};
    if (widget.canEdit) {
      for (final m in _menu) {
        final r = _recipeOf(m['id']);
        if (r != null) costs[m['id']] = recipeCost(r, _stock, toDouble(m['price']));
      }
    }
    final rows = _menu.where((m) {
      if (_cat.isNotEmpty && m['category'] != _cat) return false;
      if (_missingOnly && _recipeOf(m['id']) != null) return false;
      return q.isEmpty || '${m['name']} ${m['nameEN']} ${m['nameDE']}'.toLowerCase().contains(q);
    }).toList();
    if (_byCost) rows.sort((a, b) => (costs[b['id']]?.foodCostPct ?? -1).compareTo(costs[a['id']]?.foodCostPct ?? -1));
    final pcts = costs.values.map((c) => c.foodCostPct).whereType<double>().toList();
    final withRecipe = _menu.where((m) => _recipeOf(m['id']) != null).length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        SummaryRow([
          SummaryStat(Icons.menu_book_outlined, tr(context, 'With recipe', 'Mit Rezept'), '$withRecipe / ${_menu.length}', withRecipe == _menu.length ? TriptiColors.green : TriptiColors.ink),
          SummaryStat(Icons.pie_chart_outline, tr(context, 'Avg food cost', 'Wareneinsatz Ø'), pcts.isEmpty ? '–' : '${round(pcts.reduce((a, b) => a + b) / pcts.length, 1)}%', pcts.isEmpty ? TriptiColors.ink : _costColor(pcts.reduce((a, b) => a + b) / pcts.length)),
          SummaryStat(Icons.warning_amber_rounded, tr(context, 'Above 35%', 'Über 35%'), '${pcts.where((p) => p > 35).length}', pcts.where((p) => p > 35).isEmpty ? TriptiColors.green : TriptiColors.red),
        ]),
        const SizedBox(height: 4),
        const SizedBox(height: 8),
        TextField(controller: _q, onChanged: (_) => setState(() {}), decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tr(context, 'Search dishes', 'Gerichte suchen'))),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            FilterChip(label: Text(tr(context, 'Without recipe', 'Ohne Rezept')), selected: _missingOnly, onSelected: (v) => setState(() => _missingOnly = v)),
            const SizedBox(width: 8),
            if (widget.canEdit) ...[
              FilterChip(label: Text(tr(context, 'Highest food cost', 'Höchster Wareneinsatz')), selected: _byCost, onSelected: (v) => setState(() => _byCost = v)),
              const SizedBox(width: 8),
            ],
            ChoiceChip(label: Text(tr(context, 'All', 'Alle')), selected: _cat.isEmpty, onSelected: (_) => setState(() => _cat = '')),
            for (final c in cats) Padding(padding: const EdgeInsets.only(left: 8), child: ChoiceChip(label: Text(c), selected: _cat == c, onSelected: (_) => setState(() => _cat = c))),
          ]),
        ),
        const SizedBox(height: 8),
        if (rows.isEmpty) EmptyState(Icons.menu_book, tr(context, 'No dishes found.', 'Keine Gerichte gefunden.')),
        for (final m in rows)
          Card(
            child: ListTile(
              onTap: () => _open(m),
              title: Text(_name(m, de), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text.rich(TextSpan(children: [
                TextSpan(text: '${m['category'] ?? ''} · ${euro(toDouble(m['price']))}'),
                if ((costs[m['id']]?.perPortion ?? 0) > 0) TextSpan(text: '\n${euro(costs[m['id']]!.perPortion)} ${tr(context, 'per portion', 'pro Portion')}'),
                if (costs[m['id']]?.foodCostPct != null)
                  TextSpan(text: '  ${costs[m['id']]!.foodCostPct}% ${tr(context, 'food cost', 'Wareneinsatz')}', style: TextStyle(color: _costColor(costs[m['id']]!.foodCostPct), fontWeight: FontWeight.w700)),
              ])),
              trailing: _recipeOf(m['id']) != null
                  ? StatusPill(tr(context, 'Recipe', 'Rezept'), TriptiColors.green, icon: Icons.check_circle)
                  : StatusPill(tr(context, 'No recipe', 'Kein Rezept'), Colors.grey),
            ),
          ),
      ]),
    );
  }

  Future<void> _open(Map<String, dynamic> dish) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => RecipeEditor(dish: dish, recipe: _recipeOf(dish['id']), stock: _stock, canEdit: widget.canEdit, dishName: _name(dish, AppScope.read(context).de)),
    ));
    if (changed == true) _load();
  }
}

class RecipeEditor extends StatefulWidget {
  const RecipeEditor({super.key, required this.dish, required this.recipe, required this.stock, required this.canEdit, required this.dishName});
  final Map<String, dynamic> dish;
  final Map<String, dynamic>? recipe;
  final Map<String, Map<String, dynamic>> stock;
  final bool canEdit;
  final String dishName;

  @override
  State<RecipeEditor> createState() => _RecipeEditorState();
}

class _Line {
  _Line({String name = '', this.stockItem = '', String qty = '', this.unit = 'g'})
      : name = TextEditingController(text: name),
        qty = TextEditingController(text: qty);
  final TextEditingController name, qty;
  String stockItem, unit;
}

class _RecipeEditorState extends State<RecipeEditor> {
  late final TextEditingController _yield, _steps, _notes, _cookFor;
  late final List<_Line> _lines;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final r = widget.recipe;
    _yield = TextEditingController(text: '${r?['yieldPortions'] ?? 1}');
    _cookFor = TextEditingController(text: '${r?['yieldPortions'] ?? 1}');
    _steps = TextEditingController(text: '${r?['steps'] ?? ''}');
    _notes = TextEditingController(text: '${r?['notes'] ?? ''}');
    _lines = [
      for (final l in jsonList(r?['ingredients'])) _Line(name: '${l['name'] ?? ''}', stockItem: '${l['stockItem'] ?? ''}', qty: '${l['qty'] ?? ''}', unit: '${l['unit'] ?? ''}'),
    ];
    if (_lines.isEmpty && widget.canEdit) _lines.add(_Line());
  }

  @override
  void dispose() {
    for (final c in [_yield, _steps, _notes, _cookFor]) {
      c.dispose();
    }
    for (final l in _lines) {
      l.name.dispose();
      l.qty.dispose();
    }
    super.dispose();
  }

  List<Map<String, dynamic>> get _ingredients => [
        for (final l in _lines)
          if (l.name.text.trim().isNotEmpty && toDouble(l.qty.text.replaceAll(',', '.')) > 0)
            {'name': l.name.text.trim(), 'stockItem': l.stockItem, 'qty': round(toDouble(l.qty.text.replaceAll(',', '.')), 3), 'unit': l.unit},
      ];

  void _pickStock(_Line l, Map<String, dynamic> s) {
    final u = '${s['unit'] ?? ''}'.trim().toLowerCase();
    setState(() {
      l.name.text = '${s['name']}';
      l.stockItem = s['id'];
      l.unit = u == 'kg' ? 'g' : u == 'l' ? 'ml' : (u.isEmpty ? 'pcs' : u);
    });
  }

  (String, Color) _storeNote(Map<String, dynamic> ing) {
    final item = stockFor(ing, widget.stock);
    if (item == null) return (ing['name'].toString().isEmpty ? '' : tr(context, 'not in stock list', 'nicht in der Lagerliste'), Colors.black45);
    final q = toDouble(item['quantity']);
    final unit = '${item['unit'] ?? ''}';
    if (q <= 0) return (tr(context, 'none in store', 'nichts im Lager'), TriptiColors.red);
    final min = toDouble(item['minStock']);
    if (min > 0 && q <= min) return (tr(context, 'only ${fmtNum(q)} $unit in store', 'nur ${fmtNum(q)} $unit im Lager'), TriptiColors.amber);
    return (tr(context, '${fmtNum(q)} $unit in store', '${fmtNum(q)} $unit im Lager'), TriptiColors.green);
  }

  Future<void> _save() async {
    final ing = _ingredients;
    if (ing.isEmpty) {
      toast(context, tr(context, 'Add at least one ingredient.', 'Mindestens eine Zutat eintragen.'), error: true);
      return;
    }
    final session = AppScope.read(context);
    final body = {
      'menuItem': widget.dish['id'],
      'yieldPortions': toDouble(_yield.text) >= 1 ? toDouble(_yield.text).round() : 1,
      'ingredients': ing,
      'steps': _steps.text,
      'notes': _notes.text,
      'updatedBy': session.displayName,
    };
    setState(() => _saving = true);
    final ok = await runAction(context, () async {
      final r = widget.recipe;
      if (r != null) {
        await session.pb.collection('recipes').update(r['id'], body: body);
      } else {
        await session.pb.collection('recipes').create(body: body);
      }
    }, done: tr(context, 'Recipe saved', 'Rezept gespeichert'));
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) Navigator.of(context).pop(true);
  }

  Future<void> _delete() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr(context, 'Delete this recipe?', 'Dieses Rezept löschen?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: TriptiColors.red), onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Delete', 'Löschen'))),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    final pb = AppScope.read(context).pb;
    final ok = await runAction(context, () => pb.collection('recipes').delete(widget.recipe!['id']), done: tr(context, 'Recipe deleted', 'Rezept gelöscht'));
    if (ok && mounted) Navigator.of(context).pop(true);
  }

  Future<void> _print() async {
    final font = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans.ttf'));
    final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
    if (!mounted) return;
    final n = toDouble(_cookFor.text) > 0 ? toDouble(_cookFor.text) : toDouble(_yield.text);
    final cookFor = tr(context, 'Cook for', 'Kochen für'), portions = tr(context, 'portions', 'Portionen');
    final method = tr(context, 'Method', 'Zubereitung'), notes = tr(context, 'Notes', 'Notizen');
    final doc = pw.Document(theme: pw.ThemeData.withFont(base: font, bold: bold));
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      build: (_) => [
        pw.Text(widget.dishName, style: pw.TextStyle(font: bold, fontSize: 20)),
        pw.Text('$cookFor: ${fmtNum(n)} $portions'),
        pw.SizedBox(height: 10),
        for (final l in _lines)
          if (l.name.text.trim().isNotEmpty)
            pw.Container(
              padding: const pw.EdgeInsets.symmetric(vertical: 4),
              decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey400))),
              child: pw.Row(children: [pw.Expanded(child: pw.Text(l.name.text)), pw.Text('${scaledQty(l.qty.text.replaceAll(',', '.'), _yield.text, n)} ${l.unit}')]),
            ),
        if (_steps.text.trim().isNotEmpty) ...[pw.SizedBox(height: 12), pw.Text(method, style: pw.TextStyle(font: bold, fontSize: 14)), pw.Text(_steps.text)],
        if (_notes.text.trim().isNotEmpty) ...[pw.SizedBox(height: 12), pw.Text(notes, style: pw.TextStyle(font: bold, fontSize: 14)), pw.Text(_notes.text)],
      ],
    ));
    final bytes = await doc.save();
    await Printing.layoutPdf(name: widget.dishName, onLayout: (_) async => Uint8List.fromList(bytes));
  }

  @override
  Widget build(BuildContext context) {
    final cost = recipeCost({'yieldPortions': _yield.text, 'ingredients': _ingredients}, widget.stock, toDouble(widget.dish['price']));
    final cookFor = toDouble(_cookFor.text) > 0 ? toDouble(_cookFor.text) : (toDouble(_yield.text) > 0 ? toDouble(_yield.text) : 1);
    final stockList = widget.stock.values.toList()..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.dishName),
        actions: [IconButton(icon: const Icon(Icons.print), tooltip: tr(context, 'Print', 'Drucken'), onPressed: _print)],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text('${widget.dish['category'] ?? ''} · ${euro(toDouble(widget.dish['price']))}', style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 12),
        if (!widget.canEdit && widget.recipe == null)
          Text(tr(context, 'No recipe. Only the kitchen manager can change recipes.', 'Kein Rezept. Nur die Küchenleitung kann Rezepte ändern.'))
        else ...[
          Row(children: [
            Expanded(child: Text(tr(context, 'Portions this recipe makes', 'Portionen aus diesem Rezept'), style: const TextStyle(fontWeight: FontWeight.w700))),
            SizedBox(width: 80, child: TextField(controller: _yield, enabled: widget.canEdit, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}))),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.groups, size: 20, color: Colors.black54),
            const SizedBox(width: 6),
            Expanded(child: Text(tr(context, 'Cook for (portions)', 'Kochen für (Portionen)'), style: const TextStyle(fontWeight: FontWeight.w700))),
            SizedBox(width: 80, child: TextField(controller: _cookFor, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}))),
          ]),
          const SizedBox(height: 14),
          Text(tr(context, 'Ingredients', 'Zutaten'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          for (final l in _lines)
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
                child: widget.canEdit
                    ? Column(children: [
                        Row(children: [
                          Expanded(
                            child: Autocomplete<Map<String, dynamic>>(
                              initialValue: l.name.value,
                              displayStringForOption: (s) => '${s['name']}',
                              optionsBuilder: (v) => v.text.isEmpty ? const Iterable.empty() : stockList.where((s) => '${s['name']}'.toLowerCase().contains(v.text.toLowerCase())).take(20),
                              onSelected: (s) => _pickStock(l, s),
                              fieldViewBuilder: (ctx, ctl, focus, submit) {
                                return TextField(
                                  controller: ctl,
                                  focusNode: focus,
                                  decoration: InputDecoration(hintText: tr(context, 'Ingredient', 'Zutat')),
                                  onChanged: (v) {
                                    final match = stockList.where((s) => '${s['name']}'.trim().toLowerCase() == v.trim().toLowerCase()).firstOrNull;
                                    if (match != null) {
                                      _pickStock(l, match);
                                    } else {
                                      setState(() {
                                        l.name.text = v;
                                        l.stockItem = '';
                                      });
                                    }
                                  },
                                );
                              },
                            ),
                          ),
                          IconButton(icon: const Icon(Icons.delete_outline, color: TriptiColors.red), onPressed: () => setState(() => _lines.remove(l))),
                        ]),
                        const SizedBox(height: 6),
                        Row(children: [
                          SizedBox(width: 110, child: TextField(controller: l.qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(hintText: tr(context, 'Amount', 'Menge')), onChanged: (_) => setState(() {}))),
                          const SizedBox(width: 8),
                          DropdownButton<String>(
                            value: l.unit,
                            items: [for (final u in {...recipeUnits, if (l.unit.isNotEmpty) l.unit}) DropdownMenuItem(value: u, child: Text(u))],
                            onChanged: (v) => setState(() => l.unit = v ?? l.unit),
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Builder(builder: (_) {
                            final (t, c) = _storeNote({'name': l.name.text, 'stockItem': l.stockItem});
                            return Text(t, style: TextStyle(fontSize: 12, color: c, fontWeight: FontWeight.w600));
                          })),
                        ]),
                      ])
                    : Row(children: [
                        Expanded(child: Text(l.name.text)),
                        Text('${scaledQty(l.qty.text, _yield.text, cookFor)} ${l.unit}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                      ]),
              ),
            ),
          if (widget.canEdit)
            OutlinedButton.icon(onPressed: () => setState(() => _lines.add(_Line())), icon: const Icon(Icons.add), label: Text(tr(context, 'Add ingredient', 'Zutat hinzufügen'))),
          if (widget.canEdit) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: TriptiColors.muted.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${tr(context, 'Cost per portion', 'Kosten pro Portion')}: ${euro(cost.perPortion)}  ·  ${tr(context, 'Menu price', 'Preis lt. Karte')}: ${euro(toDouble(widget.dish['price']))}', style: const TextStyle(fontWeight: FontWeight.w700)),
                if (cost.foodCostPct != null) Text('${tr(context, 'Food cost', 'Wareneinsatz')}: ${cost.foodCostPct}%', style: TextStyle(color: _costColor(cost.foodCostPct), fontWeight: FontWeight.w800)),
                if (cost.perPortion > 0) Text(tr(context, 'Price for 30% food cost: ${euro(priceForFoodCost(cost.perPortion)!)}', 'Preis für 30% Wareneinsatz: ${euro(priceForFoodCost(cost.perPortion)!)}'), style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
                if (cost.missing > 0) Text(tr(context, '${cost.missing} ingredient(s) have no stock price, so the cost is not complete.', '${cost.missing} Zutat(en) ohne Lagerpreis, die Kosten sind daher unvollständig.'), style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
              ]),
            ),
          ],
          const SizedBox(height: 14),
          if (widget.canEdit) ...[
            TextField(controller: _steps, maxLines: 6, decoration: InputDecoration(labelText: tr(context, 'Method', 'Zubereitung'), alignLabelWithHint: true)),
            const SizedBox(height: 10),
            TextField(controller: _notes, maxLines: 2, decoration: InputDecoration(labelText: tr(context, 'Notes (plating, allergens, storage)', 'Notizen (Anrichten, Allergene, Lagerung)'), alignLabelWithHint: true)),
            const SizedBox(height: 16),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.save),
              label: Text(_saving ? tr(context, 'Saving…', 'Speichert…') : tr(context, 'Save recipe', 'Rezept speichern')),
            ),
            if (widget.recipe != null)
              TextButton.icon(style: TextButton.styleFrom(foregroundColor: TriptiColors.red), onPressed: _delete, icon: const Icon(Icons.delete_outline), label: Text(tr(context, 'Delete recipe', 'Rezept löschen'))),
          ] else ...[
            if (_steps.text.isNotEmpty) ...[Text(tr(context, 'Method', 'Zubereitung'), style: const TextStyle(fontWeight: FontWeight.w800)), Text(_steps.text), const SizedBox(height: 10)],
            if (_notes.text.isNotEmpty) ...[Text(tr(context, 'Notes', 'Notizen'), style: const TextStyle(fontWeight: FontWeight.w800)), Text(_notes.text)],
          ],
        ],
      ]),
    );
  }
}
