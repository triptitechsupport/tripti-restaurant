import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

// Admin: the rules for online pickup orders (pickup_settings, one record).
const NUMBERS = [
  ['slotMinutes', 'Zeitraster (Minuten)', 'Abstand der wählbaren Abholzeiten, z. B. 15.', 5, 120],
  ['minLeadMinutes', 'Mindest-Vorlauf (Minuten)', 'Frühestens so viele Minuten nach der Bestellung abholbar.', 0, 1440],
  ['defaultPrepMinutes', 'Standard-Zubereitungszeit (Minuten)', 'Für Gerichte ohne eigene Zubereitungszeit.', 0, 600],
  ['releaseBufferMinutes', 'Puffer für die Küche (Minuten)', 'Ticket geht so viel früher an die Küche als nötig.', 0, 240],
  ['maxDaysAhead', 'Tage im Voraus bestellbar', 'Wie weit Gäste in die Zukunft bestellen dürfen.', 0, 60],
  ['previewDays', 'Vorschau in der Küche (Tage)', 'Die Küche sieht Vorbestellungen so viele Tage im Voraus.', 0, 14],
  ['maxOrdersPerSlot', 'Max. Bestellungen pro Zeitfenster', '0 = unbegrenzt.', 0, 100],
  ['maxDishesPerSlot', 'Max. Gerichte pro Zeitfenster', '0 = unbegrenzt.', 0, 500],
];
const TIMES = [
  ['lunchStart', 'Mittag ab'], ['lunchEnd', 'Mittag bis'], ['dinnerStart', 'Abend ab'], ['dinnerEnd', 'Abend bis'],
];

export default function PickupSettingsForm({ client }) {
  const [rec, setRec] = useState(null);
  const [form, setForm] = useState(null);
  const [ordering, setOrdering] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await client.collection('pickup_settings').getList(1, 1, { $autoCancel: false });
        const os = await client.collection('order_settings').getList(1, 1, { $autoCancel: false }).catch(() => ({ items: [] }));
        if (!alive) return;
        setRec(r.items[0] || null);
        setForm(r.items[0] ? { ...r.items[0] } : {});
        setOrdering(os.items[0] || null);
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => { alive = false; };
  }, [client]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!form) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Lade Einstellungen ...</p>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const bad = TIMES.find(([k]) => form[k] && !/^\d{2}:\d{2}$/.test(form[k]));
    if (bad) { toast.error(`${bad[1]}: Format HH:MM`); return; }
    setSaving(true);
    try {
      const data = {};
      NUMBERS.forEach(([k, , , min, max]) => { data[k] = Math.min(max, Math.max(min, Math.round(Number(form[k]) || 0))); });
      TIMES.forEach(([k]) => { data[k] = form[k] || ''; });
      data.enabled = !!form.enabled;
      data.autoConfirm = !!form.autoConfirm;
      data.noteDE = form.noteDE || '';
      data.noteEN = form.noteEN || '';
      const saved = rec
        ? await client.collection('pickup_settings').update(rec.id, data)
        : await client.collection('pickup_settings').create(data);
      setRec(saved);
      setForm({ ...saved });
      toast.success('Abhol-Einstellungen gespeichert');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleOrdering = async (on) => {
    if (!ordering) return;
    try {
      const saved = await client.collection('order_settings').update(ordering.id, { isOrderingEnabled: on });
      setOrdering(saved);
      toast.success(on ? 'Online-Bestellungen eingeschaltet' : 'Online-Bestellungen ausgeschaltet');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border p-4 space-y-4 bg-muted/30">
        {ordering && (
          <div className="flex items-start gap-3">
            <Switch id="ps-ordering" checked={!!ordering.isOrderingEnabled} onCheckedChange={toggleOrdering} className="mt-1" />
            <div>
              <Label htmlFor="ps-ordering" className="font-semibold text-base cursor-pointer">Online-Bestellung auf der Website</Label>
              <p className="text-sm text-muted-foreground">Hauptschalter: zeigt „In den Warenkorb“ auf der Speisekarte. Wird sofort gespeichert.</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Switch id="ps-enabled" checked={!!form.enabled} onCheckedChange={(v) => set('enabled', v)} className="mt-1" />
          <div>
            <Label htmlFor="ps-enabled" className="font-semibold text-base cursor-pointer">Vorbestellung zur Abholung</Label>
            <p className="text-sm text-muted-foreground">Aus = Gäste können keine neuen Abholungen bestellen (z. B. bei voller Küche).</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch id="ps-auto" checked={!!form.autoConfirm} onCheckedChange={(v) => set('autoConfirm', v)} className="mt-1" />
          <div>
            <Label htmlFor="ps-auto" className="font-semibold text-base cursor-pointer">Automatisch bestätigen</Label>
            <p className="text-sm text-muted-foreground">Aus = jede Bestellung muss im Admin oder vom Service bestätigt werden, bevor sie an die Küche geht.</p>
          </div>
        </div>
      </div>

      <div>
        <p className="font-semibold mb-2">Abholzeiten</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TIMES.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`ps-${k}`}>{label}</Label>
              <Input id={`ps-${k}`} type="time" value={form[k] || ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Ruhetag und Betriebsurlaub kommen aus den Öffnungszeiten (Reservierungen).</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NUMBERS.map(([k, label, hint, min, max]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`ps-${k}`}>{label}</Label>
            <Input id={`ps-${k}`} type="number" inputMode="numeric" min={min} max={max} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="ps-noteDE">Hinweis beim Bestellen (Deutsch)</Label>
          <Textarea id="ps-noteDE" rows={2} maxLength={500} value={form.noteDE || ''} onChange={(e) => set('noteDE', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ps-noteEN">Hinweis beim Bestellen (Englisch)</Label>
          <Textarea id="ps-noteEN" rows={2} maxLength={500} value={form.noteEN || ''} onChange={(e) => set('noteEN', e.target.value)} />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="h-11">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Speichern
      </Button>
    </div>
  );
}
