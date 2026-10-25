import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/calls.dart';
import '../../core/scope.dart';
import '../../core/theme.dart';

const _green = Color(0xFF047857);
const _roleOrder = [
  'admin',
  'waiter',
  'cashier',
  'kitchen',
  'kitchen_manager',
  'stock',
  'auditor',
];

String callRoleName(BuildContext context, String r) {
  switch (r) {
    case 'all':
      return tr(context, 'Everyone', 'Alle');
    case 'admin':
      return 'Admin';
    case 'waiter':
      return tr(context, 'Waiters', 'Kellner');
    case 'cashier':
      return tr(context, 'Cashiers', 'Kasse');
    case 'kitchen':
      return tr(context, 'Kitchen', 'Küche');
    case 'kitchen_manager':
      return tr(context, 'Kitchen managers', 'Küchenleitung');
    case 'stock':
      return tr(context, 'Stock', 'Lager');
    case 'auditor':
      return tr(context, 'Auditors', 'Prüfer');
    default:
      return r;
  }
}

/// One person's role, e.g. "Waiter" (callRoleName gives the group, "Waiters").
String callRoleOne(BuildContext context, String r) {
  switch (r) {
    case 'waiter':
      return tr(context, 'Waiter', 'Kellner');
    case 'cashier':
      return tr(context, 'Cashier', 'Kasse');
    case 'kitchen_manager':
      return tr(context, 'Kitchen manager', 'Küchenleitung');
    case 'auditor':
      return tr(context, 'Auditor', 'Prüfer');
    default:
      return callRoleName(context, r);
  }
}

class CallScope extends InheritedNotifier<CallEngine> {
  const CallScope({super.key, required CallEngine engine, required super.child})
    : super(notifier: engine);
  static CallEngine? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CallScope>()?.notifier;
  static CallEngine? read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<CallScope>()?.notifier;
}

/// Wraps the whole app (MaterialApp.builder): listens for calls while signed
/// in and shows the incoming-call screen and the in-call bar above every page.
class CallHost extends StatefulWidget {
  const CallHost({super.key, required this.child});
  final Widget child;

  @override
  State<CallHost> createState() => _CallHostState();
}

class _CallHostState extends State<CallHost> {
  CallEngine? _engine;
  String _key = '';

  void _sync() {
    final s = AppScope.read(context);
    final key = s.signedIn ? '${s.collection}:${s.user?.id}' : '';
    if (key == _key) return;
    _key = key;
    _engine?.dispose();
    _engine = null;
    if (key.isEmpty) return;
    final e = CallEngine(
      s.pb,
      myId: s.user!.id,
      myName: s.displayName,
      myRole: roleKey(s.role),
    );
    _engine = e;
    e.start().catchError((err) => debugPrint('[calls] start $err'));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    AppScope.of(context); // rebuild on sign-in / sign-out
    _sync();
  }

  @override
  void dispose() {
    _engine?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = _engine;
    if (e == null) return widget.child;
    return CallScope(
      engine: e,
      child: Builder(
        builder: (context) {
          final c = CallScope.of(context)!;
          return Stack(
            children: [
              widget.child,
              if (c.state == CallState.inCall)
                const Positioned(
                  left: 8,
                  right: 8,
                  bottom: 84,
                  child: SafeArea(top: false, child: _InCallBar()),
                ),
              if (c.state == CallState.incoming && c.incoming != null)
                const Positioned.fill(child: _IncomingCall()),
            ],
          );
        },
      ),
    );
  }
}

class _IncomingCall extends StatelessWidget {
  const _IncomingCall();

  @override
  Widget build(BuildContext context) {
    final c = CallScope.of(context)!;
    final r = c.incoming!;
    final targets = r.data['targets'] is List
        ? r.data['targets'] as List
        : const [];
    final group =
        targets.length > 1 ||
        targets.any((t) => t is Map && t['type'] == 'role');
    return Material(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          constraints: const BoxConstraints(maxWidth: 380),
          decoration: BoxDecoration(
            color: TriptiColors.card,
            borderRadius: BorderRadius.circular(28),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  color: Color(0xFFD1FAE5),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.phone_in_talk, size: 36, color: _green),
              ),
              const SizedBox(height: 14),
              Text(
                r.getStringValue('createdByName'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: TriptiColors.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${callRoleOne(context, r.getStringValue('createdByRole'))}${group ? ' · ${tr(context, 'Group call', 'Gruppenanruf')}: ${r.getStringValue('title')}' : ''}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _RoundAction(
                    icon: Icons.call_end,
                    color: TriptiColors.red,
                    label: tr(context, 'Decline', 'Ablehnen'),
                    onTap: c.decline,
                  ),
                  _RoundAction(
                    icon: Icons.call,
                    color: _green,
                    label: tr(context, 'Answer', 'Annehmen'),
                    onTap: c.accept,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      SizedBox(
        width: 68,
        height: 68,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: color,
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
          ),
          onPressed: onTap,
          child: Icon(icon, size: 30, color: Colors.white),
        ),
      ),
      const SizedBox(height: 6),
      Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
    ],
  );
}

class _InCallBar extends StatefulWidget {
  const _InCallBar();

  @override
  State<_InCallBar> createState() => _InCallBarState();
}

class _InCallBarState extends State<_InCallBar> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = CallScope.of(context)!;
    final r = c.room;
    final title = r == null
        ? ''
        : (r.getStringValue('createdById') == c.myId
              ? r.getStringValue('title')
              : r.getStringValue('createdByName'));
    final secs = c.startedAt == null
        ? 0
        : DateTime.now().difference(c.startedAt!).inSeconds;
    final time =
        '${(secs ~/ 60).toString().padLeft(2, '0')}:${(secs % 60).toString().padLeft(2, '0')}';
    final others = c.others;
    Widget btn(
      IconData i,
      VoidCallback f, {
      Color bg = Colors.white24,
      String? tip,
    }) => SizedBox(
      width: 44,
      height: 44,
      child: IconButton.filled(
        style: IconButton.styleFrom(backgroundColor: bg),
        tooltip: tip,
        onPressed: f,
        icon: Icon(i, color: Colors.white, size: 22),
      ),
    );
    return Material(
      color: _green,
      elevation: 8,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.phone_in_talk, color: Colors.white),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title.isEmpty ? tr(context, 'Call', 'Anruf') : title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        c.anyoneJoined
                            ? '${tr(context, 'Connected', 'Verbunden')} · $time'
                            : tr(context, 'Ringing…', 'Klingelt…'),
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                btn(
                  c.speaker ? Icons.volume_up : Icons.hearing,
                  c.toggleSpeaker,
                  tip: tr(context, 'Speaker', 'Lautsprecher'),
                ),
                const SizedBox(width: 6),
                btn(
                  c.muted ? Icons.mic_off : Icons.mic,
                  c.toggleMute,
                  tip: tr(context, 'Mute', 'Stumm'),
                ),
                const SizedBox(width: 6),
                btn(
                  Icons.call_end,
                  c.leave,
                  bg: TriptiColors.red,
                  tip: tr(context, 'Hang up', 'Auflegen'),
                ),
              ],
            ),
            if (others.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final m in others)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: m.state == 'joined'
                            ? (c.isConnected(m.userId)
                                  ? Colors.white
                                  : Colors.white60)
                            : Colors.black26,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${m.name}${m.state == 'declined'
                            ? ' (${tr(context, 'declined', 'abgelehnt')})'
                            : m.state == 'left'
                            ? ' (${tr(context, 'left', 'aufgelegt')})'
                            : ''}',
                        style: TextStyle(
                          fontSize: 12,
                          color: m.state == 'joined' ? _green : Colors.white,
                          decoration: m.state == 'joined'
                              ? null
                              : TextDecoration.lineThrough,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Phone button for the top bar: call one person, a group or whole roles.
class CallButton extends StatelessWidget {
  const CallButton({super.key});

  @override
  Widget build(BuildContext context) {
    final c = CallScope.of(context);
    if (c == null) return const SizedBox.shrink();
    return IconButton(
      icon: const Icon(Icons.call_outlined),
      tooltip: tr(context, 'Call', 'Anrufen'),
      onPressed: c.state != CallState.idle
          ? null
          : () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => CallPickerPage(engine: c)),
            ),
    );
  }
}

class CallPickerPage extends StatefulWidget {
  const CallPickerPage({super.key, required this.engine});
  final CallEngine engine;

  @override
  State<CallPickerPage> createState() => _CallPickerPageState();
}

class _CallPickerPageState extends State<CallPickerPage> {
  List<StaffPerson>? _people;
  String? _error;
  bool _group = false;
  String _q = '';
  final Set<String> _roles = {};
  final Map<String, StaffPerson> _picked = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await loadCallableStaff(
        AppScope.read(context).pb.authStore.token,
      );
      if (mounted) setState(() => _people = list);
    } catch (e) {
      if (mounted) {
        setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _start(List<Map<String, dynamic>> targets, String title) async {
    Navigator.of(context).pop();
    await widget.engine.call(targets, title);
    if (widget.engine.error.isNotEmpty && mounted) {
      toast(context, widget.engine.error, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = (_people ?? [])
        .where(
          (p) =>
              q.isEmpty ||
              p.name.toLowerCase().contains(q) ||
              callRoleName(context, p.role).toLowerCase().contains(q),
        )
        .toList();
    final groups = [
      for (final r in _roleOrder)
        MapEntry(r, list.where((p) => p.role == r).toList()),
    ].where((e) => e.value.isNotEmpty).toList();
    final chosen = [
      ..._roles.map((r) => callRoleName(context, r)),
      ..._picked.values.map((p) => p.name),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'Call', 'Anrufen'))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                  value: false,
                  icon: const Icon(Icons.person),
                  label: Text(tr(context, 'One person', 'Eine Person')),
                ),
                ButtonSegment(
                  value: true,
                  icon: const Icon(Icons.groups),
                  label: Text(tr(context, 'Group', 'Gruppe')),
                ),
              ],
              selected: {_group},
              onSelectionChanged: (s) => setState(() => _group = s.first),
            ),
          ),
          if (_group)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr(context, 'Ring everyone in:', 'Alle anrufen bei:'),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Colors.black54,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      for (final r in [
                        'all',
                        ..._roleOrder.where((x) => x != 'auditor'),
                      ])
                        FilterChip(
                          label: Text(callRoleName(context, r)),
                          selected: _roles.contains(r),
                          selectedColor: const Color(0xFFD1FAE5),
                          onSelected: (v) => setState(
                            () => v ? _roles.add(r) : _roles.remove(r),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: TextField(
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: tr(
                  context,
                  'Search name or role…',
                  'Name oder Rolle suchen…',
                ),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          Expanded(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center),
                    ),
                  )
                : _people == null
                ? const Center(child: CircularProgressIndicator())
                : groups.isEmpty
                ? Center(
                    child: Text(
                      tr(context, 'Nobody found.', 'Niemand gefunden.'),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.only(bottom: 16),
                    children: [
                      for (final g in groups) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: Text(
                            callRoleName(context, g.key).toUpperCase(),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: Colors.black45,
                            ),
                          ),
                        ),
                        for (final p in g.value)
                          _group
                              ? CheckboxListTile(
                                  value: _picked.containsKey(p.id),
                                  title: Text(
                                    p.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  onChanged: (v) => setState(
                                    () => v == true
                                        ? _picked[p.id] = p
                                        : _picked.remove(p.id),
                                  ),
                                )
                              : ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: const Color(0xFFD1FAE5),
                                    child: Text(
                                      p.name.isEmpty
                                          ? '?'
                                          : p.name[0].toUpperCase(),
                                      style: const TextStyle(
                                        color: _green,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  title: Text(
                                    p.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  trailing: const Icon(
                                    Icons.call,
                                    color: _green,
                                  ),
                                  onTap: () => _start([
                                    {
                                      'type': 'user',
                                      'id': p.id,
                                      'name': p.name,
                                      'role': p.role,
                                    },
                                  ], p.name),
                                ),
                      ],
                    ],
                  ),
          ),
          if (_group)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: _green),
                    onPressed: chosen.isEmpty
                        ? null
                        : () => _start([
                            for (final r in _roles) {'type': 'role', 'role': r},
                            for (final p in _picked.values)
                              {
                                'type': 'user',
                                'id': p.id,
                                'name': p.name,
                                'role': p.role,
                              },
                          ], chosen.join(', ')),
                    icon: const Icon(Icons.call),
                    label: Text(
                      chosen.isEmpty
                          ? tr(context, 'Call', 'Anrufen')
                          : '${tr(context, 'Call', 'Anrufen')} (${chosen.join(', ')})',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
