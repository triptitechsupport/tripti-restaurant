import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock_ai.dart';
import '../../core/store.dart';
import '../../core/theme.dart';

/// Supplier bill upload: pick a PDF (or take a photo), the server reads every
/// line and converts cartons and packs into stock units; the stock person
/// checks the list and books everything with one tap.
Future<bool> uploadSupplierBill(BuildContext context, {bool photo = false}) async {
  final session = AppScope.read(context);
  List<int>? bytes;
  String name = 'bill.pdf', type = 'application/pdf';
  try {
    if (photo) {
      final f = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 2400, maxHeight: 2400, imageQuality: 85);
      if (f == null) return false;
      bytes = await f.readAsBytes();
      name = f.name;
      type = f.mimeType ?? 'image/jpeg';
    } else {
      final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png']);
      if (f == null) return false;
      bytes = await f.readAsBytes();
      name = f.name;
      final ext = (f.extension ?? '').toLowerCase();
      type = ext == 'pdf' ? 'application/pdf' : ext == 'png' ? 'image/png' : 'image/jpeg';
    }
  } catch (_) {
    if (context.mounted) toast(context, tr(context, 'Could not open the file.', 'Datei konnte nicht geöffnet werden.'), error: true);
    return false;
  }
  if (!context.mounted) return false;
  if (bytes.length > 20 * 1024 * 1024) {
    toast(context, tr(context, 'The file is larger than 20 MB.', 'Die Datei ist größer als 20 MB.'), error: true);
    return false;
  }
  final reading = tr(context, 'Reading the bill… this can take a minute for long bills.', 'Rechnung wird gelesen… bei langen Rechnungen bis zu einer Minute.');
  final offline = tr(context, 'No connection to the server.', 'Keine Verbindung zum Server.');
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => PopScope(
      canPop: false,
      child: AlertDialog(content: Row(children: [const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(color: TriptiColors.primary)), const SizedBox(width: 18), Expanded(child: Text(reading))])),
    ),
  );
  Map<String, dynamic>? out;
  String? error;
  try {
    out = await readBill(token: session.pb.authStore.token, bytes: bytes, mediaType: type, fileName: name, lang: session.de ? 'de' : 'en');
  } catch (e) {
    error = e is StockAiError ? e.message : offline;
  }
  if (!context.mounted) return false;
  Navigator.of(context, rootNavigator: true).pop();
  if (error != null || out == null) {
    toast(context, error ?? offline, error: true);
    return false;
  }
  final booked = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => BillCheckPage(data: out!)));
  return booked == true;
}

class BillCheckPage extends StatefulWidget {
  const BillCheckPage({super.key, required this.data});
  final Map<String, dynamic> data;

  @override
  State<BillCheckPage> createState() => _BillCheckPageState();
}

class _BillCheckPageState extends State<BillCheckPage> {
  late final Map<String, dynamic> _bill = Map<String, dynamic>.from(widget.data['bill'] as Map? ?? {});
  late final List<Map<String, dynamic>> _lines = [for (final l in (widget.data['lines'] as List? ?? const [])) Map<String, dynamic>.from(l as Map)];
  late final Map? _dup = widget.data['duplicate'] as Map?;
  late final _supplier = TextEditingController(text: '${_bill['supplier'] ?? ''}');
  late final _number = TextEditingController(text: '${_bill['billNumber'] ?? ''}');
  bool _busy = false;

  List<Map<String, dynamic>> get _included => _lines.where((l) => l['include'] == true && toDouble(l['quantity']) > 0).toList();

  Future<void> _editLine(Map<String, dynamic> l) async {
    final name = TextEditingController(text: '${l['itemName']}');
    final qty = TextEditingController(text: fmtNum(toDouble(l['quantity'])));
    final cost = TextEditingController(text: l['unitCost'] == null ? '' : '${l['unitCost']}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${l['text']}', style: const TextStyle(fontSize: 16)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          if (l['isNew'] == true) TextField(controller: name, decoration: InputDecoration(labelText: tr(context, 'New stock item', 'Neuer Lagerartikel'))),
          TextField(controller: qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: '${tr(context, 'Adds', 'Zugang')} (${l['unit']})')),
          TextField(controller: cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: '€ / ${l['unit']}')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      if (l['isNew'] == true && name.text.trim().isNotEmpty) l['itemName'] = name.text.trim();
      l['quantity'] = toDouble(qty.text.replaceAll(',', '.'));
      final c = toDouble(cost.text.replaceAll(',', '.'));
      l['unitCost'] = c > 0 ? c : null;
    });
  }

  Future<void> _book() async {
    final session = AppScope.read(context);
    setState(() => _busy = true);
    try {
      final out = await bookBill(
        token: session.pb.authStore.token,
        bill: {..._bill, 'supplier': _supplier.text.trim(), 'billNumber': _number.text.trim()},
        lines: _lines,
        force: _dup != null,
      );
      if (!mounted) return;
      final booked = (out['booked'] as List? ?? const []).length;
      toast(context, tr(context, 'Bill ${out['billNumber']} booked: $booked lines, ${out['created']} new items.', 'Rechnung ${out['billNumber']} eingebucht: $booked Zeilen, ${out['created']} neue Artikel.'));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      toast(context, e is StockAiError ? e.message : tr(context, 'No connection to the server.', 'Keine Verbindung zum Server.'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inc = _included;
    final newCount = {for (final l in inc.where((l) => l['isNew'] == true)) '${l['itemName']}'.toLowerCase()}.length;
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Check the bill', 'Rechnung prüfen'))),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 120), children: [
          Row(children: [
            Expanded(child: TextField(controller: _supplier, decoration: InputDecoration(labelText: tr(context, 'Supplier', 'Lieferant')))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _number, decoration: InputDecoration(labelText: tr(context, 'Bill number', 'Rechnungsnr.')))),
          ]),
          if (_dup != null)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: TriptiColors.red.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
              child: Text(tr(context, 'This bill was already booked on ${_dup['date']}. Booking it again adds the stock twice.', 'Diese Rechnung wurde schon am ${_dup['date']} eingebucht. Nochmal einbuchen zählt die Ware doppelt.'), style: const TextStyle(color: TriptiColors.red, fontWeight: FontWeight.w600)),
            ),
          if ('${_bill['note'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${_bill['note']}', style: const TextStyle(fontSize: 12, color: Colors.black54))),
          const SizedBox(height: 8),
          Text(tr(context, 'Tap a line to change it. Untick lines you don\'t want to book.', 'Zeile antippen zum Ändern. Haken weg bei Zeilen, die nicht eingebucht werden sollen.'), style: const TextStyle(fontSize: 12, color: Colors.black54)),
          for (final l in _lines)
            Card(
              child: CheckboxListTile(
                value: l['include'] == true,
                onChanged: (v) => setState(() => l['include'] = v == true),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: const EdgeInsets.fromLTRB(4, 2, 10, 2),
                title: Text('${l['itemName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${l['text']}\n${l['packLabel'] ?? ''}${l['isNew'] == true ? ' · ${tr(context, 'new item', 'neuer Artikel')}' : ''}', style: TextStyle(fontSize: 12, color: l['isNew'] == true ? TriptiColors.amber : Colors.black54)),
                isThreeLine: true,
                secondary: InkWell(
                  onTap: () => _editLine(l),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text('+${fmtNum(toDouble(l['quantity']))} ${l['unit']}', style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.green)),
                    if (l['unitCost'] != null) Text('${euro(toDouble(l['unitCost']))}/${l['unit']}', style: const TextStyle(fontSize: 12)),
                    const Icon(Icons.edit, size: 16, color: Colors.black38),
                  ]),
                ),
              ),
            ),
        ]),
      ),
      bottomSheet: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(tr(context, '${inc.length} of ${_lines.length} lines · $newCount new items · ${euro(toDouble(_bill['linesNet']))}', '${inc.length} von ${_lines.length} Zeilen · $newCount neue Artikel · ${euro(toDouble(_bill['linesNet']))}'), style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 6),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), backgroundColor: _dup != null ? TriptiColors.red : null),
              onPressed: inc.isEmpty || _busy ? null : _book,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_circle_outline),
              label: Text(_dup != null ? tr(context, 'Book again anyway', 'Trotzdem nochmal einbuchen') : tr(context, 'Book all (${inc.length})', 'Alles einbuchen (${inc.length})')),
            ),
          ]),
        ),
      ),
    );
  }
}
