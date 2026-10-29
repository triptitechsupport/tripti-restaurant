import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'store.dart';

pw.Font? _bold;

/// Kitchen ticket (KOT) on the 80 mm printer, laid out like the website's
/// lib/kotPrint.js: dishes grouped by category in the admin print order,
/// each category repeating order ID and table so the slip can be cut apart.
Future<List<int>> buildKotPdf({
  required Ticket ticket,
  required String orderId,
  required Map<String, int?> printOrder,
  required Map<String, String> categoryOfItem,
  bool cutBetweenCategories = false,
  DateTime? orderCreated,
}) async {
  _bold ??= pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
  final f = _bold!;
  final byCat = <String, List<Map<String, dynamic>>>{};
  for (final it in ticket.items) {
    var c = (categoryOfItem['${it['id']}'] ?? '${it['category'] ?? ''}').trim();
    if (c.isEmpty) c = 'Uncategorized';
    byCat.putIfAbsent(c, () => []).add(it);
  }
  int order(String c) {
    if (c == 'Uncategorized') return 1 << 40;
    final o = printOrder[c];
    return o ?? (1000000 + (c.isEmpty ? 0 : c.codeUnitAt(0)));
  }

  final cats = byCat.keys.toList()
    ..sort((a, b) {
      final d = order(a).compareTo(order(b));
      return d != 0 ? d : a.compareTo(b);
    });
  final id = ticket.suffix.isEmpty ? orderId : '${orderId}_${ticket.suffix}';
  final created = orderCreated ?? ticket.created;
  String two(int v) => v.toString().padLeft(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final room = '${ticket.data['room'] ?? ''}';
  final table = '${ticket.data['tableLabel'] ?? ''}'.contains('+') ? '${ticket.data['tableLabel']}' : ticket.table;

  final meta = pw.TextStyle(font: f, fontSize: 10.5);
  final item = pw.TextStyle(font: f, fontSize: 13);
  final doc = pw.Document();
  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.roll80.copyWith(marginLeft: 3 * PdfPageFormat.mm, marginRight: 3 * PdfPageFormat.mm, marginTop: 3 * PdfPageFormat.mm, marginBottom: 8 * PdfPageFormat.mm),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Text('KOT', style: pw.TextStyle(font: f, fontSize: 24)),
      if (created != null)
        pw.Text('Date: ${two(created.day)} ${months[created.month - 1]} ${created.year} · Time: ${two(created.hour)}:${two(created.minute)}', style: meta),
      if (ticket.notes.isNotEmpty) pw.Padding(padding: const pw.EdgeInsets.only(top: 2), child: pw.Text('Note: ${ticket.notes}', style: meta)),
      for (var i = 0; i < cats.length; i++) ...[
        if (i > 0)
          cutBetweenCategories
              ? pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 10), child: pw.Text('— — — CUT HERE — — —', textAlign: pw.TextAlign.center, style: meta))
              : pw.Divider(thickness: 1),
        pw.SizedBox(height: 3),
        pw.Text('Order ID: #$id', style: meta),
        pw.Text('${room.isEmpty ? '—' : room}, ${table.isEmpty ? '—' : table}', style: meta),
        pw.Container(
          margin: const pw.EdgeInsets.only(top: 5, bottom: 2),
          padding: const pw.EdgeInsets.symmetric(vertical: 2),
          decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(width: 2), bottom: pw.BorderSide(width: 2))),
          child: pw.Text(cats[i].toUpperCase(), style: pw.TextStyle(font: f, fontSize: 15)),
        ),
        for (final it in byCat[cats[i]]!) ...[
          pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Expanded(
              child: pw.Text(
                '${it['name'] ?? 'Item'}${'${it['spiceLevel'] ?? 'None'}' != 'None' ? ' (${it['spiceLevel']})' : ''}',
                style: item,
              ),
            ),
            pw.SizedBox(width: 6),
            pw.Text('x${it['quantity'] ?? 1}', style: item),
          ]),
          if ('${it['notes'] ?? ''}'.isNotEmpty) pw.Text('${it['notes']}', style: meta),
          pw.SizedBox(height: 2),
        ],
      ],
      if (ticket.placedBy.isNotEmpty) pw.Padding(padding: const pw.EdgeInsets.only(top: 6), child: pw.Text('Waiter / Placed by: ${ticket.placedBy}', style: meta)),
    ]),
  ));
  return doc.save();
}

/// Sends a PDF to the Android print service (choose the 80 mm printer once;
/// Android remembers it).
Future<bool> printPdf(Future<List<int>> Function() build, String name) async {
  final bytes = await build();
  return Printing.layoutPdf(name: name, format: PdfPageFormat.roll80, onLayout: (_) async => Uint8List.fromList(bytes));
}
