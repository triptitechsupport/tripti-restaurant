import React, { useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminMarqueeSettings() {
  const [record, setRecord] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await pb.collection('marquee_settings').getList(1, 1, { $autoCancel: false });
        if (res.items.length > 0) {
          setRecord(res.items[0]);
          setEnabled(res.items[0].enabled);
          setText(res.items[0].text || '');
        }
      } catch (_) {}
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      let updated;
      if (record) {
        updated = await pb.collection('marquee_settings').update(record.id, { enabled, text }, { $autoCancel: false });
      } else {
        updated = await pb.collection('marquee_settings').create({ enabled, text }, { $autoCancel: false });
      }
      setRecord(updated);
      toast.success('Marquee settings saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save marquee settings');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading marquee settings…
    </div>
  );

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 space-y-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
          <Megaphone className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-serif font-bold text-primary">Marquee / Announcement Bar</h3>
          <p className="text-sm text-muted-foreground">Scrolling message shown below the header on all pages</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="marquee-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="marquee-enabled" className="font-semibold cursor-pointer">
          {enabled ? 'Marquee visible' : 'Marquee hidden'}
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="marquee-text" className="font-semibold">Marquee Text</Label>
        <Textarea
          id="marquee-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Welcome to Tripti Genusswelt – Authentic Indian cuisine …"
          rows={3}
          maxLength={1000}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">{text.length}/1000</p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
        Save Marquee Settings
      </Button>
    </div>
  );
}
