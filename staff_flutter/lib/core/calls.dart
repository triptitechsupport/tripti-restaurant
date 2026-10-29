import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'package:pocketbase/pocketbase.dart';

import 'config.dart';
import 'session.dart';

/// Staff voice calls: one person, several people or whole roles.
/// Same protocol as the website (apps/web/src/lib/groupCall.js):
/// call_rooms (who rings), call_members (joined / left / declined),
/// call_signals (WebRTC offer/answer). One connection per pair; of each
/// pair the smaller user id sends the offer.

/// Fallback when the server's /calls/ice list can't be loaded. Without a
/// TURN relay from the server, audio only works when both phones can reach
/// each other directly.
const _ice = [
  {'urls': 'stun:stun.l.google.com:19302'},
  {'urls': 'stun:stun1.l.google.com:19302'},
];
const _audioWait = Duration(seconds: 15);
const _ringFor = Duration(seconds: 45);
const _sound = MethodChannel('tripti/sound');

String roleKey(StaffRole? r) {
  switch (r) {
    case StaffRole.admin:
      return 'admin';
    case StaffRole.waiter:
      return 'waiter';
    case StaffRole.cashier:
      return 'cashier';
    case StaffRole.kitchen:
      return 'kitchen';
    case StaffRole.kitchenManager:
      return 'kitchen_manager';
    case StaffRole.stock:
      return 'stock';
    case StaffRole.auditor:
      return 'auditor';
    default:
      return '';
  }
}

/// Someone who can be called.
class StaffPerson {
  StaffPerson(this.id, this.name, this.role);
  final String id;
  final String name;
  final String role;
}

/// Everyone the signed-in person can call (server: GET /api/calls/staff).
Future<List<StaffPerson>> loadCallableStaff(String token) async {
  final r = await http
      .get(
        Uri.parse('${AppConfig.apiUrl}/calls/staff'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      )
      .timeout(const Duration(seconds: 20));
  final d = jsonDecode(utf8.decode(r.bodyBytes));
  if (r.statusCode >= 300) {
    throw Exception(
      d is Map
          ? d['message'] ?? 'Error ${r.statusCode}'
          : 'Error ${r.statusCode}',
    );
  }
  return [
    for (final p in (d['people'] as List? ?? []))
      StaffPerson('${p['id']}', '${p['name']}', '${p['role']}'),
  ];
}

class CallMember {
  CallMember(this.userId, this.name, this.role, this.state)
    : joinedAt = state == 'joined' ? DateTime.now() : null;
  final String userId;
  final String name;
  final String role;
  String state;
  DateTime? joinedAt;
}

enum CallState { idle, incoming, inCall }

class _Peer {
  _Peer(this.pc);
  final RTCPeerConnection pc;
  final DateTime since = DateTime.now();
  bool connected = false;
  bool failed = false;
  Timer? check;
}

class CallEngine extends ChangeNotifier {
  CallEngine(
    this.pb, {
    required this.myId,
    required this.myName,
    required this.myRole,
  });

  final PocketBase pb;
  final String myId;
  final String myName;
  final String myRole;

  CallState state = CallState.idle;
  RecordModel? room;
  RecordModel? incoming;
  final List<CallMember> members = [];
  final Map<String, _Peer> _peers = {};
  MediaStream? _stream;
  bool muted = false;
  bool speaker = true;
  String error = '';
  DateTime? startedAt;
  final List<UnsubscribeFunc> _subs = [];
  Timer? _timer;
  bool _ringing = false;
  bool _disposed = false;

  List<Map<String, dynamic>>? _iceServers;

  /// True when the server gave a TURN relay (audio works on any network).
  bool relay = false;

  bool isConnected(String userId) => _peers[userId]?.connected ?? false;

  /// A joined person whose audio did not get through (network blocks it).
  bool noAudio(String userId) {
    final p = _peers[userId];
    final now = DateTime.now();
    if (p != null) {
      return p.failed || (!p.connected && now.difference(p.since) > _audioWait);
    }
    final m = members.where((x) => x.userId == userId).firstOrNull;
    final at = m?.state == 'joined' ? m?.joinedAt : null;
    return at != null && now.difference(at) > _audioWait;
  }

  bool get anyConnected => _peers.values.any((p) => p.connected);
  bool get anyNoAudio =>
      others.any((m) => m.state == 'joined' && noAudio(m.userId));

  Future<void> _prepareIce() async {
    if (_iceServers != null) return;
    try {
      final r = await http
          .get(
            Uri.parse('${AppConfig.apiUrl}/calls/ice'),
            headers: {
              'Authorization': 'Bearer ${pb.authStore.token}',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 10));
      if (r.statusCode >= 300) return;
      final d = jsonDecode(utf8.decode(r.bodyBytes));
      final list = d is Map ? d['iceServers'] : null;
      if (list is List && list.isNotEmpty) {
        _iceServers = [
          for (final x in list)
            if (x is Map) Map<String, dynamic>.from(x),
        ];
        relay = d['relay'] == true;
      }
    } catch (_) {}
  }

  List<CallMember> get others =>
      members.where((m) => m.userId != myId).toList();
  bool get anyoneJoined => others.any((m) => m.state == 'joined');

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> start() async {
    _subs.add(await pb.collection('call_rooms').subscribe('*', _onRoom));
    _subs.add(await pb.collection('call_members').subscribe('*', _onMember));
    _subs.add(await pb.collection('call_signals').subscribe('*', _onSignal));
    try {
      final since = DateTime.now()
          .toUtc()
          .subtract(const Duration(seconds: 40))
          .toIso8601String()
          .replaceFirst('T', ' ');
      final list = await pb
          .collection('call_rooms')
          .getList(
            page: 1,
            perPage: 10,
            sort: '-created',
            filter: pb.filter('status != "ended" && created >= {:s}', {
              's': since,
            }),
          );
      for (final r in list.items) {
        if (_targetsMe(r)) {
          _ring(r);
          break;
        }
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _disposed = true;
    for (final u in _subs) {
      u().catchError((_) {});
    }
    if (state == CallState.inCall) leave();
    _clearRing();
    super.dispose();
  }

  bool _targetsMe(RecordModel r) {
    if (r.getStringValue('createdById') == myId) return false;
    final t = r.data['targets'];
    if (t is! List) return false;
    return t.any(
      (x) =>
          x is Map &&
          ((x['type'] == 'user' && x['id'] == myId) ||
              (x['type'] == 'role' &&
                  (x['role'] == 'all' || x['role'] == myRole))),
    );
  }

  Future<void> _startRing(bool incomingCall) async {
    _ringing = true;
    if (kIsWeb) return;
    try {
      if (incomingCall) await _sound.invokeMethod('ring');
    } catch (_) {}
  }

  void _clearRing() {
    _timer?.cancel();
    _timer = null;
    if (_ringing && !kIsWeb) {
      _sound.invokeMethod('stopRing').catchError((_) => null);
    }
    _ringing = false;
  }

  Future<MediaStream> _mic() async {
    final s =
        _stream ??
        await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': false,
        });
    _stream = s;
    return s;
  }

  void _releaseMic() {
    for (final t in _stream?.getTracks() ?? <MediaStreamTrack>[]) {
      t.stop();
    }
    _stream?.dispose();
    _stream = null;
  }

  /// targets: [{'type':'user','id':..,'name':..,'role':..} | {'type':'role','role':..}]
  Future<void> call(List<Map<String, dynamic>> targets, String title) async {
    if (state != CallState.idle || targets.isEmpty) return;
    error = '';
    try {
      await _mic();
    } catch (_) {
      error = 'Microphone permission denied.';
      _emit();
      return;
    }
    await _prepareIce();
    try {
      room = await pb
          .collection('call_rooms')
          .create(
            body: {
              'createdById': myId,
              'createdByName': myName,
              'createdByRole': myRole,
              'title': title,
              'targets': targets,
              'status': 'ringing',
            },
          );
      await pb
          .collection('call_members')
          .create(
            body: {
              'room': room!.id,
              'userId': myId,
              'name': myName,
              'role': myRole,
              'state': 'joined',
            },
          );
    } catch (_) {
      error = 'Could not start the call.';
      room = null;
      _releaseMic();
      _emit();
      return;
    }
    state = CallState.inCall;
    members
      ..clear()
      ..add(CallMember(myId, myName, myRole, 'joined'));
    await _applySpeaker();
    _startRing(false);
    _timer = Timer(_ringFor, () {
      if (state == CallState.inCall && !anyoneJoined) leave();
    });
    _emit();
  }

  void _ring(RecordModel r) {
    if (state != CallState.idle || incoming != null) return;
    incoming = r;
    state = CallState.incoming;
    _startRing(true);
    _timer = Timer(_ringFor, () {
      if (incoming?.id == r.id) {
        _clearRing();
        incoming = null;
        state = CallState.idle;
        _emit();
      }
    });
    _emit();
  }

  Future<void> accept() async {
    final r = incoming;
    if (r == null) return;
    _clearRing();
    error = '';
    try {
      await _mic();
    } catch (_) {
      error = 'Microphone permission denied.';
      incoming = null;
      state = CallState.idle;
      _emit();
      return;
    }
    await _prepareIce();
    try {
      final fresh = await pb.collection('call_rooms').getOne(r.id);
      if (fresh.getStringValue('status') == 'ended') throw Exception('ended');
      room = fresh;
      incoming = null;
      state = CallState.inCall;
      await _saveMyState('joined');
      if (fresh.getStringValue('status') != 'active') {
        await pb
            .collection('call_rooms')
            .update(fresh.id, body: {'status': 'active'})
            .catchError((_) => fresh);
      }
      final list = await pb
          .collection('call_members')
          .getFullList(filter: pb.filter('room = {:r}', {'r': fresh.id}));
      members
        ..clear()
        ..addAll(
          list.map(
            (m) => CallMember(
              m.getStringValue('userId'),
              m.getStringValue('name'),
              m.getStringValue('role'),
              m.getStringValue('state'),
            ),
          ),
        );
      startedAt = DateTime.now();
      await _applySpeaker();
      for (final m in List.of(members)) {
        if (m.state == 'joined') await _ensurePeer(m.userId);
      }
    } catch (_) {
      error = 'The call has already ended.';
      incoming = null;
      room = null;
      state = CallState.idle;
      _releaseMic();
    }
    _emit();
  }

  Future<void> decline() async {
    final r = incoming;
    _clearRing();
    incoming = null;
    state = CallState.idle;
    _emit();
    if (r != null) {
      await pb
          .collection('call_members')
          .create(
            body: {
              'room': r.id,
              'userId': myId,
              'name': myName,
              'role': myRole,
              'state': 'declined',
            },
          )
          .catchError((_) => RecordModel());
    }
  }

  Future<void> _saveMyState(String s) async {
    final mine = await pb
        .collection('call_members')
        .getList(
          page: 1,
          perPage: 1,
          filter: pb.filter('room = {:r} && userId = {:u}', {
            'r': room!.id,
            'u': myId,
          }),
        );
    if (mine.items.isNotEmpty) {
      await pb
          .collection('call_members')
          .update(mine.items.first.id, body: {'state': s});
    } else {
      await pb
          .collection('call_members')
          .create(
            body: {
              'room': room!.id,
              'userId': myId,
              'name': myName,
              'role': myRole,
              'state': s,
            },
          );
    }
  }

  Future<void> leave() async {
    final r = room;
    _clearRing();
    for (final id in List.of(_peers.keys)) {
      await _closePeer(id);
    }
    _releaseMic();
    final othersJoined = anyoneJoined;
    state = CallState.idle;
    members.clear();
    startedAt = null;
    muted = false;
    _iceServers = null;
    _emit();
    if (r == null) return;
    try {
      await _saveMyState('left');
    } catch (_) {}
    room = null;
    if (!othersJoined) {
      await pb
          .collection('call_rooms')
          .update(r.id, body: {'status': 'ended'})
          .catchError((_) => r);
    }
    _emit();
  }

  void toggleMute() {
    muted = !muted;
    for (final t in _stream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
    _emit();
  }

  Future<void> toggleSpeaker() async {
    speaker = !speaker;
    await _applySpeaker();
    _emit();
  }

  Future<void> _applySpeaker() async {
    if (kIsWeb) return;
    try {
      await Helper.setSpeakerphoneOn(speaker);
    } catch (_) {}
  }

  Future<_Peer> _newPeer(String userId) async {
    final pc = await createPeerConnection({
      'iceServers': _iceServers ?? _ice,
      'sdpSemantics': 'unified-plan',
    });
    final peer = _Peer(pc);
    pc.onConnectionState = (s) {
      peer.connected =
          s == RTCPeerConnectionState.RTCPeerConnectionStateConnected;
      peer.failed = s == RTCPeerConnectionState.RTCPeerConnectionStateFailed;
      if (peer.connected) {
        _clearRing();
        startedAt ??= DateTime.now();
        // Android picks the audio route when the sound starts; set it again.
        _applySpeaker();
      }
      _emit();
    };
    peer.check = Timer(_audioWait + const Duration(milliseconds: 200), _emit);
    final s = _stream;
    if (s != null) {
      for (final t in s.getTracks()) {
        await pc.addTrack(t, s);
      }
    }
    _peers[userId] = peer;
    return peer;
  }

  Future<void> _closePeer(String userId) async {
    final p = _peers.remove(userId);
    if (p == null) return;
    p.check?.cancel();
    try {
      await p.pc.close();
    } catch (_) {}
  }

  Future<void> _waitForIce(RTCPeerConnection pc) async {
    final done = Completer<void>();
    if (pc.iceGatheringState ==
        RTCIceGatheringState.RTCIceGatheringStateComplete) {
      return;
    }
    pc.onIceGatheringState = (s) {
      if (s == RTCIceGatheringState.RTCIceGatheringStateComplete &&
          !done.isCompleted) {
        done.complete();
      }
    };
    await done.future.timeout(
      const Duration(milliseconds: 4000),
      onTimeout: () {},
    );
  }

  Future<Map<String, dynamic>> _local(RTCPeerConnection pc) async {
    final d = await pc.getLocalDescription();
    return {'type': d?.type, 'sdp': d?.sdp};
  }

  Future<void> _ensurePeer(String userId) async {
    final r = room;
    if (r == null || userId == myId || _peers.containsKey(userId)) return;
    if (myId.compareTo(userId) >= 0) return; // the other side sends the offer
    final p = await _newPeer(userId);
    final offer = await p.pc.createOffer({'offerToReceiveAudio': true});
    await p.pc.setLocalDescription(offer);
    await _waitForIce(p.pc);
    await pb
        .collection('call_signals')
        .create(
          body: {
            'room': r.id,
            'fromId': myId,
            'toId': userId,
            'kind': 'offer',
            'data': await _local(p.pc),
          },
        )
        .catchError((_) => RecordModel());
  }

  void _onRoom(RecordSubscriptionEvent e) {
    final r = e.record;
    if (r == null) return;
    final status = r.getStringValue('status');
    if (e.action == 'create') {
      if (status != 'ended' && _targetsMe(r)) _ring(r);
      return;
    }
    if (status == 'ended') {
      if (incoming?.id == r.id) {
        _clearRing();
        incoming = null;
        state = CallState.idle;
        _emit();
      } else if (room?.id == r.id && state == CallState.inCall) {
        leave();
      }
    } else if (room?.id == r.id) {
      room = r;
      _emit();
    }
  }

  Future<void> _onMember(RecordSubscriptionEvent e) async {
    final m = e.record;
    if (m == null) return;
    final roomId = m.getStringValue('room');
    final uid = m.getStringValue('userId');
    final st = m.getStringValue('state');
    if (incoming?.id == roomId && uid == myId && st != 'joined') {
      _clearRing();
      incoming = null;
      state = CallState.idle;
      _emit();
      return;
    }
    if (room == null || roomId != room!.id) return;
    final i = members.indexWhere((x) => x.userId == uid);
    if (i >= 0) {
      final was = members[i].state;
      members[i].state = st;
      if (st == 'joined' && was != 'joined') {
        members[i].joinedAt = DateTime.now();
      }
    } else {
      members.add(
        CallMember(uid, m.getStringValue('name'), m.getStringValue('role'), st),
      );
    }
    if (uid != myId) {
      if (st == 'joined') {
        _clearRing();
        startedAt ??= DateTime.now();
        Timer(_audioWait + const Duration(milliseconds: 200), _emit);
        await _ensurePeer(uid);
      } else {
        await _closePeer(uid);
        final t = room!.data['targets'];
        final onePerson =
            t is List &&
            t.length == 1 &&
            t.first is Map &&
            t.first['type'] == 'user';
        if (!anyoneJoined && (st == 'left' || onePerson)) {
          await leave();
          return;
        }
      }
    }
    _emit();
  }

  Future<void> _onSignal(RecordSubscriptionEvent e) async {
    final s = e.record;
    if (e.action != 'create' || s == null || room == null) return;
    if (s.getStringValue('toId') != myId ||
        s.getStringValue('room') != room!.id) {
      return;
    }
    final from = s.getStringValue('fromId');
    final data = s.data['data'];
    if (data is! Map) return;
    final desc = RTCSessionDescription('${data['sdp']}', '${data['type']}');
    try {
      if (s.getStringValue('kind') == 'offer') {
        await _closePeer(from);
        final p = await _newPeer(from);
        await p.pc.setRemoteDescription(desc);
        final answer = await p.pc.createAnswer({'offerToReceiveAudio': true});
        await p.pc.setLocalDescription(answer);
        await _waitForIce(p.pc);
        await pb
            .collection('call_signals')
            .create(
              body: {
                'room': room!.id,
                'fromId': myId,
                'toId': from,
                'kind': 'answer',
                'data': await _local(p.pc),
              },
            );
      } else {
        final p = _peers[from];
        if (p != null && await p.pc.getRemoteDescription() == null) {
          await p.pc.setRemoteDescription(desc);
        }
      }
    } catch (err) {
      debugPrint('[calls] signal $err');
    }
    _emit();
  }
}
