import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'store.dart';

final _money = NumberFormat.currency(locale: 'de_AT', symbol: '€', decimalDigits: 2);
String receiptMoney(dynamic v) => _money.format(toDouble(v));

String _date(DateTime d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.day)} ${m[d.month - 1]} ${d.year} ${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
}

pw.Font? _regular, _bold;
Future<(pw.Font, pw.Font)> _fonts() async {
  _regular ??= pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans.ttf'));
  _bold ??= pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
  return (_regular!, _bold!);
}

/// The RKSV receipt on an 80 mm roll, with the same content as the
/// website's receipt (FiscalReceiptDialog.jsx).
Future<List<int>> buildReceiptPdf(Map<String, dynamic> t, [PdfPageFormat? format]) async {
  final (regular, bold) = await _fonts();
  final response = jsonMap(t['responsePayload']);
  final snap = jsonMap(t['receiptSnapshot']);
  final company = jsonMap(snap['company']);
  final lines = jsonList(snap['lines']);
  final vatTotals = jsonList(snap['vatTotals']);
  final fallback = t['isFallback'] == true;
  final status = '${t['status'] ?? ''}';
  final qr = '${t['qrCodeData'] ?? ''}';
  final type = '${t['receiptType'] ?? 'NORMAL'}';
  final title = type == 'CANCELLATION'
      ? 'CANCELLATION / STORNO'
      : type == 'TRAINING'
          ? 'TRAINING / SCHULUNG'
          : 'RECEIPT / BELEG';
  final signed = parseDate(t['signedAt']);
  final orderId = '${t['orderId'] ?? ''}';
  final sn = '${snap['settlementNumber'] ?? ''}';
  final orderRef = sn.startsWith('${orderId}_') ? sn : [orderId, sn.isNotEmpty ? sn : '${snap['settlementId'] ?? ''}'].where((x) => x.isNotEmpty).join('_');

  const base = pw.TextStyle(fontSize: 8.5);
  pw.Widget row(String l, String r, {bool b = false}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 1),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Expanded(child: pw.Text(l)),
          pw.SizedBox(width: 6),
          pw.Text(r, style: b ? pw.TextStyle(font: bold) : null),
        ]),
      );
  pw.Widget rule() => pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 4), child: pw.Divider(thickness: 0.6, height: 1));

  final doc = pw.Document(theme: pw.ThemeData.withFont(base: regular, bold: bold));
  doc.addPage(pw.Page(
    pageFormat: format ?? PdfPageFormat.roll80.copyWith(marginLeft: 4 * PdfPageFormat.mm, marginRight: 4 * PdfPageFormat.mm, marginTop: 3 * PdfPageFormat.mm, marginBottom: 6 * PdfPageFormat.mm),
    build: (_) => pw.DefaultTextStyle(
      style: base,
      child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
        if (response['_env'] != 'LIVE')
          pw.Container(
            margin: const pw.EdgeInsets.only(bottom: 6),
            padding: const pw.EdgeInsets.all(3),
            decoration: pw.BoxDecoration(border: pw.Border.all(width: 1)),
            child: pw.Text('TEST RECEIPT\nNOT FOR ACCOUNTING', textAlign: pw.TextAlign.center, style: pw.TextStyle(font: bold)),
          ),
        pw.Text('${company['name'] ?? ''}', textAlign: pw.TextAlign.center, style: pw.TextStyle(font: bold, fontSize: 12)),
        pw.Text('${company['address'] ?? ''}', textAlign: pw.TextAlign.center),
        pw.Text('UID: ${company['vatId'] ?? ''}', textAlign: pw.TextAlign.center),
        rule(),
        pw.Text(title, textAlign: pw.TextAlign.center, style: pw.TextStyle(font: bold, fontSize: 10)),
        rule(),
        if ('${snap['cashRegisterName'] ?? ''}'.isNotEmpty) row('Register', '${snap['cashRegisterName']}'),
        if ('${snap['cashierName'] ?? ''}'.isNotEmpty) row('Cashier / Kassier', '${snap['cashierName']}'),
        fallback ? row('Local reference', '${t['localReference'] ?? ''}') : row('Receipt No.', '${t['fiskalyReceiptNumber'] ?? ''}', b: true),
        row('Order ID', orderRef),
        row('Date / Time', signed == null ? '—' : _date(signed)),
        rule(),
        pw.Row(children: [pw.Expanded(child: pw.Text('ITEM / ARTIKEL', style: pw.TextStyle(font: bold))), pw.Text('EUR', style: pw.TextStyle(font: bold))]),
        for (final l in lines) ...[
          pw.SizedBox(height: 3),
          pw.Text('${l['text'] ?? ''}', style: pw.TextStyle(font: bold)),
          row('${l['quantity']} × ${receiptMoney(l['price_per_unit'])} · ${l['vatPercent']}% VAT',
              receiptMoney((toDouble(l['price_per_unit']) * 100).round() * toDouble(l['quantity']) / 100)),
        ],
        rule(),
        pw.Row(children: [
          pw.Expanded(child: pw.Text('TOTAL / SUMME', style: pw.TextStyle(font: bold, fontSize: 11))),
          pw.Text(receiptMoney(t['amount']), style: pw.TextStyle(font: bold, fontSize: 11)),
        ]),
        row('Payment', '${t['paymentType'] ?? ''}', b: true),
        rule(),
        pw.Row(children: [pw.Expanded(child: pw.Text('VAT / MWST.', style: pw.TextStyle(font: bold))), pw.Text('GROSS / BRUTTO', style: pw.TextStyle(font: bold))]),
        for (final v in vatTotals)
          row(() {
            final l = lines.where((x) => x['vatRate'] == v['vat_rate']).firstOrNull;
            return l?['vatPercent'] != null ? '${l!['vatPercent']}%' : '${v['vat_rate']}';
          }(), receiptMoney(v['amount'])),
        if ('${snap['cancellationReason'] ?? ''}'.isNotEmpty) pw.Text('Cancellation reason: ${snap['cancellationReason']}'),
        for (final h in (response['hints'] is List ? response['hints'] as List : const [])) pw.Padding(padding: const pw.EdgeInsets.only(top: 3), child: pw.Text('$h')),
        rule(),
        if (!fallback) row('Kassen-ID', '${response['cash_register_serial_number'] ?? ''}'),
        if (qr.isNotEmpty)
          pw.Center(
            child: pw.Padding(
              padding: const pw.EdgeInsets.symmetric(vertical: 6),
              child: pw.BarcodeWidget(barcode: pw.Barcode.qrCode(errorCorrectLevel: pw.BarcodeQRCorrectionLevel.medium), data: qr, width: 42 * PdfPageFormat.mm, height: 42 * PdfPageFormat.mm),
            ),
          ),
        pw.Text(fallback ? 'Outage receipt / Ausfallbeleg' : 'Fiscal Receipt / Fiskalbeleg', textAlign: pw.TextAlign.center),
        pw.Text(
          fallback
              ? 'Sicherheitseinrichtung ausgefallen'
              : status == 'signed'
                  ? 'SIGNED / SIGNIERT'
                  : status == 'outage'
                      ? 'SECURITY DEVICE OUTAGE'
                      : 'NOT READY FOR PRINT',
          textAlign: pw.TextAlign.center,
          style: pw.TextStyle(font: bold),
        ),
      ]),
    ),
  ));
  return doc.save();
}
