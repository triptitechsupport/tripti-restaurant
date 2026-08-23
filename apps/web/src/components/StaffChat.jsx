import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, X, Send, Volume2, VolumeX, Phone, PhoneOff, PhoneCall, Mic, MicOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import useStaffCall from '@/hooks/useStaffCall';

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const ROLE_META = {
  admin: { label: 'Admin', cls: 'bg-primary text-primary-foreground' },
  waiter: { label: 'Waiter', cls: 'bg-secondary text-secondary-foreground' },
  kds: { label: 'Kitchen (KDS)', cls: 'bg-emerald-600 text-white' },
};

const OTHER_ROLES = {
  admin: ['waiter', 'kds'],
  waiter: ['admin', 'kds'],
  kds: ['admin', 'waiter'],
};

const SOUND_KEY = 'staff_chat_sound_v1';

function playPing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1180, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.42);
    setTimeout(() => ctx.close(), 700);
  } catch (_) { /* ignore */ }
}

function fmtTime(str) {
  try {
    return new Date(str).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

/**
 * Floating real-time chat widget shared by Admin, Waiter and KDS dashboards.
 * @param {'admin'|'waiter'|'kds'} role  - current user's role
 * @param {object} pbClient              - the PocketBase client for this session
 * @param {string} displayName           - name shown to other staff
 */
export default function StaffChat({ role, pbClient, displayName }) {
  const [open, setOpen] = useState(false);
  const [activePeer, setActivePeer] = useState(OTHER_ROLES[role][0]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (_) { return true; }
  });
  const scrollRef = useRef(null);
  const openRef = useRef(open);
  const activePeerRef = useRef(activePeer);
  openRef.current = open;
  activePeerRef.current = activePeer;

  const peers = OTHER_ROLES[role];

  const call = useStaffCall({ role, pbClient, displayName });

  const loadMessages = useCallback(async () => {
    try {
      const filter = `senderRole = "${role}" || recipientRole = "${role}"`;
      const res = await pbClient.collection('staff_messages').getFullList({
        sort: 'created',
        filter,
        $autoCancel: false,
      });
      setMessages(res);
    } catch (err) {
      console.error('[StaffChat] load failed', err);
    }
  }, [pbClient, role]);

  useEffect(() => {
    loadMessages();
    let unsub = null;
    pbClient
      .collection('staff_messages')
      .subscribe('*', (e) => {
        const r = e.record;
        const involvesMe = r.senderRole === role || r.recipientRole === role;
        if (!involvesMe) return;
        setMessages((prev) => {
          if (e.action === 'delete') return prev.filter((m) => m.id !== r.id);
          const exists = prev.find((m) => m.id === r.id);
          if (exists) return prev.map((m) => (m.id === r.id ? r : m));
          return [...prev, r];
        });
        // incoming message from someone else
        if (e.action === 'create' && r.senderRole !== role && r.recipientRole === role) {
          if (soundOn) playPing();
        }
      })
      .then((fn) => { unsub = fn; })
      .catch((err) => console.error('[StaffChat] subscribe failed', err));

    return () => {
      if (typeof unsub === 'function') unsub();
      else pbClient.collection('staff_messages').unsubscribe('*');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, pbClient, soundOn]);

  // conversation for the active peer
  const conversation = messages.filter(
    (m) =>
      (m.senderRole === role && m.recipientRole === activePeer) ||
      (m.senderRole === activePeer && m.recipientRole === role)
  );

  // unread counts per peer (messages sent TO me, not read)
  const unreadByPeer = {};
  peers.forEach((p) => {
    unreadByPeer[p] = messages.filter(
      (m) => m.senderRole === p && m.recipientRole === role && !m.read
    ).length;
  });
  const totalUnread = Object.values(unreadByPeer).reduce((a, b) => a + b, 0);

  // Unread urgent alerts sent to me (across all peers)
  const unreadAlerts = messages.filter(
    (m) => m.recipientRole === role && m.senderRole !== role && !m.read && m.isAlert
  ).length;

  // auto-scroll
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length, open, activePeer]);

  // mark active conversation as read
  useEffect(() => {
    if (!open) return;
    const toMark = messages.filter(
      (m) => m.senderRole === activePeer && m.recipientRole === role && !m.read
    );
    toMark.forEach((m) => {
      pbClient
        .collection('staff_messages')
        .update(m.id, { read: true }, { $autoCancel: false })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activePeer, messages.length]);

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch (_) { /* ignore */ }
      return next;
    });
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await pbClient.collection('staff_messages').create(
        {
          senderRole: role,
          recipientRole: activePeer,
          senderName: displayName || ROLE_META[role].label,
          content,
          read: false,
        },
        { $autoCancel: false }
      );
      setText('');
    } catch (err) {
      console.error('[StaffChat] send failed', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[80] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Staff chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 h-6 min-w-6 px-1 rounded-full bg-destructive text-white text-xs font-bold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
        {!open && unreadAlerts > 0 && (
          <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center animate-pulse" title="Urgent alert">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* Incoming call overlay */}
      {call.incoming && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xs bg-card border-2 border-border rounded-2xl shadow-2xl p-6 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <PhoneCall className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Incoming call</p>
            <p className="text-lg font-bold mb-6">
              {call.incoming.callerName || ROLE_META[call.incoming.callerRole]?.label}
              <span className="block text-xs font-normal text-muted-foreground">
                {ROLE_META[call.incoming.callerRole]?.label}
              </span>
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={call.declineCall}
                className="flex flex-col items-center gap-1 text-destructive"
                aria-label="Decline call"
              >
                <span className="h-14 w-14 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg">
                  <PhoneOff className="h-6 w-6" />
                </span>
                Decline
              </button>
              <button
                type="button"
                onClick={call.acceptCall}
                className="flex flex-col items-center gap-1 text-emerald-600"
                aria-label="Accept call"
              >
                <span className="h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                  <Phone className="h-6 w-6" />
                </span>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active / outgoing call bar */}
      {call.callState !== 'idle' && !call.incoming && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-[90] w-[92vw] max-w-sm bg-primary text-primary-foreground rounded-2xl shadow-2xl p-4 flex items-center gap-3">
          <span className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <PhoneCall className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {call.peerRole ? ROLE_META[call.peerRole]?.label : ''}
            </p>
            <p className="text-xs opacity-80 notranslate" translate="no">
              {call.callState === 'calling'
                ? 'Calling…'
                : `Connected · ${fmtDuration(call.duration)}`}
            </p>
          </div>
          {call.callState === 'connected' && (
            <button
              type="button"
              onClick={call.toggleMute}
              className="h-10 w-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              aria-label={call.muted ? 'Unmute' : 'Mute'}
            >
              {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={call.endCall}
            className="h-10 w-10 rounded-full bg-destructive hover:opacity-90 flex items-center justify-center"
            aria-label="End call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[80] w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-card border-2 border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <MessageCircle className="h-5 w-5" /> Staff Chat
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                className="p-1.5 rounded hover:bg-white/20"
                aria-label="Toggle sound"
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/20"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Peer tabs */}
          <div className="flex border-b border-border">
            {peers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActivePeer(p)}
                data-peer={p}
                className={cn(
                  'flex-1 relative px-3 py-2.5 text-sm font-medium transition-colors',
                  activePeer === p
                    ? 'bg-accent/50 text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:bg-accent/30'
                )}
              >
                {ROLE_META[p].label}
                {unreadByPeer[p] > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold">
                    {unreadByPeer[p]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-background/40">
            {conversation.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground italic py-8">
                No messages yet. Say hello to {ROLE_META[activePeer].label}.
              </p>
            ) : (
              conversation.map((m) => {
                const mine = m.senderRole === role;
                const isAlert = !!m.isAlert;
                return (
                  <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                    {isAlert && (
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Urgent Alert
                      </span>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        isAlert
                          ? mine
                            ? 'bg-destructive text-destructive-foreground rounded-br-sm border-2 border-destructive/60'
                            : 'bg-destructive/10 text-foreground border-2 border-destructive rounded-bl-sm'
                          : mine
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-card border border-border rounded-bl-sm'
                      )}
                    >
                      {!mine && (
                        <span className="block text-[11px] font-semibold opacity-70 mb-0.5">
                          {m.senderName || ROLE_META[m.senderRole].label}
                        </span>
                      )}
                      <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    </div>
                    <span
                      className="text-[10px] text-muted-foreground mt-0.5 notranslate"
                      translate="no"
                    >
                      {fmtTime(m.created)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {call.error && (
            <p className="px-3 py-1.5 text-xs text-destructive bg-destructive/10">{call.error}</p>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-t border-border bg-card">
            <Button
              size="icon"
              variant="outline"
              onClick={() => call.startCall(activePeer)}
              disabled={call.callState !== 'idle' || !!call.incoming}
              aria-label={`Call ${ROLE_META[activePeer].label}`}
              title={`Call ${ROLE_META[activePeer].label}`}
              className="shrink-0 text-emerald-600 border-emerald-600 hover:bg-emerald-50"
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${ROLE_META[activePeer].label}...`}
              className="bg-background"
            />
            <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
