import 'dart:async';

import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pocketbase/pocketbase.dart';
import 'package:printing/printing.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/foundation.dart' show Uint8List;

import '../../core/planning.dart';
import '../../core/scope.dart';
import '../../core/stock.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import '../common/widgets.dart';

(String, Color) requestStatus(BuildContext context, String s) => switch (s) {
      'submitted' => (tr(context, 'Sent', 'Gesendet'), TriptiColors.blue),
      'in_progress' => (tr(context, 'Being prepared', 'In Vorbereitung'), TriptiColors.amber),
      'partial' => (tr(context, 'Partly given', 'Teilweise ausgegeben'), TriptiColors.amber),
      'fulfilled' => (tr(context, 'Done', 'Erledigt'), TriptiColors.green),
      'cancelled' => (tr(context, 'Cancelled', 'Storniert'), TriptiColors.red),
      _ => (tr(context, 'Draft', 'Entwurf'), Colors.grey),
    };

String weekLabel(BuildContext context, DateTime? s) {
  if (s == null) return '';
  final e = s.add(const Duration(days: 6));
  return '${tr(context, 'Week', 'KW')} ${weekNumber(s)} · ${s.day}.${s.month}. – ${e.day}.${e.month}.';
}

double _remainingOf(Map<String, dynamic> l) {
  final r = toDouble(l['qty']) - toDouble(l['fulfilledQty']);
  return r > 0 ? r : 0;
}

/// A4 list of what is still to give out, with what is in store and what
/// has to be bought.
Future<void> printShoppingList(String title, List<({String name, String unit, double need, double? have})> rows, {String note = '', required bool de}) async {
  final font = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
  final doc = pw.Document(theme: pw.ThemeData.withFont(base: font, bold: bold));
  String t(String en, String g) => de ? g : en;
  pw.Widget cell(String v, {bool b = false, bool right = false}) => pw.Padding(
        padding: const pw.EdgeInsets.all(4),
        child: pw.Text(v, textAlign: right ? pw.TextAlign.right : pw.TextAlign.left, style: b ? pw.TextStyle(font: bold) : null),
      );
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    build: (_) => [
      pw.Text(title, style: pw.TextStyle(font: bold, fontSize: 18)),
      pw.SizedBox(height: 8),
      pw.Table(
        border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: PdfColors.grey400), bottom: pw.BorderSide(color: PdfColors.grey400)),
        columnWidths: {0: const pw.FlexColumnWidth(3)},
        children: [
          pw.TableRow(children: [cell(t('Item', 'Artikel'), b: true), cell(t('Needed', 'Benötigt'), b: true, right: true), cell(t('In store', 'Im Lager'), b: true, right: true), cell(t('To buy', 'Einkaufen'), b: true, right: true)]),
          for (final r in rows)
            pw.TableRow(children: [
              cell(r.name),
              cell('${fmtNum(r.need)} ${r.unit}', right: true),
              cell(r.have == null ? '-' : '${fmtNum(r.have!)} ${r.unit}', right: true),
              cell(() {
                final buy = r.have == null ? r.need : (r.need - r.have! > 0 ? r.need - r.have! : 0);
                return buy > 0 ? '${fmtNum(buy)} ${r.unit}' : '';
              }(), b: true, right: true),
            ]),
        ],
      ),
      if (note.isNotEmpty) ...[pw.SizedBox(height: 10), pw.Text(note)],
    ],
  ));
  final bytes = await doc.save();
  await Printing.layoutPdf(name: title, onLayout: (_) async => Uint8List.fromList(bytes));
}

/// Kitchen manager: weekly ingredient requests to the stock manager.
/// With [stockMode] the stock manager sees the sent requests and gives the
/// goods out of the store.
class StockRequestsPage extends StatefulWidget {
  const StockRequestsPage({super.key, this.stockMode = false});
  final bool stockMode;

  @override
  State<StockRequestsPage> createState() => _StockRequestsPageState();
}

class _StockRequestsPageState extends State<StockRequestsPage> {
  List<Map<String, dynamic>> _requests = [];
  Map<String, Map<String, dynamic>> _stock = {};
  List<Map<String, dynamic>> _lots = [];
  bool _loading = true;
  UnsubscribeFunc? _unsub;

  PocketBase get pb => AppScope.read(context).pb;

  @override
  void initState() {
    super.initState();
    _load();
    pb.collection('stock_requests').subscribe('*', (_) => _load()).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final since = pbDate(DateTime.now().subtract(const Duration(days: 120)));
      final r = await Future.wait([
        pb.collection('stock_requests').getFullList(filter: 'weekStart >= "$since"', sort: '-weekStart,-created'),
        pb.collection('stock_items').getFullList(sort: 'name', fields: 'id,name,unit,quantity,unitCost,minStock,category').catchError((_) => <RecordModel>[]),
        if (widget.stockMode) pb.collection('stock_lots').getFullList(fields: 'id,stockItem,quantity,remainingQty,expiry,status,location').catchError((_) => <RecordModel>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _requests = r[0].map((e) => e.toJson()).toList();
        _stock = {for (final s in r[1]) s.id: s.toJson()};
        _lots = widget.stockMode ? r[2].map((e) => e.toJson()).toList() : [];
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        toast(context, errorMessage(e), error: true);
      }
    }
  }

  Future<void> _open(Map<String, dynamic>? r) async {
    final last = _requests.where((x) => x['status'] != 'cancelled' && x['id'] != r?['id'] && jsonList(x['items']).isNotEmpty).firstOrNull;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => RequestEditor(request: r, stock: _stock, last: last, stockMode: widget.stockMode, lots: _lots)));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (widget.stockMode) return _stockList();
    final now = DateTime.now();
    final next = isoDay(nextWeekStart(now));
    final forNext = _requests.where((r) => parseDate(r['weekStart']) != null && isoDay(parseDate(r['weekStart'])!) == next && r['status'] != 'cancelled').toList();
    final remind = now.weekday >= DateTime.thursday && !forNext.any((r) => r['status'] != 'draft');
    final open = _requests.where((r) => ['draft', ...openForStock].contains(r['status']) || (r['status'] == 'fulfilled' && '${r['receivedAt'] ?? ''}'.isEmpty)).toList();
    final done = _requests.where((r) => !open.contains(r)).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        PageIntro(Icons.shopping_basket_outlined, tr(context, 'Stock requests', 'Lageranfragen'), tr(context, 'Plan next week\'s ingredients and send the list to the stock manager.', 'Zutaten für nächste Woche planen und die Liste an das Lager schicken.')),
        const SizedBox(height: 10),
        if (remind)
          Card(
            color: const Color(0xFFFEF3C7),
            child: ListTile(
              leading: const Icon(Icons.notifications_active, color: TriptiColors.amber),
              title: Text(forNext.isNotEmpty
                  ? tr(context, 'The draft for week ${weekNumber(nextWeekStart(now))} has not been sent yet.', 'Der Entwurf für KW ${weekNumber(nextWeekStart(now))} ist noch nicht gesendet.')
                  : tr(context, 'The list for next week (week ${weekNumber(nextWeekStart(now))}) has not been sent yet.', 'Die Liste für nächste Woche (KW ${weekNumber(nextWeekStart(now))}) ist noch nicht gesendet.')),
              trailing: TextButton(onPressed: () => _open(forNext.firstOrNull), child: Text(forNext.isNotEmpty ? tr(context, 'Open draft', 'Entwurf öffnen') : tr(context, 'Start it now', 'Jetzt anlegen'))),
            ),
          ),
        FilledButton.icon(onPressed: () => _open(null), icon: const Icon(Icons.add), label: Text(tr(context, 'New request', 'Neue Anforderung'))),
        const SizedBox(height: 12),
        if (_requests.isEmpty) EmptyState(Icons.assignment_outlined, tr(context, 'No requests yet.', 'Noch keine Anforderungen.')),
        if (open.isNotEmpty) _head(tr(context, 'Open', 'Offen')),
        for (final r in open) _tile(r),
        if (done.isNotEmpty) _head(tr(context, 'Earlier', 'Frühere')),
        for (final r in done) _tile(r),
      ]),
    );
  }

  Widget _stockList() {
    final visible = _requests.where((r) => r['status'] != 'draft').toList();
    final open = visible.where((r) => openForStock.contains(r['status'])).toList()
      ..sort((a, b) => '${a['neededBy'] ?? a['weekStart']}'.compareTo('${b['neededBy'] ?? b['weekStart']}'));
    final done = visible.where((r) => !open.contains(r)).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
        PageIntro(Icons.assignment_outlined, tr(context, 'Kitchen requests', 'Küchenanfragen'), tr(context, 'Weekly lists from the kitchen. Give out what is in store; the rest goes on the shopping list.', 'Wochenlisten der Küche. Vorhandenes ausgeben, der Rest kommt auf die Einkaufsliste.')),
        const SizedBox(height: 10),
        if (open.isNotEmpty)
          OutlinedButton.icon(onPressed: () => _printAll(open), icon: const Icon(Icons.shopping_cart_outlined), label: Text(tr(context, 'Shopping list for all open requests', 'Einkaufsliste für alle offenen Anforderungen'))),
        if (visible.isEmpty) EmptyState(Icons.assignment_outlined, tr(context, 'No requests from the kitchen yet.', 'Noch keine Anforderungen der Küche.')),
        if (open.isNotEmpty) _head(tr(context, 'To do', 'Zu erledigen')),
        for (final r in open) _tile(r),
        if (done.isNotEmpty) _head(tr(context, 'Earlier', 'Frühere')),
        for (final r in done) _tile(r),
      ]),
    );
  }

  Future<void> _printAll(List<Map<String, dynamic>> open) async {
    final de = AppScope.read(context).de;
    final rows = <String, ({String name, String unit, double need, double? have})>{};
    for (final r in open) {
      for (final l in jsonList(r['items'])) {
        final rem = _remainingOf(l);
        if (rem <= 0) continue;
        final item = stockFor(l, _stock);
        final unit = item != null && '${item['unit'] ?? ''}'.isNotEmpty ? '${item['unit']}' : '${l['unit'] ?? ''}';
        final qty = item != null ? (convertQty(rem, '${l['unit'] ?? ''}'.isEmpty ? unit : '${l['unit']}', unit) ?? rem) : rem;
        final key = item != null ? 's:${item['id']}' : 'n:${'${l['name']}'.toLowerCase()}:${l['unit']}';
        final prev = rows[key];
        rows[key] = (name: item != null ? '${item['name']}' : '${l['name']}', unit: unit, need: (prev?.need ?? 0) + qty, have: item != null ? toDouble(item['quantity']) : null);
      }
    }
    final list = rows.values.toList()..sort((a, b) => a.name.compareTo(b.name));
    await printShoppingList(de ? 'Einkaufsliste' : 'Shopping list', list, de: de);
  }

  Widget _head(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 6), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: TriptiColors.ink)));

  Widget _tile(Map<String, dynamic> r) {
    final (label, color) = requestStatus(context, '${r['status']}');
    final n = jsonList(r['items']).length;
    final toConfirm = r['status'] == 'fulfilled' && '${r['receivedAt'] ?? ''}'.isEmpty;
    final lines = jsonList(r['items']);
    final given = lines.where((l) => _remainingOf(l) <= 0).length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AccentCard(
        color: color,
        onTap: () => _open(r),
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.calendar_month_outlined, size: 20, color: TriptiColors.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(weekLabel(context, parseDate(r['weekStart'])), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5, color: TriptiColors.ink))),
            StatusPill(label, color),
          ]),
          const SizedBox(height: 4),
          Text('$n ${tr(context, 'items', 'Artikel')}${'${r['requestedByName'] ?? ''}'.isNotEmpty ? ' · ${r['requestedByName']}' : ''}', style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
          if (toConfirm) Padding(padding: const EdgeInsets.only(top: 4), child: StatusPill(tr(context, 'Confirm receipt', 'Erhalt bestätigen'), TriptiColors.blue, icon: Icons.fact_check_outlined)),
          if (n > 0 && r['status'] != 'draft' && r['status'] != 'cancelled') ...[
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(value: given / n, minHeight: 5, color: given == n ? TriptiColors.green : TriptiColors.amber, backgroundColor: TriptiColors.muted),
                ),
              ),
              const SizedBox(width: 8),
              Text('$given/$n ${tr(context, 'given', 'ausgegeben')}', style: const TextStyle(fontSize: 11.5, color: Colors.black54)),
            ]),
          ],
        ]),
      ),
    );
  }
}

class _ReqLine {
  _ReqLine(Map<String, dynamic> l)
      : data = Map<String, dynamic>.from(l),
        name = TextEditingController(text: '${l['name'] ?? ''}'),
        qty = TextEditingController(text: l['qty'] == null ? '' : fmtNum(toDouble(l['qty']))),
        note = TextEditingController(text: '${l['note'] ?? ''}'),
        give = TextEditingController();
  final Map<String, dynamic> data;
  final TextEditingController name, qty, note, give;
  String get unit => '${data['unit'] ?? ''}';
}

class RequestEditor extends StatefulWidget {
  const RequestEditor({super.key, required this.request, required this.stock, this.last, this.stockMode = false, this.lots = const []});
  final Map<String, dynamic>? request;
  final Map<String, Map<String, dynamic>> stock;
  final Map<String, dynamic>? last;
  final bool stockMode;
  final List<Map<String, dynamic>> lots;

  @override
  State<RequestEditor> createState() => _RequestEditorState();
}

class _RequestEditorState extends State<RequestEditor> {
  late String _week;
  late DateTime? _neededBy;
  late final TextEditingController _notes, _received, _stockNote;
  late List<_ReqLine> _lines;
  bool _busy = false;
  // Planning from recipes.
  List<Map<String, dynamic>>? _planRows, _recipes;
  int _missing = 0, _growth = 0;

  Map<String, dynamic>? get r => widget.request;
  String get _status => '${r?['status'] ?? 'draft'}';
  bool get _editable => !widget.stockMode && ['draft', 'submitted'].contains(_status);
  bool get _stockOpen => widget.stockMode && openForStock.contains(_status);

  @override
  void initState() {
    super.initState();
    final ws = parseDate(r?['weekStart']);
    _week = ws == null ? isoDay(nextWeekStart()) : isoDay(ws);
    _neededBy = parseDate(r?['neededBy']) ?? DateTime.parse(_week);
    _notes = TextEditingController(text: '${r?['notes'] ?? ''}');
    _received = TextEditingController(text: '${r?['receivedNote'] ?? ''}');
    _stockNote = TextEditingController(text: '${r?['stockNote'] ?? ''}');
    _lines = jsonList(r?['items']).map(_ReqLine.new).toList();
  }

  List<Map<String, dynamic>> _clean() => [
        for (final l in _lines)
          if (l.name.text.trim().isNotEmpty && toDouble(l.qty.text.replaceAll(',', '.')) > 0)
            {
              'stockItem': '${l.data['stockItem'] ?? ''}',
              'name': l.name.text.trim(),
              'unit': l.unit,
              'qty': round(toDouble(l.qty.text.replaceAll(',', '.')), 3),
              'note': l.note.text,
            },
      ];

  double? _inStore(_ReqLine l) {
    final item = stockFor({'name': l.name.text, 'stockItem': l.data['stockItem']}, widget.stock);
    if (item == null) return null;
    return convertQty(toDouble(item['quantity']), '${item['unit'] ?? ''}', l.unit.isEmpty ? '${item['unit'] ?? ''}' : l.unit);
  }

  Future<void> _save(String status) async {
    final items = _clean();
    if (items.isEmpty) {
      toast(context, tr(context, 'Add at least one item.', 'Mindestens einen Artikel eintragen.'), error: true);
      return;
    }
    final pb = AppScope.read(context).pb;
    final body = {
      'weekStart': pbDate(DateTime.parse('${_week}T00:00:00')),
      'neededBy': _neededBy == null ? '' : pbDate(DateTime(_neededBy!.year, _neededBy!.month, _neededBy!.day)),
      'items': items,
      'notes': _notes.text,
      'status': status,
    };
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      if (r?['id'] != null) {
        await pb.collection('stock_requests').update(r!['id'], body: body);
      } else {
        await pb.collection('stock_requests').create(body: body);
      }
    }, done: status == 'submitted' ? tr(context, 'Request sent to the stock manager', 'Anforderung an das Lager gesendet') : tr(context, 'Draft saved', 'Entwurf gespeichert'));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop();
  }

  Future<void> _simple(Future<void> Function(PocketBase) f, String done, {String? confirm}) async {
    if (confirm != null) {
      final yes = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(title: Text(confirm), actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Back', 'Zurück'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK')),
        ]),
      );
      if (yes != true || !mounted) return;
    }
    final pb = AppScope.read(context).pb;
    setState(() => _busy = true);
    final ok = await runAction(context, () => f(pb), done: done);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop();
  }

  double _defaultGive(_ReqLine l) {
    final rem = _remainingOf({'qty': l.qty.text, 'fulfilledQty': l.data['fulfilledQty']});
    final have = _inStore(l);
    if (have == null) return 0;
    final h = round(have, 3);
    return h <= 0 ? 0 : (rem < h ? rem : h);
  }

  double _giveOf(_ReqLine l) => l.give.text.trim().isEmpty ? _defaultGive(l) : toDouble(l.give.text.replaceAll(',', '.'));

  Future<void> _startPreparing() => _simple((pb) => pb.collection('stock_requests').update(r!['id'], body: {'status': 'in_progress'}), tr(context, 'Started. The kitchen can no longer change this list.', 'Gestartet. Die Küche kann die Liste nicht mehr ändern.'));

  Future<void> _giveOut() async {
    final session = AppScope.read(context);
    final pb = session.pb;
    final weekWord = tr(context, 'week', 'KW');
    final badUnitMsg = tr(context, 'Units do not match the stock list for', 'Einheit passt nicht zur Lagerliste bei');
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      if (_status == 'submitted') {
        await pb.collection('stock_requests').update(r!['id'], body: {'status': 'in_progress'});
      }
      final reason = 'Weekly request $weekWord ${weekNumber(parseDate(r!['weekStart']) ?? DateTime.now())}';
      final liveItems = <String, Map<String, dynamic>>{};
      final liveLots = widget.lots.map((x) => {...x}).toList();
      final items = <Map<String, dynamic>>[];
      final badUnit = <String>[];
      for (final l in _lines) {
        final giveRaw = _giveOf(l);
        var given = 0.0;
        final found = stockFor({'name': l.name.text, 'stockItem': l.data['stockItem']}, widget.stock);
        if (giveRaw > 0) {
          if (found != null) {
            final item = liveItems.putIfAbsent('${found['id']}', () => {...found});
            final unit = '${item['unit'] ?? ''}';
            final inItemUnit = convertQty(giveRaw, l.unit.isEmpty ? unit : l.unit, unit);
            if (inItemUnit == null) {
              badUnit.add(l.name.text);
            } else {
              final done = await issueFromStock(pb,
                  item: item,
                  lots: liveLots,
                  qty: inItemUnit,
                  staffId: '${r!['requestedBy'] ?? ''}'.isEmpty ? 'kitchen' : '${r!['requestedBy']}',
                  staffName: '${r!['requestedByName'] ?? ''}'.isEmpty ? 'Kitchen' : '${r!['requestedByName']}',
                  role: 'stock',
                  byName: session.displayName,
                  byId: session.user?.id ?? '',
                  reason: reason);
              given = convertQty(done, unit, l.unit.isEmpty ? unit : l.unit) ?? 0;
            }
          } else {
            given = giveRaw; // bought or handed over outside the stock list
          }
        }
        final line = {...l.data}..remove('give');
        if ('${line['stockItem'] ?? ''}'.isEmpty && found != null) line['stockItem'] = found['id'];
        line['fulfilledQty'] = round(toDouble(l.data['fulfilledQty']) + given, 3);
        items.add(line);
      }
      final complete = items.every((l) => toDouble(l['fulfilledQty']) + 1e-9 >= toDouble(l['qty']));
      await pb.collection('stock_requests').update(r!['id'], body: {'items': items, 'status': complete ? 'fulfilled' : 'partial', 'stockNote': _stockNote.text});
      if (badUnit.isNotEmpty) throw Exception('$badUnitMsg: ${badUnit.join(', ')}');
    }, done: tr(context, 'Stock given out', 'Ware ausgegeben'));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.of(context).pop();
  }

  Future<void> _addToStock(_ReqLine l) async {
    final pb = AppScope.read(context).pb;
    setState(() => _busy = true);
    await runAction(context, () async {
      final u = l.unit.toLowerCase();
      final item = await pb.collection('stock_items').create(body: {
        'name': l.name.text.trim(),
        'unit': u == 'g' ? 'kg' : u == 'ml' ? 'l' : (l.unit.isEmpty ? 'pcs' : l.unit),
        'quantity': 0,
        'category': 'Kitchen',
      });
      l.data['stockItem'] = item.id;
      widget.stock[item.id] = item.toJson();
      final saved = [
        for (final x in jsonList(r!['items'])) {...x}
      ];
      final i = _lines.indexOf(l);
      if (i >= 0 && i < saved.length) saved[i]['stockItem'] = item.id;
      await pb.collection('stock_requests').update(r!['id'], body: {'items': saved});
    }, done: tr(context, '${l.name.text} added to the stock list', '${l.name.text} in die Lagerliste aufgenommen'));
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _printList(bool onlyShort) async {
    final de = AppScope.read(context).de;
    final rows = [
      for (final l in _lines)
        (name: l.name.text, unit: l.unit, need: _remainingOf({'qty': l.qty.text, 'fulfilledQty': l.data['fulfilledQty']}), have: _inStore(l)),
    ].where((x) => !onlyShort || (x.have == null ? x.need : x.need - x.have!) > 0).toList();
    final week = weekLabel(context, DateTime.parse(_week));
    await printShoppingList('${onlyShort ? (de ? 'Einkaufsliste' : 'Shopping list') : (de ? 'Anforderung' : 'Request')} · $week', rows, note: _notes.text, de: de);
  }

  void _copyLast() {
    final items = jsonList(widget.last?['items']).map((l) => {...l}..remove('fulfilledQty')).toList();
    setState(() => _lines = items.map(_ReqLine.new).toList());
    toast(context, tr(context, '${items.length} items copied. Check the amounts.', '${items.length} Artikel übernommen. Mengen bitte prüfen.'));
  }

  Future<void> _loadPlan() async {
    final pb = AppScope.read(context).pb;
    final de = AppScope.read(context).de;
    setState(() => _busy = true);
    try {
      final since = pbDate(DateTime.now().subtract(const Duration(days: 7)));
      final res = await Future.wait([
        pb.collection('recipes').getFullList(),
        pb.collection('menu_items').getFullList(fields: 'id,name,nameEN,nameDE,category'),
        pb.collection('kitchen_orders').getFullList(filter: 'created >= "$since"', fields: 'id,status,items'),
      ]);
      final recipes = res[0].map((e) => e.toJson()).toList();
      final menu = {for (final m in res[1]) m.id: m.toJson()};
      final sold = portionsSold(res[2].map((e) => e.toJson()));
      final withRecipe = recipes.map((x) => x['menuItem']).toSet();
      final rows = <Map<String, dynamic>>[];
      for (final x in recipes) {
        final m = menu[x['menuItem']];
        if (m == null) continue;
        final name = de && '${m['nameDE'] ?? ''}'.isNotEmpty ? m['nameDE'] : ('${m['nameEN'] ?? ''}'.isNotEmpty ? m['nameEN'] : m['name']);
        rows.add({'id': x['menuItem'], 'name': '$name', 'sold': sold[x['menuItem']] ?? 0.0, 'planned': (sold[x['menuItem']] ?? 0.0).round()});
      }
      rows.sort((a, b) {
        final d = (b['sold'] as double).compareTo(a['sold'] as double);
        return d != 0 ? d : '${a['name']}'.compareTo('${b['name']}');
      });
      setState(() {
        _recipes = recipes;
        _planRows = rows;
        _missing = sold.keys.where((id) => menu.containsKey(id) && !withRecipe.contains(id)).length;
        _growth = 0;
      });
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  void _calculate() {
    final planned = {for (final p in _planRows!) '${p['id']}': (p['planned'] as num)};
    final needs = ingredientNeeds(_recipes!, planned, widget.stock);
    setState(() {
      for (final n in needs) {
        final qty = niceQty(n['qty'] as num, '${n['unit']}');
        final i = _lines.indexWhere((l) => '${n['stockItem']}'.isNotEmpty
            ? l.data['stockItem'] == n['stockItem']
            : '${l.data['stockItem'] ?? ''}'.isEmpty && l.name.text.toLowerCase() == '${n['name']}'.toLowerCase());
        if (i >= 0) {
          _lines[i].qty.text = fmtNum(qty);
          _lines[i].data['unit'] = n['unit'];
        } else {
          _lines.add(_ReqLine({'stockItem': n['stockItem'], 'name': n['name'], 'unit': n['unit'], 'qty': qty, 'note': ''}));
        }
      }
      _lines.sort((a, b) => a.name.text.compareTo(b.name.text));
    });
    toast(context, tr(context, '${needs.length} ingredients added from recipes', '${needs.length} Zutaten aus Rezepten übernommen'));
  }

  @override
  Widget build(BuildContext context) {
    final (label, color) = requestStatus(context, _status);
    final stockList = widget.stock.values.toList()..sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
    final weeks = [for (var i = 0; i < 5; i++) isoDay(weekStartOf().add(Duration(days: 7 * i)))];
    if (!weeks.contains(_week)) weeks.insert(0, _week);
    return Scaffold(
      appBar: AppBar(title: Text(r == null ? tr(context, 'New request', 'Neue Anforderung') : weekLabel(context, DateTime.parse(_week)))),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(padding: const EdgeInsets.fromLTRB(14, 12, 14, 32), children: [
          Row(children: [StatusPill(label, color), const SizedBox(width: 8), if ('${r?['requestedByName'] ?? ''}'.isNotEmpty) Text('${tr(context, 'Requested by', 'Angefordert von')} ${r!['requestedByName']}', style: const TextStyle(color: Colors.black54))]),
          if (!widget.stockMode && !_editable && _status != 'cancelled')
            Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr(context, 'The stock manager is working on this request. Ask them for changes.', 'Das Lager bearbeitet diese Anforderung bereits. Änderungen bitte mit dem Lager absprechen.'), style: const TextStyle(color: TriptiColors.amber))),
          const SizedBox(height: 10),
          if (_editable) ...[
            DropdownButtonFormField<String>(
              initialValue: _week,
              decoration: InputDecoration(labelText: tr(context, 'Week', 'Woche')),
              items: [for (final w in weeks) DropdownMenuItem(value: w, child: Text(weekLabel(context, DateTime.parse(w))))],
              onChanged: (v) => setState(() {
                _week = v ?? _week;
                _neededBy = DateTime.parse(_week);
              }),
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(tr(context, 'Needed by', 'Benötigt bis')),
              subtitle: Text(_neededBy == null ? '—' : '${_neededBy!.day}.${_neededBy!.month}.${_neededBy!.year}'),
              trailing: const Icon(Icons.calendar_month),
              onTap: () async {
                final d = await showDatePicker(context: context, initialDate: _neededBy ?? DateTime.now(), firstDate: DateTime.now().subtract(const Duration(days: 30)), lastDate: DateTime.now().add(const Duration(days: 90)));
                if (d != null) setState(() => _neededBy = d);
              },
            ),
            Wrap(spacing: 8, runSpacing: 6, children: [
              OutlinedButton.icon(onPressed: _loadPlan, icon: const Icon(Icons.calculate_outlined), label: Text(tr(context, 'Plan from recipes', 'Aus Rezepten planen'))),
              if (widget.last != null)
                OutlinedButton.icon(onPressed: _copyLast, icon: const Icon(Icons.copy), label: Text(tr(context, 'Copy week ${weekNumber(parseDate(widget.last!['weekStart']) ?? DateTime.now())}', 'Aus KW ${weekNumber(parseDate(widget.last!['weekStart']) ?? DateTime.now())} übernehmen'))),
            ]),
            if (_planRows != null) _planCard(),
          ] else
            Text('${tr(context, 'Needed by', 'Benötigt bis')}: ${_neededBy == null ? '—' : '${_neededBy!.day}.${_neededBy!.month}.${_neededBy!.year}'}'),
          const SizedBox(height: 12),
          Text(tr(context, 'Items', 'Artikel'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          for (final l in _lines) _lineCard(l, stockList),
          if (_editable) OutlinedButton.icon(onPressed: () => setState(() => _lines.add(_ReqLine({'unit': 'kg'}))), icon: const Icon(Icons.add), label: Text(tr(context, 'Add item', 'Artikel hinzufügen'))),
          const SizedBox(height: 12),
          if (!widget.stockMode)
            TextField(controller: _notes, enabled: _editable, maxLines: 2, decoration: InputDecoration(labelText: tr(context, 'Notes for the stock manager', 'Notiz für das Lager')))
          else if (_notes.text.trim().isNotEmpty)
            Text('${tr(context, 'Note from the kitchen', 'Notiz der Küche')}: ${_notes.text}'),
          if (_stockOpen) ...[
            const SizedBox(height: 8),
            TextField(controller: _stockNote, maxLines: 2, decoration: InputDecoration(labelText: tr(context, 'Note for the kitchen', 'Notiz für die Küche'))),
            const SizedBox(height: 12),
            if (_status == 'submitted')
              OutlinedButton.icon(onPressed: _startPreparing, icon: const Icon(Icons.play_arrow), label: Text(tr(context, 'Start preparing', 'Vorbereitung starten'))),
            const SizedBox(height: 8),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _giveOut,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.inventory),
              label: Text(tr(context, 'Give out', 'Ausgeben')),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(tr(context, 'You can give out part now and the rest later. The kitchen sees what is still missing.', 'Teilweise ausgeben geht auch, der Rest später. Die Küche sieht, was noch fehlt.'), style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ),
          ] else if ('${r?['stockNote'] ?? ''}'.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('${tr(context, 'Note from stock', 'Notiz vom Lager')}: ${r!['stockNote']}')),
          if (r?['id'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Wrap(spacing: 8, children: [
                OutlinedButton.icon(onPressed: () => _printList(true), icon: const Icon(Icons.shopping_cart_outlined), label: Text(tr(context, 'Shopping list', 'Einkaufsliste'))),
                OutlinedButton.icon(onPressed: () => _printList(false), icon: const Icon(Icons.print), label: Text(tr(context, 'Print list', 'Liste drucken'))),
              ]),
            ),
          const SizedBox(height: 16),
          if (_editable) ...[
            FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: () => _save('submitted'), icon: const Icon(Icons.send), label: Text(tr(context, 'Send to stock manager', 'An das Lager senden'))),
            const SizedBox(height: 8),
            if (_status == 'draft') OutlinedButton.icon(onPressed: () => _save('draft'), icon: const Icon(Icons.save_outlined), label: Text(tr(context, 'Save draft', 'Entwurf speichern'))),
            if (r?['id'] != null && _status == 'submitted')
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: TriptiColors.red),
                onPressed: () => _simple((pb) => pb.collection('stock_requests').update(r!['id'], body: {'status': 'cancelled'}), tr(context, 'Request cancelled', 'Anforderung storniert'), confirm: tr(context, 'Cancel this request?', 'Diese Anforderung stornieren?')),
                icon: const Icon(Icons.cancel_outlined),
                label: Text(tr(context, 'Cancel request', 'Anforderung stornieren')),
              ),
            if (r?['id'] != null && _status == 'draft')
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: TriptiColors.red),
                onPressed: () => _simple((pb) => pb.collection('stock_requests').delete(r!['id']), tr(context, 'Draft deleted', 'Entwurf gelöscht'), confirm: tr(context, 'Delete this draft?', 'Diesen Entwurf löschen?')),
                icon: const Icon(Icons.delete_outline),
                label: Text(tr(context, 'Delete draft', 'Entwurf löschen')),
              ),
          ],
          if (_status == 'fulfilled' && !widget.stockMode)
            '${r?['receivedAt'] ?? ''}'.isNotEmpty
                ? Text(tr(context, 'Received by ${r!['receivedByName']} on ${timeOf(parseDate(r!['receivedAt']))}', 'Erhalten von ${r!['receivedByName']} um ${timeOf(parseDate(r!['receivedAt']))}'), style: const TextStyle(color: TriptiColors.green, fontWeight: FontWeight.w700))
                : Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text(tr(context, 'Did everything arrive?', 'Ist alles angekommen?'), style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text(tr(context, 'Confirm when the goods are in the kitchen. Write down anything missing or damaged.', 'Bestätigen, sobald die Ware in der Küche ist. Fehlendes oder Beschädigtes notieren.'), style: const TextStyle(color: Colors.black54)),
                        const SizedBox(height: 8),
                        TextField(controller: _received, decoration: InputDecoration(labelText: tr(context, 'Missing or damaged (optional)', 'Fehlt oder beschädigt (optional)'))),
                        const SizedBox(height: 8),
                        FilledButton.icon(
                          style: FilledButton.styleFrom(backgroundColor: TriptiColors.green),
                          onPressed: () => _simple((pb) => pb.collection('stock_requests').update(r!['id'], body: {'receivedNote': _received.text}), tr(context, 'Receipt confirmed', 'Erhalt bestätigt')),
                          icon: const Icon(Icons.inventory),
                          label: Text(tr(context, 'Confirm received', 'Erhalt bestätigen')),
                        ),
                      ]),
                    ),
                  ),
        ]),
      ),
    );
  }

  Widget _planCard() {
    final rows = _planRows!;
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(tr(context, 'Plan from recipes', 'Aus Rezepten planen'), style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(tr(context, 'Portions sold in the last 7 days. Change the plan, then calculate.', 'Verkaufte Portionen der letzten 7 Tage. Plan anpassen, dann berechnen.'), style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
          if (rows.isEmpty) Text(tr(context, 'No recipes yet. Add recipes first to plan from sales.', 'Noch keine Rezepte. Zuerst Rezepte anlegen, um aus Verkäufen zu planen.')),
          if (_missing > 0) Text(tr(context, '$_missing dish(es) sold last week have no recipe.', '$_missing letzte Woche verkaufte Gerichte haben kein Rezept.'), style: const TextStyle(color: TriptiColors.amber, fontSize: 12.5)),
          if (rows.isNotEmpty) ...[
            Row(children: [
              Text('${tr(context, 'Extra', 'Zuschlag')}: '),
              for (final g in [0, 10, 20, 30])
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text('+$g%'),
                    selected: _growth == g,
                    onSelected: (_) => setState(() {
                      _growth = g;
                      for (final r in rows) {
                        r['planned'] = ((r['sold'] as double) * (1 + g / 100)).round();
                      }
                    }),
                  ),
                ),
            ]),
            for (final p in rows)
              Row(children: [
                Expanded(child: Text('${p['name']}')),
                Text('${(p['sold'] as double).round()}', style: const TextStyle(color: Colors.black54)),
                const Icon(Icons.arrow_forward, size: 14, color: Colors.black45),
                const SizedBox(width: 4),
                SizedBox(
                  width: 64,
                  child: TextFormField(
                    key: ValueKey('${p['id']}-$_growth'),
                    initialValue: '${p['planned']}',
                    keyboardType: TextInputType.number,
                    onChanged: (v) => p['planned'] = int.tryParse(v) ?? 0,
                  ),
                ),
              ]),
            const SizedBox(height: 8),
            FilledButton.icon(onPressed: _calculate, icon: const Icon(Icons.calculate), label: Text(tr(context, 'Calculate ingredients', 'Zutaten berechnen'))),
          ],
        ]),
      ),
    );
  }

  Widget _lineCard(_ReqLine l, List<Map<String, dynamic>> stockList) {
    final have = _inStore(l);
    final given = toDouble(l.data['fulfilledQty']);
    if (widget.stockMode) {
      final rem = _remainingOf({'qty': l.qty.text, 'fulfilledQty': given});
      final short = have == null ? rem : (rem - have > 0 ? rem - have : 0.0);
      return Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(l.name.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
              if (rem <= 0) const Icon(Icons.check_circle, color: TriptiColors.green),
            ]),
            Text(
              '${tr(context, 'Requested', 'Angefordert')}: ${fmtNum(toDouble(l.qty.text))} ${l.unit}'
              '${given > 0 ? ' · ${tr(context, 'given', 'ausgegeben')}: ${fmtNum(given)} ${l.unit}' : ''}'
              '${have != null ? ' · ${tr(context, 'in store', 'im Lager')}: ${fmtNum(have)} ${l.unit}' : ''}'
              '${l.note.text.isNotEmpty ? ' · ${l.note.text}' : ''}',
              style: const TextStyle(fontSize: 13, color: Colors.black87),
            ),
            if (short > 0 && rem > 0) Text('${tr(context, 'Short', 'Fehlt')}: ${fmtNum(short)} ${l.unit}', style: const TextStyle(fontSize: 12.5, color: TriptiColors.red, fontWeight: FontWeight.w700)),
            if (have == null)
              Row(children: [
                Expanded(child: Text(tr(context, 'Not in the stock list', 'Nicht in der Lagerliste'), style: const TextStyle(fontSize: 12, color: Colors.black45))),
                if (_stockOpen) TextButton.icon(onPressed: () => _addToStock(l), icon: const Icon(Icons.add_box_outlined, size: 18), label: Text(tr(context, 'Add to stock list', 'In Lagerliste aufnehmen'))),
              ]),
            if (_stockOpen && rem > 0)
              Row(children: [
                Text(tr(context, 'Give', 'Ausgeben'), style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(width: 8),
                SizedBox(
                  width: 90,
                  child: TextField(
                    controller: l.give,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textAlign: TextAlign.right,
                    decoration: InputDecoration(hintText: fmtNum(_defaultGive(l)), isDense: true),
                  ),
                ),
                const SizedBox(width: 6),
                Text(l.unit),
              ]),
          ]),
        ),
      );
    }
    if (!_editable) {
      return Card(
        child: ListTile(
          title: Text(l.name.text),
          subtitle: l.note.text.isEmpty ? null : Text(l.note.text),
          trailing: Text('${fmtNum(toDouble(l.qty.text))} ${l.unit}${given > 0 ? '\n${tr(context, 'given', 'ausgegeben')} ${fmtNum(given)}' : ''}', textAlign: TextAlign.right),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 4, 8),
        child: Column(children: [
          Row(children: [
            Expanded(
              child: Autocomplete<Map<String, dynamic>>(
                initialValue: l.name.value,
                displayStringForOption: (s) => '${s['name']}',
                optionsBuilder: (v) => v.text.isEmpty ? const Iterable.empty() : stockList.where((s) => '${s['name']}'.toLowerCase().contains(v.text.toLowerCase())).take(20),
                onSelected: (s) => setState(() {
                  l.name.text = '${s['name']}';
                  l.data['stockItem'] = s['id'];
                  l.data['unit'] = '${s['unit'] ?? ''}'.isEmpty ? 'pcs' : s['unit'];
                }),
                fieldViewBuilder: (ctx, ctl, focus, _) => TextField(
                  controller: ctl,
                  focusNode: focus,
                  decoration: InputDecoration(hintText: tr(context, 'Item', 'Artikel')),
                  onChanged: (v) => setState(() {
                    l.name.text = v;
                    final m = stockList.where((s) => '${s['name']}'.trim().toLowerCase() == v.trim().toLowerCase()).firstOrNull;
                    l.data['stockItem'] = m?['id'] ?? '';
                    if (m != null) l.data['unit'] = '${m['unit'] ?? ''}'.isEmpty ? 'pcs' : m['unit'];
                  }),
                ),
              ),
            ),
            IconButton(icon: const Icon(Icons.delete_outline, color: TriptiColors.red), onPressed: () => setState(() => _lines.remove(l))),
          ]),
          Row(children: [
            SizedBox(width: 80, child: TextField(controller: l.qty, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(hintText: tr(context, 'Qty', 'Menge')))),
            const SizedBox(width: 6),
            DropdownButton<String>(
              value: l.unit.isEmpty ? 'pcs' : l.unit,
              items: [for (final u in {...recipeUnits, if (l.unit.isNotEmpty) l.unit}) DropdownMenuItem(value: u, child: Text(u))],
              onChanged: (v) => setState(() => l.data['unit'] = v),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                have == null ? tr(context, 'not in stock list', 'nicht in der Lagerliste') : '${tr(context, 'In store', 'Im Lager')}: ${fmtNum(have)} ${l.unit}',
                style: TextStyle(fontSize: 12, color: have == null ? Colors.black45 : (have <= 0 ? TriptiColors.red : TriptiColors.green)),
              ),
            ),
          ]),
          TextField(controller: l.note, decoration: InputDecoration(hintText: tr(context, 'Note', 'Notiz'), isDense: true)),
        ]),
      ),
    );
  }
}
