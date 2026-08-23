import React, { useEffect, useState } from 'react';
import { Mail, Loader2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { DEFAULT_EMAIL_TEMPLATES, TEMPLATE_PLACEHOLDERS } from '@/utils/gmailComposer.js';

const FIELD_KEYS = [
  'approvedSubject', 'approvedBody',
  'declinedSubject', 'declinedBody',
  'pendingSubject', 'pendingBody',
  'restaurantPhone', 'restaurantEmail', 'restaurantWebsite',
];

export default function EmailTemplateSettings() {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(DEFAULT_EMAIL_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const list = await pb.collection('email_templates').getList(1, 1, { $autoCancel: false });
      if (list.items.length > 0) {
        const rec = list.items[0];
        setRecord(rec);
        const next = { ...DEFAULT_EMAIL_TEMPLATES };
        FIELD_KEYS.forEach((k) => {
          if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') next[k] = rec[k];
        });
        setForm(next);
      }
    } catch (err) {
      console.error('Failed to load email templates', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data = {};
      FIELD_KEYS.forEach((k) => { data[k] = form[k] || ''; });
      let updated;
      if (record) {
        updated = await pb.collection('email_templates').update(record.id, data, { $autoCancel: false });
      } else {
        updated = await pb.collection('email_templates').create(data, { $autoCancel: false });
      }
      setRecord(updated);
      toast.success('Email templates saved');
    } catch (err) {
      console.error('Failed to save email templates', err);
      toast.error('Failed to save email templates');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setForm({ ...DEFAULT_EMAIL_TEMPLATES });
    toast.info('Reset to defaults. Click Save to apply.');
  };

  const renderTemplateFields = (subjectKey, bodyKey) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold text-foreground block">Subject</label>
        <Input value={form[subjectKey]} onChange={(e) => update(subjectKey, e.target.value)} className="h-11" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold text-foreground block">Message Body</label>
        <Textarea
          value={form[bodyKey]}
          onChange={(e) => update(bodyKey, e.target.value)}
          rows={16}
          className="font-mono text-sm leading-relaxed"
        />
      </div>
    </div>
  );

  return (
    <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b-2 border-border">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="font-serif text-primary text-xl">Email Templates</CardTitle>
            <CardDescription className="font-medium text-foreground">
              Customize the emails sent to guests. Templates are used when you click the email button on a reservation.
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
          <div className="space-y-6">
            <div className="rounded-xl border-2 border-border bg-accent/20 p-4">
              <p className="text-sm font-bold text-primary mb-2">Available placeholders</p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_PLACEHOLDERS.map((p) => (
                  <code key={p} className="text-xs bg-muted px-2 py-1 rounded border border-border font-mono">{p}</code>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These are automatically replaced with the reservation and restaurant details when the email is composed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground block">Restaurant Phone</label>
                <Input value={form.restaurantPhone} onChange={(e) => update('restaurantPhone', e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground block">Restaurant Email</label>
                <Input value={form.restaurantEmail} onChange={(e) => update('restaurantEmail', e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground block">Restaurant Website</label>
                <Input value={form.restaurantWebsite} onChange={(e) => update('restaurantWebsite', e.target.value)} className="h-11" />
              </div>
            </div>

            <Tabs defaultValue="approved" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="declined">Declined</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
              <TabsContent value="approved" className="mt-4">{renderTemplateFields('approvedSubject', 'approvedBody')}</TabsContent>
              <TabsContent value="declined" className="mt-4">{renderTemplateFields('declinedSubject', 'declinedBody')}</TabsContent>
              <TabsContent value="pending" className="mt-4">{renderTemplateFields('pendingSubject', 'pendingBody')}</TabsContent>
            </Tabs>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Templates
              </Button>
              <Button variant="outline" onClick={resetToDefaults} disabled={isSaving}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reset to Defaults
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
