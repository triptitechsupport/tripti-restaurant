import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/scope.dart';
import '../core/theme.dart';

/// One sign-in for every staff role. The server decides which screens open.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _id = TextEditingController();
  final _pw = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await AppScope.read(context).signIn(_id.text, _pw.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  Future<void> _server() async {
    final session = AppScope.read(context);
    final c = TextEditingController(text: AppConfig.server);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr(context, 'Server', 'Server')),
        content: TextField(controller: c, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: AppConfig.defaultServer)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, AppConfig.defaultServer), child: Text(tr(context, 'Default', 'Standard'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: Text(tr(context, 'Save', 'Speichern'))),
        ],
      ),
    );
    if (v != null) await session.setServer(v);
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return Scaffold(
      backgroundColor: TriptiColors.primary,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(onPressed: _server, icon: const Icon(Icons.dns_outlined, color: Colors.white70), tooltip: 'Server'),
                TextButton.icon(
                  onPressed: () => session.setLanguage(session.de ? 'en' : 'de'),
                  icon: const Icon(Icons.translate, color: Colors.white, size: 18),
                  label: Text(session.de ? 'DE' : 'EN', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                ),
              ]),
            ),
          ),
          ClipRRect(borderRadius: BorderRadius.circular(22), child: Image.asset('assets/app-icon.png', width: 84, height: 84)),
          const SizedBox(height: 14),
          const Text('Tripti Staff', style: TextStyle(fontFamily: 'serif', fontSize: 30, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 4),
          Text(tr(context, 'Staff sign-in', 'Mitarbeiter-Anmeldung'), style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 28),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(color: TriptiColors.background, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(24, 28, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(tr(context, 'Username or email', 'Benutzername oder E-Mail'), style: const TextStyle(fontWeight: FontWeight.w700, color: TriptiColors.ink)),
                    const SizedBox(height: 8),
                    TextField(
                      key: const Key('staff-id'),
                      controller: _id,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                    ),
                    const SizedBox(height: 18),
                    Text(tr(context, 'Password', 'Passwort'), style: const TextStyle(fontWeight: FontWeight.w700, color: TriptiColors.ink)),
                    const SizedBox(height: 8),
                    TextField(
                      key: const Key('staff-pw'),
                      controller: _pw,
                      obscureText: !_show,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        suffixIcon: IconButton(icon: Icon(_show ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _show = !_show)),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: const Color(0xFFFDE8E4), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF2B8AE))),
                        child: Row(children: [
                          const Icon(Icons.error_outline, color: TriptiColors.red),
                          const SizedBox(width: 10),
                          Expanded(child: Text(_error!, style: const TextStyle(color: TriptiColors.red, fontWeight: FontWeight.w600))),
                        ]),
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                      child: _busy
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                          : Text(tr(context, 'Sign in', 'Anmelden')),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      tr(context, 'Waiter, cashier, kitchen, kitchen manager, stock, auditor and admin all sign in here.',
                          'Kellner, Kasse, Küche, Küchenleitung, Lager, Prüfer und Admin melden sich hier an.'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.black54, fontSize: 13),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
