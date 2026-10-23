import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/billing.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'receipt_view.dart';

/// Today's payments with their RKSV receipts: reprint, or retry signing.
class ReceiptsPage extends StatefulWidget {
  const ReceiptsPage({super.key});

  @override
  State<ReceiptsPage> createState() => _ReceiptsPageState();
}

class _ReceiptsPageState extends State<ReceiptsPage> {
  List<Map<String, dynamic>> _settlements = [];
  List<FiscalReceipt> _receipts = [];
  String? _error;
  bool _loaded = false;
  bool _today = true;
  String? _busy;
  Timer? _timer;

  BillingApi get _api => BillingApi(AppScope.read(context).pb);

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([_api.settlements(), _api.transactions()]);
      if (!mounted) return;
      setState(() {
        _settlements = r[0] as List<Map<String, dynamic>>;
        _receipts = r[1] as List<FiscalReceipt>;
        _error = null;
        _loaded = true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    }
  }

  FiscalReceipt? _receiptFor(String settlementId) =>
      _receipts.where((t) => t.settlement == settlementId && t.receiptType == 'NORMAL' && t.status != 'superseded').firstOrNull;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    final rows = _settlements.where((x) => !_today || !(parseDate(x['created']) ?? now).isBefore(start)).toList();
    final missing = rows.where((x) => !(_receiptFor('${x['id']}')?.printable ?? false)).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        SegmentedButton<bool>(
          segments: [
            ButtonSegment(value: true, label: Text(tr(context, 'Today', 'Heute'))),
            ButtonSegment(value: false, label: Text(tr(context, 'All', 'Alle'))),
          ],
          selected: {_today},
          onSelectionChanged: (v) => setState(() => _today = v.first),
        ),
        const SizedBox(height: 10),
        if (_error != null)
          Card(color: const Color(0xFFFEF3C7), child: ListTile(leading: const Icon(Icons.warning_amber, color: TriptiColors.amber), title: Text(_error!))),
        if (_loaded && missing > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(tr(context, '$missing payment(s) without a signed receipt.', '$missing Zahlung(en) ohne signierten Beleg.'), style: const TextStyle(color: TriptiColors.amber, fontWeight: FontWeight.w700)),
          ),
        if (!_loaded && _error == null) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
        if (_loaded && rows.isEmpty) EmptyState(Icons.receipt_long, tr(context, 'No payments yet.', 'Noch keine Zahlungen.')),
        for (final x in rows) _tile(x),
      ]),
    );
  }

  Widget _tile(Map<String, dynamic> x) {
    final id = '${x['id']}';
    final r = _receiptFor(id);
    final status = r?.status ?? '';
    final (label, color) = switch (status) {
      'signed' => (tr(context, 'Signed', 'Signiert'), TriptiColors.green),
      'outage' => (tr(context, 'Outage', 'Ausfall'), TriptiColors.amber),
      'pending' || 'queued' => (tr(context, 'Signing…', 'Wird signiert…'), TriptiColors.amber),
      'failed' => (tr(context, 'Failed', 'Fehlgeschlagen'), TriptiColors.red),
      _ => (tr(context, 'No receipt', 'Kein Beleg'), Colors.grey),
    };
    return Card(
      child: ListTile(
        title: Text('${x['settlementNumber'] ?? x['orderId'] ?? ''} · ${tr(context, 'Table', 'Tisch')} ${x['tableNumber'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(children: [
            Text('${euro(toDouble(x['amount']))} · ${timeOf(parseDate(x['created']))}  '),
            StatusPill(label, color),
            if (r != null && r.data['paymentType'] != null) Text('  ${r.data['paymentType']}', style: const TextStyle(fontSize: 12)),
          ]),
        ),
        trailing: _busy == id
            ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
            : r != null && (r.printable || r.hasFallback)
                ? IconButton(
                    icon: const Icon(Icons.print, color: TriptiColors.primary),
                    tooltip: tr(context, 'Print', 'Drucken'),
                    onPressed: () => openReceipt(context, r.printable ? r : r.asFallback()),
                  )
                : r != null && (status == 'failed' || status == 'queued')
                    ? TextButton(
                        onPressed: () async {
                          setState(() => _busy = id);
                          await runAction(context, () => _api.retry(r.id), done: tr(context, 'Signing again…', 'Wird erneut signiert…'));
                          await _load();
                          if (mounted) setState(() => _busy = null);
                        },
                        child: Text(tr(context, 'Retry', 'Erneut')),
                      )
                    : null,
      ),
    );
  }
}
