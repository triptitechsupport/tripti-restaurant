import 'package:flutter/material.dart';

import '../../core/actions.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'waiter_home.dart';

/// One kitchen ticket with its dishes. Ready dishes can be served one by one.
class TicketCard extends StatefulWidget {
  const TicketCard({super.key, required this.ticket, this.showTable = false});
  final Ticket ticket;
  final bool showTable;

  @override
  State<TicketCard> createState() => _TicketCardState();
}

class _TicketCardState extends State<TicketCard> {
  bool _busy = false;

  Future<void> _do(Future<void> Function() f, {String? done}) async {
    if (_busy) return;
    setState(() => _busy = true);
    await runAction(context, f, done: done);
    if (mounted) setState(() => _busy = false);
    if (mounted) StoreScope.of(context).refreshLive();
  }

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final a = StoreScope.actionsOf(context);
    final t = widget.ticket;
    final o = s.orderById(t.parentId);
    final (label, color) = ticketStatus(context, t.status);
    final units = <({Map<String, dynamic> item, int index, int unit, String status})>[];
    final items = t.items;
    for (var i = 0; i < items.length; i++) {
      for (var u = 0; u < unitCount(items[i]); u++) {
        units.add((item: items[i], index: i, unit: u, status: t.itemStatus(i)));
      }
    }
    final servable = t.open ? units.where((x) => x.status == 'prepared' || (t.status == 'ready' && x.status != 'pickedup')).length : 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (widget.showTable) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: TriptiColors.primary, borderRadius: BorderRadius.circular(8)),
                child: Text('${t.data['tableLabel'] ?? ''}'.contains('+') ? '${t.data['tableLabel']}'.replaceFirst('Tables', tr(context, 'Tables', 'Tische')) : '${tr(context, 'Table', 'Tisch')} ${t.table}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(child: Text(ticketLabel(t, o), style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.ink))),
            Text(timeOf(t.created), style: const TextStyle(color: Colors.black45, fontSize: 12)),
            const SizedBox(width: 8),
            StatusPill(label, color),
          ]),
          const SizedBox(height: 8),
          for (final u in units)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Icon(
                  u.status == 'pickedup' || t.status == 'completed'
                      ? Icons.check_circle
                      : u.status == 'prepared' || t.status == 'ready'
                          ? Icons.room_service
                          : Icons.schedule,
                  size: 18,
                  color: u.status == 'pickedup' || t.status == 'completed'
                      ? TriptiColors.blue
                      : u.status == 'prepared' || t.status == 'ready'
                          ? TriptiColors.green
                          : Colors.black38,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: '${u.item['name'] ?? ''}', style: TextStyle(decoration: t.status == 'cancelled' ? TextDecoration.lineThrough : null, fontWeight: FontWeight.w600)),
                    if ('${u.item['tableNumber'] ?? ''}'.isNotEmpty && '${u.item['tableNumber']}' != t.table)
                      TextSpan(text: '  ${tr(context, 'Table', 'Tisch')} ${u.item['tableNumber']}', style: const TextStyle(color: TriptiColors.blue, fontSize: 12, fontWeight: FontWeight.w700)),
                    if ('${u.item['spiceLevel'] ?? 'None'}' != 'None') TextSpan(text: '  ${u.item['spiceLevel']}', style: const TextStyle(color: TriptiColors.amber, fontSize: 12)),
                  ])),
                ),
                if (t.open && u.status != 'pickedup' && (u.status == 'prepared' || t.status == 'ready'))
                  TextButton(
                    style: TextButton.styleFrom(foregroundColor: TriptiColors.green, visualDensity: VisualDensity.compact),
                    onPressed: _busy ? null : () => _do(() async => a.serveDish(t, u.index, u.unit), done: tr(context, 'Served', 'Serviert')),
                    child: Text(tr(context, 'Serve', 'Servieren')),
                  ),
              ]),
            ),
          if (t.notes.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 4), child: Text('${tr(context, 'Note', 'Notiz')}: ${t.notes}', style: const TextStyle(fontSize: 13, color: Colors.black54))),
          if (t.open) ...[
            const SizedBox(height: 6),
            Row(children: [
              if (t.status == 'pending')
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: TriptiColors.red),
                  onPressed: _busy
                      ? null
                      : () async {
                          final ok = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: Text(tr(context, 'Cancel this ticket?', 'Dieses Ticket stornieren?')),
                              content: Text(tr(context, 'The kitchen has not started it yet.', 'Die Küche hat noch nicht begonnen.')),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Keep', 'Behalten'))),
                                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Cancel ticket', 'Stornieren'))),
                              ],
                            ),
                          );
                          if (ok == true && context.mounted) await _do(() => a.cancelTicket(t), done: tr(context, 'Ticket cancelled', 'Ticket storniert'));
                        },
                  icon: const Icon(Icons.close, size: 18),
                  label: Text(tr(context, 'Cancel', 'Stornieren')),
                ),
              const Spacer(),
              if (servable > 1)
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: TriptiColors.green, minimumSize: const Size(40, 40)),
                  onPressed: _busy ? null : () => _do(() => a.serveReady(t), done: tr(context, 'Ready dishes served', 'Fertige Gerichte serviert')),
                  icon: const Icon(Icons.done_all, size: 18),
                  label: Text(t.status == 'ready' ? tr(context, 'Serve all', 'Alle servieren') : tr(context, 'Serve $servable ready', '$servable fertige servieren')),
                ),
            ]),
          ],
        ]),
      ),
    );
  }
}
