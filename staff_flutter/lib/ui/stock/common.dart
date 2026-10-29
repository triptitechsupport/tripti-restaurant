import 'package:flutter/material.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'scan.dart';

/// "In stock" / "Low" / "Out" pill.
Widget stockPill(BuildContext context, Map<String, dynamic> item) => switch (stockStatus(item)) {
      'out' => StatusPill(tr(context, 'Out', 'Leer'), TriptiColors.red),
      'low' => StatusPill(tr(context, 'Low', 'Knapp'), TriptiColors.amber),
      _ => StatusPill(tr(context, 'In stock', 'Vorrätig'), TriptiColors.green),
    };

String qtyText(Map<String, dynamic> item) => '${fmtNum(toDouble(item['quantity']))} ${item['unit'] ?? ''}'.trim();

String dateText(DateTime? d) => d == null ? '' : '${d.day}.${d.month}.${d.year}';

String dateTimeText(DateTime? d) => d == null ? '' : '${dateText(d)} ${timeOf(d)}';

/// Search box that picks a stock item by name or barcode.
class StockItemPicker extends StatelessWidget {
  const StockItemPicker({super.key, required this.items, required this.onSelected, this.initial = '', this.label, this.onText});
  final List<Map<String, dynamic>> items;
  final ValueChanged<Map<String, dynamic>> onSelected;
  final ValueChanged<String>? onText;
  final String initial;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Autocomplete<Map<String, dynamic>>(
      initialValue: TextEditingValue(text: initial),
      displayStringForOption: (s) => '${s['name']}',
      optionsBuilder: (v) {
        final q = v.text.trim().toLowerCase();
        if (q.isEmpty) return const Iterable.empty();
        return items.where((s) => '${s['name']}'.toLowerCase().contains(q) || '${s['barcode'] ?? ''}'.contains(q)).take(25);
      },
      optionsViewBuilder: (ctx, onSel, options) => Align(
        alignment: Alignment.topLeft,
        child: Material(
          elevation: 4,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280, maxWidth: 420),
            child: ListView(padding: EdgeInsets.zero, shrinkWrap: true, children: [
              for (final o in options)
                ListTile(dense: true, title: Text('${o['name']}'), subtitle: Text(qtyText(o)), trailing: stockPill(context, o), onTap: () => onSel(o)),
            ]),
          ),
        ),
      ),
      onSelected: onSelected,
      fieldViewBuilder: (ctx, ctl, focus, _) => TextField(
        controller: ctl,
        focusNode: focus,
        onChanged: onText,
        decoration: InputDecoration(
          labelText: label ?? tr(context, 'Item (name or barcode)', 'Artikel (Name oder Barcode)'),
          prefixIcon: const Icon(Icons.search),
          suffixIcon: IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: tr(context, 'Scan barcode', 'Barcode scannen'),
            onPressed: () async {
              final code = await scanBarcode(ctx);
              if (code == null || !ctx.mounted) return;
              final found = itemByBarcode(items, code);
              if (found == null) {
                toast(ctx, tr(ctx, 'No item has barcode $code. Add it under Stock first.', 'Kein Artikel hat den Barcode $code. Zuerst unter Lager anlegen.'), error: true);
                return;
              }
              ctl.text = '${found['name']}';
              focus.unfocus();
              onSelected(found);
            },
          ),
        ),
      ),
    );
  }
}

Future<DateTime?> pickDate(BuildContext context, DateTime? initial) => showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
