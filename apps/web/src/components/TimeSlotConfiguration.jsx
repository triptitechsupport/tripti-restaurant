import React, { useState, useEffect } from 'react';
import { Clock, Edit2, CheckCircle2, Plus, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileTableCard from '@/components/MobileTableCard.jsx';
import MobileFormField from '@/components/MobileFormField.jsx';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function TimeSlotConfiguration() {
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  
  const isMobile = useIsMobile();

  const fetchTimeSlots = async () => {
    try {
      const records = await pb.collection('time_slots').getList(1, 500, {
        sort: 'order',
        $autoCancel: false
      });
      setTimeSlots(records.items);
    } catch (error) {
      console.error('Error fetching time slots:', error);
      toast.error('Failed to load time slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeSlots();

    pb.collection('time_slots').subscribe('*', function (e) {
      fetchTimeSlots();
    });

    return () => pb.collection('time_slots').unsubscribe('*');
  }, []);

  const handleAddClick = () => {
    setIsNew(true);
    setEditingSlot({ name: '', startTime: '12:00', endTime: '13:00', slotType: 'lunch', order: timeSlots.length + 1 });
    setIsDialogOpen(true);
  };

  const handleEditClick = (slot) => {
    setIsNew(false);
    setEditingSlot({ ...slot });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm('Are you sure you want to delete this time slot?')) return;
    setActionLoading(true);
    try {
      await pb.collection('time_slots').delete(id, { $autoCancel: false });
      toast.success('Time slot deleted successfully');
    } catch (error) {
      toast.error('Failed to delete time slot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSlot.name || !editingSlot.startTime || !editingSlot.endTime) {
      toast.error('Please fill in all required fields');
      return;
    }
    setActionLoading(true);
    try {
      if (isNew) {
        await pb.collection('time_slots').create(editingSlot, { $autoCancel: false });
        toast.success('Time slot created successfully');
      } else {
        await pb.collection('time_slots').update(editingSlot.id, {
          name: editingSlot.name, startTime: editingSlot.startTime, endTime: editingSlot.endTime, slotType: editingSlot.slotType, order: parseInt(editingSlot.order) || 1
        }, { $autoCancel: false });
        toast.success('Time slot updated successfully');
      }
      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to save time slot');
    } finally {
      setActionLoading(false);
    }
  };

  const lunchSlots = timeSlots.filter(s => s.slotType === 'lunch');
  const dinnerSlots = timeSlots.filter(s => s.slotType === 'dinner');

  if (loading) {
    return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const renderSlots = (slots, title, Icon, badgeColor, badgeText, badgeBg) => (
    <Card className="flex flex-col h-full shadow-sm border-border">
      <CardHeader className="p-mobile pb-4">
        <div className="flex items-start sm:items-center justify-between gap-4 mb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Icon className={`w-5 h-5 ${badgeColor}`} /> {title}
          </CardTitle>
          <Badge variant="outline" className={`${badgeBg} ${badgeColor} border-${badgeColor}/20 shrink-0`}>{badgeText}</Badge>
        </div>
        <CardDescription>Manage available time slots for {title.toLowerCase()} reservations.</CardDescription>
      </CardHeader>
      <CardContent className="px-mobile pb-mobile pt-0 flex-1">
        {slots.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border border-dashed rounded-xl bg-muted/20">No {title.toLowerCase()} slots configured</div>
        ) : isMobile ? (
          <div className="space-y-3">
            {slots.map(slot => (
              <MobileTableCard
                key={slot.id}
                header={<div className="font-semibold text-lg text-foreground">{slot.name}</div>}
                subHeader={<div className="text-sm font-medium text-muted-foreground">{slot.startTime} - {slot.endTime}</div>}
                actions={
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-11" onClick={() => handleEditClick(slot)}><Edit2 className="w-4 h-4 mr-2"/> Edit</Button>
                    <Button variant="outline" className="h-11 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleDeleteClick(slot.id)}><Trash2 className="w-4 h-4 mr-2"/> Delete</Button>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Slot Name</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map(slot => (
                  <TableRow key={slot.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{slot.name}</TableCell>
                    <TableCell className="text-muted-foreground">{slot.startTime} - {slot.endTime}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEditClick(slot)}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => handleDeleteClick(slot.id)}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border shadow-sm">
        <div>
          <h3 className="text-lg font-semibold">Service Hours</h3>
          <p className="text-sm text-muted-foreground hidden sm:block">Configure when guests can book a table.</p>
        </div>
        <Button onClick={handleAddClick} className="min-h-touch">
          <Plus className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Add Time Slot</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {renderSlots(lunchSlots, 'Lunch Service', Clock, 'text-primary', 'Daytime', 'bg-primary/10')}
        {renderSlots(dinnerSlots, 'Dinner Service', Clock, 'text-secondary-foreground', 'Evening', 'bg-secondary/10')}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="modal-mobile-safe">
          <DialogHeader>
            <DialogTitle className="text-xl">{isNew ? 'Add Time Slot' : 'Edit Time Slot'}</DialogTitle>
            <DialogDescription>Modify the schedule for this seating window.</DialogDescription>
          </DialogHeader>
          
          {editingSlot && (
            <div className="space-y-4 md:space-y-6 py-4">
              <MobileFormField label="Slot Name">
                <Input value={editingSlot.name} onChange={e => setEditingSlot({...editingSlot, name: e.target.value})} placeholder="e.g., Early Lunch" />
              </MobileFormField>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <MobileFormField label="Start Time (HH:mm)">
                  <Input type="time" value={editingSlot.startTime} onChange={e => setEditingSlot({...editingSlot, startTime: e.target.value})} />
                </MobileFormField>
                <MobileFormField label="End Time (HH:mm)">
                  <Input type="time" value={editingSlot.endTime} onChange={e => setEditingSlot({...editingSlot, endTime: e.target.value})} />
                </MobileFormField>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <MobileFormField label="Service Type">
                  <Select value={editingSlot.slotType} onValueChange={val => setEditingSlot({...editingSlot, slotType: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lunch" className="min-h-[44px]">Lunch</SelectItem>
                      <SelectItem value="dinner" className="min-h-[44px]">Dinner</SelectItem>
                    </SelectContent>
                  </Select>
                </MobileFormField>
                <MobileFormField label="Display Order">
                  <Input type="number" min="1" value={editingSlot.order} onChange={e => setEditingSlot({...editingSlot, order: e.target.value})} />
                </MobileFormField>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={actionLoading} className="h-12 sm:h-11 w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading} className="h-12 sm:h-11 w-full sm:w-auto">
              {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}