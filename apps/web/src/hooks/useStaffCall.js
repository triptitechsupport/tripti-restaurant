import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ROLE_LABEL = { admin: 'Admin', waiter: 'Waiter', kds: 'Kitchen (KDS)' };

function waitForIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // Fallback so we never hang forever waiting on ICE gathering.
    setTimeout(resolve, 2500);
  });
}

function playRing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    let stopped = false;
    const beep = () => {
      if (stopped) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(660, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.62);
    };
    beep();
    const interval = setInterval(beep, 1400);
    return () => {
      stopped = true;
      clearInterval(interval);
      setTimeout(() => ctx.close().catch(() => {}), 300);
    };
  } catch (_) {
    return null;
  }
}

/**
 * WebRTC voice-call between staff users (admin/waiter/kds) using PocketBase
 * `staff_calls` records for signaling (non-trickle ICE).
 *
 * Calls are USER-SPECIFIC: when callerId/calleeId are set, only the targeted
 * user's device rings. Role-based calls (admin <-> kds, waiter -> admin/kds
 * broadcast) leave calleeId empty and ring every user of the callee role,
 * preserving the previous behaviour for those peers.
 *
 * @param {string} role       - current user's role
 * @param {string} userId     - current user's auth record id
 * @param {object} pbClient   - PocketBase client for this session
 * @param {string} displayName- name shown to other staff
 */
export default function useStaffCall({ role, userId, pbClient, displayName }) {
  // 'idle' | 'calling' | 'ringing' (incoming) | 'connected'
  const [callState, setCallState] = useState('idle');
  const [peerRole, setPeerRole] = useState(null);
  const [peerName, setPeerName] = useState('');
  const [incoming, setIncoming] = useState(null); // {id, callerRole, callerName}
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callIdRef = useRef(null);
  const connectedAtRef = useRef(null);
  const ringStopRef = useRef(null);
  const timerRef = useRef(null);

  // ensure a hidden audio element for remote playback
  useEffect(() => {
    let el = document.getElementById('staff-call-remote-audio');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'staff-call-remote-audio';
      el.autoplay = true;
      el.playsInline = true;
      document.body.appendChild(el);
    }
    remoteAudioRef.current = el;
  }, []);

  const stopRing = useCallback(() => {
    if (ringStopRef.current) {
      ringStopRef.current();
      ringStopRef.current = null;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    stopRing();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (_) { /* noop */ }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, [stopRing]);

  const resetState = useCallback(() => {
    cleanupMedia();
    callIdRef.current = null;
    connectedAtRef.current = null;
    setCallState('idle');
    setPeerRole(null);
    setPeerName('');
    setMuted(false);
    setDuration(0);
  }, [cleanupMedia]);

  const buildPc = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.ontrack = (ev) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = ev.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // remote gone
      }
    };
    return pc;
  }, []);

  const getMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startDurationTimer = useCallback(() => {
    connectedAtRef.current = Date.now();
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
  }, []);

  // ---- Outgoing call ----
  // target = { role, id, name } — id is empty for role-based peers
  // (admin <-> kds, waiter -> admin/kds) and a specific user id for a
  // single waiter so only that waiter rings.
  const startCall = useCallback(async (target) => {
    if (callState !== 'idle') return;
    if (!target || !target.role) return;
    setError('');
    try {
      setCallState('calling');
      setPeerRole(target.role);
      setPeerName(target.name || ROLE_LABEL[target.role] || '');
      const pc = buildPc();
      pcRef.current = pc;
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const rec = await pbClient.collection('staff_calls').create(
        {
          callerRole: role,
          calleeRole: target.role,
          callerId: userId || '',
          calleeId: target.id || '',
          callerName: displayName || ROLE_LABEL[role],
          status: 'ringing',
          offer: pc.localDescription.toJSON(),
        },
        { $autoCancel: false }
      );
      callIdRef.current = rec.id;
      ringStopRef.current = playRing();
    } catch (err) {
      console.error('[StaffCall] startCall failed', err);
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not start call.');
      resetState();
    }
  }, [callState, buildPc, getMic, pbClient, role, userId, displayName, resetState]);

  // ---- Accept incoming ----
  const acceptCall = useCallback(async () => {
    if (!incoming) return;
    stopRing();
    setError('');
    try {
      const rec = await pbClient.collection('staff_calls').getOne(incoming.id, { $autoCancel: false });
      if (rec.status !== 'ringing') { setIncoming(null); return; }
      setPeerRole(incoming.callerRole);
      setPeerName(incoming.callerName || ROLE_LABEL[incoming.callerRole] || '');
      const pc = buildPc();
      pcRef.current = pc;
      const stream = await getMic();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(rec.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      callIdRef.current = incoming.id;
      await pbClient.collection('staff_calls').update(
        incoming.id,
        { status: 'connected', answer: pc.localDescription.toJSON() },
        { $autoCancel: false }
      );
      setIncoming(null);
      setCallState('connected');
      startDurationTimer();
    } catch (err) {
      console.error('[StaffCall] acceptCall failed', err);
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not answer call.');
      setIncoming(null);
      resetState();
    }
  }, [incoming, pbClient, buildPc, getMic, startDurationTimer, resetState, stopRing]);

  const declineCall = useCallback(async () => {
    if (!incoming) return;
    const id = incoming.id;
    setIncoming(null);
    stopRing();
    try {
      await pbClient.collection('staff_calls').update(id, { status: 'declined' }, { $autoCancel: false });
    } catch (_) { /* noop */ }
  }, [incoming, pbClient, stopRing]);

  const endCall = useCallback(async () => {
    const id = callIdRef.current;
    const dur = connectedAtRef.current
      ? Math.floor((Date.now() - connectedAtRef.current) / 1000)
      : 0;
    resetState();
    if (id) {
      try {
        await pbClient.collection('staff_calls').update(
          id,
          { status: 'ended', durationSec: dur },
          { $autoCancel: false }
        );
      } catch (_) { /* noop */ }
    }
  }, [pbClient, resetState]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
      }
      return next;
    });
  }, []);

  // A staff_calls record is relevant to me if I'm the targeted callee user,
  // or (for role-based calls) I belong to the callee role, or I'm the caller.
  const callInvolvesMe = useCallback((r) => {
    if (r.callerId && r.callerId === userId) return true;
    if (r.calleeId) return r.calleeId === userId;
    // role-based call (no calleeId)
    return r.calleeRole === role || r.callerRole === role;
  }, [userId, role]);

  // ---- Signaling subscription ----
  useEffect(() => {
    let unsub = null;
    pbClient
      .collection('staff_calls')
      .subscribe('*', async (e) => {
        const r = e.record;
        if (!callInvolvesMe(r)) return;

        if (e.action === 'create') {
          // incoming call to me (and I'm the callee, not the caller)
          if (r.calleeRole === role && r.status === 'ringing' && !(r.callerId && r.callerId === userId)) {
            if (callState === 'idle' && !incoming) {
              setIncoming({ id: r.id, callerRole: r.callerRole, callerName: r.callerName });
              ringStopRef.current = playRing();
            } else {
              // busy -> auto decline
              pbClient.collection('staff_calls')
                .update(r.id, { status: 'declined' }, { $autoCancel: false })
                .catch(() => {});
            }
          }
          return;
        }

        if (e.action === 'update') {
          // my outgoing call got answered
          if (r.id === callIdRef.current && r.callerId === userId) {
            if (r.status === 'connected' && r.answer && pcRef.current
                && !pcRef.current.currentRemoteDescription) {
              try {
                stopRing();
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(r.answer));
                setCallState('connected');
                startDurationTimer();
              } catch (err) {
                console.error('[StaffCall] set answer failed', err);
              }
            } else if (['declined', 'ended', 'missed'].includes(r.status)) {
              resetState();
            }
          }
          // active connected call ended by the other party
          else if (r.id === callIdRef.current && ['ended', 'declined'].includes(r.status)) {
            resetState();
          }
          // incoming call was cancelled by caller before I answered
          else if (incoming && r.id === incoming.id && r.status !== 'ringing') {
            setIncoming(null);
            stopRing();
          }
        }
      })
      .then((fn) => { unsub = fn; })
      .catch((err) => console.error('[StaffCall] subscribe failed', err));

    return () => {
      if (typeof unsub === 'function') unsub();
      else pbClient.collection('staff_calls').unsubscribe('*');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId, pbClient, callState, incoming, callInvolvesMe]);

  // cleanup on unmount
  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  return {
    callState,
    peerRole,
    peerName,
    incoming,
    muted,
    duration,
    error,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    clearError: () => setError(''),
  };
}
