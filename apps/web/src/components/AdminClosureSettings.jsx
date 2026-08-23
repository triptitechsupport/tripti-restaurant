import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, Pencil, Loader2, Save, CalendarX, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

function formatDateRange(startStr, endStr) {
  try {
    const start = format(new Date(startStr.slice(0, 10) + 'T12:00:00'), 'MMM d, yyyy');
    const end = format(new Date(endStr.slice(0, 10) + 'T12:00:00'), 'MMM d, yyyy');
    if (startStr.slice(0, 10) === endStr.slice(0, 10)) return start;
    return `${start} — ${end}`;
  } catch {
    return '—';
  }
}

export default function AdminClosureSettings() {
  const [hoursRecord, setHoursRecord] = useState(null);
  const [closedWeekday, setClosedWeekday] = useState('3');
  const [savingWeekday, setSavingWeekday] = useState(false);

  const [closedDates, setClosedDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const loadHours = async () => {
      try {
        const res = await pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false });
        if (res.items.length > 0) {
          setHoursRecord(res.items[0]);
          setClosedWeekday(String(res.items[0].closedWeekday ?? 3));
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadHours();

    const loadDates = async () => {
      try {
        setLoadingDates(true);
        const res = await pb.collection('closed_dates').getFullList({ sort: 'start_date', $autoCancel: false });
        setClosedDates(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingDates(false);
      }
    };
    loadDates();
  }, []);

  const saveWeekday = async () => {
    setSavingWeekday(true);
    try {
      const dayNum = parseInt(closedWeekday, 10);
      if (hoursRecord) {
        const updated = await pb.collection('restaurant_hours').update(hoursRecord.id, { closedWeekday: dayNum }, { $autoCancel: false });
        setHoursRecord(updated);
      } else {
        const created = await pb.collection('restaurant_hours').create({ closedWeekday: dayNum }, { $autoCancel: false });
        setHoursRecord(created);
      }
      toast.success('Closed weekday updated!');
    } catch (e) {
      toast.error('Failed to save.');
      console.error(e);
    } finally {
      setSavingWeekday(false);
    }
  };

  const openAdd = () => {
    setEditingRecord(null);
    setFormStartDate('');
    setFormEndDate('');
    setFormReason('');
    setDialogOpen(true);
  };

  const openEdit = (rec) => {
    setEditingRecord(rec);
    setFormStartDate(rec.start_date ? rec.start_date.slice(0, 10) : '');
    setFormEndDate(rec.end_date ? rec.end_date.slice(0, 10) : '');
    setFormReason(rec.reason || '');
    setDialogOpen(true);
  };

  const handleSaveDate = async () => {
    if (!formStartDate) { toast.error('Start date is required.'); return; }
    if (!formEndDate) { toast.error('End date is required.'); return; }
    if (formEndDate < formStartDate) { toast.error('End date must be on or after start date.'); return; }

    setSavingDate(true);
    try {
      const payload = {
        start_date: formStartDate,
        end_date: formEndDate,
        reason: formReason.trim(),
      };
      if (editingRecord) {
        const updated = await pb.collection('closed_dates').update(editingRecord.id, payload, { $autoCancel: false });
        setClosedDates(prev => prev.map(d => d.id === updated.id ? updated : d).sort((a, b) => a.start_date > b.start_date ? 1 : -1));
        toast.success('Closure period updated!');
      } else {
        const created = await pb.collection('closed_dates').create(payload, { $autoCancel: false });
        setClosedDates(prev => [...prev, created].sort((a, b) => a.start_date > b.start_date ? 1 : -1));
        toast.success('Closure period added!');
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error('Failed to save.');
      console.error(e);
    } finally {
      setSavingDate(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await pb.collection('closed_dates').delete(id, { $autoCancel: false });
      setClosedDates(prev => prev.filter(d => d.id !== id));
      toast.success('Closure period removed.');
    } catch (e) {
      toast.error('Failed to delete.');
    } finally {
      setDeletingId(null);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Closed Weekday */}
      <div className="bg-card border-2 border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-xl text-primary"><Clock className="w-5 h-5" /></div>
          <h3 className="text-xl font-serif font-bold text-primary">Weekly Closed Day</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          The restaurant will be marked as closed every week on this day. Reservations on this day will be disabled.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 max-w-xs space-y-2">
            <Label className="font-semibold text-primary">Closed Weekday</Label>
            <Select value={closedWeekday} onValueChange={setClosedWeekday}>
              <SelectTrigger className="h-11 border-2 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveWeekday} disabled={savingWeekday} className="h-11">
            {savingWeekday ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {/* Holiday / Closure Date Ranges */}
      <div className="bg-card border-2 border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl text-primary"><CalendarX className="w-5 h-5" /></div>
            <h3 className="text-xl font-serif font-bold text-primary">Holiday & Closure Dates</h3>
          </div>
          <Button size="sm" onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" /> Add Date Range
          </Button>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Add date ranges when the restaurant will be closed (holidays, vacations, renovations). All dates within the range (inclusive) will block reservations and show a closure marquee.
        </p>

        {loadingDates ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : closedDates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
            No closure periods configured yet.
          </div>
        ) : (
          <div className="space-y-2">
            {closedDates.map(rec => (
              <div key={rec.id} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                <div>
                  <p className="font-semibold text-foreground">{formatDateRange(rec.start_date, rec.end_date)}</p>
                  {rec.reason && <p className="text-sm text-muted-foreground mt-0.5">{rec.reason}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEdit(rec)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setDeleteId(rec.id)}
                    disabled={deletingId === rec.id}
                  >
                    {deletingId === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editingRecord ? 'Edit Closure Period' : 'Add Closure Period'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-primary">Start Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={e => {
                    setFormStartDate(e.target.value);
                    if (formEndDate && e.target.value > formEndDate) setFormEndDate(e.target.value);
                  }}
                  className="h-11 border-2 bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-primary">End Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={formEndDate}
                  min={formStartDate}
                  onChange={e => setFormEndDate(e.target.value)}
                  className="h-11 border-2 bg-background"
                />
              </div>
            </div>
            {formStartDate && formEndDate && formStartDate === formEndDate && (
              <p className="text-xs text-muted-foreground">Single day closure</p>
            )}
            {formStartDate && formEndDate && formStartDate !== formEndDate && (
              <p className="text-xs text-muted-foreground">
                All dates from {formStartDate} to {formEndDate} (inclusive) will be blocked.
              </p>
            )}
            <div className="space-y-2">
              <Label className="font-semibold text-primary">Reason / Description (optional)</Label>
              <Input
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                placeholder="e.g. National Holiday, Summer Vacation, Renovation…"
                className="h-11 border-2 bg-background"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDate} disabled={savingDate}>
              {savingDate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingRecord ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-destructive">Delete Closure Period</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2">Are you sure you want to remove this closure period? This action cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteId)}
              disabled={!!deletingId}
            >
              {deletingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
