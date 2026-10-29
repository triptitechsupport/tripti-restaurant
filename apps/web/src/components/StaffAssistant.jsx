import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Mic, Send, Volume2, VolumeX, Trash2, Loader2 } from 'lucide-react';
import apiServerClient from '@/lib/apiServerClient.js';
import { signedInClient, ALL_STAFF_CLIENTS } from '@/lib/staffSession.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// The staff assistant on the website's staff and admin pages (the Android
// staff app has its own). It asks the server (/api/assistant/chat) with the
// signed-in person's own login, so it only sees what that role may see.

const SUGGEST = {
  waiter_users: [['Which of my tickets are ready?', 'Welche meiner Tickets sind fertig?'], ['How do I combine two tables?', 'Wie kombiniere ich zwei Tische?'], ['Why can\'t I ask for the bill?', 'Warum kann ich die Rechnung nicht anfordern?']],
  kds_users: [['What is waiting longest?', 'Was wartet am längsten?'], ['Which pickups are today?', 'Welche Abholungen gibt es heute?'], ['How do I mark a dish sold out?', 'Wie markiere ich ein Gericht als ausverkauft?']],
  stock_users: [['Which items are low or out?', 'Welche Artikel sind knapp oder leer?'], ['What did the kitchen request?', 'Was hat die Küche angefordert?'], ['How do I book a delivery?', 'Wie buche ich eine Lieferung ein?']],
  auditor_users: [['How much was paid today?', 'Wie viel wurde heute bezahlt?'], ['How do I export DEP7?', 'Wie exportiere ich DEP7?']],
  admin_users: [['Which tables are open right now?', 'Welche Tische sind gerade offen?'], ['How much did we take today?', 'Wie viel haben wir heute eingenommen?'], ['Where do I add a cashier?', 'Wo lege ich einen Kassierer an?']],
};

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

function speak(text, de) {
  if (!canSpeak || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = de ? 'de-AT' : 'en-GB';
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
const stopSpeaking = () => { try { if (canSpeak) window.speechSynthesis.cancel(); } catch { /* ignore */ } };

function readPref() {
  try { return localStorage.getItem('assistant_speak') !== '0'; } catch { return true; }
}

export default function StaffAssistant() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const de = language !== 'en';
  const tr = (en, d) => (de ? d : en);
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [readAloud, setReadAloud] = useState(readPref);
  const listRef = useRef(null);
  const recRef = useRef(null);

  // Show/hide when someone signs in or out on this page.
  useEffect(() => {
    const offs = ALL_STAFF_CLIENTS.map((c) => c.authStore.onChange(() => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
  }, []);

  const client = signedInClient(pathname);
  const collection = (client?.authStore.record || client?.authStore.model)?.collectionName;
  const tips = useMemo(() => [...(SUGGEST[collection] || []), ['I want to report a problem or an idea', 'Ich möchte ein Problem oder eine Idee melden']], [collection]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => () => { stopSpeaking(); recRef.current?.abort?.(); }, []);

  if (!client) return null;

  const ask = async (q) => {
    const question = String(q || '').trim();
    if (!question || busy) return;
    stopSpeaking();
    setError('');
    const history = [...messages, { role: 'user', content: question }];
    setMessages(history);
    setText('');
    setBusy(true);
    try {
      const res = await apiServerClient.fetch('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.authStore.token}` },
        body: JSON.stringify({ app: 'web', lang: de ? 'de' : 'en', messages: history.slice(-12) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || tr('The assistant could not answer.', 'Der Assistent konnte nicht antworten.'));
      const reply = String(data.reply || '');
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      if (readAloud) speak(reply, de);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const listen = () => {
    if (!Recognition) return;
    if (listening) { recRef.current?.stop(); return; }
    stopSpeaking();
    try {
      const rec = new Recognition();
      rec.lang = de ? 'de-AT' : 'en-GB';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => { const said = e.results?.[0]?.[0]?.transcript; if (said) ask(said); };
      rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setError(tr('Voice input did not work. Check the microphone permission.', 'Spracheingabe hat nicht geklappt. Bitte Mikrofon-Erlaubnis prüfen.')); };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const toggleRead = () => {
    const v = !readAloud;
    setReadAloud(v);
    if (!v) stopSpeaking();
    try { localStorage.setItem('assistant_speak', v ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="assistant-raise fixed bottom-6 left-6 z-[80] h-14 w-14 rounded-full bg-[#d4a537] text-[#5b1220] shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
          aria-label={tr('Assistant', 'Assistent')}
          title={tr('Assistant: ask how something works', 'Assistent: frag, wie etwas geht')}
        >
          <Sparkles className="h-7 w-7" />
        </button>
      )}
      {open && (
        <div className="assistant-raise-panel fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 z-[90] w-[94vw] max-w-md h-[75vh] max-h-[620px] bg-card border-2 border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-label={tr('Assistant', 'Assistent')}>
          <div className="flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5 text-[#d4a537]" />
            <span className="font-bold flex-1">{tr('Assistant', 'Assistent')}</span>
            {canSpeak && (
              <button type="button" onClick={toggleRead} className="p-1.5 rounded-lg hover:bg-white/10" title={readAloud ? tr('Read answers aloud: on', 'Antworten vorlesen: an') : tr('Read answers aloud: off', 'Antworten vorlesen: aus')}>
                {readAloud ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
            )}
            {messages.length > 0 && (
              <button type="button" disabled={busy} onClick={() => { stopSpeaking(); setMessages([]); setError(''); }} className="p-1.5 rounded-lg hover:bg-white/10" title={tr('New conversation', 'Neues Gespräch')}>
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={() => { stopSpeaking(); setOpen(false); }} className="p-1.5 rounded-lg hover:bg-white/10" aria-label={tr('Close', 'Schließen')}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border-2 border-border bg-card p-3 text-sm">
                  <div className="font-bold mb-1">{tr('Ask me anything about this page', 'Frag mich alles zu dieser Seite')}</div>
                  <div className="text-muted-foreground">
                    {tr('Which button to press, how something works, or what is happening right now. Tell me about problems or ideas and I pass them on to the admin. I never change orders, payments or stock.',
                      'Welcher Knopf, wie etwas geht, oder was gerade los ist. Erzähl mir von Problemen oder Ideen, ich gebe sie an den Admin weiter. Ich ändere nie Bestellungen, Zahlungen oder Lager.')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tips.map(([en, d]) => (
                    <button key={en} type="button" onClick={() => ask(de ? d : en)} className="text-left text-sm px-3 py-1.5 rounded-full border-2 border-primary/30 bg-card hover:bg-primary/5">
                      {de ? d : en}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border-2 border-border'}`}>
                  {m.role !== 'user' && <Sparkles className="inline h-4 w-4 mr-1 -mt-0.5 text-[#d4a537]" />}
                  {m.content}
                  {m.role !== 'user' && canSpeak && (
                    <button type="button" onClick={() => speak(m.content, de)} className="ml-1 align-middle text-muted-foreground hover:text-foreground" aria-label={tr('Read aloud', 'Vorlesen')}>
                      <Volume2 className="inline h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr('Thinking…', 'Einen Moment…')}</div>}
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          </div>

          <form className="flex items-center gap-2 p-2 border-t-2 border-border bg-card" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            {Recognition && (
              <button type="button" onClick={listen} disabled={busy} className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-primary text-primary-foreground'} disabled:opacity-50`} aria-label={tr('Speak', 'Sprechen')} title={listening ? tr('Listening… tap to stop', 'Ich höre zu… tippen zum Stoppen') : tr('Speak your question', 'Frage sprechen')}>
                <Mic className="h-5 w-5" />
              </button>
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              placeholder={listening ? tr('Listening…', 'Ich höre zu…') : tr('Type a question…', 'Frage eingeben…')}
              className="flex-1 min-w-0 h-11 rounded-xl border-2 border-input bg-background px-3 text-[15px]"
            />
            <button type="submit" disabled={busy || !text.trim()} className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-40" aria-label={tr('Send', 'Senden')}>
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
