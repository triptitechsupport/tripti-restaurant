import 'package:flutter/material.dart';

import 'package:pocketbase/pocketbase.dart';

import '../../core/scope.dart';
import '../../core/session.dart';
import '../../core/store.dart';
import '../../core/theme.dart';

class StatusPill extends StatelessWidget {
  const StatusPill(this.text, this.color, {super.key, this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99), border: Border.all(color: color.withValues(alpha: 0.35))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: color), const SizedBox(width: 4)],
        Text(text, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// Ticket status label and colour.
(String, Color) ticketStatus(BuildContext context, String s) {
  switch (s) {
    case 'preparing':
      return (tr(context, 'Cooking', 'In Zubereitung'), TriptiColors.amber);
    case 'ready':
      return (tr(context, 'Ready', 'Fertig'), TriptiColors.green);
    case 'completed':
      return (tr(context, 'Served', 'Serviert'), TriptiColors.blue);
    case 'cancelled':
      return (tr(context, 'Cancelled', 'Storniert'), Colors.grey);
    default:
      return (tr(context, 'Waiting', 'Wartet'), TriptiColors.red);
  }
}

String ticketLabel(Ticket t, Order? o) {
  final base = o?.orderId ?? '';
  if (base.isEmpty) return t.suffix.isEmpty ? '#${t.id.substring(0, 5)}' : t.suffix;
  return t.suffix.isEmpty ? base : '${base}_${t.suffix}';
}

String timeOf(DateTime? d) {
  if (d == null) return '';
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.hour)}:${two(d.minute)}';
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.icon, this.text, {super.key});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 52, color: TriptiColors.ink.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54, fontSize: 15)),
          ]),
        ),
      );
}

/// Runs a server action with a spinner-free busy flag and shows the result.
Future<bool> runAction(BuildContext context, Future<void> Function() action, {String? done}) async {
  try {
    await action();
    if (done != null && context.mounted) toast(context, done);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, errorMessage(e), error: true);
    return false;
  }
}

String errorMessage(Object e) {
  if (e is ClientException) return errorText(e);
  final s = e.toString();
  return s.startsWith('Exception: ') ? s.substring(11) : s;
}
