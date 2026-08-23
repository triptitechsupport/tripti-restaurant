import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Hash } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

export default function AdminMaxTableNumberSettings() {
  const [settingsId, setSettingsId] = useState(null);
  const [maxTableNumber, setMaxTableNumber] = useState(9);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const records = await pb.collection('table_settings').getFullList({ $autoCancel: false });
      if (records && records.length > 0) {
        setSettingsId(records[0].id);
        setMaxTableNumber(Number(records[0].maxTableNumber) || 9);
      } else {
        setSettingsId(null);
        setMaxTableNumber(9);
      }
    } catch (e) {
      toast.error('Failed to load table settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const value = parseInt(maxTableNumber, 10);
    if (Number.isNaN(value) || value < 1) {
      toast.error('Maximum table number must be at least 1');
      return;
    }
    setSaving(true);
    try {
      if (settingsId) {
        await pb.collection('table_settings').update(settingsId, { maxTableNumber: value }, { $autoCancel: false });
      } else {
        const rec = await pb.collection('table_settings').create({ maxTableNumber: value }, { $autoCancel: false });
        setSettingsId(rec.id);
      }
      setMaxTableNumber(value);
      toast.success(`Maximum table number set to ${value}`);
    } catch (err) {
      toast.error('Failed to save table settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-2 border-border shadow-sm">
      <CardContent className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-primary">Maximum Table Number</h3>
            <p className="text-sm text-muted-foreground">
              Controls the highest table number available to waiters. Tables 1 through this value (that are also marked Active) appear in the waiter order selector.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 w-full sm:w-48">
              <Label className="text-foreground font-semibold">Max Table Number</Label>
              <Input
                type="number"
                min="1"
                value={maxTableNumber}
                onChange={(e) => setMaxTableNumber(e.target.value)}
                className="bg-background text-foreground"
                disabled={saving}
              />
            </div>
            <Button type="submit" disabled={saving} className="min-w-[120px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Setting'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
