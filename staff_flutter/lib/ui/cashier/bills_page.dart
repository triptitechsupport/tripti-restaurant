import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import '../waiter/waiter_home.dart';
import 'pay_sheet.dart';

/// Cashier: tables waiting for their bill, and orders a waiter asked to end.
class BillsPage extends StatelessWidget {
  const BillsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final live = s.liveOrders;
    final bills = live.where((o) => o.billPending).toList()..sort((a, b) => (a.billRequestedAt ?? DateTime(0)).compareTo(b.billRequestedAt ?? DateTime(0)));
    final ends = live.where((o) => o.endPending).toList()..sort((a, b) => (a.endRequestedAt ?? DateTime(0)).compareTo(b.endRequestedAt ?? DateTime(0)));
    final unpaid = live.where((o) => !o.billPending && o.paymentStatus != 'paid' && s.ticketsOf(o).any((t) => t.status != 'cancelled')).toList();
    return RefreshIndicator(
      onRefresh: s.refreshLive,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        _head(context, Icons.receipt_long, tr(context, 'Bill requests', 'Rechnungsanfragen'), bills.length),
        if (bills.isEmpty) _none(context, tr(context, 'No table is waiting for its bill.', 'Kein Tisch wartet auf die Rechnung.')),
        for (final o in bills) _BillTile(order: o, kind: _Kind.bill),
        const SizedBox(height: 16),
        _head(context, Icons.flag, tr(context, 'End order requests', 'Anfragen zum Beenden'), ends.length),
        if (ends.isEmpty) _none(context, tr(context, 'No end requests.', 'Keine Anfragen.')),
        for (final o in ends) _BillTile(order: o, kind: _Kind.end),
        const SizedBox(height: 16),
        _head(context, Icons.table_restaurant, tr(context, 'Other open bills', 'Weitere offene Rechnungen'), unpaid.length),
        for (final o in unpaid) _BillTile(order: o, kind: _Kind.other),
      ]),
    );
  }

  Widget _head(BuildContext context, IconData icon, String text, int n) => Padding(
        padding: const EdgeInsets.only(bottom: 8, left: 4),
        child: Row(children: [
          Icon(icon, size: 20, color: TriptiColors.primary),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: TriptiColors.ink)),
          const SizedBox(width: 8),
          if (n > 0) CircleAvatar(radius: 11, backgroundColor: TriptiColors.primary, child: Text('$n', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800))),
        ]),
      );

  Widget _none(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
        child: Text(text, style: const TextStyle(color: Colors.black54)),
      );
}

enum _Kind { bill, end, other }

class _BillTile extends StatefulWidget {
  const _BillTile({required this.order, required this.kind});
  final Order order;
  final _Kind kind;

  @override
  State<_BillTile> createState() => _BillTileState();
}

class _BillTileState extends State<_BillTile> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final a = StoreScope.actionsOf(context);
    final o = widget.order;
    final tickets = s.ticketsOf(o);
    final total = tickets.where((t) => t.status != 'cancelled').fold<double>(0, (x, t) => x + t.total);
    final open = tickets.where((t) => t.open).length;
    final by = widget.kind == _Kind.bill ? o.data['billRequestedBy'] : o.data['endRequestedBy'];
    final at = widget.kind == _Kind.bill ? o.billRequestedAt : o.endRequestedAt;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(s.tableTitle(o).contains('+') ? tr(context, 'Tables ${s.tableTitle(o)}', 'Tische ${s.tableTitle(o)}') : tr(context, 'Table ${o.table}', 'Tisch ${o.table}'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: TriptiColors.ink)),
            const SizedBox(width: 8),
            Text(o.orderId, style: const TextStyle(color: Colors.black54)),
            const Spacer(),
            Text(euro(total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: TriptiColors.primary)),
          ]),
          if (widget.kind != _Kind.other)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text('${by ?? ''} · ${timeOf(at)}', style: const TextStyle(color: Colors.black54, fontSize: 12.5)),
            ),
          const SizedBox(height: 6),
          Wrap(spacing: 6, children: [
            StatusPill(
              o.paymentStatus == 'paid' ? tr(context, 'Paid', 'Bezahlt') : o.paymentStatus == 'partial' ? tr(context, 'Part paid', 'Teilbezahlt') : tr(context, 'Not paid', 'Nicht bezahlt'),
              o.paymentStatus == 'paid' ? TriptiColors.green : TriptiColors.red,
            ),
            if (open > 0) StatusPill(tr(context, '$open ticket(s) not served', '$open Ticket(s) nicht serviert'), TriptiColors.amber),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            if (widget.kind != _Kind.end || o.paymentStatus != 'paid')
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy || o.paymentStatus == 'paid' ? null : () => showPaySheet(context, o),
                  icon: const Icon(Icons.point_of_sale),
                  label: Text(tr(context, 'Take payment', 'Kassieren')),
                ),
              ),
            if (widget.kind == _Kind.end) ...[
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy || open > 0
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          await runAction(context, () => a.endOrder(o), done: tr(context, 'Order ended.', 'Bestellung beendet.'));
                          await s.refreshLive();
                          if (mounted) setState(() => _busy = false);
                        },
                  icon: const Icon(Icons.flag),
                  label: Text(tr(context, 'End order', 'Beenden')),
                ),
              ),
            ],
          ]),
        ]),
      ),
    );
  }
}
