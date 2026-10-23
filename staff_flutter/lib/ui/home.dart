import 'package:flutter/material.dart';

import '../core/scope.dart';
import '../core/session.dart';
import '../core/theme.dart';
import 'auditor/auditor_home.dart';
import 'kitchen/kitchen_home.dart';
import 'stock/stock_home.dart';
import 'waiter/waiter_home.dart';

/// Opens the screens of the signed-in role.
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    switch (session.role) {
      case StaffRole.waiter:
      case StaffRole.cashier:
        return const WaiterHome();
      case StaffRole.kitchen:
      case StaffRole.kitchenManager:
        return const KitchenHome();
      case StaffRole.stock:
        return const StockHome();
      case StaffRole.auditor:
        return const AuditorHome();
      default:
        return const ComingSoon();
    }
  }
}

String roleName(BuildContext context, StaffRole? r) {
  switch (r) {
    case StaffRole.admin:
      return 'Admin';
    case StaffRole.waiter:
      return tr(context, 'Waiter', 'Kellner');
    case StaffRole.cashier:
      return tr(context, 'Cashier', 'Kasse');
    case StaffRole.kitchen:
      return tr(context, 'Kitchen', 'Küche');
    case StaffRole.kitchenManager:
      return tr(context, 'Kitchen manager', 'Küchenleitung');
    case StaffRole.stock:
      return tr(context, 'Stock', 'Lager');
    case StaffRole.auditor:
      return tr(context, 'Auditor', 'Prüfer');
    default:
      return '';
  }
}

/// The "More" sheet: who is signed in, language and sign out.
Future<void> showMoreSheet(BuildContext context, {List<Widget> extra = const []}) {
  final session = AppScope.read(context);
  return showModalBottomSheet(
    context: context,
    showDragHandle: true,
    backgroundColor: TriptiColors.card,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text('${session.displayName} · ${roleName(context, session.role)}', style: const TextStyle(fontFamily: 'serif', fontSize: 18, fontWeight: FontWeight.w700, color: TriptiColors.ink)),
        ),
        ...extra,
        ListTile(
          leading: const Icon(Icons.translate),
          title: Text(session.de ? 'Language: English' : 'Sprache: Deutsch'),
          onTap: () {
            Navigator.pop(ctx);
            session.setLanguage(session.de ? 'en' : 'de');
          },
        ),
        ListTile(
          leading: const Icon(Icons.logout, color: TriptiColors.red),
          title: Text(tr(context, 'Sign out', 'Abmelden'), style: const TextStyle(color: TriptiColors.red, fontWeight: FontWeight.w700)),
          onTap: () {
            Navigator.pop(ctx);
            session.signOut();
          },
        ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}

class ComingSoon extends StatelessWidget {
  const ComingSoon({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(roleName(context, session.role)), actions: [
        IconButton(icon: const Icon(Icons.more_vert), onPressed: () => showMoreSheet(context)),
      ]),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.construction, size: 56, color: TriptiColors.primary),
            const SizedBox(height: 16),
            Text(
              tr(context, 'The ${roleName(context, session.role)} screens are being built in this app. Until then, please use the Tripti Staff app.',
                  'Die Bildschirme für ${roleName(context, session.role)} werden gerade gebaut. Bis dahin bitte die Tripti-Staff-App verwenden.'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16),
            ),
          ]),
        ),
      ),
    );
  }
}
