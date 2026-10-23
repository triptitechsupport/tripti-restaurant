import 'package:flutter/material.dart';

import '../../core/billing.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import '../waiter/waiter_home.dart';
import 'receipt_view.dart';

/// Cashier takes a payment for a table: every unpaid dish is ticked (untick
/// to split the bill), Cash or Card, then the RKSV receipt is issued and
/// opened for printing.
Future<void> showPaySheet(BuildContext context, Order order) {
  final store = StoreScope.of(context);
  final actions = StoreScope.actionsOf(context);
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => StoreScope(store: store, actions: actions, child: _PaySheet(orderId: order.id)),
  );
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.orderId});
  final String orderId;

  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  Set<String>? _sel; // "ticketId:lineIndex"
  String _type = 'CASH';
  bool _busy = false;
  String? _requestKey;
  String? _lastSignature;

  static bool unpaid(Map<String, dynamic> it) => it['cleared'] != true && '${it['settlementId'] ?? ''}'.isEmpty;

  List<({Ticket t, int i, Map<String, dynamic> it})> _lines(LiveStore s, Order o) => [
        for (final t in s.ticketsOf(o))
          if (t.status != 'cancelled')
            for (var i = 0; i < t.items.length; i++)
              if (unpaid(t.items[i])) (t: t, i: i, it: t.items[i]),
      ];

  double _price(Map<String, dynamic> it) => toDouble(it['price']) * (toDouble(it['quantity']) == 0 ? 1 : toDouble(it['quantity']));

  Future<void> _pay(Order o, List<Ticket> tickets, double amount) async {
    if (_busy) return;
    final sel = _sel!;
    setState(() => _busy = true);
    final session = AppScope.read(context);
    final billing = BillingApi(session.pb);
    final store = StoreScope.of(context);
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final de = session.de;
    // Same request key for a retry of the same selection, so a payment is
    // never booked twice.
    final sig = '${o.id}|${(sel.toList()..sort()).join(',')}';
    if (sig != _lastSignature) {
      _lastSignature = sig;
      _requestKey = newRequestKey();
    }
    try {
      final settlement = await billing.settle(o, tickets, sel, _requestKey!);
      messenger.showSnackBar(SnackBar(content: Text(de ? 'Zahlung gebucht: ${euro(amount)}. Beleg wird signiert…' : 'Payment booked: ${euro(amount)}. Signing the receipt…')));
      store.refreshLive();
      try {
        final r = await billing.issueReceipt('${settlement['id']}', _type);
        nav.pop();
        await nav.push(MaterialPageRoute(builder: (_) => ReceiptView(model: r.printModel()!)));
      } catch (e) {
        nav.pop();
        messenger.showSnackBar(SnackBar(backgroundColor: TriptiColors.red, duration: const Duration(seconds: 10), content: Text(errorMessage(e))));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        toast(context, errorMessage(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final de = AppScope.of(context).de;
    final o = s.orderById(widget.orderId);
    if (o == null) return const SizedBox(height: 200);
    final lines = _lines(s, o);
    _sel ??= {for (final l in lines) '${l.t.id}:${l.i}'};
    _sel!.removeWhere((k) => !lines.any((l) => '${l.t.id}:${l.i}' == k));
    final amount = lines.where((l) => _sel!.contains('${l.t.id}:${l.i}')).fold<double>(0, (a, l) => a + _price(l.it));
    final unpaidTotal = lines.fold<double>(0, (a, l) => a + _price(l.it));
    final allOn = _sel!.length == lines.length;
    final name = {for (final m in s.menu) m.id: m};

    return Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(
        title: Text(tr(context, 'Payment · Table ${s.tableTitle(o)}', 'Zahlung · Tisch ${s.tableTitle(o)}'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        subtitle: Text('${o.orderId} · ${tr(context, 'open', 'offen')} ${euro(unpaidTotal)}'),
        trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
      ),
      if (lines.isEmpty)
        Padding(padding: const EdgeInsets.all(24), child: EmptyState(Icons.check_circle, tr(context, 'Everything is paid.', 'Alles ist bezahlt.')))
      else ...[
        CheckboxListTile(
          dense: true,
          value: allOn,
          controlAffinity: ListTileControlAffinity.leading,
          onChanged: _busy ? null : (v) => setState(() => _sel = v == true ? {for (final l in lines) '${l.t.id}:${l.i}'} : {}),
          title: Text(tr(context, 'Whole bill', 'Ganze Rechnung'), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        const Divider(height: 1),
        Flexible(
          child: ListView(shrinkWrap: true, children: [
            for (final l in lines)
              CheckboxListTile(
                dense: true,
                value: _sel!.contains('${l.t.id}:${l.i}'),
                onChanged: _busy
                    ? null
                    : (v) => setState(() {
                          final k = '${l.t.id}:${l.i}';
                          v == true ? _sel!.add(k) : _sel!.remove(k);
                        }),
                controlAffinity: ListTileControlAffinity.leading,
                title: Row(children: [
                  Expanded(child: Text('${toDouble(l.it['quantity']) > 1 ? '${toDouble(l.it['quantity']).toInt()}× ' : ''}${name[l.it['id']]?.nameFor(de) ?? l.it['name'] ?? ''}')),
                  Text(euro(_price(l.it)), style: const TextStyle(fontWeight: FontWeight.w700)),
                ]),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          child: SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'CASH', label: Text(tr(context, 'Cash', 'Bar')), icon: const Icon(Icons.payments_outlined)),
              ButtonSegment(value: 'CARD', label: Text(tr(context, 'Card', 'Karte')), icon: const Icon(Icons.credit_card)),
            ],
            selected: {_type},
            onSelectionChanged: _busy ? null : (v) => setState(() => _type = v.first),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54), backgroundColor: TriptiColors.green),
              onPressed: _busy || amount <= 0 ? null : () => _pay(o, s.ticketsOf(o), amount),
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check),
              label: Text('${tr(context, 'Take payment', 'Zahlung kassieren')} · ${euro(amount)}'),
            ),
          ),
        ),
      ],
    ]);
  }
}
