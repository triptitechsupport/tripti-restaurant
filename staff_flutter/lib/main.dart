import 'package:flutter/material.dart';

import 'core/scope.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'ui/home.dart';
import 'ui/login_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session();
  runApp(AppScope(session: session, child: const TriptiStaffApp()));
  await session.init();
}

class TriptiStaffApp extends StatelessWidget {
  const TriptiStaffApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return MaterialApp(
      title: 'Tripti Staff',
      debugShowCheckedModeBanner: false,
      theme: triptiTheme(),
      home: !session.ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : session.signedIn
              ? HomePage(key: ValueKey('${session.collection}-${session.user?.id}'))
              : const LoginPage(),
    );
  }
}
