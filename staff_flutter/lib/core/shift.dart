// Clock-in / clock-out (waiter_timesheets): port of timesheetService.js.
import 'package:pocketbase/pocketbase.dart';

class Shifts {
  Shifts(this.pb, this.waiterId);
  final PocketBase pb;
  final String waiterId;

  Future<Map<String, dynamic>?> active() async {
    if (waiterId.isEmpty) return null;
    try {
      final r = await pb.collection('waiter_timesheets').getFirstListItem('waiter = "$waiterId" && clockOut = null');
      return r.toJson();
    } catch (_) {
      return null;
    }
  }

  /// Closes the open shift, if there is one.
  Future<void> clockOut() async {
    final a = await active();
    if (a == null) return;
    final now = DateTime.now();
    final start = DateTime.tryParse('${a['clockIn'] ?? ''}'.replaceFirst(' ', 'T')) ?? now;
    final mins = now.difference(start).inSeconds / 60;
    await pb.collection('waiter_timesheets').update(a['id'], body: {
      'clockOut': now.toUtc().toIso8601String(),
      'shiftDuration': mins < 0 ? 0 : mins.round(),
    });
  }

  /// Closes a forgotten shift first, then starts a new one.
  Future<Map<String, dynamic>> clockIn() async {
    await clockOut();
    final r = await pb.collection('waiter_timesheets').create(body: {
      'waiter': waiterId,
      'clockIn': DateTime.now().toUtc().toIso8601String(),
    });
    return r.toJson();
  }
}

String formatShift(int minutes) {
  final m = minutes < 0 ? 0 : minutes;
  return m >= 60 ? '${m ~/ 60}h ${m % 60}m' : '${m}m';
}
