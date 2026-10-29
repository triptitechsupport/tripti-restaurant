import 'package:flutter/material.dart';

import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'common.dart';
import 'bill_page.dart';
import 'scan.dart';

class _InLine {
  Map<String, dynamic>? item;
  final qty = TextEditingController(), cost = TextEditingController(), barcode = TextEditingController();
  DateTime? expiry;
  int key = DateTime.now().microsecondsSinceEpoch;
}

/// Goods-in: one supplier bill with one lot per line.
class GoodsInPage extends StatefulWidget {
  const GoodsInPage({super.key});

  @override
  State<GoodsInPage> createState() => _GoodsInPageState();
}

class _GoodsInPageState extends State<GoodsInPage> {
  List<Map<String, dynamic>> _items = [];
  final _supplier = TextEditingController(), _bill = TextEditingController(), _notes = TextEditingController();
  List<_InLine> _lines = [_InLine()];
  bool _loading = true, _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await AppScope.read(context).pb.collection('stock_items').getFullList(sort: 'name');
      if (mounted) setState(() => _items = r.map((e) => e.toJson()).toList());
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _submit() async {
    final valid = _lines.where((l) => l.item != null && toDouble(l.qty.text.replaceAll(',', '.')) > 0).toList();
    if (valid.isEmpty) {
      toast(context, tr(context, 'Add at least one item with a quantity.', 'Mindestens einen Artikel mit Menge eintragen.'), error: true);
      return;
    }
    for (final l in valid) {
      final bc = l.barcode.text.trim();
      if (bc.isNotEmpty && !RegExp(r'^\d{1,40}$').hasMatch(bc)) {
        toast(context, tr(context, 'Barcode must be digits only (${l.item!['name']}).', 'Barcode nur aus Ziffern (${l.item!['name']}).'), error: true);
        return;
      }
      if (l.item!['perishable'] == true && l.expiry == null) {
        toast(context, tr(context, '${l.item!['name']} is perishable: enter the expiry date.', '${l.item!['name']} ist verderblich: Ablaufdatum eintragen.'), error: true);
        return;
      }
    }
    final session = AppScope.read(context);
    final pb = session.pb;
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      final bill = _bill.text.trim().isEmpty ? 'GRN-${DateTime.now().millisecondsSinceEpoch}' : _bill.text.trim();
      final receipt = await pb.collection('stock_receipts').create(body: {
        'billNumber': bill,
        'supplier': _supplier.text.trim(),
        'billDate': DateTime.now().toUtc().toIso8601String(),
        'notes': _notes.text.trim(),
        'receivedBy': session.displayName,
        'receivedById': session.user?.id ?? '',
        'receivedByRole': 'stock',
      });
      for (final l in valid) {
        final cost = toDouble(l.cost.text.replaceAll(',', '.'));
        await receiveLot(pb,
            itemId: l.item!['id'],
            itemName: '${l.item!['name']}',
            quantity: toDouble(l.qty.text.replaceAll(',', '.')),
            barcode: l.barcode.text.trim(),
            expiry: l.expiry,
            unitCost: cost > 0 ? cost : null,
            perishable: l.item!['perishable'] == true,
            supplierBill: _bill.text.trim(),
            receiptId: receipt.id,
            byName: session.displayName,
            byId: session.user?.id ?? '',
            role: 'stock');
      }
    }, done: tr(context, '${valid.length} item(s) received', '${valid.length} Artikel eingebucht'));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      setState(() {
        _lines = [_InLine()];
        _bill.clear();
        _notes.clear();
      });
      _load();
    }
  }

  /// Supplier bill (PDF or photo) -> check -> booked in one tap.
  Future<void> _upload(bool photo) async {
    final booked = await uploadSupplierBill(context, photo: photo);
    if (booked && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return AbsorbPointer(
      absorbing: _busy,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
        PageIntro(Icons.local_shipping_outlined, tr(context, 'Goods in', 'Wareneingang'), tr(context, 'Book a delivery into the store. Each line becomes a lot with its own expiry.', 'Lieferung einbuchen. Jede Zeile wird eine Charge mit eigenem Ablaufdatum.')),
        const SizedBox(height: 8),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () => _upload(false),
          icon: const Icon(Icons.upload_file),
          label: Text(tr(context, 'Upload supplier bill (PDF)', 'Lieferantenrechnung hochladen (PDF)')),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          onPressed: () => _upload(true),
          icon: const Icon(Icons.document_scanner_outlined),
          label: Text(tr(context, 'Photo of a paper bill', 'Papierrechnung fotografieren')),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Text(tr(context, 'Or book a delivery by hand:', 'Oder Lieferung von Hand einbuchen:'), style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextField(controller: _supplier, decoration: InputDecoration(labelText: tr(context, 'Supplier', 'Lieferant')))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: _bill, decoration: InputDecoration(labelText: tr(context, 'Bill number', 'Rechnungsnr.')))),
        ]),
        const SizedBox(height: 10),
        for (final l in _lines) _lineCard(l),
        OutlinedButton.icon(onPressed: () => setState(() => _lines.add(_InLine())), icon: const Icon(Icons.add), label: Text(tr(context, 'Add line', 'Zeile hinzufügen'))),
        const SizedBox(height: 8),
        TextField(controller: _notes, decoration: InputDecoration(labelText: tr(context, 'Notes', 'Notizen'))),
        const SizedBox(height: 16),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: _submit,
          icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.local_shipping_outlined),
          label: Text(tr(context, 'Receive goods', 'Ware einbuchen')),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(tr(context, 'Item missing? Add it under Stock first.', 'Artikel fehlt? Zuerst unter Lager anlegen.'), style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ),
      ]),
    );
  }

  Widget _lineCard(_InLine l) => Card(
        key: ValueKey(l.key),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 6, 4, 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: StockItemPicker(
                  items: _items,
                  initial: '${l.item?['name'] ?? ''}',
                  onSelected: (s) => setState(() {
                    l.item = s;
                    if (l.cost.text.isEmpty && toDouble(s['unitCost']) > 0) l.cost.text = '${s['unitCost']}';
                  }),
                  onText: (_) {
                    if (l.item != null) setState(() => l.item = null);
                  },
                ),
              ),
              if (_lines.length > 1) IconButton(icon: const Icon(Icons.delete_outline, color: TriptiColors.red), onPressed: () => setState(() => _lines.remove(l))),
            ]),
            if (l.item != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 0, 8),
                child: Text('${tr(context, 'In store now', 'Jetzt im Lager')}: ${qtyText(l.item!)}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
              ),
            Row(children: [
              Expanded(child: TextField(controller: l.qty, onChanged: (_) => setState(() {}), keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: '${tr(context, 'Quantity', 'Menge')}${l.item != null ? ' (${l.item!['unit'] ?? ''})' : ''}'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: l.cost, onChanged: (_) => setState(() {}), keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr(context, 'Price/unit €', 'Preis/Einheit €')))),
            ]),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: l.barcode,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Lot barcode (optional)', 'Chargen-Barcode (optional)'),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.qr_code_scanner),
                      onPressed: () async {
                        final code = await scanBarcode(context);
                        if (code != null && mounted) setState(() => l.barcode.text = code);
                      },
                    ),
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () async {
                  final d = await pickDate(context, l.expiry);
                  if (d != null) setState(() => l.expiry = DateTime(d.year, d.month, d.day, 23, 59));
                },
                icon: const Icon(Icons.event),
                label: Text(l.expiry == null ? tr(context, 'Expiry', 'Ablauf') : dateText(l.expiry), style: TextStyle(color: l.expiry == null && l.item?['perishable'] == true ? TriptiColors.red : null)),
              ),
            ]),
            if (l.item != null && toDouble(l.qty.text.replaceAll(',', '.')) > 0 && toDouble(l.cost.text.replaceAll(',', '.')) > 0)
              Text('= ${euro(toDouble(l.qty.text.replaceAll(',', '.')) * toDouble(l.cost.text.replaceAll(',', '.')))}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
        ),
      );
}
