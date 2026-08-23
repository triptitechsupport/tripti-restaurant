import React, { useState, useEffect } from 'react';
import { Save, Settings2, Hash, Users, ListOrdered, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileFormField from '@/components/MobileFormField.jsx';

export default function TableCapacitySettings() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [settingsId, setSettingsId] = useState(null);
  const [formData, setFormData] = useState({ maxPartySize: 8, totalAvailableTables: 10, maxBookingsPerSlot: 8 });

  const fetchSettings = async () => {
    try {
      const records = await pb.collection('booking_settings').getFullList({ $autoCancel: false });
      if (records.length > 0) {
        const setting = records[0];
        setSettingsId(setting.id);
        setFormData({
          maxPartySize: setting.maxPartySize,
          totalAvailableTables: setting.totalAvailableTables,
          maxBookingsPerSlot: setting.maxBookingsPerSlot
        });
      }
    } catch (error) {
      toast.error('Failed to load capacity settings');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    pb.collection('booking_settings').subscribe('*', function (e) {
      if (e.action === 'update' || e.action === 'create') {
        setSettingsId(e.record.id);
        setFormData({
          maxPartySize: e.record.maxPartySize,
          totalAvailableTables: e.record.totalAvailableTables,
          maxBookingsPerSlot: e.record.maxBookingsPerSlot
        });
      }
    });
    return () => pb.collection('booking_settings').unsubscribe('*');
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (settingsId) {
        await pb.collection('booking_settings').update(settingsId, formData, { $autoCancel: false });
      } else {
        const newRecord = await pb.collection('booking_settings').create(formData, { $autoCancel: false });
        setSettingsId(newRecord.id);
      }
      toast.success('Capacity settings updated successfully');
    } catch (error) {
      toast.error('Failed to save capacity settings');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <Card className="shadow-sm border-border">
        <CardHeader className="p-mobile pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
              <Settings2 className="w-5 h-5" />
            </div>
            <CardTitle className="text-xl">Booking & Capacity Rules</CardTitle>
          </div>
          <CardDescription>
            Configure constraints for online table reservations. These limits apply automatically to new bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 md:space-y-8 px-mobile pb-mobile">
          
          <div className="grid gap-6">
            <MobileFormField 
              label={<span className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> Max Party Size</span>} 
              id="maxPartySize"
              description="Maximum number of guests allowed in a single online booking."
            >
              <Input 
                id="maxPartySize" name="maxPartySize" type="number" min="1"
                className="h-12 md:h-14 text-lg font-medium bg-muted/20"
                value={formData.maxPartySize} onChange={handleChange}
              />
            </MobileFormField>

            <MobileFormField 
              label={<span className="flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" /> Total Restaurant Tables</span>} 
              id="totalAvailableTables"
              description="Total physical tables available in the restaurant."
            >
              <Input 
                id="totalAvailableTables" name="totalAvailableTables" type="number" min="1"
                className="h-12 md:h-14 text-lg font-medium bg-muted/20"
                value={formData.totalAvailableTables} onChange={handleChange}
              />
            </MobileFormField>

            <MobileFormField 
              label={<span className="flex items-center gap-2"><ListOrdered className="w-4 h-4 text-muted-foreground" /> Max Bookings Per Time Slot</span>} 
              id="maxBookingsPerSlot"
              description="Maximum distinct bookings accepted within one time slot."
            >
              <Input 
                id="maxBookingsPerSlot" name="maxBookingsPerSlot" type="number" min="1"
                className="h-12 md:h-14 text-lg font-medium bg-muted/20"
                value={formData.maxBookingsPerSlot} onChange={handleChange}
              />
            </MobileFormField>
          </div>

        </CardContent>
        <CardFooter className="bg-muted/20 border-t p-mobile">
          <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto h-12 md:h-14 px-8 text-base font-semibold">
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}