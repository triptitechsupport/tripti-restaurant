import 'dart:async';

import 'package:flutter/material.dart';
import 'package:pocketbase/pocketbase.dart';

import '../../core/alert.dart';
import '../../core/chat.dart';
import '../../core/scope.dart';
import '../../core/store.dart';
import '../../core/theme.dart';
import 'widgets.dart';

String _peerLabel(BuildContext context, ChatPeer p) => p.isWaiter
    ? p.name
    : switch (p.role) {
        'kds' => tr(context, 'Kitchen', 'Küche'),
        'admin' => 'Admin',
        _ => tr(context, 'Waiters', 'Kellner'),
      };

/// Chat icon with the unread count; beeps when a message comes in.
class TeamChatButton extends StatefulWidget {
  const TeamChatButton({super.key, required this.role});

  /// 'waiter' or 'kds'.
  final String role;

  @override
  State<TeamChatButton> createState() => _TeamChatButtonState();
}

class _TeamChatButtonState extends State<TeamChatButton> {
  List<Map<String, dynamic>> _messages = [];
  UnsubscribeFunc? _unsub;
  bool _open = false;

  PocketBase get pb => AppScope.read(context).pb;
  String get me => AppScope.read(context).user?.id ?? '';

  @override
  void initState() {
    super.initState();
    _load();
    pb.collection('staff_messages').subscribe('*', (e) {
      final r = e.record?.toJson();
      if (r == null || !chatInvolvesMe(r, me, widget.role)) return;
      if (e.action == 'create' && chatIncoming(r, me, widget.role) && !_open) alertBeep();
      _load();
    }).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    if (me.isEmpty) return;
    try {
      final r = await pb.collection('staff_messages').getList(perPage: 200, sort: '-created', filter: chatFilter(me, widget.role));
      if (mounted) setState(() => _messages = r.items.map((e) => e.toJson()).toList());
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final unread = _messages.where((m) => m['read'] != true && chatIncoming(m, me, widget.role)).length;
    final alert = _messages.any((m) => m['read'] != true && m['isAlert'] == true && chatIncoming(m, me, widget.role));
    return IconButton(
      tooltip: tr(context, 'Team chat', 'Team-Chat'),
      icon: Badge(
        isLabelVisible: unread > 0,
        backgroundColor: alert ? TriptiColors.gold : null,
        label: Text('$unread'),
        child: const Icon(Icons.forum_outlined),
      ),
      onPressed: () async {
        _open = true;
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TeamChatPage(role: widget.role)));
        _open = false;
        _load();
      },
    );
  }
}

/// Chat with the kitchen, the admin or (from the kitchen) one waiter.
class TeamChatPage extends StatefulWidget {
  const TeamChatPage({super.key, required this.role});
  final String role;

  @override
  State<TeamChatPage> createState() => _TeamChatPageState();
}

class _TeamChatPageState extends State<TeamChatPage> {
  List<Map<String, dynamic>> _messages = [];
  List<Map<String, dynamic>> _waiters = [];
  late ChatPeer _peer;
  final _text = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  UnsubscribeFunc? _unsub;
  final Set<String> _marked = {};
  bool _picked = false;

  PocketBase get pb => AppScope.read(context).pb;
  String get me => AppScope.read(context).user?.id ?? '';
  List<ChatPeer> get _rolePeers => widget.role == 'waiter' ? const [ChatPeer.role('kds'), ChatPeer.role('admin')] : const [ChatPeer.role('admin')];

  @override
  void initState() {
    super.initState();
    _peer = _rolePeers.first;
    _load();
    if (widget.role != 'waiter') {
      pb.collection('waiter_users').getFullList(sort: 'username').then((r) {
        if (mounted) setState(() => _waiters = r.map((e) => e.toJson()).toList());
      }).catchError((_) {});
    }
    pb.collection('staff_messages').subscribe('*', (e) {
      final r = e.record?.toJson();
      if (r == null || !chatInvolvesMe(r, me, widget.role)) return;
      if (e.action == 'create' && chatIncoming(r, me, widget.role) && !chatInConversation(r, _peer, me, widget.role)) alertBeep();
      _load();
    }).then((u) => _unsub = u).catchError((_) => () async {});
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    if (me.isEmpty) return;
    try {
      final r = await pb.collection('staff_messages').getList(perPage: 300, sort: '-created', filter: chatFilter(me, widget.role));
      if (!mounted) return;
      setState(() => _messages = r.items.reversed.map((e) => e.toJson()).toList());
      if (!_picked) {
        _picked = true;
        _openUnread();
      }
      _markRead();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
      });
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
  }

  /// Opens the conversation that has the newest unread message.
  void _openUnread() {
    if (_unread(_peer) > 0) return;
    final m = _messages.reversed.where((m) => m['read'] != true && chatIncoming(m, me, widget.role)).firstOrNull;
    if (m == null) return;
    final from = '${m['senderRole'] ?? ''}';
    ChatPeer? p;
    if (from == 'waiter' && widget.role != 'waiter' && '${m['senderId'] ?? ''}'.isNotEmpty) {
      p = ChatPeer.waiter('${m['senderId']}', '${m['senderName'] ?? ''}');
    } else {
      p = _rolePeers.where((r) => r.role == from).firstOrNull;
    }
    if (p != null && chatInConversation(m, p, me, widget.role)) setState(() => _peer = p!);
  }

  void _markRead() {
    for (final m in _messages) {
      if (m['read'] != true && chatIncoming(m, me, widget.role) && chatInConversation(m, _peer, me, widget.role) && _marked.add('${m['id']}')) {
        pb.collection('staff_messages').update(m['id'], body: {'read': true}).catchError((_) => RecordModel());
      }
    }
  }

  int _unread(ChatPeer p) => _messages.where((m) => m['read'] != true && !_marked.contains(m['id']) && chatIncoming(m, me, widget.role) && chatInConversation(m, p, me, widget.role)).length;

  Future<void> _send({String? text, List<String>? roles, bool alert = false}) async {
    final content = (text ?? _text.text).trim();
    if (content.isEmpty || _sending) return;
    final session = AppScope.read(context);
    setState(() => _sending = true);
    final targets = roles != null ? [for (final r in roles) ChatPeer.role(r)] : [_peer];
    final ok = await runAction(context, () async {
      for (final t in targets) {
        await pb.collection('staff_messages').create(body: {
          'senderRole': widget.role,
          'recipientRole': t.role,
          'senderId': me,
          'recipientId': t.waiterId,
          'senderName': session.displayName,
          'content': content,
          'read': false,
          if (alert) 'isAlert': true,
        });
      }
    }, done: alert ? tr(context, 'Alert sent', 'Alarm gesendet') : null);
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok && text == null) _text.clear();
    if (ok) _load();
  }

  Future<void> _quickAlert() async {
    final ctl = TextEditingController();
    var to = 'both';
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(tr(context, 'Quick alert', 'Schnell-Alarm')),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'both', label: Text(tr(context, 'Both', 'Beide'))),
                ButtonSegment(value: 'kds', label: Text(tr(context, 'Kitchen', 'Küche'))),
                const ButtonSegment(value: 'admin', label: Text('Admin')),
              ],
              selected: {to},
              onSelectionChanged: (v) => set(() => to = v.first),
            ),
            const SizedBox(height: 10),
            TextField(controller: ctl, autofocus: true, decoration: InputDecoration(hintText: tr(context, 'e.g. Need help at table 5', 'z. B. Brauche Hilfe an Tisch 5'))),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr(context, 'Cancel', 'Abbrechen'))),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: TriptiColors.red), onPressed: () => Navigator.pop(ctx, true), child: Text(tr(context, 'Send alert', 'Alarm senden'))),
          ],
        ),
      ),
    );
    if (go != true || ctl.text.trim().isEmpty) return;
    await _send(text: ctl.text, roles: to == 'both' ? ['kds', 'admin'] : [to], alert: true);
  }

  @override
  Widget build(BuildContext context) {
    final conv = _messages.where((m) => chatInConversation(m, _peer, me, widget.role)).toList();
    final waiterPeers = [
      for (final w in _waiters)
        ChatPeer.waiter('${w['id']}', '${w['displayName'] ?? ''}'.isNotEmpty ? '${w['displayName']}' : '${w['username'] ?? 'Waiter'}'),
    ];
    // Waiters who wrote or got a message come first.
    final talked = {for (final m in _messages) ...[m['senderId'], m['recipientId']]};
    waiterPeers.sort((a, b) {
      final d = (talked.contains(b.waiterId) ? 1 : 0) - (talked.contains(a.waiterId) ? 1 : 0);
      return d != 0 ? d : a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Team chat', 'Team-Chat')),
        actions: [
          if (widget.role == 'waiter')
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: _quickAlert,
              icon: const Icon(Icons.campaign_outlined),
              label: Text(tr(context, 'Alert', 'Alarm')),
            ),
        ],
      ),
      body: Column(children: [
        SizedBox(
          height: 54,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(10, 8, 10, 6), children: [
            for (final p in [..._rolePeers, ...waiterPeers])
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  avatar: p.isWaiter ? const Icon(Icons.person_outline, size: 16) : null,
                  label: Text(_unread(p) > 0 ? '${_peerLabel(context, p)} (${_unread(p)})' : _peerLabel(context, p)),
                  selected: p.key == _peer.key,
                  onSelected: (_) {
                    setState(() => _peer = p);
                    _markRead();
                  },
                ),
              ),
          ]),
        ),
        const Divider(height: 1),
        Expanded(
          child: conv.isEmpty
              ? EmptyState(Icons.forum_outlined, tr(context, 'No messages yet. Say hello.', 'Noch keine Nachrichten.'))
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(12),
                  itemCount: conv.length,
                  itemBuilder: (_, i) => _bubble(conv[i]),
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 6, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(hintText: '${tr(context, 'Message to', 'Nachricht an')} ${_peerLabel(context, _peer)}'),
                ),
              ),
              IconButton.filled(
                onPressed: _sending ? null : () => _send(),
                icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _bubble(Map<String, dynamic> m) {
    final mine = me.isNotEmpty ? m['senderId'] == me : m['senderRole'] == widget.role;
    final alert = m['isAlert'] == true;
    final color = alert ? const Color(0xFFFEE2E2) : (mine ? TriptiColors.primary : Colors.white);
    final fg = mine && !alert ? Colors.white : TriptiColors.ink;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: alert ? TriptiColors.red : TriptiColors.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (!mine || alert)
            Text('${alert ? '${tr(context, 'ALERT', 'ALARM')} · ' : ''}${'${m['senderName'] ?? ''}'.isNotEmpty ? m['senderName'] : m['senderRole']}',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: alert ? TriptiColors.red : fg.withValues(alpha: 0.8))),
          Text('${m['content'] ?? ''}', style: TextStyle(color: fg, fontSize: 15)),
          Align(alignment: Alignment.bottomRight, child: Text(timeOf(parseDate(m['created'])?.toLocal()), style: TextStyle(fontSize: 10.5, color: fg.withValues(alpha: 0.7)))),
        ]),
      ),
    );
  }
}
