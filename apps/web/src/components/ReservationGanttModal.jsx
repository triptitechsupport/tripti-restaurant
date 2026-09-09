import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

// 30-minute slot options across the two serving windows.
const TIME_OPTIONS = [
  '11:00', '11:30', '12:00', '12:30', '13:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00',
];

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending', color: 'bg-amber-500' },
  { value: 'Approved', label: 'Confirmed', color: 'bg-emerald-600' },
  { value: 'Completed', label: 'Completed', color: 'bg-blue-600' },
  { value: 'Declined', label: 'Cancelled', color: 'bg-red-600' },
];

const toMinutes = (t) => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

export default function ReservationGanttModal({
  open, onOpenChange, reservation, tables, defaultDate, defaultTableId, defaultStartTime,
  allReservations, onSaved, onDeleted,
}) {
  const isEdit = Boolean(reservation && reservation.id);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    guestName: '', email: '', phone: '',
    date: defaultDate || '',
    startTime: defaultStartTime || '11:00',
    endTime: '',
    partySize: '2',
    assignedTables: [],
    status: 'Pending',
    adminNotes: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (reservation) {
      let tablesArr = reservation.assignedTables;
      if (!Array.isArray(tablesArr) || tablesArr.length === 0) {
        tablesArr = reservation.assignedTable ? [reservation.assignedTable] : [];
      }
      setForm({
        guestName: reservation.guestName || '',
        email: reservation.email || '',
        phone: reservation.phone || '',
        date: (reservation.reservationDate || defaultDate || '').slice(0, 10),
        startTime: reservation.reservationTime || '11:00',
        endTime: reservation.endTime || defaultEndTime(reservation.reservationTime),
        partySize: String(reservation.partySize || reservation.numberOfGuests || '2'),
        assignedTables: tablesArr,
        status: reservation.status || 'Pending',
        adminNotes: reservation.adminNotes || '',
      });
    } else {
      setForm({
        guestName: '', email: '', phone: '',
        date: defaultDate || '',
        startTime: defaultStartTime || '11:00',
        endTime: defaultEndTime(defaultStartTime || '11:00'),
        partySize: '2',
        assignedTables: defaultTableId ? [defaultTableId] : [],
        status: 'Pending',
        adminNotes: '',
      });
    }
    setErrors({});
  }, [open, reservation, defaultDate, defaultTableId, defaultStartTime]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const toggleTable = (id) => {
    setForm((p) => {
      const has = p.assignedTables.includes(id);
      return { ...p, assignedTables: has ? p.assignedTables.filter((t) => t !== id) : [...p.assignedTables, id] };
    });
  };

  const validate = () => {
    const e = {};
    if (!form.guestName.trim()) e.guestName = 'Guest name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'Valid email is required';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    if (!form.date) e.date = 'Date is required';
    if (!form.startTime) e.startTime = 'Start time is required';
    if (!form.endTime) e.endTime = 'End time is required';
    else {
      const s = toMinutes(form.startTime);
      const en = toMinutes(form.endTime);
      if (s != null && en != null && en <= s) e.endTime = 'End time must be after start time';
    }
    const ps = parseInt(form.partySize, 10);
    if (!ps || ps < 1) e.partySize = 'Party size must be at least 1';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    // Conflict prevention: reject overlaps with other active reservations on
    // the same table(s) for the chosen date. Mirrors the GanttChart drag
    // conflict check so Manual Fit can never create a double-booking.
    if (Array.isArray(allReservations) && form.assignedTables.length > 0) {
      const dateStr = (form.date || '').slice(0, 10);
      const s = toMinutes(form.startTime);
      const en = toMinutes(form.endTime);
      const tset = new Set(form.assignedTables);
      const conflict = allReservations.some((r) => {
        if (reservation && r.id === reservation.id) return false;
        if (r.status === 'Declined') return false;
        const rDate = (r.reservationDate || '').slice(0, 10);
        if (rDate !== dateStr) return false;
        const rs = toMinutes(r.reservationTime);
        let re = toMinutes(r.endTime);
        if (re == null) re = rs != null ? rs + 90 : null;
        if (rs == null || re == null) return false;
        if (!(s < re && en > rs)) return false;
        let rTids = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
          ? r.assignedTables
          : (r.assignedTable ? [r.assignedTable] : []);
        if (rTids.length === 0) return false;
        return rTids.some((t) => tset.has(t));
      });
      if (conflict) {
        toast.error('Conflict detected — this table is already booked for that time. Choose a different table or time.');
        return;
      }
    }
    setSaving(true);
    try {
      const dateStr = form.date + ' 12:00:00.000Z';
      const primaryTable = form.assignedTables[0] || '';
      const data = {
        guestName: form.guestName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        reservationDate: dateStr,
        reservationTime: form.startTime,
        endTime: form.endTime,
        numberOfGuests: parseInt(form.partySize, 10),
        partySize: parseInt(form.partySize, 10),
        assignedTable: primaryTable,
        assignedTables: form.assignedTables,
        status: form.status,
        adminNotes: form.adminNotes.trim(),
        paymentStatus: reservation?.paymentStatus || 'unpaid',
      };
      if (isEdit) {
        await pb.collection('table_reservations').update(reservation.id, data, { $autoCancel: false });
        toast.success('Reservation updated');
      } else {
        data.reservationCode = 'RES-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        data.childrenChairsNeeded = false;
        data.numberOfChildrenChairs = 0;
        data.kidsUnder4 = false;
        data.numberOfKidsUnder4 = 0;
        await pb.collection('table_reservations').create(data, { $autoCancel: false });
        toast.success('Reservation created');
      }
      onSaved && onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save reservation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!window.confirm('Delete this reservation? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await pb.collection('table_reservations').delete(reservation.id, { $autoCancel: false });
      toast.success('Reservation deleted');
      onDeleted && onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || 'Failed to delete reservation');
    } finally {
      setDeleting(false);
    }
  };

  const sortedTables = [...tables].sort((a, b) => {
    if (a.room !== b.room) return (a.room || '').localeCompare(b.room || '');
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !deleting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Reservation' : 'New Reservation'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update reservation details, table assignment, or status.' : 'Create a reservation on the timeline.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-guest">Guest Name <span className="text-destructive">*</span></Label>
              <Input id="r-guest" value={form.guestName} onChange={(e) => setField('guestName', e.target.value)} />
              {errors.guestName && <p className="text-xs text-destructive">{errors.guestName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-party">Party Size <span className="text-destructive">*</span></Label>
              <Input id="r-party" type="number" min="1" value={form.partySize} onChange={(e) => setField('partySize', e.target.value)} />
              {errors.partySize && <p className="text-xs text-destructive">{errors.partySize}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-email">Email <span className="text-destructive">*</span></Label>
              <Input id="r-email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-phone">Phone <span className="text-destructive">*</span></Label>
              <Input id="r-phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-date">Date <span className="text-destructive">*</span></Label>
              <Input id="r-date" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Start Time <span className="text-destructive">*</span></Label>
              <Select value={form.startTime} onValueChange={(v) => { setField('startTime', v); if (!form.endTime) setField('endTime', defaultEndTime(v)); }}>
                <SelectTrigger><SelectValue placeholder="Start" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t} className="min-h-[40px]">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.startTime && <p className="text-xs text-destructive">{errors.startTime}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>End Time <span className="text-destructive">*</span></Label>
              <Select value={form.endTime} onValueChange={(v) => setField('endTime', v)}>
                <SelectTrigger><SelectValue placeholder="End" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t} className="min-h-[40px]">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.endTime && <p className="text-xs text-destructive">{errors.endTime}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned Tables</Label>
            <p className="text-xs text-muted-foreground -mt-1">Select one table, or multiple adjacent tables for combined/large parties.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/20 border border-border/50 rounded-lg max-h-[160px] overflow-y-auto">
              {sortedTables.length === 0 && <p className="text-xs text-muted-foreground col-span-full">No tables configured.</p>}
              {sortedTables.map((tb) => (
                <label key={tb.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <Checkbox checked={form.assignedTables.includes(tb.id)} onCheckedChange={() => toggleTable(tb.id)} />
                  <span className="font-medium">{tb.name}</span>
                  <span className="text-[10px] text-muted-foreground">{tb.capacity || 4}p</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value} className="min-h-[40px]">{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-notes">Admin Notes</Label>
              <Input id="r-notes" value={form.adminNotes} onChange={(e) => setField('adminNotes', e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          {isEdit && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting || saving} className="text-destructive border-destructive/30 hover:bg-destructive/10 sm:mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || deleting} className="min-w-[120px]">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultEndTime(start) {
  const s = toMinutes(start);
  if (s == null) return '12:30';
  let mins = s + 90;
  if (mins > 21 * 60) mins = 21 * 60;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
