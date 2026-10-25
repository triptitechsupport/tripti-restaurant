// Staff voice calls for one person, several people or whole roles.
// Signalling goes through PocketBase (call_rooms, call_members, call_signals);
// audio goes directly between devices (WebRTC, one connection per pair).
// Of each pair, the person with the smaller id sends the offer, so two people
// joining at the same moment still connect exactly once.
// The Android app (staff_flutter/lib/core/calls.dart) speaks the same protocol.

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const RING_MS = 45000;

function waitForIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 2500);
  });
}

export function ringTone(pattern = 'incoming') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return () => {};
    const ctx = new Ctx();
    let stopped = false;
    const beep = () => {
      if (stopped) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(pattern === 'incoming' ? 660 : 440, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(pattern === 'incoming' ? 0.35 : 0.12, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.62);
    };
    beep();
    const t = setInterval(beep, pattern === 'incoming' ? 1400 : 3000);
    return () => { stopped = true; clearInterval(t); setTimeout(() => ctx.close().catch(() => {}), 300); };
  } catch {
    return () => {};
  }
}

export function targetsMe(room, me) {
  if (!room || room.createdById === me.id) return false;
  const t = Array.isArray(room.targets) ? room.targets : [];
  return t.some((x) => (x.type === 'user' && x.id === me.id) || (x.type === 'role' && (x.role === 'all' || x.role === me.role)));
}

export class GroupCall {
  constructor({ pb, me, onChange }) {
    this.pb = pb;
    this.me = me;
    this.onChange = onChange || (() => {});
    this.state = 'idle'; // idle | incoming | in-call
    this.room = null;
    this.incoming = null;
    this.members = []; // call_members of the current room
    this.peers = new Map(); // userId -> { pc, audio }
    this.stream = null;
    this.muted = false;
    this.error = '';
    this.startedAt = null;
    this.unsubs = [];
    this.stopRing = null;
    this.timer = null;
  }

  emit() { this.onChange(this.snapshot()); }

  snapshot() {
    return {
      state: this.state,
      room: this.room,
      incoming: this.incoming,
      members: this.members,
      connected: [...this.peers.entries()].filter(([, p]) => p.pc.connectionState === 'connected').map(([id]) => id),
      muted: this.muted,
      error: this.error,
      startedAt: this.startedAt,
    };
  }

  async start() {
    const opts = { $autoCancel: false };
    this.unsubs.push(await this.pb.collection('call_rooms').subscribe('*', (e) => this.onRoom(e), opts));
    this.unsubs.push(await this.pb.collection('call_members').subscribe('*', (e) => this.onMember(e), opts));
    this.unsubs.push(await this.pb.collection('call_signals').subscribe('*', (e) => this.onSignal(e), opts));
    // A call that started a moment ago (for example while the page loaded).
    try {
      const since = new Date(Date.now() - 40000).toISOString().replace('T', ' ');
      const list = await this.pb.collection('call_rooms').getList(1, 10, { filter: this.pb.filter('status != "ended" && created >= {:s}', { s: since }), sort: '-created', ...opts });
      const r = list.items.find((x) => targetsMe(x, this.me));
      if (r) await this.ring(r);
    } catch { /* ignore */ }
  }

  stop() {
    this.unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    this.unsubs = [];
    if (this.state === 'in-call') this.leave();
    this.clearRing();
  }

  clearRing() {
    if (this.stopRing) { this.stopRing(); this.stopRing = null; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  async getMic() {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return this.stream;
  }

  micError(err) {
    return err?.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not use the microphone.';
  }

  // targets: [{type:'user', id, name, role} | {type:'role', role}]
  async call(targets, title) {
    if (this.state !== 'idle') return;
    this.error = '';
    try {
      await this.getMic();
    } catch (err) {
      this.error = this.micError(err);
      return this.emit();
    }
    const opts = { $autoCancel: false };
    try {
      this.room = await this.pb.collection('call_rooms').create({ createdById: this.me.id, createdByName: this.me.name, createdByRole: this.me.role, title: title || '', targets, status: 'ringing' }, opts);
      await this.pb.collection('call_members').create({ room: this.room.id, userId: this.me.id, name: this.me.name, role: this.me.role, state: 'joined' }, opts);
    } catch (err) {
      this.error = 'Could not start the call.';
      this.releaseMic();
      this.room = null;
      return this.emit();
    }
    this.state = 'in-call';
    this.members = [{ userId: this.me.id, name: this.me.name, role: this.me.role, state: 'joined' }];
    this.stopRing = ringTone('outgoing');
    // Nobody answered: end it.
    this.timer = setTimeout(() => {
      if (this.state === 'in-call' && !this.members.some((m) => m.userId !== this.me.id && m.state === 'joined')) this.leave();
    }, RING_MS);
    this.emit();
  }

  async ring(room) {
    if (this.state !== 'idle' || this.incoming) return;
    this.incoming = room;
    this.state = 'incoming';
    this.stopRing = ringTone('incoming');
    this.timer = setTimeout(() => { if (this.incoming?.id === room.id) { this.clearRing(); this.incoming = null; this.state = 'idle'; this.emit(); } }, RING_MS);
    this.emit();
  }

  async accept() {
    const room = this.incoming;
    if (!room) return;
    this.clearRing();
    this.error = '';
    try {
      await this.getMic();
    } catch (err) {
      this.error = this.micError(err);
      this.incoming = null;
      this.state = 'idle';
      return this.emit();
    }
    const opts = { $autoCancel: false };
    try {
      const fresh = await this.pb.collection('call_rooms').getOne(room.id, opts);
      if (fresh.status === 'ended') throw new Error('ended');
      this.room = fresh;
      this.incoming = null;
      this.state = 'in-call';
      await this.saveMyState('joined');
      if (fresh.status !== 'active') await this.pb.collection('call_rooms').update(fresh.id, { status: 'active' }, opts).catch(() => {});
      this.members = await this.pb.collection('call_members').getFullList({ filter: this.pb.filter('room = {:r}', { r: fresh.id }), ...opts });
      this.startedAt = Date.now();
      for (const m of this.members) if (m.state === 'joined') await this.ensurePeer(m.userId);
    } catch {
      this.error = 'The call has already ended.';
      this.incoming = null;
      this.room = null;
      this.state = 'idle';
      this.releaseMic();
    }
    this.emit();
  }

  async decline() {
    const room = this.incoming;
    this.clearRing();
    this.incoming = null;
    this.state = 'idle';
    this.emit();
    if (room) {
      await this.pb.collection('call_members').create({ room: room.id, userId: this.me.id, name: this.me.name, role: this.me.role, state: 'declined' }, { $autoCancel: false }).catch(() => {});
    }
  }

  async saveMyState(state) {
    const opts = { $autoCancel: false };
    const mine = await this.pb.collection('call_members').getList(1, 1, { filter: this.pb.filter('room = {:r} && userId = {:u}', { r: this.room.id, u: this.me.id }), ...opts });
    if (mine.items[0]) await this.pb.collection('call_members').update(mine.items[0].id, { state }, opts);
    else await this.pb.collection('call_members').create({ room: this.room.id, userId: this.me.id, name: this.me.name, role: this.me.role, state }, opts);
  }

  async leave() {
    const room = this.room;
    this.clearRing();
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.releaseMic();
    const others = this.members.filter((m) => m.userId !== this.me.id && m.state === 'joined');
    this.state = 'idle';
    this.room = null;
    this.members = [];
    this.startedAt = null;
    this.muted = false;
    this.emit();
    if (!room) return;
    const opts = { $autoCancel: false };
    try {
      this.room = room;
      await this.saveMyState('left');
    } catch { /* ignore */ }
    this.room = null;
    if (!others.length) await this.pb.collection('call_rooms').update(room.id, { status: 'ended' }, opts).catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !this.muted; });
    this.emit();
  }

  releaseMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  newPeer(userId) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    pc.ontrack = (ev) => { audio.srcObject = ev.streams[0]; audio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { this.clearRing(); if (!this.startedAt) this.startedAt = Date.now(); }
      this.emit();
    };
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    const peer = { pc, audio };
    this.peers.set(userId, peer);
    return peer;
  }

  closePeer(userId) {
    const p = this.peers.get(userId);
    if (!p) return;
    try { p.pc.close(); } catch { /* ignore */ }
    p.audio.srcObject = null;
    p.audio.remove();
    this.peers.delete(userId);
  }

  async ensurePeer(userId) {
    if (!this.room || userId === this.me.id || this.peers.has(userId)) return;
    if (!(this.me.id < userId)) return; // the other side sends the offer
    const { pc } = this.newPeer(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    await this.pb.collection('call_signals').create({ room: this.room.id, fromId: this.me.id, toId: userId, kind: 'offer', data: pc.localDescription.toJSON() }, { $autoCancel: false }).catch(() => {});
  }

  async onRoom(e) {
    const r = e.record;
    if (e.action === 'create') {
      if (r.status !== 'ended' && targetsMe(r, this.me)) await this.ring(r);
      return;
    }
    if (r.status === 'ended') {
      if (this.incoming?.id === r.id) { this.clearRing(); this.incoming = null; this.state = 'idle'; this.emit(); }
      else if (this.room?.id === r.id && this.state === 'in-call') this.leave();
    } else if (this.room?.id === r.id) {
      this.room = r;
      this.emit();
    }
  }

  async onMember(e) {
    const m = e.record;
    if (this.incoming?.id === m.room && m.userId === this.me.id && m.state !== 'joined') {
      // Answered or declined on another device of mine.
      this.clearRing(); this.incoming = null; this.state = 'idle'; this.emit();
      return;
    }
    if (!this.room || m.room !== this.room.id) return;
    const i = this.members.findIndex((x) => x.userId === m.userId);
    if (i >= 0) this.members[i] = m; else this.members.push(m);
    if (m.userId !== this.me.id) {
      if (m.state === 'joined') {
        this.clearRing();
        if (!this.startedAt) this.startedAt = Date.now();
        await this.ensurePeer(m.userId);
      } else {
        this.closePeer(m.userId);
        // Everyone else left: end the call.
        const target = (this.room.targets || []);
        const onePerson = target.length === 1 && target[0].type === 'user';
        if (!this.members.some((x) => x.userId !== this.me.id && x.state === 'joined') && (m.state === 'left' || onePerson)) this.leave();
      }
    }
    this.emit();
  }

  async onSignal(e) {
    const s = e.record;
    if (e.action !== 'create' || s.toId !== this.me.id || !this.room || s.room !== this.room.id) return;
    try {
      if (s.kind === 'offer') {
        this.closePeer(s.fromId);
        const { pc } = this.newPeer(s.fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(s.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIce(pc);
        await this.pb.collection('call_signals').create({ room: this.room.id, fromId: this.me.id, toId: s.fromId, kind: 'answer', data: pc.localDescription.toJSON() }, { $autoCancel: false });
      } else if (s.kind === 'answer') {
        const p = this.peers.get(s.fromId);
        if (p && !p.pc.currentRemoteDescription) await p.pc.setRemoteDescription(new RTCSessionDescription(s.data));
      }
    } catch (err) {
      console.error('[calls] signal', err);
    }
    this.emit();
  }
}
