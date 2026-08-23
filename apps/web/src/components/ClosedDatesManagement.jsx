import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarPlus as CalendarIcon, Trash2, Plus, CalendarOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileFormField from '@/components/MobileFormField.jsx';

export default function ClosedDatesManagement() {
  const [closedDates, setClosedDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [reason, setReason] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateToDelete, setDateToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClosedDates = async () => {
    try {
      const records = await pb.collection('closed_dates').getList(1, 500, { sort: '+date', $autoCancel: false });
      setClosedDates(records.items);
    } catch (error) {
      toast.error('Failed to load closed dates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClosedDates();
    pb.collection('closed_dates').subscribe('*', () => fetchClosedDates());
    return () => pb.collection('closed_dates').unsubscribe('*');
  }, []);

  const handleAddClosedDate = async () => {
    if (!selectedDate) { toast.error('Please select a date'); return; }
    setActionLoading(true);
    try {
      const dateStr = selectedDate.toISOString();
      await pb.collection('closed_dates').create({ date: dateStr, reason: reason || 'Closed' }, { $autoCancel: false });
      toast.success('Closed date added successfully');
      setSelectedDate(null);
      setReason('');
    } catch (error) {
      toast.error('Failed to add closed date');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!dateToDelete) return;
    setActionLoading(true);
    try {
      await pb.collection('closed_dates').delete(dateToDelete.id, { $autoCancel: false });
      toast.success('Closed date removed');
      setIsDialogOpen(false);
      setDateToDelete(null);
    } catch (error) {
      toast.error('Failed to delete closed date');
    } finally {
      setActionLoading(false);
    }
  };

  const disabledDays = closedDates.map(record => new Date(record.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-300">
      <div className="lg:col-span-1 space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="p-mobile pb-4">
            <CardTitle>Add Closed Date</CardTitle>
            <CardDescription>Select a date to block all reservations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-mobile pb-mobile pt-0">
            <div className="border rounded-xl p-2 sm:p-4 flex justify-center bg-card shadow-sm">
              <Calendar 
                mode="single" 
                selected={selectedDate} 
                onSelect={setSelectedDate}
                modifiers={{ closed: disabledDays }}
                modifiersStyles={{ closed: { textDecoration: 'line-through', color: 'var(--destructive)' } }}
                className="scale-90 sm:scale-100"
              />
            </div>
            
            <MobileFormField label="Reason (Optional)" id="reason">
              <Input id="reason" placeholder="e.g., Private Event, Holiday" value={reason} onChange={e => setReason(e.target.value)} />
            </MobileFormField>
            
            <Button onClick={handleAddClosedDate} className="w-full min-h-[48px] text-base" disabled={!selectedDate || actionLoading}>
              {actionLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
              Block Date
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="h-full shadow-sm">
          <CardHeader className="p-mobile pb-4">
            <CardTitle>Upcoming Closed Dates</CardTitle>
            <CardDescription>Manage your scheduled restaurant closures.</CardDescription>
          </CardHeader>
          <CardContent className="px-mobile pb-mobile pt-0">
            {loading ? (
              <div className="flex justify-center items-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading dates...
              </div>
            ) : closedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border rounded-2xl border-dashed bg-muted/20">
                <CalendarOff className="h-14 w-14 text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-medium text-foreground mb-1">No blocked dates</h3>
                <p className="text-muted-foreground text-sm max-w-[200px] mx-auto">The restaurant is open every scheduled day.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {closedDates.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/40 transition-colors shadow-sm bg-card">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                        <CalendarOff className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-base sm:text-lg text-foreground leading-tight">
                          {format(new Date(record.date), 'EEEE, MMMM d, yyyy')}
                        </div>
                        <div className="text-sm font-medium text-muted-foreground mt-1">
                          {record.reason || 'Closed for reservations'}
                        </div>
                      </div>
                    </div>
                    
                    <Dialog open={isDialogOpen && dateToDelete?.id === record.id} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDateToDelete(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0" onClick={() => setDateToDelete(record)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="modal-mobile-safe">
                        <DialogHeader>
                          <DialogTitle>Remove Blocked Date</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to reopen {format(new Date(record.date), 'MMMM d, yyyy')} for reservations?
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2 mt-4">
                          <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={actionLoading} className="h-12 sm:h-10 w-full sm:w-auto">Cancel</Button>
                          <Button variant="destructive" onClick={handleDelete} disabled={actionLoading} className="h-12 sm:h-10 w-full sm:w-auto">
                            {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Remove
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}