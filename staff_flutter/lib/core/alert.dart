import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const _sound = MethodChannel('tripti/sound');

/// Plays the phone's notification sound and vibrates (messages, ready dishes).
Future<void> alertBeep() async {
  HapticFeedback.heavyImpact();
  if (kIsWeb) return;
  try {
    await _sound.invokeMethod('notify');
  } catch (_) {
    SystemSound.play(SystemSoundType.alert);
  }
}

/// New order: three loud beeps (alarm volume) and a strong vibration.
Future<void> orderAlert() async {
  HapticFeedback.heavyImpact();
  if (kIsWeb) return;
  try {
    await _sound.invokeMethod('order');
  } catch (_) {
    SystemSound.play(SystemSoundType.alert);
  }
}
