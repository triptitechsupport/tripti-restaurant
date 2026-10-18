import React, { useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquareText, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_DE = 'Falls Sie weitere besondere Wünsche für das Restaurant haben';
const DEFAULT_EN = 'If any other special requests for restaurant';
const MAX_LEN = 250;

export default function AdminReservationFormSettings() {
  const [record, setRecord] = useState(null);
  const [placeholderDE, setPlaceholderDE] = useState(DEFAULT_DE);
  const [placeholderEN, setPlaceholderEN] = useState(DEFAULT_EN);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await pb.collection('reservation_form_settings').getList(1, 1, {
          $autoCancel: false,
        });
        if (res.items.length > 0) {
          const item = res.items[0];
          setRecord(item);
          setPlaceholderDE(item.specialRequestsPlaceholderDE || DEFAULT_DE);
          setPlaceholderEN(item.specialRequestsPlaceholderEN || DEFAULT_EN);
        }
      } catch (err) {
        console.error('[AdminReservationFormSettings] load failed', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    const de = (placeholderDE || '').trim().slice(0, MAX_LEN);
    const en = (placeholderEN || '').trim().slice(0, MAX_LEN);
    if (!de || !en) {
      toast.error('Both German and English placeholder texts are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        specialRequestsPlaceholderDE: de,
        specialRequestsPlaceholderEN: en,
      };
      let updated;
      if (record) {
        updated = await pb.collection('reservation_form_settings').update(record.id, payload, {
          $autoCancel: false,
        });
      } else {
        updated = await pb.collection('reservation_form_settings').create(payload, {
          $autoCancel: false,
        });
      }
      setRecord(updated);
      setPlaceholderDE(updated.specialRequestsPlaceholderDE || de);
      setPlaceholderEN(updated.specialRequestsPlaceholderEN || en);
      toast.success('Reservation form placeholder saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save reservation form settings');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reservation form settings…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 space-y-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-serif font-bold text-primary">
            Reservation — Additional Wishes Text
          </h3>
          <p className="text-sm text-muted-foreground">
            Placeholder shown in the “Zusätzliche Wünsche” field on the public reservation form
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="special-placeholder-de" className="font-semibold">
          Placeholder (Deutsch)
        </Label>
        <Textarea
          id="special-placeholder-de"
          value={placeholderDE}
          onChange={(e) => setPlaceholderDE(e.target.value.slice(0, MAX_LEN))}
          placeholder={DEFAULT_DE}
          rows={3}
          maxLength={MAX_LEN}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {placeholderDE.length}/{MAX_LEN}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="special-placeholder-en" className="font-semibold">
          Placeholder (English)
        </Label>
        <Textarea
          id="special-placeholder-en"
          value={placeholderEN}
          onChange={(e) => setPlaceholderEN(e.target.value.slice(0, MAX_LEN))}
          placeholder={DEFAULT_EN}
          rows={3}
          maxLength={MAX_LEN}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {placeholderEN.length}/{MAX_LEN}
        </p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4 mr-2" />
        )}
        Save Placeholder Text
      </Button>
    </div>
  );
}
