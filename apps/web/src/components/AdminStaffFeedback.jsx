import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, FileText, Download, Copy, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import apiServerClient from '@/lib/apiServerClient.js';
import pb from '@/lib/pocketbaseClient.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Problems and ideas staff told the assistant in the staff app, and the
// improvement report built from them (server: apps/api/src/routes/assistant.js).
const KIND = {
  problem: ['Problem', 'Problem', 'bg-red-100 text-red-800'],
  idea: ['Idea', 'Idee', 'bg-emerald-100 text-emerald-800'],
  missing: ['Missing', 'Fehlt', 'bg-amber-100 text-amber-800'],
  confusing: ['Confusing', 'Unklar', 'bg-sky-100 text-sky-800'],
};
const ROLE = { waiter: 'Waiter', cashier: 'Cashier', kitchen: 'Kitchen', kitchen_manager: 'Kitchen manager', stock: 'Stock manager', auditor: 'Auditor', admin: 'Admin' };
const STATUS = ['new', 'planned', 'done', 'dismissed'];

async function call(path, options = {}) {
  const res = await apiServerClient.fetch(`/assistant${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}`, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

export default function AdminStaffFeedback() {
  const { language } = useLanguage();
  const de = language !== 'en';
  const tr = (en, d) => (de ? d : en);
  const [days, setDays] = useState(30);
  const [showDone, setShowDone] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [making, setMaking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await call(`/feedback?days=${days}${showDone ? '&all=1' : ''}`);
      setItems(d.items || []);
    } catch (e) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [days, showDone]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try {
      await call(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((list) => list.map((f) => (f.id === id ? { ...f, status } : f)));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const makeReport = async () => {
    setMaking(true);
    try {
      const d = await call('/feedback/report', { method: 'POST', body: JSON.stringify({ days, lang: de ? 'de' : 'en', includeDone: showDone }) });
      setReport(d.text || '');
      if (d.entries && !d.summarized) toast.warning(tr('The summary could not be written; the report lists all entries.', 'Die Zusammenfassung ging nicht; der Bericht listet alle Einträge.'));
    } catch (e) {
      toast.error(e.message);
    }
    setMaking(false);
  };

  const download = () => {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tripti-improvement-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const counts = (items || []).reduce((c, f) => ({ ...c, [f.kind]: (c[f.kind] || 0) + 1 }), {});

  return (
    <div className="p-4 space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> {tr('Staff feedback', 'Mitarbeiter-Feedback')}</h2>
          <p className="text-muted-foreground text-sm max-w-2xl">
            {tr('Problems and ideas your team told the assistant in the staff app. Create the improvement report to get everything as one text document.',
              'Probleme und Ideen, die das Team dem Assistenten in der Mitarbeiter-App gesagt hat. Der Verbesserungsbericht fasst alles als ein Textdokument zusammen.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{tr(`Last ${d} days`, `Letzte ${d} Tage`)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {tr('Include done', 'Erledigte zeigen')}</label>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />{tr('Refresh', 'Aktualisieren')}</Button>
          <Button onClick={makeReport} disabled={making || !items?.length}>
            {making ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {making ? tr('Writing report…', 'Bericht wird erstellt…') : tr('Create improvement report', 'Verbesserungsbericht erstellen')}
          </Button>
        </div>
      </div>

      {items && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label={tr('Entries', 'Einträge')} value={items.length} />
          {Object.keys(KIND).map((k) => <Stat key={k} label={KIND[k][de ? 1 : 0]} value={counts[k] || 0} />)}
        </div>
      )}

      {report && (
        <div className="border-2 border-primary/30 rounded-2xl bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b">
            <span className="font-bold">{tr('Improvement report', 'Verbesserungsbericht')}</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(report).then(() => toast.success(tr('Copied', 'Kopiert')))}><Copy className="w-4 h-4 mr-1" />{tr('Copy', 'Kopieren')}</Button>
              <Button size="sm" onClick={download}><Download className="w-4 h-4 mr-1" />{tr('Download .txt', '.txt herunterladen')}</Button>
            </div>
          </div>
          <pre className="p-4 whitespace-pre-wrap text-sm font-sans max-h-[520px] overflow-auto">{report}</pre>
        </div>
      )}

      {items === null ? (
        <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !items.length ? (
        <div className="text-center text-muted-foreground p-10 border-2 border-dashed rounded-2xl">
          {tr('No feedback yet. Staff can tell the assistant (sparkle button in the staff app) about problems and ideas.',
            'Noch kein Feedback. Das Team kann dem Assistenten (Glitzer-Knopf in der Mitarbeiter-App) Probleme und Ideen sagen.')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <div key={f.id} className={`rounded-xl border-2 bg-card p-4 border-l-8 ${f.impact === 'high' ? 'border-l-red-500' : f.impact === 'medium' ? 'border-l-amber-400' : 'border-l-slate-300'} ${f.status === 'done' || f.status === 'dismissed' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${KIND[f.kind]?.[2] || 'bg-muted'}`}>{KIND[f.kind]?.[de ? 1 : 0] || f.kind}</span>
                    <span className="font-semibold">{f.area}</span>
                    <span className="text-muted-foreground">· {f.staffName} ({ROLE[f.role] || f.role}) · {new Date(String(f.created).replace(' ', 'T')).toLocaleString(de ? 'de-AT' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {f.impact && <span className="text-muted-foreground">· {tr('impact', 'Wirkung')} {f.impact}</span>}
                  </div>
                  <div className="font-bold">{f.summary}</div>
                  {f.details && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{f.details}</div>}
                </div>
                <select value={f.status} onChange={(e) => setStatus(f.id, e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  {STATUS.map((s) => <option key={s} value={s}>{{ new: tr('New', 'Neu'), planned: tr('Planned', 'Geplant'), done: tr('Done', 'Erledigt'), dismissed: tr('Dismissed', 'Verworfen') }[s]}</option>)}
                </select>
              </div>
              {f.status === 'done' && <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {tr('Done', 'Erledigt')}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border-2 bg-card p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
