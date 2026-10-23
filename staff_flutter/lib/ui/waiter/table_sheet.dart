import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/session.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'order_page.dart';
import 'ticket_card.dart';
import 'waiter_home.dart';

/// The open order of a table: its tickets, total and next steps
/// (add dishes, ask for the bill, ask to end, free the table).
Future<void> showTableSheet(BuildContext context, TableInfo table, Order order) {
  final store = StoreScope.of(context);
  final actions = StoreScope.actionsOf(context);
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => StoreScope(
      store: store,
      actions: actions,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        maxChildSize: 0.95,
        builder: (ctx, scroll) => _TableSheet(table: table, orderId: order.id, scroll: scroll),
      ),
    ),
  );
}

class _TableSheet extends StatefulWidget {
  const _TableSheet({required this.table, required this.orderId, required this.scroll});
  final TableInfo table;
  final String orderId;
  final ScrollController scroll;

  @override
  State<_TableSheet> createState() => _TableSheetState();
}

class _TableSheetState extends State<_TableSheet> {
  bool _busy = false;

  Future<void> _do(Future<void> Function() f, String done, {bool close = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final store = StoreScope.of(context);
    final ok = await runAction(context, f, done: done);
    await store.refreshLive();
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok && close) Navigator.of(context).pop();
  }

  Future<bool> _confirm(String title, String body, String yes) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(yes)),
        ],
      ),
    );
    return r == true;
  }

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final a = StoreScope.actionsOf(context);
    final cashier = AppScope.of(context).role == StaffRole.cashier;
    final o = s.orderById(widget.orderId);
    if (o == null) {
      return EmptyState(Icons.table_restaurant, tr(context, 'This order is gone.', 'Diese Bestellung gibt es nicht mehr.'));
    }
    final tickets = s.ticketsOf(o);
    final active = tickets.where((t) => t.status != 'cancelled').toList();
    final total = active.fold<double>(0, (x, t) => x + t.total);
    final unfinished = tickets.where((t) => t.open).length;
    final paid = o.paymentStatus == 'paid';
    final ended = o.ended || !o.isOpen;

    final buttons = <Widget>[];
    if (!ended) {
      buttons.add(FilledButton.icon(
        onPressed: _busy
            ? null
            : () {
                final nav = Navigator.of(context);
                nav.pop();
                nav.push(MaterialPageRoute(builder: (_) => StoreScope(store: s, actions: a, child: OrderPage(table: widget.table))));
              },
        icon: const Icon(Icons.add),
        label: Text(tr(context, 'Add dishes', 'Gerichte hinzufügen')),
      ));
      if (!cashier && !o.billPending && !paid) {
        buttons.add(OutlinedButton.icon(
          onPressed: _busy ? null : () => _do(() => a.requestBill(o), tr(context, 'The cashier was asked for the bill.', 'Die Kasse wurde um die Rechnung gebeten.')),
          icon: const Icon(Icons.receipt_long),
          label: Text(tr(context, 'Request bill from cashier', 'Rechnung bei der Kasse anfordern')),
        ));
      }
      if (!cashier && !o.endPending) {
        buttons.add(OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  if (unfinished > 0) {
                    toast(context, tr(context, 'Serve or cancel every ticket first ($unfinished open).', 'Zuerst alle Tickets servieren oder stornieren ($unfinished offen).'), error: true);
                    return;
                  }
                  await _do(() => a.askToEnd(o), tr(context, 'The cashier was asked to end the order.', 'Die Kasse wurde gebeten, die Bestellung zu beenden.'));
                },
          icon: const Icon(Icons.flag_outlined),
          label: Text(tr(context, 'Ask cashier to end order', 'Kasse bitten, Bestellung zu beenden')),
        ));
      }
      if (cashier) {
        buttons.add(OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  if (unfinished > 0) {
                    toast(context, tr(context, 'Serve or cancel every ticket first ($unfinished open).', 'Zuerst alle Tickets servieren oder stornieren ($unfinished offen).'), error: true);
                    return;
                  }
                  final done = tr(context, 'Order ended.', 'Bestellung beendet.');
                  if (await _confirm(tr(context, 'End this order?', 'Bestellung beenden?'), tr(context, 'No more tickets can be added afterwards.', 'Danach können keine Tickets mehr hinzugefügt werden.'), tr(context, 'End order', 'Beenden'))) {
                    await _do(() => a.endOrder(o), done);
                  }
                },
          icon: const Icon(Icons.flag),
          label: Text(tr(context, 'End order', 'Bestellung beenden')),
        ));
      }
    } else if (!o.freed) {
      buttons.add(FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: TriptiColors.green),
        onPressed: _busy
            ? null
            : () async {
                final done = tr(context, 'Table is free.', 'Tisch ist frei.');
                if (await _confirm(tr(context, 'Free table ${widget.table.number}?', 'Tisch ${widget.table.number} freigeben?'), tr(context, 'The table becomes free for new guests.', 'Der Tisch wird für neue Gäste frei.'), tr(context, 'Free table', 'Freigeben'))) {
                  await _do(() => a.freeTable(o), done, close: true);
                }
              },
        icon: const Icon(Icons.check_circle_outline),
        label: Text(tr(context, 'Free table', 'Tisch freigeben')),
      ));
    }

    return ListView(controller: widget.scroll, padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(4)))),
      const SizedBox(height: 12),
      Row(children: [
        Text(tr(context, 'Table ${widget.table.number}', 'Tisch ${widget.table.number}'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: TriptiColors.ink)),
        const SizedBox(width: 10),
        Text(o.orderId, style: const TextStyle(color: Colors.black54, fontWeight: FontWeight.w600)),
        const Spacer(),
        Text(euro(total), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: TriptiColors.primary)),
      ]),
      const SizedBox(height: 8),
      Wrap(spacing: 6, runSpacing: 6, children: [
        if (ended) StatusPill(tr(context, 'Ended', 'Beendet'), Colors.grey, icon: Icons.flag),
        if (o.billPending) StatusPill(tr(context, 'Bill requested', 'Rechnung angefordert'), TriptiColors.amber, icon: Icons.receipt_long),
        if (o.billReady) StatusPill(tr(context, 'Bill ready at cashier', 'Rechnung an der Kasse bereit'), TriptiColors.green, icon: Icons.receipt),
        if (o.endPending) StatusPill(tr(context, 'End requested', 'Beenden angefragt'), TriptiColors.amber, icon: Icons.flag_outlined),
        StatusPill(
          paid ? tr(context, 'Paid', 'Bezahlt') : o.paymentStatus == 'partial' ? tr(context, 'Part paid · ${euro(o.outstanding)} open', 'Teilbezahlt · ${euro(o.outstanding)} offen') : tr(context, 'Not paid', 'Nicht bezahlt'),
          paid ? TriptiColors.green : TriptiColors.red,
          icon: Icons.euro,
        ),
      ]),
      const SizedBox(height: 14),
      for (final b in buttons) Padding(padding: const EdgeInsets.only(bottom: 8), child: SizedBox(height: 48, child: b)),
      const SizedBox(height: 6),
      if (tickets.isEmpty) EmptyState(Icons.receipt_long, tr(context, 'No tickets yet.', 'Noch keine Tickets.')),
      for (final t in tickets.reversed) TicketCard(ticket: t),
    ]);
  }
}
