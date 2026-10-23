import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_ringtone_player/flutter_ringtone_player.dart';

/// Plays the phone's notification sound and vibrates.
Future<void> alertBeep() async {
  HapticFeedback.heavyImpact();
  if (kIsWeb) return;
  try {
    await FlutterRingtonePlayer().playNotification(volume: 1.0, asAlarm: false);
  } catch (_) {
    SystemSound.play(SystemSoundType.alert);
  }
}
