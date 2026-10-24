import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const _sound = MethodChannel('tripti/sound');

/// Plays the phone's notification sound and vibrates.
Future<void> alertBeep() async {
  HapticFeedback.heavyImpact();
  if (kIsWeb) return;
  try {
    await _sound.invokeMethod('notify');
  } catch (_) {
    SystemSound.play(SystemSoundType.alert);
  }
}
