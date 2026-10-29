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
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: color), const SizedBox(width: 4)],
          Text(
            text,
            style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 52, color: TriptiColors.ink.withValues(alpha: 0.3)),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54, fontSize: 15),
          ),
        ],
      ),
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

/// One number in a [SummaryRow].
class SummaryStat {
  const SummaryStat(this.icon, this.label, this.value, this.color, {this.onTap});
  final IconData icon;
  final String label, value;
  final Color color;
  final VoidCallback? onTap;
}

/// A row of small number cards that fills the screen width
/// (2 per row on phones, all in one row on wider screens).
class SummaryRow extends StatelessWidget {
  const SummaryRow(this.stats, {super.key});
  final List<SummaryStat> stats;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final cols = c.maxWidth >= 560 || stats.length <= 2 ? stats.length : (stats.length == 3 ? 3 : 2);
      final w = (c.maxWidth - 8 * (cols - 1)) / cols;
      final compact = w < 140;
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final s in stats)
            SizedBox(
              width: w,
              child: Material(
                color: TriptiColors.card,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: TriptiColors.border, width: 1.2),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: s.onTap,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
                    child: Row(
                      children: [
                        if (!compact) ...[
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(color: s.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                            child: Icon(s.icon, color: s.color, size: 20),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        s.value,
                                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: s.color),
                                      ),
                                    ),
                                  ),
                                  if (compact) Icon(s.icon, color: s.color.withValues(alpha: 0.7), size: 18),
                                ],
                              ),
                              Text(
                                s.label,
                                maxLines: compact ? 2 : 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 11.5, color: Colors.black54),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      );
    },
  );
}

/// A section title with an icon and an optional count bubble.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.icon, this.text, {super.key, this.count = 0, this.color = TriptiColors.primary});
  final IconData icon;
  final String text;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
    child: Row(
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            text,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: TriptiColors.ink),
          ),
        ),
        if (count > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
            child: Text(
              '$count',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ],
    ),
  );
}

/// A card with a coloured stripe on its left edge.
class AccentCard extends StatelessWidget {
  const AccentCard({super.key, required this.color, required this.child, this.onTap, this.padding = const EdgeInsets.fromLTRB(14, 12, 14, 12)});
  final Color color;
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: color),
            Expanded(
              child: Padding(padding: padding, child: child),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A short explanation at the top of a page, with an icon.
class PageIntro extends StatelessWidget {
  const PageIntro(this.icon, this.title, this.text, {super.key});
  final IconData icon;
  final String title, text;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 4),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [TriptiColors.primary.withValues(alpha: 0.09), TriptiColors.gold.withValues(alpha: 0.10)]),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: TriptiColors.border),
    ),
    child: Row(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: TriptiColors.primary, borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: TriptiColors.ink),
              ),
              const SizedBox(height: 2),
              Text(text, style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
            ],
          ),
        ),
      ],
    ),
  );
}
