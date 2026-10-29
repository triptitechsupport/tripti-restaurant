import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';

import '../../core/billing.dart';
import '../../core/receipt_pdf.dart';
import '../../core/scope.dart';

/// Shows the RKSV receipt and prints it on the 80 mm printer
/// (Android print service, like the kitchen tickets).
Future<void> openReceipt(BuildContext context, FiscalReceipt r) async {
  final model = r.printModel();
  if (model == null) {
    toast(context, tr(context, 'This receipt is not signed yet.', 'Dieser Beleg ist noch nicht signiert.'), error: true);
    return;
  }
  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReceiptView(model: model)));
}

class ReceiptView extends StatelessWidget {
  const ReceiptView({super.key, required this.model});
  final Map<String, dynamic> model;

  @override
  Widget build(BuildContext context) {
    final fallback = model['isFallback'] == true;
    return Scaffold(
      appBar: AppBar(title: Text(fallback ? tr(context, 'Outage receipt', 'Ausfallbeleg') : tr(context, 'Receipt', 'Beleg'))),
      body: PdfPreview(
        build: (format) async => Uint8List.fromList(await buildReceiptPdf(model)),
        initialPageFormat: PdfPageFormat.roll80,
        canChangePageFormat: false,
        canChangeOrientation: false,
        canDebug: false,
        allowSharing: true,
        pdfFileName: 'Beleg-${model['orderId'] ?? ''}.pdf',
        maxPageWidth: 360,
        loadingWidget: const CircularProgressIndicator(),
      ),
    );
  }
}
