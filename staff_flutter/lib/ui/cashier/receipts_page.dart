import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/billing.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';
import 'receipt_view.dart';

/// Today's payments with their RKSV receipts: reprint, or retry signing.
/// With [readOnly] (auditor) nothing can be retried, only viewed and printed.
class ReceiptsPage extends StatefulWidget {
  const ReceiptsPage({super.key, this.readOnly = false});
  final bool readOnly;

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

  FiscalReceipt? _receiptFor(String settlementId) => _receipts.where((t) => t.settlement == settlementId && t.receiptType == 'NORMAL' && t.status != 'superseded').firstOrNull;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    final rows = _settlements.where((x) => !_today || !(parseDate(x['created']) ?? now).isBefore(start)).toList();
    final missing = rows.where((x) => !(_receiptFor('${x['id']}')?.printable ?? false)).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: [
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
            Card(
              color: const Color(0xFFFEF3C7),
              child: ListTile(
                leading: const Icon(Icons.warning_amber, color: TriptiColors.amber),
                title: Text(_error!),
              ),
            ),
          if (_loaded && missing > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: TriptiColors.amber.withValues(alpha: 0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: TriptiColors.amber),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        tr(context, '$missing payment(s) without a signed receipt.', '$missing Zahlung(en) ohne signierten Beleg.'),
                        style: const TextStyle(color: TriptiColors.amber, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_loaded && rows.isNotEmpty) _totals(rows),
          if (!_loaded && _error == null)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_loaded && rows.isEmpty) EmptyState(Icons.receipt_long, tr(context, 'No payments yet.', 'Noch keine Zahlungen.')),
          for (final x in rows) _tile(x),
        ],
      ),
    );
  }

  String _when(DateTime? d) {
    if (d == null) return '';
    final l = d.toLocal(), n = DateTime.now();
    return l.year == n.year && l.month == n.month && l.day == n.day ? timeOf(l) : '${l.day}.${l.month}. ${timeOf(l)}';
  }

  Widget _totals(List<Map<String, dynamic>> rows) {
    var cash = 0.0, card = 0.0, total = 0.0;
    for (final x in rows) {
      final a = toDouble(x['amount']);
      total += a;
      final pt = '${_receiptFor('${x['id']}')?.data['paymentType'] ?? ''}'.toUpperCase();
      if (pt == 'CASH') cash += a;
      if (pt.isNotEmpty && pt != 'CASH') card += a;
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SummaryRow([
        SummaryStat(Icons.receipt_long, tr(context, 'Payments', 'Zahlungen'), '${rows.length}', TriptiColors.ink),
        SummaryStat(Icons.payments_outlined, tr(context, 'Cash', 'Bar'), euro(cash), TriptiColors.green),
        SummaryStat(Icons.credit_card, tr(context, 'Card', 'Karte'), euro(card), TriptiColors.blue),
        SummaryStat(Icons.euro, tr(context, 'Total', 'Gesamt'), euro(total), TriptiColors.primary),
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
    final pt = '${r?.data['paymentType'] ?? ''}'.toUpperCase();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AccentCard(
        color: color,
        padding: EdgeInsets.zero,
        child: ListTile(
          contentPadding: const EdgeInsets.fromLTRB(12, 2, 8, 2),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  '${tr(context, 'Table', 'Tisch')} ${x['tableNumber'] ?? ''}',
                  style: const TextStyle(fontWeight: FontWeight.w800, color: TriptiColors.ink),
                ),
              ),
              Text(
                euro(toDouble(x['amount'])),
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: TriptiColors.primary),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('${x['settlementNumber'] ?? x['orderId'] ?? ''} · ${_when(parseDate(x['created']))}', style: const TextStyle(fontSize: 12.5)),
                StatusPill(label, color),
                if (pt.isNotEmpty)
                  StatusPill(
                    pt == 'CASH' ? tr(context, 'Cash', 'Bar') : tr(context, 'Card', 'Karte'),
                    pt == 'CASH' ? TriptiColors.green : TriptiColors.blue,
                    icon: pt == 'CASH' ? Icons.payments_outlined : Icons.credit_card,
                  ),
              ],
            ),
          ),
          trailing: _busy == id
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              : r != null && (r.printable || r.hasFallback)
              ? IconButton(
                  icon: const Icon(Icons.print, color: TriptiColors.primary),
                  tooltip: tr(context, 'Print', 'Drucken'),
                  onPressed: () => openReceipt(context, r.printable ? r : r.asFallback()),
                )
              : !widget.readOnly && r != null && (status == 'failed' || status == 'queued')
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
      ),
    );
  }
}
