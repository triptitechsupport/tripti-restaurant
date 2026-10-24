import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

/// One line of the assistant chat.
class AssistantMessage {
  AssistantMessage(this.fromUser, this.text);
  final bool fromUser;
  final String text;
}

/// What the server answered: the text and, maybe, a screen to open.
class AssistantReply {
  AssistantReply(this.text, this.screen);
  final String text;
  final String? screen;
}

/// Asks the server's staff assistant (read-only; it never changes data).
Future<AssistantReply> askAssistant({required String token, required bool de, required List<AssistantMessage> history}) async {
  final r = await http
      .post(
        Uri.parse('${AppConfig.apiUrl}/assistant/chat'),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({
          'lang': de ? 'de' : 'en',
          'messages': [for (final m in history) {'role': m.fromUser ? 'user' : 'assistant', 'content': m.text}],
        }),
      )
      .timeout(const Duration(seconds: 90));
  Map d = {};
  try {
    d = jsonDecode(utf8.decode(r.bodyBytes)) as Map;
  } catch (_) {}
  if (r.statusCode >= 300) throw Exception(d['message'] ?? 'The assistant could not answer (${r.statusCode}).');
  final screen = '${d['screen'] ?? ''}';
  return AssistantReply('${d['reply'] ?? ''}', screen.isEmpty ? null : screen);
}

/// The phone's own speech input and read-aloud (Android only).
class Voice {
  static const _ch = MethodChannel('tripti/voice');
  static bool get available => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Opens the speech prompt and returns what was said, or null.
  static Future<String?> listen({required bool de}) async {
    if (!available) return null;
    return _ch.invokeMethod<String>('listen', {'lang': de ? 'de-AT' : 'en-GB'});
  }

  static Future<void> speak(String text, {required bool de}) async {
    if (!available || text.trim().isEmpty) return;
    try {
      await _ch.invokeMethod('speak', {'text': text, 'lang': de ? 'de-AT' : 'en-GB'});
    } catch (_) {}
  }

  static Future<void> stop() async {
    if (!available) return;
    try {
      await _ch.invokeMethod('stop');
    } catch (_) {}
  }
}
