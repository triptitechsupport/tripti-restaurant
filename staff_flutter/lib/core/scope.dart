import 'package:flutter/material.dart';

import 'session.dart';

/// Gives every screen the session (login, server, language).
class AppScope extends InheritedNotifier<Session> {
  const AppScope({super.key, required Session session, required super.child}) : super(notifier: session);

  static Session of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
  static Session read(BuildContext context) => context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}

/// English or German text, following the language switch.
String tr(BuildContext context, String en, String de) => AppScope.of(context).de ? de : en;

String euro(num v) => '€${v.toStringAsFixed(2)}';

void toast(BuildContext context, String text, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(text),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? const Color(0xFFB91C1C) : const Color(0xFF5F1B26),
    duration: Duration(seconds: error ? 6 : 3),
  ));
}
