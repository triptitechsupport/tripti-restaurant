import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../core/config.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';

/// Kitchen manager's menu: edit dishes (name, price, category, VAT, text),
/// add new ones and mark dishes sold out (or available again). Sold-out
/// dishes disappear from the website menu and the waiter's menu.
class SoldOutPage extends StatefulWidget {
  const SoldOutPage({super.key});

  @override
  State<SoldOutPage> createState() => _SoldOutPageState();
}

class _SoldOutPageState extends State<SoldOutPage> {
  List<MenuItem>? _items;
  List<Category> _cats = [];
  final _q = TextEditingController();
  String? _busy;

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
        pb.collection('menu_items').getFullList(sort: 'category,name'),
        pb.collection('categories').getFullList(sort: 'display_order,name'),
      ]);
      if (!mounted) return;
      setState(() {
        _items = r[0].map((e) => MenuItem(e.toJson())).toList();
        _cats = r[1].map((e) => Category(e.toJson())).toList();
      });
    } catch (e) {
      if (mounted) {
        toast(context, errorMessage(e), error: true);
        setState(() => _items = []);
      }
    }
  }

  Future<void> _toggle(MenuItem m, bool available, bool de) async {
    final pb = AppScope.read(context).pb;
    setState(() => _busy = m.id);
    try {
      final res = await http.post(
        Uri.parse('${AppConfig.apiUrl}/staff/menu/${m.id}/availability'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ${pb.authStore.token}'},
        body: jsonEncode({'available': available}),
      );
      Map data = {};
      try {
        data = jsonDecode(res.body) as Map;
      } catch (_) {}
      if (res.statusCode >= 300) throw Exception(data['message'] ?? 'Error ${res.statusCode}');
      m.data['availability'] = available;
      if (mounted) {
        toast(context, available ? (de ? '${m.nameFor(de)} wieder verfügbar' : '${m.nameFor(de)} available again') : (de ? '${m.nameFor(de)} ausverkauft' : '${m.nameFor(de)} sold out'));
      }
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _busy = null);
  }

  Future<void> _edit(MenuItem? m) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => DishEditor(item: m, categories: _cats)));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final de = AppScope.of(context).de;
    final items = _items;
    if (items == null) return const Center(child: CircularProgressIndicator());
    final q = _q.text.trim().toLowerCase();
    final order = {for (var i = 0; i < _cats.length; i++) _cats[i].name: i};
    final names = {for (final c in _cats) c.name: c.nameFor(de)};
    final groups = <String, List<MenuItem>>{};
    for (final m in items) {
      if (q.isNotEmpty && !'${m.nameFor(de)} ${m.nameEN}'.toLowerCase().contains(q)) continue;
      groups.putIfAbsent(m.category, () => []).add(m);
    }
    final keys = groups.keys.toList()..sort((a, b) => (order[a] ?? 999).compareTo(order[b] ?? 999));
    final soldOut = items.where((m) => !m.available).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          onPressed: () => _edit(null),
          icon: const Icon(Icons.add),
          label: Text(tr(context, 'New dish', 'Neues Gericht')),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _q,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tr(context, 'Search dishes', 'Gerichte suchen')),
        ),
        const SizedBox(height: 8),
        Text(tr(context, '$soldOut dish(es) sold out', '$soldOut Gericht(e) ausverkauft'), style: const TextStyle(color: TriptiColors.red, fontWeight: FontWeight.w700)),
        for (final k in keys) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 14, 4, 4),
            child: Text(names[k] ?? (k.isEmpty ? tr(context, 'Other', 'Sonstiges') : k), style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.ink)),
          ),
          Card(
            child: Column(children: [
              for (final m in groups[k]!)
                ListTile(
                  contentPadding: const EdgeInsets.only(left: 4, right: 8),
                  leading: IconButton(icon: const Icon(Icons.edit_outlined), tooltip: tr(context, 'Edit dish', 'Gericht bearbeiten'), onPressed: () => _edit(m)),
                  onTap: () => _edit(m),
                  title: Text(m.nameFor(de), style: TextStyle(fontWeight: FontWeight.w600, color: m.available ? null : Colors.black45)),
                  subtitle: Text(
                    m.available ? euro(m.price) : '${euro(m.price)} · ${tr(context, 'Sold out', 'Ausverkauft')}',
                    style: TextStyle(color: m.available ? Colors.black54 : TriptiColors.red),
                  ),
                  trailing: Switch(
                    value: m.available,
                    activeThumbColor: TriptiColors.green,
                    onChanged: _busy == m.id ? null : (v) => _toggle(m, v, de),
                  ),
                ),
            ]),
          ),
        ],
      ]),
    );
  }
}

const _vatRates = {'REDUCED_1': '10 %', 'STANDARD': '20 %', 'REDUCED_2': '13 %', 'SPECIAL': '19 %'};

/// Edit or add one dish. Saves with the kitchen manager's own login
/// (PocketBase allows the kitchen manager to change menu_items).
class DishEditor extends StatefulWidget {
  const DishEditor({super.key, this.item, required this.categories});
  final MenuItem? item;
  final List<Category> categories;

  @override
  State<DishEditor> createState() => _DishEditorState();
}

class _DishEditorState extends State<DishEditor> {
  late final Map<String, dynamic> _d = widget.item?.data ?? {};
  late final _nameEN = TextEditingController(text: '${_d['nameEN'] ?? _d['name'] ?? ''}');
  late final _nameDE = TextEditingController(text: '${_d['nameDE'] ?? ''}');
  late final _price = TextEditingController(text: widget.item == null ? '' : toDouble(_d['price']).toStringAsFixed(2).replaceAll('.', ','));
  late final _descEN = TextEditingController(text: '${_d['descriptionEN'] ?? _d['description'] ?? ''}');
  late final _descDE = TextEditingController(text: '${_d['descriptionDE'] ?? ''}');
  late final _prep = TextEditingController(text: _d['prepMinutes'] == null || toDouble(_d['prepMinutes']) == 0 ? '' : '${(_d['prepMinutes'] as num).toInt()}');
  late String _cat = '${_d['category'] ?? ''}';
  late String _vat = _vatRates.containsKey('${_d['vat_Rate']}') ? '${_d['vat_Rate']}' : 'REDUCED_1';
  late bool _veg = _d['isVegetarian'] == true;
  late bool _available = _d['availability'] != false;
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_nameEN, _nameDE, _price, _descEN, _descDE, _prep]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameEN.text.trim();
    final price = toDouble(_price.text.replaceAll(',', '.'));
    if (name.isEmpty || price <= 0 || _cat.isEmpty) {
      toast(context, tr(context, 'Name, price and category are needed.', 'Name, Preis und Kategorie sind nötig.'), error: true);
      return;
    }
    final pb = AppScope.read(context).pb;
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'name': name,
      'nameEN': name,
      'nameDE': _nameDE.text.trim(),
      'price': price,
      'category': _cat,
      'vat_Rate': _vat,
      'description': _descEN.text.trim(),
      'descriptionEN': _descEN.text.trim(),
      'descriptionDE': _descDE.text.trim(),
      'isVegetarian': _veg,
      'availability': _available,
      if (_prep.text.trim().isNotEmpty) 'prepMinutes': toDouble(_prep.text),
    };
    try {
      if (widget.item == null) {
        await pb.collection('menu_items').create(body: body);
      } else {
        await pb.collection('menu_items').update(widget.item!.id, body: body);
      }
      if (!mounted) return;
      toast(context, tr(context, 'Dish saved.', 'Gericht gespeichert.'));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      toast(context, errorMessage(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final de = AppScope.of(context).de;
    final cats = [...widget.categories]..sort((a, b) => a.order.compareTo(b.order));
    final names = {for (final c in cats) c.name};
    return Scaffold(
      appBar: AppBar(title: Text(widget.item == null ? tr(context, 'New dish', 'Neues Gericht') : tr(context, 'Edit dish', 'Gericht bearbeiten'))),
      body: AbsorbPointer(
        absorbing: _saving,
        child: ListView(padding: const EdgeInsets.fromLTRB(14, 14, 14, 100), children: [
          TextField(controller: _nameEN, decoration: InputDecoration(labelText: tr(context, 'Name (English)', 'Name (Englisch)'))),
          const SizedBox(height: 10),
          TextField(controller: _nameDE, decoration: InputDecoration(labelText: tr(context, 'Name (German)', 'Name (Deutsch)'))),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Price €', 'Preis €')))),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _vat,
                decoration: InputDecoration(labelText: tr(context, 'VAT', 'MwSt.')),
                items: [for (final e in _vatRates.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _vat = v ?? _vat),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: names.contains(_cat) ? _cat : null,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr(context, 'Category', 'Kategorie')),
            items: [for (final c in cats) DropdownMenuItem(value: c.name, child: Text(c.nameFor(de)))],
            onChanged: (v) => setState(() {
              _cat = v ?? _cat;
              if (widget.item == null) _vat = RegExp(r'beverage|drink|getränk|getraenk', caseSensitive: false).hasMatch(_cat) ? 'STANDARD' : 'REDUCED_1';
            }),
          ),
          const SizedBox(height: 10),
          TextField(controller: _descEN, maxLines: 3, minLines: 1, decoration: InputDecoration(labelText: tr(context, 'Description (English)', 'Beschreibung (Englisch)'))),
          const SizedBox(height: 10),
          TextField(controller: _descDE, maxLines: 3, minLines: 1, decoration: InputDecoration(labelText: tr(context, 'Description (German)', 'Beschreibung (Deutsch)'))),
          const SizedBox(height: 10),
          TextField(controller: _prep, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr(context, 'Cooking time (minutes, for pre-orders)', 'Kochzeit (Minuten, für Vorbestellungen)'))),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(tr(context, 'Vegetarian', 'Vegetarisch')), value: _veg, onChanged: (v) => setState(() => _veg = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(tr(context, 'Available (not sold out)', 'Verfügbar (nicht ausverkauft)')), value: _available, activeThumbColor: TriptiColors.green, onChanged: (v) => setState(() => _available = v)),
          Text(tr(context, 'Photos are changed on the website (Menu).', 'Fotos werden auf der Website geändert (Speisekarte).'), style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ]),
      ),
      bottomSheet: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _saving ? null : _save,
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.save),
            label: Text(tr(context, 'Save', 'Speichern')),
          ),
        ),
      ),
    );
  }
}
