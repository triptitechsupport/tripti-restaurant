import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tripti_staff/core/receipt_pdf.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('receipt pdf builds', () async {
    final bytes = await buildReceiptPdf({
      'status': 'signed',
      'qrCodeData': '_R1-AT1_TEST_fake1_2026-10-23T09:00:00_0,00_5,50',
      'signedAt': '2026-10-23T09:00:00Z',
      'fiskalyReceiptNumber': '1042',
      'amount': 15.4,
      'paymentType': 'CASH',
      'orderId': 'WI00020',
      'receiptSnapshot': {
        'company': {'name': 'Tripti Genusswelt', 'address': 'Hauptplatz 1, 9500 Villach', 'vatId': 'ATU12345678'},
        'cashRegisterName': 'Main counter',
        'settlementNumber': 'WI00020_S001',
        'lines': [
          {'text': 'Aloo Bajji', 'quantity': 1, 'price_per_unit': 5.5, 'vatPercent': 10, 'vatRate': 'REDUCED_1'},
          {'text': 'Mango Lassi groß', 'quantity': 2, 'price_per_unit': 4.95, 'vatPercent': 20, 'vatRate': 'STANDARD'},
        ],
        'vatTotals': [
          {'vat_rate': 'REDUCED_1', 'amount': 5.5},
          {'vat_rate': 'STANDARD', 'amount': 9.9},
        ],
      },
      'responsePayload': {'_env': 'TEST', 'cash_register_serial_number': 'TRIPTI-001'},
    });
    expect(bytes.length, greaterThan(1000));
    final out = Platform.environment['RECEIPT_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
