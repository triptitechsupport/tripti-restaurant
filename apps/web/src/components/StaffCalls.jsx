import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, X, Users, User, Search, Loader2 } from 'lucide-react';
import apiServerClient from '@/lib/apiServerClient.js';
import { signedInClient, staffIdentity, ALL_STAFF_CLIENTS, ROLE_LABELS } from '@/lib/staffSession.js';
import { GroupCall } from '@/lib/groupCall.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Voice calls on every staff page: call one person, pick several people,
// or ring whole roles (all waiters, kitchen, admin, everyone...).
const ROLE_ORDER = ['admin', 'waiter', 'cashier', 'kitchen', 'kitchen_manager', 'stock', 'auditor'];

function fmt(sec) {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export default function StaffCalls() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const de = language !== 'en';
  const tr = (en, d) => (de ? d : en);
  const roleName = (r) => (ROLE_LABELS[r] || [r, r])[de ? 1 : 0];
  const [, setTick] = useState(0);
  const [snap, setSnap] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('person');
  const [people, setPeople] = useState(null);
  const [search, setSearch] = useState('');
  const [pickedPeople, setPickedPeople] = useState([]);
  const [pickedRoles, setPickedRoles] = useState([]);
  const [now, setNow] = useState(Date.now());
  const engine = useRef(null);

  useEffect(() => {
    const offs = ALL_STAFF_CLIENTS.map((c) => c.authStore.onChange(() => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
  }, []);

  const client = signedInClient(pathname);
  const me = staffIdentity(client);
  const key = client && me ? `${me.id}` : '';

  // One call engine per signed-in person.
  useEffect(() => {
    if (!key) return undefined;
    const g = new GroupCall({ pb: client, me, onChange: setSnap });
    engine.current = g;
    g.start().catch((err) => console.error('[calls] start', err));
    setSnap(g.snapshot());
    return () => { g.stop(); engine.current = null; setSnap(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The phone button in the staff chat starts a call here.
  useEffect(() => {
    const onCall = (e) => engine.current?.call(e.detail?.targets || [], e.detail?.title || '');
    window.addEventListener('staff-call', onCall);
    return () => window.removeEventListener('staff-call', onCall);
  }, []);

  useEffect(() => {
    if (snap?.state !== 'in-call') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [snap?.state]);

  const loadPeople = async () => {
    if (!client) return;
    try {
      const res = await apiServerClient.fetch('/calls/staff', { headers: { Authorization: `Bearer ${client.authStore.token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setPeople(d.people || []);
    } catch {
      setPeople([]);
    }
  };

  useEffect(() => { if (open && people === null) loadPeople(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (people || []).filter((p) => !q || p.name.toLowerCase().includes(q) || roleName(p.role).toLowerCase().includes(q));
    return ROLE_ORDER.map((r) => [r, list.filter((p) => p.role === r)]).filter(([, l]) => l.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, search, de]);

  if (!client || !me || !snap) return null;
  const g = engine.current;

  const callPerson = (p) => {
    setOpen(false);
    g?.call([{ type: 'user', id: p.id, name: p.name, role: p.role }], p.name);
  };
  const callGroup = () => {
    const targets = [
      ...pickedRoles.map((r) => ({ type: 'role', role: r })),
      ...pickedPeople.map((p) => ({ type: 'user', id: p.id, name: p.name, role: p.role })),
    ];
    if (!targets.length) return;
    const title = [...pickedRoles.map(roleName), ...pickedPeople.map((p) => p.name)].join(', ');
    setOpen(false);
    setPickedPeople([]);
    setPickedRoles([]);
    g?.call(targets, title);
  };
  const togglePerson = (p) => setPickedPeople((l) => (l.some((x) => x.id === p.id) ? l.filter((x) => x.id !== p.id) : [...l, p]));
  const toggleRole = (r) => setPickedRoles((l) => (l.includes(r) ? l.filter((x) => x !== r) : [...l, r]));

  const inCall = snap.state === 'in-call';
  const others = (snap.members || []).filter((m) => m.userId !== me.id);
  const joined = others.filter((m) => m.state === 'joined');
  const roomTitle = snap.room?.createdById === me.id ? (snap.room?.title || '') : (snap.room?.createdByName || '');

  return (
    <>
      {!inCall && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="assistant-raise fixed bottom-6 left-[5.5rem] z-[80] h-14 w-14 rounded-full bg-emerald-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
          aria-label={tr('Call', 'Anrufen')}
          title={tr('Call a colleague or a group', 'Kollegen oder Gruppe anrufen')}
        >
          <Phone className="h-6 w-6" />
        </button>
      )}

      {open && !inCall && (
        <div className="assistant-raise-panel fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 z-[90] w-[94vw] max-w-md h-[75vh] max-h-[620px] bg-card border-2 border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-label={tr('Call', 'Anrufen')}>
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-700 text-white">
            <Phone className="h-5 w-5" />
            <span className="font-bold flex-1">{tr('Call', 'Anrufen')}</span>
            <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label={tr('Close', 'Schließen')}><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1 p-2 border-b">
            <button type="button" onClick={() => setMode('person')} className={`flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm ${mode === 'person' ? 'bg-emerald-600 text-white' : 'hover:bg-muted'}`}><User className="h-4 w-4" />{tr('One person', 'Eine Person')}</button>
            <button type="button" onClick={() => setMode('group')} className={`flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm ${mode === 'group' ? 'bg-emerald-600 text-white' : 'hover:bg-muted'}`}><Users className="h-4 w-4" />{tr('Group', 'Gruppe')}</button>
          </div>
          {mode === 'group' && (
            <div className="p-3 border-b space-y-2">
              <div className="text-xs font-bold text-muted-foreground">{tr('Ring everyone in:', 'Alle anrufen bei:')}</div>
              <div className="flex flex-wrap gap-2">
                {['all', ...ROLE_ORDER.filter((r) => r !== 'auditor')].map((r) => (
                  <button key={r} type="button" onClick={() => toggleRole(r)} className={`px-3 py-1.5 rounded-full text-sm border-2 ${pickedRoles.includes(r) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border hover:bg-muted'}`}>{roleName(r)}</button>
                ))}
              </div>
            </div>
          )}
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 rounded-xl border-2 border-input px-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search name or role…', 'Name oder Rolle suchen…')} className="flex-1 h-10 bg-transparent outline-none text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {people === null ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !grouped.length ? (
              <div className="text-center text-sm text-muted-foreground p-6">{tr('Nobody found.', 'Niemand gefunden.')}</div>
            ) : grouped.map(([r, list]) => (
              <div key={r} className="mb-2">
                <div className="px-2 py-1 text-xs font-bold uppercase text-muted-foreground">{roleName(r)}</div>
                {list.map((p) => {
                  const picked = pickedPeople.some((x) => x.id === p.id);
                  return mode === 'person' ? (
                    <button key={p.id} type="button" onClick={() => callPerson(p)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-left">
                      <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">{p.name.slice(0, 1).toUpperCase()}</span>
                      <span className="flex-1 font-semibold">{p.name}</span>
                      <PhoneCall className="h-5 w-5 text-emerald-700" />
                    </button>
                  ) : (
                    <label key={p.id} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted cursor-pointer">
                      <input type="checkbox" checked={picked} onChange={() => togglePerson(p)} className="h-5 w-5" />
                      <span className="flex-1 font-semibold">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {mode === 'group' && (
            <div className="p-2 border-t">
              <button type="button" disabled={!pickedPeople.length && !pickedRoles.length} onClick={callGroup} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                <PhoneCall className="h-5 w-5" />
                {tr('Call', 'Anrufen')} {pickedRoles.length + pickedPeople.length ? `(${[...pickedRoles.map(roleName), ...pickedPeople.map((p) => p.name)].join(', ')})` : ''}
              </button>
            </div>
          )}
          {snap.error && <div className="px-3 py-2 text-sm text-red-700 bg-red-50">{snap.error}</div>}
        </div>
      )}

      {snap.state === 'incoming' && snap.incoming && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-3xl shadow-2xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse"><PhoneCall className="h-8 w-8 text-emerald-700" /></div>
            <div>
              <div className="text-xl font-bold">{snap.incoming.createdByName}</div>
              <div className="text-sm text-muted-foreground">
                {roleName(snap.incoming.createdByRole)}
                {(snap.incoming.targets || []).length > 1 || (snap.incoming.targets || []).some((t) => t.type === 'role') ? ` · ${tr('Group call', 'Gruppenanruf')}: ${snap.incoming.title}` : ''}
              </div>
            </div>
            <div className="flex justify-center gap-8">
              <button type="button" onClick={() => g?.decline()} className="flex flex-col items-center gap-1 text-sm"><span className="h-14 w-14 rounded-full bg-red-600 text-white flex items-center justify-center"><PhoneOff className="h-6 w-6" /></span>{tr('Decline', 'Ablehnen')}</button>
              <button type="button" onClick={() => g?.accept()} className="flex flex-col items-center gap-1 text-sm"><span className="h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center"><Phone className="h-6 w-6" /></span>{tr('Answer', 'Annehmen')}</button>
            </div>
          </div>
        </div>
      )}

      {inCall && (
        <div className="assistant-raise-panel fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 z-[90] w-[94vw] max-w-sm bg-emerald-700 text-white rounded-2xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <PhoneCall className="h-5 w-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{roomTitle || tr('Call', 'Anruf')}</div>
              <div className="text-xs text-white/80">
                {joined.length ? `${tr('Connected', 'Verbunden')} · ${fmt(Math.max(0, Math.floor((now - (snap.startedAt || now)) / 1000)))}` : tr('Ringing…', 'Klingelt…')}
              </div>
            </div>
            <button type="button" onClick={() => g?.toggleMute()} className="h-11 w-11 rounded-full bg-white/15 flex items-center justify-center" aria-label={snap.muted ? tr('Unmute', 'Ton an') : tr('Mute', 'Stumm')}>
              {snap.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => g?.leave()} className="h-11 w-11 rounded-full bg-red-600 flex items-center justify-center" aria-label={tr('Hang up', 'Auflegen')}>
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
          {others.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {others.map((m) => (
                <span key={m.userId} className={`text-xs px-2 py-0.5 rounded-full ${m.state === 'joined' ? (snap.connected.includes(m.userId) ? 'bg-white text-emerald-800' : 'bg-white/60 text-emerald-900') : 'bg-black/20 line-through'}`}>
                  {m.name}{m.state === 'declined' ? ` (${tr('declined', 'abgelehnt')})` : m.state === 'left' ? ` (${tr('left', 'aufgelegt')})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
