import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import 'order_page.dart';
import 'table_sheet.dart';
import 'waiter_home.dart';

class TablesPage extends StatelessWidget {
  const TablesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final live = s.liveOrderByTable;
    final rooms = <String, List<TableInfo>>{};
    for (final t in s.tables) {
      rooms.putIfAbsent(t.room, () => []).add(t);
    }
    final keys = rooms.keys.toList()..sort();
    return RefreshIndicator(
      onRefresh: s.refreshAll,
      child: ListView(padding: const EdgeInsets.fromLTRB(14, 14, 14, 24), children: [
        Row(children: [
          _legend(TriptiColors.green, tr(context, 'Free', 'Frei')),
          _legend(TriptiColors.primary, tr(context, 'Open order', 'Offen')),
          _legend(Colors.grey, tr(context, 'Ended', 'Beendet')),
        ]),
        const SizedBox(height: 12),
        for (final room in keys) ...[
          if (room.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6, bottom: 8),
              child: Text(room, style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.ink, letterSpacing: 0.5)),
            ),
          GridView.count(
            crossAxisCount: MediaQuery.of(context).size.width > 700 ? 6 : 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.95,
            children: [for (final t in rooms[room]!) _TableTile(table: t, order: live[t.name])],
          ),
          const SizedBox(height: 12),
        ],
      ]),
    );
  }

  Widget _legend(Color c, String text) => Padding(
        padding: const EdgeInsets.only(right: 14),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(text, style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ]),
      );
}

class _TableTile extends StatelessWidget {
  const _TableTile({required this.table, required this.order});
  final TableInfo table;
  final Order? order;

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final o = order;
    final free = o == null;
    final ended = o != null && (o.ended || !o.isOpen);
    final tickets = o == null ? <Ticket>[] : s.ticketsOf(o);
    final ready = tickets.where((t) => t.open && (t.status == 'ready' || List.generate(t.items.length, t.itemStatus).contains('prepared'))).length;
    final total = tickets.where((t) => t.status != 'cancelled').fold<double>(0, (a, t) => a + t.total);
    final bg = free ? Colors.white : ended ? const Color(0xFFE7E5E4) : TriptiColors.primary;
    final fg = free || ended ? TriptiColors.ink : Colors.white;
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          if (free) {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => StoreScope(store: s, actions: StoreScope.actionsOf(context), child: OrderPage(table: table))));
          } else {
            showTableSheet(context, table, o);
          }
        },
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: free ? TriptiColors.green.withValues(alpha: 0.5) : Colors.transparent, width: 2)),
          padding: const EdgeInsets.all(10),
          child: Stack(children: [
            Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.center, children: [
              Text('${table.number}', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: fg)),
              const SizedBox(height: 2),
              if (free)
                Text(tr(context, 'FREE', 'FREI'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: TriptiColors.green, letterSpacing: 1))
              else ...[
                Text(o.orderId, style: TextStyle(fontSize: 11, color: fg.withValues(alpha: 0.8), fontWeight: FontWeight.w600)),
                Text(ended ? tr(context, 'Ended', 'Beendet') : euro(total), style: TextStyle(fontSize: 13, color: fg, fontWeight: FontWeight.w800)),
              ],
            ]),
            if (ready > 0)
              Positioned(
                top: 0,
                right: 0,
                child: CircleAvatar(radius: 11, backgroundColor: TriptiColors.green, child: Text('$ready', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800))),
              ),
            if (o != null && (o.billPending || o.endPending))
              Positioned(
                top: 0,
                left: 0,
                child: Icon(o.billPending ? Icons.receipt_long : Icons.flag, size: 18, color: free || ended ? TriptiColors.amber : TriptiColors.gold),
              ),
          ]),
        ),
      ),
    );
  }
}
