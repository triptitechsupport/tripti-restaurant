import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/assistant.dart';
import '../../core/scope.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import 'widgets.dart';

/// Sparkle button for the top bar. Opens the assistant; when the assistant
/// says which screen to open, [onScreen] gets its key (see the server's
/// assistantGuide.js SCREENS).
class AssistantButton extends StatelessWidget {
  const AssistantButton({super.key, required this.onScreen});
  final void Function(String screen) onScreen;

  @override
  Widget build(BuildContext context) => IconButton(
        icon: const Icon(Icons.auto_awesome),
        tooltip: tr(context, 'Assistant', 'Assistent'),
        onPressed: () async {
          final screen = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const AssistantPage()));
          if (screen != null) onScreen(screen);
        },
      );
}

List<String> _suggestions(BuildContext context, StaffRole? role) => [
      ..._roleSuggestions(context, role),
      tr(context, 'I want to report a problem or an idea', 'Ich möchte ein Problem oder eine Idee melden'),
    ];

List<String> _roleSuggestions(BuildContext context, StaffRole? role) {
  switch (role) {
    case StaffRole.waiter:
      return [
        tr(context, 'Which of my tickets are ready?', 'Welche meiner Tickets sind fertig?'),
        tr(context, 'How do I combine two tables?', 'Wie kombiniere ich zwei Tische?'),
        tr(context, 'How do I ask for the bill?', 'Wie fordere ich die Rechnung an?'),
        tr(context, 'Is anything sold out?', 'Ist etwas ausverkauft?'),
      ];
    case StaffRole.cashier:
      return [
        tr(context, 'Which tables still have to pay?', 'Welche Tische müssen noch zahlen?'),
        tr(context, 'How much did we take today?', 'Wie viel haben wir heute eingenommen?'),
        tr(context, 'How do I split a bill?', 'Wie teile ich eine Rechnung?'),
        tr(context, 'Why can\'t I take payment?', 'Warum kann ich nicht kassieren?'),
      ];
    case StaffRole.kitchen:
      return [
        tr(context, 'What is waiting longest?', 'Was wartet am längsten?'),
        tr(context, 'Which pickups are today?', 'Welche Abholungen gibt es heute?'),
        tr(context, 'How do I mark one dish ready?', 'Wie markiere ich ein Gericht als fertig?'),
      ];
    case StaffRole.kitchenManager:
      return [
        tr(context, 'Which stock items are low?', 'Welche Lagerartikel sind knapp?'),
        tr(context, 'What is waiting longest?', 'Was wartet am längsten?'),
        tr(context, 'How do I mark a dish sold out?', 'Wie markiere ich ein Gericht als ausverkauft?'),
        tr(context, 'How do I plan next week\'s stock?', 'Wie plane ich das Lager für nächste Woche?'),
      ];
    case StaffRole.stock:
      return [
        tr(context, 'Which items are low or out?', 'Welche Artikel sind knapp oder leer?'),
        tr(context, 'What did the kitchen request?', 'Was hat die Küche angefordert?'),
        tr(context, 'How do I book a delivery?', 'Wie buche ich eine Lieferung ein?'),
        tr(context, 'What expires soon?', 'Was läuft bald ab?'),
      ];
    case StaffRole.auditor:
      return [
        tr(context, 'How much was paid today?', 'Wie viel wurde heute bezahlt?'),
        tr(context, 'How do I export DEP7?', 'Wie exportiere ich DEP7?'),
      ];
    default:
      return [tr(context, 'What can you help with?', 'Wobei kannst du helfen?')];
  }
}

/// The assistant chat: type or speak a question, the answer is shown and
/// (if "read aloud" is on) spoken.
class AssistantPage extends StatefulWidget {
  const AssistantPage({super.key});

  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final List<AssistantMessage> _messages = [];
  bool _busy = false;
  bool _speak = true;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (mounted) setState(() => _speak = p.getBool('assistant_speak') ?? true);
    });
  }

  @override
  void dispose() {
    Voice.stop();
    super.dispose();
  }

  Future<void> _toggleSpeak() async {
    setState(() => _speak = !_speak);
    if (!_speak) Voice.stop();
    (await SharedPreferences.getInstance()).setBool('assistant_speak', _speak);
  }

  void _down() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  Future<void> _ask(String q) async {
    final question = q.trim();
    if (question.isEmpty || _busy) return;
    final session = AppScope.read(context);
    final de = session.de;
    Voice.stop();
    setState(() {
      _messages.add(AssistantMessage(true, question));
      _busy = true;
      _text.clear();
    });
    _down();
    try {
      final reply = await askAssistant(token: session.pb.authStore.token, de: de, history: _messages);
      if (!mounted) return;
      setState(() => _messages.add(AssistantMessage(false, reply.text)));
      _down();
      if (_speak) Voice.speak(reply.text, de: de);
      if (reply.screen != null) {
        await Future.delayed(const Duration(milliseconds: 1400));
        if (mounted) Navigator.of(context).pop(reply.screen);
      }
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _listen() async {
    final de = AppScope.read(context).de;
    HapticFeedback.selectionClick();
    try {
      final said = await Voice.listen(de: de);
      if (said != null && said.trim().isNotEmpty) await _ask(said);
    } on PlatformException catch (e) {
      if (mounted) toast(context, e.message ?? tr(context, 'Voice input is not available.', 'Spracheingabe ist nicht verfügbar.'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    final tips = _suggestions(context, session.role);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Assistant', 'Assistent')),
        actions: [
          if (Voice.available)
            IconButton(
              icon: Icon(_speak ? Icons.volume_up : Icons.volume_off),
              tooltip: _speak ? tr(context, 'Read answers aloud: on', 'Antworten vorlesen: an') : tr(context, 'Read answers aloud: off', 'Antworten vorlesen: aus'),
              onPressed: _toggleSpeak,
            ),
          if (_messages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: tr(context, 'New conversation', 'Neues Gespräch'),
              onPressed: _busy
                  ? null
                  : () {
                      Voice.stop();
                      setState(() => _messages.clear());
                    },
            ),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: ListView(controller: _scroll, padding: const EdgeInsets.fromLTRB(12, 12, 12, 12), children: [
            if (_messages.isEmpty) ...[
              PageIntro(
                Icons.auto_awesome,
                tr(context, 'Ask me anything about the app', 'Frag mich alles zur App'),
                tr(context, 'Which button to press, how something works, or what is happening right now (tables, tickets, stock). Tell me about problems or ideas and I pass them on to the admin. Tap the microphone to speak. I never change orders, payments or stock.',
                    'Welcher Knopf, wie etwas geht, oder was gerade los ist (Tische, Tickets, Lager). Erzähl mir von Problemen oder Ideen, ich gebe sie an den Admin weiter. Tippe aufs Mikrofon zum Sprechen. Ich ändere nie Bestellungen, Zahlungen oder Lager.'),
              ),
              const SizedBox(height: 12),
              Text(tr(context, 'Try:', 'Zum Beispiel:'), style: const TextStyle(fontWeight: FontWeight.w700, color: TriptiColors.ink)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final t in tips) ActionChip(label: Text(t), avatar: const Icon(Icons.chat_bubble_outline, size: 16, color: TriptiColors.primary), onPressed: () => _ask(t)),
              ]),
            ],
            for (final m in _messages) _bubble(m),
            if (_busy)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(children: [
                  const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 10),
                  Text(tr(context, 'Thinking…', 'Einen Moment…'), style: const TextStyle(color: Colors.black54)),
                ]),
              ),
          ]),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
            decoration: const BoxDecoration(color: TriptiColors.card, border: Border(top: BorderSide(color: TriptiColors.border))),
            child: Row(children: [
              if (Voice.available) ...[
                SizedBox(
                  width: 52,
                  height: 52,
                  child: FilledButton(
                    style: FilledButton.styleFrom(padding: EdgeInsets.zero, shape: const CircleBorder(), minimumSize: const Size(52, 52)),
                    onPressed: _busy ? null : _listen,
                    child: const Icon(Icons.mic, size: 26),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: TextField(
                  controller: _text,
                  enabled: !_busy,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: _ask,
                  decoration: InputDecoration(hintText: tr(context, 'Type a question…', 'Frage eingeben…'), isDense: true),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: TriptiColors.primary),
                tooltip: tr(context, 'Send', 'Senden'),
                onPressed: _busy ? null : () => _ask(_text.text),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _bubble(AssistantMessage m) => Align(
        alignment: m.fromUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 520),
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
          decoration: BoxDecoration(
            color: m.fromUser ? TriptiColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: m.fromUser ? null : Border.all(color: TriptiColors.border),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (!m.fromUser) ...[const Icon(Icons.auto_awesome, size: 16, color: TriptiColors.gold), const SizedBox(width: 6)],
            Flexible(child: SelectableText(m.text, style: TextStyle(color: m.fromUser ? Colors.white : TriptiColors.ink, fontSize: 15, height: 1.3))),
            if (!m.fromUser && Voice.available)
              InkWell(
                onTap: () => Voice.speak(m.text, de: AppScope.read(context).de),
                child: const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.volume_up_outlined, size: 18, color: Colors.black45)),
              ),
          ]),
        ),
      );
}
