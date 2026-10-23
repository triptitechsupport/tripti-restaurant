import 'package:flutter/material.dart';

import '../../core/actions.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'waiter_home.dart';

const spiceLevels = ['None', 'Mild', 'Medium', 'Hot', 'Extra Hot'];

String spiceName(BuildContext context, String s) {
  switch (s) {
    case 'Mild':
      return tr(context, 'Mild', 'Mild');
    case 'Medium':
      return tr(context, 'Medium', 'Mittel');
    case 'Hot':
      return tr(context, 'Hot', 'Scharf');
    case 'Extra Hot':
      return tr(context, 'Extra hot', 'Extra scharf');
    default:
      return tr(context, 'No spice', 'Nicht scharf');
  }
}

/// Menu and cart for one table. Sending creates a kitchen ticket.
class OrderPage extends StatefulWidget {
  const OrderPage({super.key, required this.table});
  final TableInfo table;

  @override
  State<OrderPage> createState() => _OrderPageState();
}

class _OrderPageState extends State<OrderPage> {
  final List<CartLine> _cart = [];
  final _search = TextEditingController();
  final _notes = TextEditingController();
  String _category = '';
  bool _sending = false;

  @override
  void dispose() {
    _search.dispose();
    _notes.dispose();
    super.dispose();
  }

  int get _count => _cart.fold(0, (a, l) => a + l.qty);
  double get _total => _cart.fold(0.0, (a, l) => a + l.qty * l.item.price);

  void _add(MenuItem m) {
    setState(() {
      final l = _cart.where((x) => x.item.id == m.id && x.spice == 'None').firstOrNull;
      if (l != null) {
        l.qty++;
      } else {
        _cart.add(CartLine(m));
      }
    });
  }

  Future<void> _send() async {
    if (_cart.isEmpty || _sending) return;
    setState(() => _sending = true);
    final a = StoreScope.actionsOf(context);
    final s = StoreScope.of(context);
    final ok = await runAction(
      context,
      () => a.sendTicket(table: widget.table.name, room: widget.table.room, lines: _cart, notes: _notes.text.trim()),
      done: tr(context, 'Ticket sent to the kitchen.', 'Ticket an die Küche gesendet.'),
    );
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok) {
      s.refreshLive();
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context);
    final de = AppScope.of(context).de;
    final q = _search.text.trim().toLowerCase();
    final cats = s.categories.where((c) => s.menu.any((m) => m.category == c.name)).toList();
    final extra = s.menu.map((m) => m.category).toSet().difference(cats.map((c) => c.name).toSet()).where((c) => c.isNotEmpty).toList()..sort();
    final items = s.menu.where((m) {
      if (q.isNotEmpty) return m.nameFor(de).toLowerCase().contains(q) || m.nameEN.toLowerCase().contains(q);
      return _category.isEmpty || m.category == _category;
    }).toList();
    final o = s.liveOrderByTable[widget.table.name];
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Table ${widget.table.number}', 'Tisch ${widget.table.number}')),
        actions: [
          if (o != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(child: Text(o.orderId, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600))),
            ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: tr(context, 'Search dishes', 'Gerichte suchen'),
              suffixIcon: q.isEmpty ? null : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(_search.clear)),
            ),
          ),
        ),
        SizedBox(
          height: 46,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
            _chip(tr(context, 'All', 'Alle'), ''),
            for (final c in cats) _chip(c.nameFor(de), c.name),
            for (final c in extra) _chip(c, c),
          ]),
        ),
        Expanded(
          child: items.isEmpty
              ? EmptyState(Icons.restaurant_menu, tr(context, 'No dishes found.', 'Keine Gerichte gefunden.'))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 100),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _menuTile(items[i], de),
                ),
        ),
      ]),
      bottomNavigationBar: _cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                  onPressed: _openCart,
                  icon: Badge(label: Text('$_count'), child: const Icon(Icons.shopping_bag_outlined)),
                  label: Text('${tr(context, 'Review order', 'Bestellung prüfen')} · ${euro(_total)}'),
                ),
              ),
            ),
    );
  }

  Widget _chip(String label, String value) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: _category == value && _search.text.isEmpty,
          onSelected: (_) => setState(() {
            _category = value;
            _search.clear();
          }),
        ),
      );

  Widget _menuTile(MenuItem m, bool de) {
    final inCart = _cart.where((l) => l.item.id == m.id).fold(0, (a, l) => a + l.qty);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: m.available ? () => _add(m) : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          child: Row(children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(border: Border.all(color: m.veg ? TriptiColors.green : TriptiColors.red, width: 2), borderRadius: BorderRadius.circular(2)),
              child: Center(child: Container(width: 4, height: 4, decoration: BoxDecoration(color: m.veg ? TriptiColors.green : TriptiColors.red, shape: BoxShape.circle))),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.nameFor(de), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: m.available ? TriptiColors.ink : Colors.black38)),
                const SizedBox(height: 2),
                Text(m.available ? euro(m.price) : tr(context, 'Sold out', 'Ausverkauft'),
                    style: TextStyle(color: m.available ? Colors.black54 : TriptiColors.red, fontWeight: FontWeight.w600)),
              ]),
            ),
            if (inCart > 0)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: CircleAvatar(radius: 13, backgroundColor: TriptiColors.primary, child: Text('$inCart', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800))),
              ),
            IconButton(
              icon: const Icon(Icons.add_circle, size: 30),
              color: TriptiColors.primary,
              onPressed: m.available ? () => _add(m) : null,
            ),
          ]),
        ),
      ),
    );
  }

  void _openCart() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        void update(VoidCallback f) {
          setState(f);
          setSheet(() {});
          if (_cart.isEmpty) Navigator.of(ctx).pop();
        }

        final de = AppScope.of(context).de;
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.85),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ListTile(
                title: Text(tr(context, 'Order for table ${widget.table.number}', 'Bestellung Tisch ${widget.table.number}'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(ctx).pop()),
              ),
              Flexible(
                child: ListView(shrinkWrap: true, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
                  for (final l in _cart)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(l.item.nameFor(de), style: const TextStyle(fontWeight: FontWeight.w700))),
                            Text(euro(l.qty * l.item.price), style: const TextStyle(fontWeight: FontWeight.w700)),
                          ]),
                          Row(children: [
                            DropdownButton<String>(
                              value: l.spice,
                              underline: const SizedBox(),
                              items: [for (final sp in spiceLevels) DropdownMenuItem(value: sp, child: Text(spiceName(context, sp)))],
                              onChanged: (v) => update(() => l.spice = v ?? 'None'),
                            ),
                            const Spacer(),
                            IconButton(icon: const Icon(Icons.remove_circle_outline), onPressed: () => update(() => l.qty > 1 ? l.qty-- : _cart.remove(l))),
                            Text('${l.qty}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            IconButton(icon: const Icon(Icons.add_circle_outline), onPressed: () => update(() => l.qty++)),
                          ]),
                        ]),
                      ),
                    ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notes,
                    maxLines: 2,
                    decoration: InputDecoration(labelText: tr(context, 'Note for the kitchen (optional)', 'Notiz für die Küche (optional)')),
                  ),
                  const SizedBox(height: 12),
                ]),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                    onPressed: _sending
                        ? null
                        : () {
                            Navigator.of(ctx).pop();
                            _send();
                          },
                    icon: const Icon(Icons.send),
                    label: Text('${tr(context, 'Send to kitchen', 'An Küche senden')} · ${euro(_total)}'),
                  ),
                ),
              ),
            ]),
          ),
        );
      }),
    );
  }
}
