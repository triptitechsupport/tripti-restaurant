import 'package:flutter/foundation.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';

/// The staff roles. Each one opens its own screens after sign-in.
enum StaffRole { admin, waiter, cashier, kitchen, kitchenManager, stock, auditor }

/// Where each role's accounts live on the server, in the order sign-in
/// tries them (the same lists the website's /staff-login uses).
const loginCollections = ['waiter_users', 'kds_users', 'stock_users', 'auditor_users', 'admin_users'];

StaffRole roleFor(String collection, RecordModel record) {
  final role = record.getStringValue('role');
  switch (collection) {
    case 'admin_users':
      return StaffRole.admin;
    case 'waiter_users':
      return role == 'cashier' ? StaffRole.cashier : StaffRole.waiter;
    case 'kds_users':
      return role == 'kitchen_manager' ? StaffRole.kitchenManager : StaffRole.kitchen;
    case 'stock_users':
      return StaffRole.stock;
    default:
      return StaffRole.auditor;
  }
}

/// The signed-in staff member, the server connection and the language.
class Session extends ChangeNotifier {
  late SharedPreferences prefs;
  PocketBase pb = PocketBase(AppConfig.pocketBaseUrl);
  String language = 'en';
  String? collection;
  StaffRole? role;
  bool ready = false;

  RecordModel? get user => pb.authStore.record;
  bool get signedIn => pb.authStore.isValid && role != null;
  String get displayName {
    final u = user;
    if (u == null) return '';
    final name = u.getStringValue('displayName');
    if (name.isNotEmpty) return name;
    final username = u.getStringValue('username');
    return username.isNotEmpty ? username : u.getStringValue('email');
  }

  bool get de => language == 'de';

  Future<void> init() async {
    prefs = await SharedPreferences.getInstance();
    await AppConfig.load(prefs);
    language = prefs.getString('language') ?? 'en';
    collection = prefs.getString('auth_collection');
    pb = _client(prefs.getString('auth'));
    if (pb.authStore.isValid && collection != null && user != null) {
      role = roleFor(collection!, user!);
      try {
        await pb.collection(collection!).authRefresh();
        role = roleFor(collection!, user!);
      } on ClientException catch (e) {
        // Offline: keep the saved login. A refused login signs out.
        if (e.statusCode == 401 || e.statusCode == 403 || e.statusCode == 404) {
          await signOut(notify: false);
        }
      }
    }
    ready = true;
    notifyListeners();
  }

  PocketBase _client(String? initial) {
    final store = AsyncAuthStore(
      save: (data) async => prefs.setString('auth', data),
      initial: initial,
      clear: () async => prefs.remove('auth'),
    );
    return PocketBase(AppConfig.pocketBaseUrl, authStore: store);
  }

  Future<void> setServer(String url) async {
    await AppConfig.save(prefs, url);
    await signOut(notify: false);
    pb = _client(null);
    notifyListeners();
  }

  Future<void> setLanguage(String lang) async {
    language = lang;
    await prefs.setString('language', lang);
    notifyListeners();
  }

  /// Signs in with a username (or e-mail) and password. Tries the list this
  /// login worked with last time first. Returns an error text, or null.
  Future<String?> signIn(String id, String password) async {
    final key = id.trim().toLowerCase();
    if (key.isEmpty || password.isEmpty) return de ? 'Benutzername und Passwort eingeben.' : 'Enter your username and password.';
    final last = prefs.getString('last_collection_$key');
    final order = [...loginCollections];
    if (key.contains('@')) {
      order.remove('admin_users');
      order.insert(0, 'admin_users');
    }
    if (last != null && order.remove(last)) order.insert(0, last);
    Object? lastError;
    for (final c in order) {
      try {
        await pb.collection(c).authWithPassword(id.trim(), password);
        collection = c;
        role = roleFor(c, user!);
        await prefs.setString('auth_collection', c);
        await prefs.setString('last_collection_$key', c);
        notifyListeners();
        return null;
      } on ClientException catch (e) {
        lastError = e;
        if (e.statusCode == 429) {
          return de ? 'Zu viele Versuche. Bitte ein paar Minuten warten.' : 'Too many attempts. Please wait a few minutes.';
        }
        if (e.statusCode == 0) {
          return de ? 'Server nicht erreichbar. Internet prüfen.' : 'Cannot reach the server. Check the internet connection.';
        }
      }
    }
    debugPrint('sign-in failed: $lastError');
    return de ? 'Benutzername oder Passwort falsch.' : 'Wrong username or password.';
  }

  Future<void> signOut({bool notify = true}) async {
    pb.realtime.unsubscribe();
    pb.authStore.clear();
    collection = null;
    role = null;
    await prefs.remove('auth_collection');
    if (notify) notifyListeners();
  }
}

/// A readable message from a server error.
String errorText(Object e) {
  if (e is ClientException) {
    final msg = e.response['message'];
    if (msg is String && msg.isNotEmpty) {
      final data = e.response['data'];
      if (data is Map && data.isNotEmpty) {
        final first = data.values.first;
        if (first is Map && first['message'] is String) return '$msg ${first['message']}';
      }
      return msg;
    }
    if (e.statusCode == 0) return 'No connection to the server.';
    return 'Server error ${e.statusCode}.';
  }
  return e.toString();
}
