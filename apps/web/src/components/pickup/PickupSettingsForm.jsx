import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';

// Admin: the rules for online pickup orders (pickup_settings, one record).
// [key, label {de,en}, hint {de,en}, min, max]
const NUMBERS = [
  ['slotMinutes', { de: 'Zeitraster (Minuten)', en: 'Time slot size (minutes)' }, { de: 'Abstand der wählbaren Abholzeiten, z. B. 15.', en: 'Gap between selectable pickup times, e.g. 15.' }, 5, 120],
  ['minLeadMinutes', { de: 'Mindest-Vorlauf (Minuten)', en: 'Minimum lead time (minutes)' }, { de: 'Frühestens so viele Minuten nach der Bestellung abholbar.', en: 'Earliest pickup is this many minutes after ordering.' }, 0, 1440],
  ['defaultPrepMinutes', { de: 'Standard-Zubereitungszeit (Minuten)', en: 'Default prep time (minutes)' }, { de: 'Für Gerichte ohne eigene Zubereitungszeit.', en: 'Used for dishes without their own prep time.' }, 0, 600],
  ['releaseBufferMinutes', { de: 'Puffer für die Küche (Minuten)', en: 'Kitchen buffer (minutes)' }, { de: 'Ticket geht so viel früher an die Küche als nötig.', en: 'The ticket goes to the kitchen this much earlier than needed.' }, 0, 240],
  ['maxDaysAhead', { de: 'Tage im Voraus bestellbar', en: 'Days guests can order ahead' }, { de: 'Wie weit Gäste in die Zukunft bestellen dürfen.', en: 'How far ahead guests may order.' }, 0, 60],
  ['previewDays', { de: 'Vorschau in der Küche (Tage)', en: 'Kitchen preview (days)' }, { de: 'Die Küche sieht Vorbestellungen so viele Tage im Voraus.', en: 'The kitchen sees pre-orders this many days ahead.' }, 0, 14],
  ['maxOrdersPerSlot', { de: 'Max. Bestellungen pro Zeitfenster', en: 'Max orders per time slot' }, { de: '0 = unbegrenzt.', en: '0 = unlimited.' }, 0, 100],
  ['maxDishesPerSlot', { de: 'Max. Gerichte pro Zeitfenster', en: 'Max dishes per time slot' }, { de: '0 = unbegrenzt.', en: '0 = unlimited.' }, 0, 500],
];
const TIMES = [
  ['lunchStart', { de: 'Mittag ab', en: 'Lunch from' }], ['lunchEnd', { de: 'Mittag bis', en: 'Lunch until' }],
  ['dinnerStart', { de: 'Abend ab', en: 'Dinner from' }], ['dinnerEnd', { de: 'Abend bis', en: 'Dinner until' }],
];

export default function PickupSettingsForm({ client }) {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tr = (de, en) => (lang === 'en' ? en : de);
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
  if (!form) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{tr('Lade Einstellungen ...', 'Loading settings ...')}</p>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const bad = TIMES.find(([k]) => form[k] && !/^\d{2}:\d{2}$/.test(form[k]));
    if (bad) { toast.error(`${bad[1][lang]}: ${tr('Format HH:MM', 'format HH:MM')}`); return; }
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
      toast.success(tr('Abhol-Einstellungen gespeichert', 'Pickup settings saved'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleOrdering = async (on) => {
    if (!ordering) return;
    try {
      // The website reads the first record. Older versions sometimes created
      // extra records, so switch them all to keep them in step.
      const all = await client.collection('order_settings').getFullList({ fields: 'id', $autoCancel: false });
      await Promise.all(all.filter((r) => r.id !== ordering.id)
        .map((r) => client.collection('order_settings').update(r.id, { isOrderingEnabled: on }, { $autoCancel: false })));
      const saved = await client.collection('order_settings').update(ordering.id, { isOrderingEnabled: on });
      setOrdering(saved);
      toast.success(on ? tr('Online-Bestellungen eingeschaltet', 'Online ordering switched on') : tr('Online-Bestellungen ausgeschaltet', 'Online ordering switched off'));
    } catch (e) {
      toast.error([401, 403, 404].includes(e?.status) ? tr('Speichern fehlgeschlagen: Admin-Anmeldung abgelaufen. Bitte ab- und wieder anmelden.', 'Could not save: your admin login has expired. Please log out and log in again.') : e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border p-4 space-y-4 bg-muted/30">
        {ordering && (
          <div className="flex items-start gap-3">
            <Switch id="ps-ordering" checked={!!ordering.isOrderingEnabled} onCheckedChange={toggleOrdering} className="mt-1" />
            <div>
              <Label htmlFor="ps-ordering" className="font-semibold text-base cursor-pointer">{tr('Online-Bestellung auf der Website', 'Online ordering on the website')}</Label>
              <p className="text-sm text-muted-foreground">{tr('Hauptschalter: zeigt „In den Warenkorb“ auf der Speisekarte. Wird sofort gespeichert.', 'Main switch: shows “Add to cart” on the menu. Saved immediately.')}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Switch id="ps-enabled" checked={!!form.enabled} onCheckedChange={(v) => set('enabled', v)} className="mt-1" />
          <div>
            <Label htmlFor="ps-enabled" className="font-semibold text-base cursor-pointer">{tr('Vorbestellung zur Abholung', 'Pre-order for pickup')}</Label>
            <p className="text-sm text-muted-foreground">{tr('Aus = Gäste können keine neuen Abholungen bestellen (z. B. bei voller Küche).', 'Off = guests cannot place new pickup orders (e.g. when the kitchen is full).')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch id="ps-auto" checked={!!form.autoConfirm} onCheckedChange={(v) => set('autoConfirm', v)} className="mt-1" />
          <div>
            <Label htmlFor="ps-auto" className="font-semibold text-base cursor-pointer">{tr('Automatisch bestätigen', 'Confirm automatically')}</Label>
            <p className="text-sm text-muted-foreground">{tr('Aus = jede Bestellung muss im Admin oder vom Service bestätigt werden, bevor sie an die Küche geht.', 'Off = every order must be confirmed by admin or waiter staff before it goes to the kitchen.')}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="font-semibold mb-2">{tr('Abholzeiten', 'Pickup times')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TIMES.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`ps-${k}`}>{label[lang]}</Label>
              <Input id={`ps-${k}`} type="time" value={form[k] || ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{tr('Beide Felder leer lassen, um Mittag oder Abend auszuschalten. Ruhetag und Betriebsurlaub kommen aus den Öffnungszeiten (Reservierungen).', 'Leave both fields empty to switch lunch or dinner off. Closed day and holidays come from the opening hours (reservations).')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NUMBERS.map(([k, label, hint, min, max]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`ps-${k}`}>{label[lang]}</Label>
            <Input id={`ps-${k}`} type="number" inputMode="numeric" min={min} max={max} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
            <p className="text-xs text-muted-foreground">{hint[lang]}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="ps-noteDE">{tr('Hinweis beim Bestellen (Deutsch)', 'Note shown when ordering (German)')}</Label>
          <Textarea id="ps-noteDE" rows={2} maxLength={500} value={form.noteDE || ''} onChange={(e) => set('noteDE', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ps-noteEN">{tr('Hinweis beim Bestellen (Englisch)', 'Note shown when ordering (English)')}</Label>
          <Textarea id="ps-noteEN" rows={2} maxLength={500} value={form.noteEN || ''} onChange={(e) => set('noteEN', e.target.value)} />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="h-11">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{tr('Speichern', 'Save')}
      </Button>
    </div>
  );
}
