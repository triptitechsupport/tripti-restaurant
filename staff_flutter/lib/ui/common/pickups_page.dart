import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';

import '../../core/alert.dart';
import '../../core/config.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import 'widgets.dart';

const _activePickup = ['received', 'confirmed', 'in_kitchen', 'ready'];

String _day(int offset) {
  final d = DateTime.now().add(Duration(days: offset));
  String two(int v) => v.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)}';
}

/// Online pickup orders, like the website's PickupOrdersBoard.
/// kitchen: the kitchen view (pre-orders, Start now, Seen, Ready).
/// manager: kitchen manager, who may also confirm and cancel.
class PickupsPage extends StatefulWidget {
  const PickupsPage({super.key, this.kitchen = false, this.manager = false});
  final bool kitchen;
  final bool manager;

  @override
  State<PickupsPage> createState() => _PickupsPageState();
}

class _PickupsPageState extends State<PickupsPage> {
  List<Map<String, dynamic>> _orders = [];
  bool _loaded = false;
  String? _error;
  String _tab = 'd:${_day(0)}';
  String? _busy;
  Set<String>? _known;
  Timer? _timer;
  UnsubscribeFunc? _unsub;

  PocketBase get pb => AppScope.read(context).pb;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => _load());
    pb.collection('orders').subscribe('*', (e) {
      if (e.record?.getStringValue('orderType') == 'pickup') _load();
    }).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _timer?.cancel();
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await pb.collection('orders').getFullList(
            filter: pb.filter('orderType = "pickup" && pickupDate >= {:from} && pickupDate <= {:to}', {'from': _day(0), 'to': _day(widget.kitchen ? 2 : 14)}),
            sort: 'pickupDate,pickupTime,created',
          );
      final rows = list.map((e) => e.toJson()).toList();
      if (_known != null && rows.any((o) => !_known!.contains(o['id']) && _activePickup.contains(o['status']))) orderAlert();
      _known = rows.map((o) => '${o['id']}').toSet();
      if (mounted) {
        setState(() {
          _orders = rows;
          _loaded = true;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    }
  }

  Future<void> _call(String path, Map<String, dynamic> body) async {
    final r = await http.post(
      Uri.parse('${AppConfig.apiUrl}/pickup$path'),
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ${pb.authStore.token}'},
      body: jsonEncode(body),
    );
    Map d = {};
    try {
      d = jsonDecode(r.body) as Map;
    } catch (_) {}
    if (r.statusCode >= 300) throw Exception(d['message'] ?? 'Request failed (${r.statusCode})');
  }

  Future<void> _act(Map<String, dynamic> o, String kind, {String? reason}) async {
    setState(() => _busy = '${o['id']}:$kind');
    final id = o['id'];
    final ok = await runAction(context, () async {
      if (kind == 'release') {
        await _call('/orders/$id/release', {});
      } else if (kind == 'seen') {
        await _call('/orders/$id/seen', {});
      } else {
        await _call('/orders/$id/status', {'status': kind, 'reason': ?reason});
      }
    }, done: tr(context, '${o['orderNumber']}: done', '${o['orderNumber']}: erledigt'));
    if (ok) await _load();
    if (mounted) setState(() => _busy = null);
  }

  bool _match(Map<String, dynamic> o) {
    if (_tab.startsWith('d:')) return o['pickupDate'] == _tab.substring(2);
    if (_tab == 'later') return '${o['pickupDate']}'.compareTo(_day(1)) > 0;
    return true;
  }

  String _dayLabel(String d) {
    if (d == _day(0)) return tr(context, 'Today', 'Heute');
    if (d == _day(1)) return tr(context, 'Tomorrow', 'Morgen');
    final p = d.split('-');
    return p.length == 3 ? '${p[2]}.${p[1]}.' : d;
  }

  (String, Color) _status(String s) => switch (s) {
        'received' => (tr(context, 'Received', 'Eingegangen'), TriptiColors.amber),
        'confirmed' => (tr(context, 'Confirmed', 'Bestätigt'), TriptiColors.blue),
        'in_kitchen' => (tr(context, 'Being prepared', 'In der Küche'), TriptiColors.amber),
        'ready' => (tr(context, 'Ready for pickup', 'Abholbereit'), TriptiColors.green),
        'picked_up' => (tr(context, 'Picked up', 'Abgeholt'), Colors.grey),
        'no_show' => (tr(context, 'Not picked up', 'Nicht abgeholt'), TriptiColors.red),
        _ => (tr(context, 'Cancelled', 'Storniert'), TriptiColors.red),
      };

  @override
  Widget build(BuildContext context) {
    final de = AppScope.of(context).de;
    final tabs = widget.kitchen
        ? [('all', tr(context, 'All', 'Alle')), for (var i = 0; i <= 2; i++) ('d:${_day(i)}', _dayLabel(_day(i)))]
        : [('d:${_day(0)}', tr(context, 'Today', 'Heute')), ('d:${_day(1)}', tr(context, 'Tomorrow', 'Morgen')), ('later', tr(context, 'Later', 'Später'))];
    final shown = _orders.where(_match).where((o) => _activePickup.contains(o['status']) || o['pickupDate'] == _day(0)).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final t in tabs)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text('${t.$2} (${_orders.where((o) => _activePickup.contains(o['status']) && (t.$1 == 'all' || (t.$1 == 'later' ? '${o['pickupDate']}'.compareTo(_day(1)) > 0 : o['pickupDate'] == t.$1.substring(2)))).length})'),
                  selected: _tab == t.$1,
                  onSelected: (_) => setState(() => _tab = t.$1),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 8),
        if (_error != null) Card(color: const Color(0xFFFEF3C7), child: ListTile(title: Text(_error!))),
        if (!_loaded) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
        if (_loaded && shown.isEmpty) EmptyState(Icons.shopping_bag_outlined, tr(context, 'No pickup orders.', 'Keine Abholungen.')),
        for (final o in shown) _card(o, de),
      ]),
    );
  }

  Widget _card(Map<String, dynamic> o, bool de) {
    final s = '${o['status']}';
    final (label, color) = _status(s);
    final items = jsonList(o['items']);
    final lead = !widget.kitchen || widget.manager;
    final released = '${o['kitchenOrder'] ?? ''}'.isNotEmpty;
    Widget btn(String kind, IconData icon, String text, {bool filled = false}) {
      final busy = _busy == '${o['id']}:$kind';
      final child = busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(icon, size: 18);
      return filled
          ? FilledButton.icon(onPressed: _busy != null ? null : () => _act(o, kind), icon: child, label: Text(text))
          : OutlinedButton.icon(onPressed: _busy != null ? null : () => _act(o, kind), icon: child, label: Text(text));
    }

    final actions = <Widget>[
      if (s == 'received' && lead) btn('confirmed', Icons.check_circle, tr(context, 'Confirm', 'Bestätigen'), filled: true),
      if ((s == 'confirmed' || s == 'received') && !released) btn('release', Icons.send, widget.kitchen ? tr(context, 'Start now', 'Jetzt starten') : tr(context, 'Send to kitchen now', 'Jetzt an Küche')),
      if (widget.kitchen && '${o['kitchenSeenAt'] ?? ''}'.isEmpty && _activePickup.contains(s)) btn('seen', Icons.visibility, tr(context, 'Seen', 'Gesehen')),
      if (s == 'in_kitchen' || (s == 'confirmed' && !widget.kitchen)) btn('ready', Icons.inventory_2, tr(context, 'Ready', 'Fertig'), filled: widget.kitchen),
      if (!widget.kitchen && ['confirmed', 'in_kitchen', 'ready'].contains(s)) btn('picked_up', Icons.check_circle, tr(context, 'Picked up', 'Abgeholt'), filled: s == 'ready'),
      if (!widget.kitchen && ['confirmed', 'in_kitchen', 'ready'].contains(s) && '${o['pickupDate']}'.compareTo(_day(0)) <= 0) btn('no_show', Icons.person_off, tr(context, 'No-show', 'Nicht abgeholt')),
      if (lead && _activePickup.contains(s))
        TextButton.icon(
          style: TextButton.styleFrom(foregroundColor: TriptiColors.red),
          onPressed: _busy != null ? null : () => _cancel(o),
          icon: const Icon(Icons.cancel_outlined, size: 18),
          label: Text(tr(context, 'Cancel', 'Stornieren')),
        ),
    ];
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: s == 'received' ? TriptiColors.amber : TriptiColors.border, width: s == 'received' ? 2 : 1)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.schedule, color: TriptiColors.primary, size: 20),
            const SizedBox(width: 6),
            Text('${o['pickupTime'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            Text(_dayLabel('${o['pickupDate']}'), style: const TextStyle(color: Colors.black54)),
            const Spacer(),
            StatusPill(label, color),
          ]),
          Text('${o['orderNumber'] ?? ''} · ${o['customerName'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Text('${it['quantity']}× ', style: const TextStyle(fontWeight: FontWeight.w800)),
                Expanded(child: Text('${(de ? it['nameDE'] : it['nameEN']) ?? it['name'] ?? '?'}')),
                if (!widget.kitchen) Text(euro(toDouble(it['price']) * toDouble(it['quantity'])), style: const TextStyle(color: Colors.black54)),
              ]),
            ),
          if ('${o['notes'] ?? ''}'.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
              child: Text('${tr(context, 'Note', 'Notiz')}: ${o['notes']}'),
            ),
          if (!widget.kitchen)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${euro(toDouble(o['totalPrice']))} · ${o['paymentStatus'] == 'completed' ? tr(context, 'paid', 'bezahlt') : tr(context, 'pays at pickup', 'zahlt bei Abholung')}${'${o['customerPhone'] ?? ''}'.isNotEmpty ? ' · ${o['customerPhone']}' : ''}',
                style: const TextStyle(fontSize: 12.5, color: Colors.black54),
              ),
            ),
          if (s == 'cancelled' && '${o['cancelReason'] ?? ''}'.isNotEmpty) Text('${tr(context, 'Reason', 'Grund')}: ${o['cancelReason']}', style: const TextStyle(color: TriptiColors.red)),
          if (actions.isNotEmpty) ...[const SizedBox(height: 8), Wrap(spacing: 8, runSpacing: 6, children: actions)],
        ]),
      ),
    );
  }

  Future<void> _cancel(Map<String, dynamic> o) async {
    final reasons = [
      tr(context, 'Kitchen fully booked', 'Küche ausgelastet'),
      tr(context, 'Dish not available', 'Gericht nicht verfügbar'),
      tr(context, 'Guest called', 'Gast hat angerufen'),
      tr(context, 'Closed', 'Geschlossen'),
    ];
    final ctl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(tr(context, 'Cancel ${o['orderNumber']}?', '${o['orderNumber']} stornieren?')),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final r in reasons) ChoiceChip(label: Text(r), selected: ctl.text == r, onSelected: (_) => set(() => ctl.text = r)),
            ]),
            const SizedBox(height: 8),
            TextField(controller: ctl, onChanged: (_) => set(() {}), decoration: InputDecoration(labelText: tr(context, 'Reason (the guest is told)', 'Grund (der Gast wird informiert)'))),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr(context, 'Back', 'Zurück'))),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: TriptiColors.red),
              onPressed: ctl.text.trim().isEmpty ? null : () => Navigator.pop(ctx, ctl.text.trim()),
              child: Text(tr(context, 'Cancel order', 'Stornieren')),
            ),
          ],
        ),
      ),
    );
    if (reason != null && mounted) await _act(o, 'cancelled', reason: reason);
  }
}
