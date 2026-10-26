import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

/// Server help for stock (apps/api/src/routes/stockAi.js):
/// photo -> item fields or delivery lines (Claude reads the photo), and
/// shop barcode -> product name (Open Food Facts).
class StockAiError implements Exception {
  StockAiError(this.message, {this.code = ''});
  final String message;
  final String code;
  @override
  String toString() => message;
}

Future<Map<String, dynamic>> recognizePhoto({required String token, required List<int> bytes, required String mode, required String lang, String mediaType = 'image/jpeg'}) async {
  final r = await http
      .post(
        Uri.parse('${AppConfig.apiUrl}/stock-ai/recognize'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: jsonEncode({'mode': mode, 'lang': lang, 'mediaType': mediaType, 'image': base64Encode(bytes)}),
      )
      .timeout(const Duration(seconds: 120));
  dynamic d;
  try {
    d = jsonDecode(utf8.decode(r.bodyBytes));
  } catch (_) {
    d = null;
  }
  if (r.statusCode >= 300 || d is! Map) {
    throw StockAiError(d is Map && d['message'] != null ? '${d['message']}' : 'Error ${r.statusCode}');
  }
  final res = d['result'];
  return res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
}

/// Name, brand, pack size and category of a shop barcode, or null.
Future<Map<String, dynamic>?> lookupBarcode({required String token, required String code, required String lang}) async {
  if (!RegExp(r'^\d{8,14}$').hasMatch(code)) return null;
  try {
    final r = await http.get(Uri.parse('${AppConfig.apiUrl}/stock-ai/barcode/$code?lang=$lang'), headers: {'Authorization': 'Bearer $token', 'Accept': 'application/json'}).timeout(const Duration(seconds: 12));
    if (r.statusCode >= 300) return null;
    final d = jsonDecode(utf8.decode(r.bodyBytes));
    return d is Map && d['found'] == true ? Map<String, dynamic>.from(d) : null;
  } catch (_) {
    return null;
  }
}

Future<Map<String, dynamic>> _post(String path, String token, Map<String, dynamic> body, {Duration timeout = const Duration(seconds: 60)}) async {
  final r = await http
      .post(Uri.parse('${AppConfig.apiUrl}$path'), headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json', 'Accept': 'application/json'}, body: jsonEncode(body))
      .timeout(timeout);
  dynamic d;
  try {
    d = jsonDecode(utf8.decode(r.bodyBytes));
  } catch (_) {
    d = null;
  }
  if (r.statusCode >= 300 || d is! Map) {
    throw StockAiError(d is Map && d['message'] != null ? '${d['message']}' : 'Error ${r.statusCode}', code: d is Map ? '${d['code'] ?? ''}' : '');
  }
  return Map<String, dynamic>.from(d);
}

/// Supplier bill (PDF or photo) -> {bill, lines, duplicate} for checking.
Future<Map<String, dynamic>> readBill({required String token, required List<int> bytes, required String mediaType, required String fileName, required String lang}) =>
    _post('/stock-ai/bill/read', token, {'file': base64Encode(bytes), 'mediaType': mediaType, 'fileName': fileName, 'lang': lang}, timeout: const Duration(minutes: 4));

/// Books the checked bill: new items, lots, quantities and history.
Future<Map<String, dynamic>> bookBill({required String token, required Map<String, dynamic> bill, required List<Map<String, dynamic>> lines, bool force = false}) =>
    _post('/stock-ai/bill/book', token, {...bill, 'lines': lines, 'force': force}, timeout: const Duration(minutes: 2));
