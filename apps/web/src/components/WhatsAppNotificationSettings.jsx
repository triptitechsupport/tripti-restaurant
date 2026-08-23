import React, { useEffect, useState } from 'react';
import { MessageCircle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';

export default function WhatsAppNotificationSettings() {
  const [record, setRecord] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const list = await pb.collection('notification_settings').getList(1, 1, { $autoCancel: false });
      if (list.items.length > 0) {
        const rec = list.items[0];
        setRecord(rec);
        setEnabled(!!rec.whatsappEnabled);
        setNumber(rec.whatsappNumber || '');
        setApiKey(rec.whatsappApiKey || '');
      }
    } catch (err) {
      console.error('Failed to load notification settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data = {
        whatsappEnabled: enabled,
        whatsappNumber: number.trim(),
        whatsappApiKey: apiKey.trim(),
      };
      let updated;
      if (record) {
        updated = await pb.collection('notification_settings').update(record.id, data, { $autoCancel: false });
      } else {
        updated = await pb.collection('notification_settings').create(data, { $autoCancel: false });
      }
      setRecord(updated);
      toast.success('WhatsApp notification settings saved');
    } catch (err) {
      console.error('Failed to save notification settings', err);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b-2 border-border">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="font-serif text-primary text-xl">WhatsApp Notifications</CardTitle>
            <CardDescription className="font-medium text-foreground">
              Receive a WhatsApp message whenever a new reservation request arrives.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-start gap-5 p-4 border-2 border-border rounded-xl bg-accent/20">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                className="mt-1 data-[state=checked]:bg-primary"
              />
              <div>
                <label className="text-lg font-serif font-bold text-primary block mb-1">Enable WhatsApp Alerts</label>
                <p className="text-sm font-medium text-foreground">Send a WhatsApp message to your phone for each new reservation.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground block">WhatsApp Number</label>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+491701234567"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Include the country code (e.g. +49 for Germany, +43 for Austria).</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground block">CallMeBot API Key</label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="123456"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Get a free API key: on WhatsApp, send the message
                {' '}<span className="font-semibold">"I allow callmebot to send me messages"</span> to
                {' '}<span className="font-semibold">+34 644 51 95 23</span>. You will receive your API key by reply.
              </p>
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
