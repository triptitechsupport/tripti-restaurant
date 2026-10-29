// Recipes and weekly stock planning: port of the website's
// lib/kitchenPlanning.js (same rules, same rounding).
import 'dart:math' as math;

import 'store.dart';

const _unitGroups = <String, (String, double)>{
  'g': ('mass', 1), 'gr': ('mass', 1), 'gram': ('mass', 1), 'kg': ('mass', 1000),
  'ml': ('volume', 1), 'cl': ('volume', 10), 'dl': ('volume', 100), 'l': ('volume', 1000), 'lt': ('volume', 1000), 'ltr': ('volume', 1000),
  'pc': ('count', 1), 'pcs': ('count', 1), 'stk': ('count', 1), 'stück': ('count', 1), 'st': ('count', 1), 'piece': ('count', 1), 'pieces': ('count', 1),
};

const recipeUnits = ['g', 'kg', 'ml', 'l', 'pcs'];

String _norm(String? u) {
  var s = (u ?? '').trim().toLowerCase();
  if (s.endsWith('.')) s = s.substring(0, s.length - 1);
  return s;
}

/// Converts between units of the same kind (g/kg, ml/l, pcs). Null when the
/// kinds differ. Same or empty units pass through.
double? convertQty(num qty, String? from, String? to) {
  final a = _norm(from), b = _norm(to);
  if (a.isEmpty || b.isEmpty || a == b) return qty.toDouble();
  final ga = _unitGroups[a], gb = _unitGroups[b];
  if (ga == null || gb == null || ga.$1 != gb.$1) return null;
  return qty * ga.$2 / gb.$2;
}

double round(num n, [int d = 2]) {
  final f = math.pow(10, d);
  return (n * f).round() / f;
}

String fmtNum(num n) {
  final r = round(n, 3);
  return r == r.roundToDouble() ? r.toInt().toString() : r.toString();
}

/// The stock item of a recipe line: the linked one, or one with the same name.
Map<String, dynamic>? stockFor(Map<String, dynamic> ing, Map<String, Map<String, dynamic>> stockById) {
  final linked = stockById['${ing['stockItem'] ?? ''}'];
  if (linked != null) return linked;
  final name = '${ing['name'] ?? ''}'.trim().toLowerCase();
  if (name.isEmpty) return null;
  for (final s in stockById.values) {
    if ('${s['name'] ?? ''}'.trim().toLowerCase() == name) return s;
  }
  return null;
}

double? priceForFoodCost(double cost, [double pct = 30]) => cost > 0 && pct > 0 ? (cost / (pct / 100) * 10).ceil() / 10 : null;

num scaledQty(dynamic qty, dynamic yieldPortions, dynamic portions) {
  final y = toDouble(yieldPortions) > 0 ? toDouble(yieldPortions) : 1.0;
  final p = toDouble(portions) > 0 ? toDouble(portions) : y;
  final n = toDouble(qty) * p / y;
  return n >= 100 ? n.round() : n >= 10 ? round(n, 1) : round(n, 2);
}

({double perPortion, double? foodCostPct, int missing}) recipeCost(Map<String, dynamic> recipe, Map<String, Map<String, dynamic>> stockById, num price) {
  final y = toDouble(recipe['yieldPortions']) > 0 ? toDouble(recipe['yieldPortions']) : 1.0;
  var cost = 0.0;
  var missing = 0;
  for (final ing in jsonList(recipe['ingredients'])) {
    final item = stockFor(ing, stockById);
    final unitCost = toDouble(item?['unitCost']);
    if (item == null || unitCost <= 0) {
      missing++;
      continue;
    }
    final q = convertQty(toDouble(ing['qty']) / y, '${ing['unit'] ?? ''}'.isEmpty ? '${item['unit'] ?? ''}' : '${ing['unit']}', '${item['unit'] ?? ''}');
    if (q == null) {
      missing++;
      continue;
    }
    cost += q * unitCost;
  }
  return (perPortion: round(cost), foodCostPct: price > 0 && cost > 0 ? round(cost / price * 100, 1) : null, missing: missing);
}

DateTime weekStartOf([DateTime? d]) {
  final x = d ?? DateTime.now();
  final day = DateTime(x.year, x.month, x.day);
  return day.subtract(Duration(days: day.weekday - 1));
}

DateTime nextWeekStart([DateTime? now]) => weekStartOf(now).add(const Duration(days: 7));

String isoDay(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

int weekNumber(DateTime d) {
  final x = DateTime.utc(d.year, d.month, d.day);
  final thursday = x.add(Duration(days: 4 - x.weekday));
  final yearStart = DateTime.utc(thursday.year, 1, 1);
  return ((thursday.difference(yearStart).inDays + 1) / 7).ceil();
}

/// Portions sold per menu item from kitchen tickets (cancelled ones skipped).
Map<String, double> portionsSold(Iterable<Map<String, dynamic>> kots) {
  final out = <String, double>{};
  for (final k in kots) {
    if (k['status'] == 'cancelled') continue;
    for (final it in jsonList(k['items'])) {
      final id = '${it['id'] ?? it['menuItemId'] ?? ''}';
      if (id.isEmpty) continue;
      out[id] = (out[id] ?? 0) + (toDouble(it['quantity']) == 0 ? 1 : toDouble(it['quantity']));
    }
  }
  return out;
}

/// Total ingredients for planned portions per dish, keyed by stock item
/// (in the stock item's unit) or by name + unit.
List<Map<String, dynamic>> ingredientNeeds(List<Map<String, dynamic>> recipes, Map<String, num> planned, Map<String, Map<String, dynamic>> stockById) {
  final lines = <String, Map<String, dynamic>>{};
  for (final r in recipes) {
    final portions = (planned[r['menuItem']] ?? 0).toDouble();
    if (portions <= 0) continue;
    final y = toDouble(r['yieldPortions']) > 0 ? toDouble(r['yieldPortions']) : 1.0;
    for (final ing in jsonList(r['ingredients'])) {
      final per = toDouble(ing['qty']) / y;
      if (per <= 0) continue;
      final item = stockFor(ing, stockById);
      var unit = '${ing['unit'] ?? ''}'.isNotEmpty ? '${ing['unit']}' : '${item?['unit'] ?? ''}';
      var qty = per * portions;
      if (item != null) {
        final c = convertQty(qty, unit, '${item['unit'] ?? ''}');
        if (c != null) {
          qty = c;
          if ('${item['unit'] ?? ''}'.isNotEmpty) unit = '${item['unit']}';
        }
      }
      final key = item != null ? 's:${item['id']}:${_norm(unit)}' : 'n:${'${ing['name'] ?? ''}'.trim().toLowerCase()}:${_norm(unit)}';
      final line = lines.putIfAbsent(key, () => {'stockItem': item?['id'] ?? '', 'name': item != null ? '${item['name']}' : '${ing['name'] ?? ''}'.trim(), 'unit': unit, 'qty': 0.0});
      line['qty'] = (line['qty'] as double) + qty;
    }
  }
  return lines.values.map((l) => {...l, 'qty': round(l['qty'] as double, 2)}).toList()..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
}

/// Rounds a requested amount up to something sensible to hand out.
double niceQty(num qty, String? unit) {
  final n = qty.toDouble();
  final u = _norm(unit);
  if (_unitGroups[u]?.$1 == 'count') return n.ceilToDouble();
  if (u == 'g' || u == 'ml') {
    if (n <= 20) return n.ceilToDouble();
    if (n <= 200) return (n / 5).ceil() * 5.0;
    return (n / 50).ceil() * 50.0;
  }
  if (n < 1) return (n * 10).ceil() / 10;
  return (n * 2).ceil() / 2;
}

const openForStock = ['submitted', 'in_progress', 'partial'];

/// "YYYY-MM-DD HH:MM:SS" UTC for PocketBase filters and date fields.
String pbDate(DateTime d) {
  final u = d.toUtc();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${u.year}-${two(u.month)}-${two(u.day)} ${two(u.hour)}:${two(u.minute)}:${two(u.second)}';
}
