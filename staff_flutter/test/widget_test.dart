import 'package:flutter_test/flutter_test.dart';
import 'package:tripti_staff/core/store.dart';

void main() {
  test('table number from name', () {
    expect(tableNum('Table 12'), 12);
    expect(tableNum('x'), null);
  });
}
