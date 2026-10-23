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
    double owed(Order o) => s.ticketsOf(o).where((t) => t.status != 'cancelled').fold<double>(0, (x, t) => x + t.total);
    final openTotal = [...bills, ...unpaid].fold<double>(0, (x, o) => x + owed(o));
    return RefreshIndicator(
      onRefresh: s.refreshLive,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: [
          SummaryRow([
            SummaryStat(Icons.receipt_long, tr(context, 'Bill requests', 'Rechnungen'), '${bills.length}', bills.isEmpty ? TriptiColors.green : TriptiColors.red),
            SummaryStat(Icons.flag_outlined, tr(context, 'End requests', 'Beenden'), '${ends.length}', ends.isEmpty ? TriptiColors.green : TriptiColors.amber),
            SummaryStat(Icons.table_restaurant, tr(context, 'Open bills', 'Offene Tische'), '${bills.length + unpaid.length}', TriptiColors.ink),
            SummaryStat(Icons.euro, tr(context, 'Still to pay', 'Noch offen'), euro(openTotal), TriptiColors.primary),
          ]),
          const SizedBox(height: 16),
          SectionTitle(Icons.receipt_long, tr(context, 'Bill requests', 'Rechnungsanfragen'), count: bills.length, color: TriptiColors.red),
          if (bills.isEmpty) _none(context, Icons.check_circle_outline, tr(context, 'No table is waiting for its bill.', 'Kein Tisch wartet auf die Rechnung.')),
          for (final o in bills) _BillTile(order: o, kind: _Kind.bill),
          const SizedBox(height: 14),
          SectionTitle(Icons.flag_outlined, tr(context, 'End order requests', 'Anfragen zum Beenden'), count: ends.length, color: TriptiColors.amber),
          if (ends.isEmpty) _none(context, Icons.check_circle_outline, tr(context, 'No end requests.', 'Keine Anfragen.')),
          for (final o in ends) _BillTile(order: o, kind: _Kind.end),
          const SizedBox(height: 14),
          SectionTitle(Icons.table_restaurant, tr(context, 'Other open bills', 'Weitere offene Rechnungen'), count: unpaid.length, color: TriptiColors.ink),
          if (unpaid.isEmpty) _none(context, Icons.check_circle_outline, tr(context, 'Every other table is paid.', 'Alle anderen Tische sind bezahlt.')),
          for (final o in unpaid) _BillTile(order: o, kind: _Kind.other),
        ],
      ),
    );
  }

  Widget _none(BuildContext context, IconData icon, String text) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 0, 4, 8),
    child: Row(
      children: [
        Icon(icon, size: 18, color: TriptiColors.green),
        const SizedBox(width: 6),
        Flexible(
          child: Text(text, style: const TextStyle(color: Colors.black54)),
        ),
      ],
    ),
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
    final accent = widget.kind == _Kind.bill
        ? TriptiColors.red
        : widget.kind == _Kind.end
        ? TriptiColors.amber
        : TriptiColors.border;
    final opened = o.created;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AccentCard(
        color: accent,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  s.tableTitle(o).contains('+') ? tr(context, 'Tables ${s.tableTitle(o)}', 'Tische ${s.tableTitle(o)}') : tr(context, 'Table ${o.table}', 'Tisch ${o.table}'),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: TriptiColors.ink),
                ),
                const SizedBox(width: 8),
                Text(o.orderId, style: const TextStyle(color: Colors.black54)),
                const Spacer(),
                Text(
                  euro(total),
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19, color: TriptiColors.primary),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                widget.kind != _Kind.other
                    ? '${widget.kind == _Kind.bill ? tr(context, 'Bill asked', 'Rechnung angefragt') : tr(context, 'End asked', 'Beenden angefragt')} ${timeOf(at)}${'${by ?? ''}'.isNotEmpty ? ' · $by' : ''}'
                    : '${tr(context, 'Open since', 'Offen seit')} ${timeOf(opened)}${'${o.data['placedBy'] ?? ''}'.isNotEmpty ? ' · ${o.data['placedBy']}' : ''}',
                style: const TextStyle(color: Colors.black54, fontSize: 12.5),
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: [
                StatusPill(
                  o.paymentStatus == 'paid'
                      ? tr(context, 'Paid', 'Bezahlt')
                      : o.paymentStatus == 'partial'
                      ? tr(context, 'Part paid', 'Teilbezahlt')
                      : tr(context, 'Not paid', 'Nicht bezahlt'),
                  o.paymentStatus == 'paid' ? TriptiColors.green : TriptiColors.red,
                ),
                if (open > 0) StatusPill(tr(context, '$open ticket(s) not served', '$open Ticket(s) nicht serviert'), TriptiColors.amber),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
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
              ],
            ),
          ],
        ),
      ),
    );
  }
}
