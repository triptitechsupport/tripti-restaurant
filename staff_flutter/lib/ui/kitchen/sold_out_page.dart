import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../core/config.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';

/// Kitchen manager: mark dishes sold out (or available again). Sold-out
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
                SwitchListTile(
                  title: Text(m.nameFor(de), style: TextStyle(fontWeight: FontWeight.w600, color: m.available ? null : Colors.black45)),
                  subtitle: m.available ? null : Text(tr(context, 'Sold out', 'Ausverkauft'), style: const TextStyle(color: TriptiColors.red)),
                  value: m.available,
                  activeThumbColor: TriptiColors.green,
                  onChanged: _busy == m.id ? null : (v) => _toggle(m, v, de),
                ),
            ]),
          ),
        ],
      ]),
    );
  }
}
