import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../common/widgets.dart';
import 'ticket_card.dart';
import 'waiter_home.dart';

/// Open tickets of all tables, ready ones first. "Mine" shows only the
/// tickets this waiter sent.
class ActivePage extends StatefulWidget {
  const ActivePage({super.key});

  @override
  State<ActivePage> createState() => _ActivePageState();
}

class _ActivePageState extends State<ActivePage> {
  bool _mine = true;

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final me = AppScope.of(context).displayName;
    int rank(String st) => switch (st) { 'ready' => 0, 'preparing' => 1, _ => 2 };
    final list = s.tickets.where((t) => t.open && (!_mine || t.placedBy == me)).toList()
      ..sort((a, b) {
        final ra = List.generate(a.items.length, a.itemStatus).contains('prepared') ? 0 : rank(a.status);
        final rb = List.generate(b.items.length, b.itemStatus).contains('prepared') ? 0 : rank(b.status);
        if (ra != rb) return ra.compareTo(rb);
        return (a.created ?? DateTime(0)).compareTo(b.created ?? DateTime(0));
      });
    return RefreshIndicator(
      onRefresh: s.refreshLive,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        SegmentedButton<bool>(
          segments: [
            ButtonSegment(value: true, label: Text(tr(context, 'My tickets', 'Meine Tickets')), icon: const Icon(Icons.person)),
            ButtonSegment(value: false, label: Text(tr(context, 'All tables', 'Alle Tische')), icon: const Icon(Icons.groups)),
          ],
          selected: {_mine},
          onSelectionChanged: (v) => setState(() => _mine = v.first),
        ),
        const SizedBox(height: 12),
        if (list.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: EmptyState(Icons.check_circle_outline, tr(context, 'No open tickets.', 'Keine offenen Tickets.')),
          ),
        for (final t in list) TicketCard(key: ValueKey(t.id), ticket: t, showTable: true),
      ]),
    );
  }
}
