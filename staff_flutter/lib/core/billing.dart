import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';

import 'config.dart';
import 'store.dart';

/// A fiscal (RKSV) receipt as the billing server stores it.
class FiscalReceipt {
  FiscalReceipt(this.data, {this.fallback = false});
  final Map<String, dynamic> data;
  final bool fallback;
  String get id => data['id'] ?? '';
  String get status => data['status'] ?? '';
  String get settlement => data['settlement'] ?? '';
  String get order => data['order'] ?? '';
  String get receiptType => data['receiptType'] ?? 'NORMAL';
  String get qrCodeData => data['qrCodeData'] ?? '';
  bool get printable => ['signed', 'outage'].contains(status) && qrCodeData.isNotEmpty;
  bool get hasFallback => data['fallbackReceipt'] is Map && '${data['fallbackReceipt']['qrCodeData'] ?? ''}'.isNotEmpty;

  /// The copy to print: the signed receipt, or the outage copy while the
  /// signing service is down (same rule as the website's fiscalPrintModel).
  Map<String, dynamic>? printModel() {
    if (!fallback) return printable ? data : null;
    final c = data['fallbackReceipt'];
    if (c is! Map || c['receiptSnapshot'] == null) return null;
    return {
      'isFallback': true,
      'status': 'fallback',
      'receiptType': c['receiptType'],
      'orderId': c['orderId'],
      'amount': c['amount'],
      'paymentType': c['paymentType'],
      'signedAt': c['issuedAt'],
      'localReference': c['reference'],
      'receiptSnapshot': c['receiptSnapshot'],
      'qrCodeData': c['qrCodeData'],
      'responsePayload': {
        '_env': c['environment'],
        'hints': [if (c['notice'] != null) c['notice']],
      },
    };
  }

  FiscalReceipt asFallback() => FiscalReceipt(data, fallback: true);
}

class BillingApi {
  BillingApi(this.pb);
  final PocketBase pb;

  Future<Map<String, dynamic>> call(String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('${AppConfig.apiUrl}/billing$path');
    final headers = {'Authorization': 'Bearer ${pb.authStore.token}', 'Content-Type': 'application/json'};
    http.Response r;
    try {
      r = body == null ? await http.get(uri, headers: headers) : await http.post(uri, headers: headers, body: jsonEncode(body));
    } catch (_) {
      throw Exception('The billing server is not reachable. Try again in a moment.');
    }
    Map<String, dynamic> data = {};
    try {
      final d = jsonDecode(r.body);
      if (d is Map) data = Map<String, dynamic>.from(d);
    } catch (_) {
      if (r.statusCode < 300) throw Exception('The billing server sent an unreadable answer.');
    }
    if (r.statusCode >= 502 && data['message'] == null) throw Exception('The billing server is not reachable. Try again in a moment.');
    if (r.statusCode >= 300) throw Exception(data['message'] ?? data['error'] ?? 'Billing request failed (${r.statusCode}).');
    return data;
  }

  /// Books a payment for the chosen ticket lines (whole lines only) and
  /// returns the payment settlement record.
  Future<Map<String, dynamic>> settle(Order order, List<Ticket> tickets, Set<String> lineKeys, String requestKey) async {
    final selections = <Map<String, dynamic>>[];
    for (final t in tickets) {
      if (t.status == 'cancelled') continue;
      final items = t.items;
      final lines = <Map<String, dynamic>>[];
      for (var i = 0; i < items.length; i++) {
        if (lineKeys.contains('${t.id}:$i')) lines.add({'index': i, 'expected': items[i]});
      }
      if (lines.isNotEmpty) selections.add({'kot': t.id, 'lines': lines});
    }
    final r = await pb.send('/api/payment-settlements/confirm', method: 'POST', body: {'order': order.id, 'selections': selections, 'requestKey': requestKey});
    return r is Map ? Map<String, dynamic>.from(r) : {};
  }

  /// Issues the RKSV receipt for a payment and waits up to 20 s for it to be
  /// signed. Returns what can be printed, or throws with the reason.
  Future<FiscalReceipt> issueReceipt(String settlementId, String paymentType) async {
    final d = await call('/settlements/$settlementId/generate', {'paymentType': paymentType});
    var t = FiscalReceipt(Map<String, dynamic>.from(d['transaction'] ?? {}));
    for (var i = 0; i < 20 && !t.printable && !t.hasFallback && t.status != 'failed'; i++) {
      await Future.delayed(const Duration(seconds: 1));
      final r = await call('/transactions/${t.id}');
      t = FiscalReceipt(Map<String, dynamic>.from(r['transaction'] ?? {}));
    }
    if (t.printable) return t;
    if (t.hasFallback) return t.asFallback();
    throw Exception('Payment saved, but the RKSV receipt is not signed yet (${t.data['errorMessage'] ?? t.status}). Open Receipts to retry.');
  }

  Future<List<Map<String, dynamic>>> settlements() async =>
      ((await call('/settlements'))['settlements'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  Future<List<FiscalReceipt>> transactions() async =>
      ((await call('/transactions'))['transactions'] as List? ?? []).whereType<Map>().map((e) => FiscalReceipt(Map<String, dynamic>.from(e))).toList();

  Future<FiscalReceipt> retry(String id) async => FiscalReceipt(Map<String, dynamic>.from((await call('/transactions/$id/retry', {}))['transaction'] ?? {}));
}

String newRequestKey() {
  final r = Random.secure();
  final b = List.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}
