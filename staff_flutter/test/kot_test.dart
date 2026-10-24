import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tripti_staff/core/kot_pdf.dart';
import 'package:tripti_staff/core/store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('kot pdf builds', () async {
    final t = Ticket({
      'id': 'k1', 'tableNumber': '4', 'room': 'Garden', 'placedBy': 'Anna', 'notes': 'No onion', 'kotSuffix': '002',
      'created': '2026-10-23 09:00:00.000Z',
      'items': [
        {'id': 'a', 'name': 'Aloo Bajji', 'category': 'Appetizers', 'quantity': 1, 'spiceLevel': 'Hot'},
        {'id': 'b', 'name': 'Butter Chicken NV', 'category': 'Main', 'quantity': 1, 'spiceLevel': 'None'},
        {'id': 'a', 'name': 'Aloo Bajji', 'category': 'Appetizers', 'quantity': 1, 'spiceLevel': 'None'},
      ],
    });
    final bytes = await buildKotPdf(ticket: t, orderId: 'WI00020', printOrder: {'Main': 1, 'Appetizers': 2}, categoryOfItem: {}, cutBetweenCategories: true);
    expect(bytes.length, greaterThan(1000));
    final out = Platform.environment['KOT_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
