import 'dart:convert';

import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/billing.dart';
import '../../core/scope.dart';
import '../cashier/receipts_page.dart';
import '../common/widgets.dart';
import '../home.dart';

/// Auditor: payments and signed receipts, view only, plus the DEP7 export.
class AuditorHome extends StatefulWidget {
  const AuditorHome({super.key});

  @override
  State<AuditorHome> createState() => _AuditorHomeState();
}

class _AuditorHomeState extends State<AuditorHome> {
  bool _busy = false;

  Future<void> _dep7() async {
    final api = BillingApi(AppScope.read(context).pb);
    setState(() => _busy = true);
    try {
      final config = await api.call('/configuration');
      final registers = ((config['registers'] as List?) ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      if (!mounted) return;
      if (config['enabled'] != true || registers.isEmpty) {
        toast(context, tr(context, 'RKSV is not set up yet, so there is nothing to export.', 'RKSV ist noch nicht eingerichtet, es gibt nichts zu exportieren.'), error: true);
        return;
      }
      var reg = registers.firstWhere((r) => r['isDefault'] == true, orElse: () => registers.first);
      if (registers.length > 1) {
        final picked = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (ctx) => SimpleDialog(
            title: Text(tr(context, 'Which register?', 'Welche Kasse?')),
            children: [for (final r in registers) SimpleDialogOption(onPressed: () => Navigator.pop(ctx, r), child: Text('${r['name'] ?? r['id']}'))],
          ),
        );
        if (picked == null) return;
        reg = picked;
      }
      final data = await api.call('/dep7?cashRegisterId=${Uri.encodeComponent('${reg['id']}')}');
      final day = DateTime.now().toIso8601String().substring(0, 10);
      final name = 'dep7-${reg['fiskalyCashRegisterId'] ?? reg['id']}-$day.json';
      final bytes = Uint8List.fromList(utf8.encode(const JsonEncoder.withIndent('  ').convert(data)));
      await SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, mimeType: 'application/json', name: name)], fileNameOverrides: [name], subject: name));
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr(context, 'Auditor', 'Prüfer')),
          Text('${session.displayName} · ${tr(context, 'view only', 'nur Ansicht')}', style: const TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w400)),
        ]),
        actions: [
          _busy
              ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
              : IconButton(icon: const Icon(Icons.download), tooltip: tr(context, 'DEP7 export', 'DEP7-Export'), onPressed: _dep7),
          IconButton(icon: const Icon(Icons.more_vert), onPressed: () => showMoreSheet(context)),
        ],
      ),
      body: const ReceiptsPage(readOnly: true),
    );
  }
}
