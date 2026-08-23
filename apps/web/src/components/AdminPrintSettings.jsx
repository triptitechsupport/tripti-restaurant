import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, Power, Users, Save } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

export default function AdminPrintSettings() {
  const [settingsId, setSettingsId] = useState(null);
  const [restaurantWide, setRestaurantWide] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);
  // perWaiter: { [waiterId]: boolean } — true = enabled, false = disabled.
  const [perWaiter, setPerWaiter] = useState({});
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [records, waiterRecords] = await Promise.all([
        pb.collection('print_settings').getFullList({ $autoCancel: false }),
        pb.collection('waiter_users').getFullList({ $autoCancel: false }).catch(() => []),
      ]);
      if (records && records.length > 0) {
        const rec = records[0];
        setSettingsId(rec.id);
        setRestaurantWide(rec.restaurantWidePrintEnabled !== false);
        setAutoPrint(rec.autoPrintKOT === true);
        const raw = rec.perWaiterPrintSettings || {};
        // Normalize to { id: boolean }.
        const norm = {};
        Object.keys(raw).forEach((id) => {
          const v = raw[id];
          norm[id] = v && v.enabled === false ? false : true;
        });
        setPerWaiter(norm);
      } else {
        setSettingsId(null);
        setRestaurantWide(true);
        setAutoPrint(false);
        setPerWaiter({});
      }
      setWaiters(waiterRecords || []);
    } catch (e) {
      toast.error('Failed to load print settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert { id: boolean } -> { id: { enabled: boolean } }, only
      // persisting waiters that are explicitly disabled (the default is
      // enabled, so we omit enabled waiters to keep the record small).
      const perSettings = {};
      waiters.forEach((w) => {
        if (perWaiter[w.id] === false) {
          perSettings[w.id] = { enabled: false };
        }
      });

      const payload = {
        restaurantWidePrintEnabled: restaurantWide,
        autoPrintKOT: autoPrint,
        perWaiterPrintSettings: perSettings,
      };

      if (settingsId) {
        await pb.collection('print_settings').update(settingsId, payload, { $autoCancel: false });
      } else {
        const rec = await pb.collection('print_settings').create(payload, { $autoCancel: false });
        setSettingsId(rec.id);
      }
      toast.success('Print settings saved');
    } catch (err) {
      console.error('Failed to save print settings', err);
      toast.error('Failed to save print settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleWaiter = (id, enabled) => {
    setPerWaiter((prev) => ({ ...prev, [id]: enabled }));
  };

  return (
    <Card className="border-2 border-border shadow-sm">
      <CardContent className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-primary">KOT Printing Controls</h3>
            <p className="text-sm text-muted-foreground">
              Manage restaurant-wide KOT printing, automatic printing, and per-waiter print permissions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Restaurant-wide toggle */}
            <div className="flex items-start gap-4 p-4 border-2 border-border rounded-xl bg-accent/20">
              <Switch
                checked={restaurantWide}
                onCheckedChange={setRestaurantWide}
                className="mt-1 data-[state=checked]:bg-primary"
                disabled={saving}
              />
              <div className="flex-1">
                <Label className="text-base font-serif font-bold text-primary flex items-center gap-2">
                  <Power className="w-4 h-4" /> Restaurant-wide Printing
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Master switch for all KOT printing. When off, no waiter or KDS role can print or
                  auto-print, regardless of individual settings. Admins always retain full print access.
                </p>
              </div>
            </div>

            {/* Auto-print toggle */}
            <div
              className={`flex items-start gap-4 p-4 border-2 border-border rounded-xl bg-accent/20 transition-opacity ${
                !restaurantWide ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Switch
                checked={autoPrint}
                onCheckedChange={setAutoPrint}
                className="mt-1 data-[state=checked]:bg-primary"
                disabled={saving || !restaurantWide}
              />
              <div className="flex-1">
                <Label className="text-base font-serif font-bold text-primary flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Auto-print KOT on Creation
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  When on, every new KOT (initial order and each additional child ticket) automatically
                  triggers the browser print flow. No per-order waiter control. Respects the
                  restaurant-wide and per-waiter permission settings.
                </p>
              </div>
            </div>

            {/* Per-waiter settings */}
            <div className="border-2 border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b-2 border-border">
                <Users className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-bold text-primary uppercase tracking-wide">
                  Per-waiter Print Settings
                </h4>
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Disable printing for individual waiters. Per-waiter settings can only restrict, never
                  expand — a waiter prints only when both the restaurant-wide toggle and their own
                  setting allow it.
                </p>
                {waiters.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    No waiter accounts found.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {waiters.map((w) => {
                      const enabled = perWaiter[w.id] !== false;
                      return (
                        <div
                          key={w.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {w.displayName || w.username || 'Waiter'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {w.username || w.email || ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-bold uppercase ${
                                enabled ? 'text-emerald-700' : 'text-destructive'
                              }`}
                            >
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <Switch
                              checked={enabled}
                              onCheckedChange={(v) => toggleWaiter(w.id, v)}
                              disabled={saving || !restaurantWide}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!restaurantWide && (
                  <p className="text-xs text-destructive mt-3 flex items-center gap-1.5">
                    <Power className="w-3.5 h-3.5" />
                    Restaurant-wide printing is off — per-waiter settings are inactive.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="min-w-[140px]">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Save Settings
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
