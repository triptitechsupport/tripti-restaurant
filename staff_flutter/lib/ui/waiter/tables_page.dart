import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
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
          const Spacer(),
          TextButton.icon(onPressed: () => _combine(context), icon: const Icon(Icons.link, size: 18), label: Text(tr(context, 'Combine', 'Verbinden'))),
        ]),
        if (s.groups.isNotEmpty)
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final g in s.groups.values)
              InputChip(
                avatar: const Icon(Icons.link, size: 16),
                label: Text('${g.display} · ${g.shared ? tr(context, 'one bill', 'eine Rechnung') : tr(context, 'separate bills', 'getrennt')}'),
                onDeleted: () => _separate(context, g),
                deleteButtonTooltipMessage: tr(context, 'Separate tables', 'Tische trennen'),
              ),
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

  Future<void> _separate(BuildContext context, TableGroup g) async {
    final s = StoreScope.of(context);
    final a = StoreScope.actionsOf(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr(context, 'Separate tables ${g.display}?', 'Tische ${g.display} trennen?')),
        content: Text(tr(context, 'Only possible while they have no open order.', 'Nur möglich, solange keine offene Bestellung da ist.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Separate', 'Trennen'))),
        ],
      ),
    );
    if (yes != true || !context.mounted) return;
    await runAction(context, () => a.separateGroup(g.id), done: tr(context, 'Tables separated.', 'Tische getrennt.'));
    s.refreshGroups();
  }

  /// Pick 2+ free tables and how to bill them, then take the order.
  Future<void> _combine(BuildContext context) async {
    final s = StoreScope.of(context);
    final a = StoreScope.actionsOf(context);
    final live = s.liveOrderByTable;
    final free = s.tables.where((t) => live[t.name] == null && s.groupOf(t.name) == null).toList();
    final picked = <String>{};
    var mode = 'shared';
    final go = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(tr(context, 'Combine tables', 'Tische verbinden'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: TriptiColors.ink)),
              Text(tr(context, 'Pick the free tables of one group of guests.', 'Die freien Tische einer Gästegruppe wählen.'), style: const TextStyle(color: Colors.black54)),
              const SizedBox(height: 10),
              if (free.length < 2) Text(tr(context, 'At least two free tables are needed.', 'Mindestens zwei freie Tische nötig.')),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final t in free)
                  FilterChip(
                    label: Text('${t.number}'),
                    selected: picked.contains(t.name),
                    onSelected: (v) => set(() => v ? picked.add(t.name) : picked.remove(t.name)),
                  ),
              ]),
              const SizedBox(height: 14),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'shared', label: Text(tr(context, 'One bill', 'Eine Rechnung')), icon: const Icon(Icons.receipt)),
                  ButtonSegment(value: 'linked', label: Text(tr(context, 'Separate bills', 'Getrennte Rechnungen')), icon: const Icon(Icons.call_split)),
                ],
                selected: {mode},
                onSelectionChanged: (v) => set(() => mode = v.first),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: picked.length < 2 ? null : () => Navigator.pop(ctx, true),
                icon: const Icon(Icons.restaurant_menu),
                label: Text(tr(context, 'Take the order', 'Bestellung aufnehmen')),
              ),
            ]),
          ),
        ),
      ),
    );
    if (go != true || !context.mounted) return;
    final tables = picked.toList()..sort(compareTableNames);
    final first = s.tables.firstWhere((t) => t.name == tables.first);
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => StoreScope(store: s, actions: a, child: OrderPage(table: first, combineTables: tables, combineMode: mode))));
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
            if (s.groupOf(table.name) != null)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.link, size: 13, color: free ? TriptiColors.amber : fg.withValues(alpha: 0.9)),
                  const SizedBox(width: 2),
                  Flexible(
                    child: Text(s.groupOf(table.name)!.tables.where((x) => x != table.name).join('+'),
                        overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: free ? TriptiColors.amber : fg.withValues(alpha: 0.9))),
                  ),
                ]),
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
