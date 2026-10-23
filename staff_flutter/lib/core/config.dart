import 'package:shared_preferences/shared_preferences.dart';

/// Where the app finds the restaurant server. The test site is the default;
/// it can be changed on the sign-in screen (Server settings).
class AppConfig {
  static const defaultServer = String.fromEnvironment('TRIPTI_SERVER', defaultValue: 'https://tripti-rksv-test.onrender.com');
  static String server = defaultServer;

  static String get pocketBaseUrl => '$server/hcgi/platform';
  static String get apiUrl => '$server/hcgi/api';

  static Future<void> load(SharedPreferences prefs) async {
    final saved = prefs.getString('server');
    if (saved != null && saved.startsWith('http')) server = saved;
  }

  static Future<void> save(SharedPreferences prefs, String value) async {
    var v = value.trim();
    while (v.endsWith('/')) {
      v = v.substring(0, v.length - 1);
    }
    server = v.isEmpty ? defaultServer : v;
    await prefs.setString('server', server);
  }
}
