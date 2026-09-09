import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, RefreshCw, Plus,
  AlertTriangle, Clock, Users, X, Phone, Mail, Hash, Sparkles, Hand, Baby, CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { cn } from '@/lib/utils';
import ReservationGanttModal from '@/components/ReservationGanttModal.jsx';

// ---- Serving windows (minutes from midnight) ----
const LUNCH_START = 11 * 60; // 660
const LUNCH_END = 13 * 60;   // 780
const DINNER_START = 17 * 60; // 1020
const DINNER_END = 21 * 60;   // 1260
const GAP = DINNER_START - LUNCH_END; // 240 (13:00-17:00 closed)
const LUNCH_SPAN = LUNCH_END - LUNCH_START; // 120
const TOTAL_SPAN = LUNCH_SPAN + (DINNER_END - DINNER_START); // 360

const COL_MINUTES = 30;
const COL_WIDTH = 68;
const ROW_HEIGHT = 58;
const LABEL_WIDTH = 96;

// Column boundary labels (each = 30 min)
const COL_LABELS = [
  '11:00', '11:30', '12:00', '12:30', '13:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00',
];
// Index in COL_LABELS where dinner begins (after 13:00)
const DINNER_COL_INDEX = 5;

const toMinutes = (t) => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
const toStr = (mins) => {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
};

// real minutes -> offset minutes (collapses the 13:00-17:00 gap)
const realToOffset = (t) => {
  if (t == null) return 0;
  if (t <= LUNCH_END) return Math.max(0, t - LUNCH_START);
  if (t >= DINNER_START) return LUNCH_SPAN + (t - DINNER_START);
  // inside gap -> clamp to lunch end
  return LUNCH_SPAN;
};
// offset minutes -> real minutes
const offsetToReal = (off) => {
  if (off <= LUNCH_SPAN) return LUNCH_START + off;
  return DINNER_START + (off - LUNCH_SPAN);
};

const timeToX = (t) => (realToOffset(toMinutes(t)) / COL_MINUTES) * COL_WIDTH;
const xToOffsetMin = (x) => {
  let off = (x / COL_WIDTH) * COL_MINUTES;
  off = Math.round(off / COL_MINUTES) * COL_MINUTES; // snap to 30
  return Math.max(0, Math.min(TOTAL_SPAN, off));
};

const STATUS_STYLE = {
  Approved: { bg: 'bg-emerald-500/85', border: 'border-emerald-700', text: 'text-white', label: 'Confirmed', dot: 'bg-emerald-600' },
  Pending: { bg: 'bg-amber-400/90', border: 'border-amber-600', text: 'text-amber-950', label: 'Pending', dot: 'bg-amber-500' },
  Completed: { bg: 'bg-blue-500/85', border: 'border-blue-700', text: 'text-white', label: 'Completed', dot: 'bg-blue-600' },
  Declined: { bg: 'bg-red-500/70', border: 'border-red-700', text: 'text-white', label: 'Cancelled', dot: 'bg-red-600' },
};

export default function GanttChart({ initialDate, focusReservationId, onFocusConsumed }) {
  const [selectedDate, setSelectedDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : format(new Date(), 'yyyy-MM-dd')
  );
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [closedWeekday, setClosedWeekday] = useState(3);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null); // {id, mode, startPx, origStart, origEnd, origRowIdx, newStart, newEnd, newRowIdx, moved, conflict}
  const [modal, setModal] = useState({ open: false, reservation: null, defaultTableId: null, defaultStartTime: null });
  const [autoFitting, setAutoFitting] = useState(false);
  // Fallback when the focused reservation isn't in the current day's list yet
  // (wrong date, still loading, or filter mismatch) — loaded by id.
  const [focusedFallback, setFocusedFallback] = useState(null);
  const focusPanelRef = useRef(null);

  const bodyRef = useRef(null);
  const dragRef = useRef(null);

  // Keep the calendar on the date supplied by "View Notification".
  useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && initialDate !== selectedDate) {
      setSelectedDate(initialDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);

  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => {
      if (a.room !== b.room) return (a.room || '').localeCompare(b.room || '');
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [tables]);

  const fetchTables = useCallback(async () => {
    try {
      const records = await pb.collection('table_configurations').getFullList({ sort: 'room,name', $autoCancel: false });
      setTables(records);
    } catch (err) {
      console.error('Failed to load tables', err);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const day = parseISO(selectedDate);
      const next = addDays(day, 1);
      const records = await pb.collection('table_reservations').getFullList({
        filter: `reservationDate >= "${format(day, 'yyyy-MM-dd')}" && reservationDate < "${format(next, 'yyyy-MM-dd')}"`,
        $autoCancel: false,
      });
      setReservations(records);
    } catch (err) {
      console.error('Failed to load reservations', err);
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false })
      .then((res) => { if (res.items.length > 0) setClosedWeekday(res.items[0].closedWeekday ?? 3); })
      .catch(() => {});
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    fetchReservations();
    void pb.collection('table_reservations').subscribe('*', () => fetchReservations()).catch((error) => console.error('Realtime subscription failed', error));
    void pb.collection('table_configurations').subscribe('*', () => fetchTables()).catch((error) => console.error('Realtime subscription failed', error));
    return () => {
      pb.collection('table_reservations').unsubscribe('*').catch(() => {});
      pb.collection('table_configurations').unsubscribe('*').catch(() => {});
    };
  }, [fetchReservations, fetchTables]);

  // Build per-table reservation blocks for the selected date.
  const tableBlocks = useMemo(() => {
    const map = new Map(); // tableId -> blocks[]
    sortedTables.forEach((t) => map.set(t.id, []));
    reservations.forEach((r) => {
      let tids = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
        ? r.assignedTables
        : (r.assignedTable ? [r.assignedTable] : []);
      if (tids.length === 0) return; // unassigned reservations aren't placed on the grid
      tids.forEach((tid) => {
        if (map.has(tid)) map.get(tid).push(r);
      });
    });
    return map;
  }, [reservations, sortedTables]);

  // Conflict check: does (start,end,tableIds) overlap any other non-declined reservation?
  const hasConflict = useCallback((id, startMin, endMin, tableIds, dateStr) => {
    const tset = new Set(tableIds);
    return reservations.some((r) => {
      if (r.id === id) return false;
      if (r.status === 'Declined') return false;
      const rDate = (r.reservationDate || '').slice(0, 10);
      if (rDate !== dateStr) return false;
      const rs = toMinutes(r.reservationTime);
      let re = toMinutes(r.endTime);
      if (re == null) re = (rs != null ? rs + 90 : null);
      if (rs == null || re == null) return false;
      if (!(startMin < re && endMin > rs)) return false; // no time overlap
      let rTids = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
        ? r.assignedTables
        : (r.assignedTable ? [r.assignedTable] : []);
      if (rTids.length === 0) return false;
      return rTids.some((t) => tset.has(t));
    });
  }, [reservations]);

  // ---- Focus reservation (arrived via "View Notification") ----
  // Prefer the record from the loaded day list; fall back to a direct getOne
  // so the details panel still appears if the day filter missed it.
  const focusedReservation = useMemo(() => {
    if (!focusReservationId) return null;
    return reservations.find((r) => r.id === focusReservationId) || focusedFallback || null;
  }, [focusReservationId, reservations, focusedFallback]);

  // If the focused id isn't in today's list, fetch it and jump to its date.
  useEffect(() => {
    if (!focusReservationId) {
      setFocusedFallback(null);
      return undefined;
    }
    const inList = reservations.some((r) => r.id === focusReservationId);
    if (inList) {
      setFocusedFallback(null);
      return undefined;
    }
    let cancelled = false;
    pb.collection('table_reservations')
      .getOne(focusReservationId, { $autoCancel: false })
      .then((rec) => {
        if (cancelled) return;
        setFocusedFallback(rec);
        const d = (rec.reservationDate || '').toString().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d !== selectedDate) {
          setSelectedDate(d);
        }
      })
      .catch((err) => {
        console.error('[GanttChart] failed to load focused reservation', err);
      });
    return () => { cancelled = true; };
  }, [focusReservationId, reservations, selectedDate]);

  // Scroll the focus panel into view once it mounts.
  useEffect(() => {
    if (!focusedReservation || !focusPanelRef.current) return undefined;
    const t = setTimeout(() => {
      focusPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => clearTimeout(t);
  }, [focusedReservation?.id]);

  // Auto Fit: place the reservation on the first free table that fits the
  // party, at the requested time if possible, otherwise the nearest free
  // 30-min slot within the serving windows. Conflict prevention is enforced
  // via hasConflict for every candidate. On success the reservation is
  // assigned and marked Approved.
  const autoFit = async (res) => {
    if (!res || autoFitting) return;
    setAutoFitting(true);
    try {
      const dateMatch = (res.reservationDate || '').toString().match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : selectedDate;
      const reqStart = toMinutes(res.reservationTime) ?? LUNCH_START;
      let reqEnd = toMinutes(res.endTime);
      const duration = reqEnd && reqEnd > reqStart ? reqEnd - reqStart : 90;
      const partySize = res.partySize || res.numberOfGuests || 1;

      // Fresh day snapshot so conflict checks aren't stale if we just jumped
      // here from a notification while the grid was still loading.
      let dayReservations = reservations;
      try {
        const day = parseISO(dateStr);
        const next = addDays(day, 1);
        dayReservations = await pb.collection('table_reservations').getFullList({
          filter: `reservationDate >= "${format(day, 'yyyy-MM-dd')}" && reservationDate < "${format(next, 'yyyy-MM-dd')}"`,
          $autoCancel: false,
        });
      } catch {
        /* fall back to in-memory list */
      }

      const conflictsOn = (id, startMin, endMin, tableIds) => {
        const tset = new Set(tableIds);
        return dayReservations.some((r) => {
          if (r.id === id) return false;
          if (r.status === 'Declined') return false;
          const rs = toMinutes(r.reservationTime);
          let re = toMinutes(r.endTime);
          if (re == null) re = rs != null ? rs + 90 : null;
          if (rs == null || re == null) return false;
          if (!(startMin < re && endMin > rs)) return false;
          let rTids = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
            ? r.assignedTables
            : (r.assignedTable ? [r.assignedTable] : []);
          if (rTids.length === 0) return false;
          return rTids.some((t) => tset.has(t));
        });
      };

      // Prefer tables whose capacity fits the party (smallest first so we
      // don't waste large tables); fall back to any table if none fit.
      const fitting = sortedTables
        .filter((t) => (t.capacity || 4) >= partySize)
        .sort((a, b) => (a.capacity || 4) - (b.capacity || 4));
      const others = sortedTables
        .filter((t) => (t.capacity || 4) < partySize)
        .sort((a, b) => (a.capacity || 4) - (b.capacity || 4));
      const candidateTables = [...fitting, ...others];

      if (candidateTables.length === 0) {
        toast.error('No tables configured. Add tables in the Tables tab first.');
        return;
      }

      const findTableAt = (s, e) => {
        for (const t of candidateTables) {
          if (!conflictsOn(res.id, s, e, [t.id])) return t;
        }
        return null;
      };

      // 1) Try the requested time first.
      let chosen = findTableAt(reqStart, reqStart + duration);
      let chosenStart = reqStart;
      let chosenEnd = reqStart + duration;

      // 2) If blocked, search outward in 30-min steps (earlier and later),
      //    staying inside the lunch/dinner windows and never spanning the
      //    13:00–17:00 closed gap.
      if (!chosen) {
        const tried = new Set([0]);
        let found = false;
        for (let step = 30; step <= 150 && !found; step += 30) {
          for (const sign of [1, -1]) {
            const key = sign * step;
            if (tried.has(key)) continue;
            tried.add(key);
            let s = reqStart + sign * step;
            let e = s + duration;
            // Clamp into serving windows.
            if (s < LUNCH_START) { s = LUNCH_START; e = s + duration; }
            if (s >= LUNCH_END && s < DINNER_START) { s = DINNER_START; e = s + duration; }
            if (e > DINNER_END) continue;
            // Reject blocks that span the closed gap.
            if (s < LUNCH_END && e > LUNCH_END && e <= DINNER_START) e = LUNCH_END;
            if (s < LUNCH_END && e > DINNER_START) continue;
            if (s >= LUNCH_END && s < DINNER_START) continue;
            if (e - s < 30) continue;
            const t = findTableAt(s, e);
            if (t) { chosen = t; chosenStart = s; chosenEnd = e; found = true; break; }
          }
        }
      }

      if (!chosen) {
        toast.error('No free table or time slot found for this reservation. Try Manual Fit.');
        return;
      }

      const data = {
        assignedTable: chosen.id,
        assignedTables: [chosen.id],
        reservationTime: toStr(chosenStart),
        endTime: toStr(chosenEnd),
        status: 'Approved',
      };
      await pb.collection('table_reservations').update(res.id, data, { $autoCancel: false });
      toast.success(`Auto-fit: ${res.guestName} → ${chosen.name} at ${toStr(chosenStart)}–${toStr(chosenEnd)}`);
      setFocusedFallback(null);
      if (onFocusConsumed) onFocusConsumed();
      // Jump calendar to the placed date so the new block is visible.
      // Changing selectedDate re-fetches via the effect; only call fetch
      // directly when the date is already correct.
      if (dateStr && dateStr !== selectedDate) {
        setSelectedDate(dateStr);
      } else {
        fetchReservations();
      }
    } catch (err) {
      console.error('[GanttChart] autoFit failed', err);
      toast.error(err?.message || 'Auto-fit failed');
    } finally {
      setAutoFitting(false);
    }
  };

  // Manual Fit: open the edit modal pre-loaded with the reservation so the
  // admin can choose the table/time themselves. Conflict prevention is
  // enforced inside the modal on save.
  const manualFit = (res) => {
    if (!res) return;
    setModal({ open: true, reservation: res, defaultTableId: null, defaultStartTime: null });
  };

  // ---- Drag handlers ----
  const onBlockPointerDown = (e, res, mode) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const startMin = toMinutes(res.reservationTime);
    let endMin = toMinutes(res.endTime);
    if (endMin == null) endMin = startMin + 90;
    const rowIdx = sortedTables.findIndex((t) => {
      let tids = Array.isArray(res.assignedTables) && res.assignedTables.length > 0
        ? res.assignedTables
        : (res.assignedTable ? [res.assignedTable] : []);
      return tids.includes(t.id);
    });
    const primaryIdx = rowIdx === -1 ? 0 : rowIdx;
    const state = {
      id: res.id, mode, startPx: e.clientX, startY: e.clientY,
      origStart: startMin, origEnd: endMin, origRowIdx: primaryIdx,
      newStart: startMin, newEnd: endMin, newRowIdx: primaryIdx,
      res, moved: false, conflict: false,
    };
    dragRef.current = state;
    setDrag(state);
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startPx;
    const dy = e.clientY - st.startY;
    if (!st.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    st.moved = true;

    const deltaMin = Math.round((dx / COL_WIDTH) * COL_MINUTES / COL_MINUTES) * COL_MINUTES;
    let newStart = st.origStart;
    let newEnd = st.origEnd;
    if (st.mode === 'move') {
      newStart = st.origStart + deltaMin;
      newEnd = st.origEnd + deltaMin;
    } else if (st.mode === 'resize-start') {
      newStart = st.origStart + deltaMin;
      if (newStart >= newEnd) newStart = newEnd - COL_MINUTES;
    } else if (st.mode === 'resize-end') {
      newEnd = st.origEnd + deltaMin;
      if (newEnd <= newStart) newEnd = newStart + COL_MINUTES;
    }
    // Snap to 30-min boundaries
    newStart = Math.round(newStart / COL_MINUTES) * COL_MINUTES;
    newEnd = Math.round(newEnd / COL_MINUTES) * COL_MINUTES;
    // Clamp to serving windows (allow start in lunch/dinner, end within range)
    newStart = Math.max(LUNCH_START, Math.min(DINNER_END - COL_MINUTES, newStart));
    newEnd = Math.max(newStart + COL_MINUTES, Math.min(DINNER_END, newEnd));
    // Prevent block from spanning the closed gap
    if (newStart < LUNCH_END && newEnd > LUNCH_END && newEnd <= DINNER_START) {
      if (st.mode === 'resize-end' || st.mode === 'move') newEnd = LUNCH_END;
    }
    if (newStart < DINNER_START && newStart > LUNCH_END) {
      newStart = st.mode === 'resize-start' ? LUNCH_END : DINNER_START;
      if (newEnd <= newStart) newEnd = newStart + COL_MINUTES;
    }

    // Determine target row from pointer Y (only for move; multi-table blocks keep row)
    let newRowIdx = st.origRowIdx;
    const isMultiTable = (Array.isArray(st.res.assignedTables) ? st.res.assignedTables.length : (st.res.assignedTable ? 1 : 1)) > 1;
    if (st.mode === 'move' && bodyRef.current && !isMultiTable) {
      const rect = bodyRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      newRowIdx = Math.max(0, Math.min(sortedTables.length - 1, Math.floor(y / ROW_HEIGHT)));
    }

    const dateStr = (st.res.reservationDate || '').slice(0, 10);
    let tids = Array.isArray(st.res.assignedTables) && st.res.assignedTables.length > 0
      ? st.res.assignedTables
      : (st.res.assignedTable ? [st.res.assignedTable] : []);
    if (st.mode === 'move' && !isMultiTable && sortedTables[newRowIdx]) {
      tids = [sortedTables[newRowIdx].id];
    }
    const conflict = hasConflict(st.id, newStart, newEnd, tids, dateStr);

    const updated = { ...st, newStart, newEnd, newRowIdx, conflict };
    dragRef.current = updated;
    setDrag(updated);
  };

  const onPointerUp = (e) => {
    const st = dragRef.current;
    if (!st) return;
    dragRef.current = null;
    if (!st.moved) {
      // treat as click -> open edit modal
      setDrag(null);
      setModal({ open: true, reservation: st.res, defaultTableId: null, defaultStartTime: null });
      return;
    }
    if (st.conflict) {
      toast.error('Conflict detected — reservation overlaps another booking on the same table. Reverted.');
      setDrag(null);
      return;
    }
    // Persist
    const data = {
      reservationTime: toStr(st.newStart),
      endTime: toStr(st.newEnd),
    };
    const isMultiTable = (Array.isArray(st.res.assignedTables) ? st.res.assignedTables.length : (st.res.assignedTable ? 1 : 1)) > 1;
    if (st.mode === 'move' && !isMultiTable && sortedTables[st.newRowIdx]) {
      const newTid = sortedTables[st.newRowIdx].id;
      data.assignedTable = newTid;
      data.assignedTables = [newTid];
    }
    pb.collection('table_reservations').update(st.id, data, { $autoCancel: false })
      .then(() => toast.success('Reservation updated'))
      .catch((err) => {
        console.error(err);
        toast.error('Failed to update reservation');
        fetchReservations();
      })
      .finally(() => setDrag(null));
  };

  // Click on empty grid cell -> create
  const onRowBackgroundClick = (e, tableId) => {
    if (dragRef.current && dragRef.current.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const offMin = xToOffsetMin(x);
    const startMin = offsetToReal(offMin);
    setModal({ open: true, reservation: null, defaultTableId: tableId, defaultStartTime: toStr(startMin) });
  };

  const changeDay = (delta) => {
    const d = parseISO(selectedDate);
    setSelectedDate(format(addDays(d, delta), 'yyyy-MM-dd'));
  };

  const cancelReservation = async (res) => {
    if (!window.confirm(`Cancel the reservation for ${res.guestName}? This sets its status to Cancelled.`)) return;
    try {
      await pb.collection('table_reservations').update(res.id, { status: 'Declined' }, { $autoCancel: false });
      toast.success('Reservation cancelled');
    } catch (err) {
      console.error(err);
      toast.error('Failed to cancel reservation');
    }
  };

  const selectedDay = parseISO(selectedDate);
  const isClosedDay = selectedDay.getDay() === closedWeekday;

  const timelineWidth = (TOTAL_SPAN / COL_MINUTES) * COL_WIDTH;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border-2 border-border rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeDay(-1)} className="h-10 w-10" aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-10 w-[170px]"
          />
          <Button variant="outline" size="icon" onClick={() => changeDay(1)} className="h-10 w-10" aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="secondary" onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))} className="h-10">
            Today
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <div className="font-serif font-bold text-primary text-base">{format(selectedDay, 'EEEE, MMM d, yyyy')}</div>
            {isClosedDay && <span className="text-xs font-bold text-red-600">Restaurant closed this day</span>}
          </div>
          <Button variant="outline" size="icon" onClick={fetchReservations} disabled={loading} className="h-10 w-10" aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Focused reservation details (arrived via "View Notification") */}
      {focusedReservation && (
        <div ref={focusPanelRef}>
          <FocusReservationPanel
            reservation={focusedReservation}
            tables={sortedTables}
            autoFitting={autoFitting}
            onAutoFit={() => autoFit(focusedReservation)}
            onManualFit={() => manualFit(focusedReservation)}
            onDismiss={() => {
              setFocusedFallback(null);
              if (onFocusConsumed) onFocusConsumed();
            }}
          />
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-muted-foreground">Status:</span>
        {Object.entries(STATUS_STYLE).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('h-3 w-3 rounded-sm', s.dot)} />
            <span className="font-medium">{s.label}</span>
          </span>
        ))}
        <span className="text-muted-foreground hidden sm:inline">·</span>
        <span className="text-muted-foreground">Click empty cell to create · Drag block to move/reassign · Drag edges to resize · Click block to edit</span>
      </div>

      {/* Timeline */}
      <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-hidden">
        {loading && reservations.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sortedTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No tables configured.</p>
            <p className="text-sm">Add tables in the Tables tab to use the timeline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_WIDTH + timelineWidth + 16 }}>
              {/* Header row */}
              <div className="flex sticky top-0 z-20 bg-card border-b-2 border-border">
                <div
                  className="flex items-center justify-center font-semibold text-xs text-muted-foreground border-r border-border bg-muted/30"
                  style={{ width: LABEL_WIDTH, height: 34 }}
                >
                  Tables
                </div>
                <div className="relative" style={{ width: timelineWidth, height: 34 }}>
                  {COL_LABELS.map((label, i) => (
                    <div
                      key={label}
                      className="absolute top-0 h-full flex items-center justify-center text-[11px] font-semibold text-muted-foreground border-l border-border/60"
                      style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                    >
                      {label}
                    </div>
                  ))}
                  {/* Closed gap divider */}
                  <div
                    className="absolute top-0 h-full flex items-center justify-center text-[9px] font-bold text-red-500/80 bg-red-500/5 border-x border-red-400/40"
                    style={{ left: DINNER_COL_INDEX * COL_WIDTH - 0, width: 0 }}
                  />
                </div>
              </div>

              {/* Body */}
              <div
                ref={bodyRef}
                className="relative"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ touchAction: 'none' }}
              >
                {sortedTables.map((table, rowIdx) => (
                  <div
                    key={table.id}
                    className="flex border-b border-border/60 relative"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Row label */}
                    <div
                      className="flex flex-col items-start justify-center px-2 border-r border-border bg-muted/20 shrink-0"
                      style={{ width: LABEL_WIDTH }}
                    >
                      <span className="text-sm font-bold text-foreground leading-tight">{table.name}</span>
                      <span className="text-[10px] text-muted-foreground">{table.room} · {table.capacity || 4} seats</span>
                    </div>

                    {/* Row timeline */}
                    <div
                      className="relative cursor-cell"
                      style={{ width: timelineWidth, height: ROW_HEIGHT }}
                      onClick={(e) => onRowBackgroundClick(e, table.id)}
                    >
                      {/* grid columns */}
                      {COL_LABELS.map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'absolute top-0 h-full border-l border-border/40',
                            i >= DINNER_COL_INDEX ? 'bg-blue-50/20' : 'bg-amber-50/10',
                          )}
                          style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                        />
                      ))}
                      {/* closed gap marker band */}
                      <div
                        className="absolute top-0 h-full flex items-center justify-center text-[9px] font-bold text-red-400/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(239,68,68,0.06)_4px,rgba(239,68,68,0.06)_8px)]"
                        style={{ left: (DINNER_COL_INDEX - 1) * COL_WIDTH, width: COL_WIDTH }}
                      >
                        Closed
                      </div>

                      {/* Blocks for this table */}
                      {tableBlocks.get(table.id)?.map((res) => {
                        const isDragging = drag && drag.id === res.id;
                        const style = STATUS_STYLE[res.status] || STATUS_STYLE.Pending;
                        const left = timeToX(res.reservationTime);
                        let endX = timeToX(res.endTime);
                        if (endX <= left) endX = left + COL_WIDTH;
                        const width = Math.max(COL_WIDTH - 2, endX - left);
                        const partySize = res.partySize || res.numberOfGuests || 0;
                        return (
                          <div
                            key={res.id + '-' + table.id}
                            onPointerDown={(e) => onBlockPointerDown(e, res, 'move')}
                            onClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => { e.preventDefault(); cancelReservation(res); }}
                            className={cn(
                              'absolute top-1 bottom-1 rounded-lg border-2 shadow-sm select-none overflow-hidden cursor-grab active:cursor-grabbing transition-shadow',
                              style.bg, style.border, style.text,
                              isDragging && 'ring-2 ring-primary shadow-lg z-30 opacity-90',
                              res.status === 'Declined' && 'opacity-60 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.12)_6px,rgba(0,0,0,0.12)_12px)]',
                            )}
                            style={{ left, width, zIndex: isDragging ? 30 : 10 }}
                            title={`${res.guestName} · ${partySize}p · ${res.reservationTime}–${res.endTime || ''} · ${style.label}`}
                          >
                            {/* resize handles */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/15 hover:bg-black/30"
                              onPointerDown={(e) => { e.stopPropagation(); onBlockPointerDown(e, res, 'resize-start'); }}
                            />
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/15 hover:bg-black/30"
                              onPointerDown={(e) => { e.stopPropagation(); onBlockPointerDown(e, res, 'resize-end'); }}
                            />
                            <div className="px-2.5 py-1 h-full flex flex-col justify-center pointer-events-none">
                              <div className="text-xs font-bold leading-tight truncate">{res.guestName}</div>
                              <div className="text-[10px] leading-tight truncate flex items-center gap-1 opacity-90">
                                <Users className="h-2.5 w-2.5" /> {partySize}
                                <span className="notranslate" translate="no">· {res.reservationTime}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Drag preview overlay */}
                {drag && drag.moved && (() => {
                  const left = (realToOffset(drag.newStart) / COL_MINUTES) * COL_WIDTH;
                  const right = (realToOffset(drag.newEnd) / COL_MINUTES) * COL_WIDTH;
                  const width = Math.max(COL_WIDTH - 2, right - left);
                  const top = drag.newRowIdx * ROW_HEIGHT + 4;
                  const style = STATUS_STYLE[drag.res.status] || STATUS_STYLE.Pending;
                  return (
                    <div
                      className={cn(
                        'absolute rounded-lg border-2 pointer-events-none z-40 flex items-center px-2 text-xs font-bold',
                        drag.conflict ? 'bg-red-500/40 border-red-700 text-white' : cn(style.bg, style.border, style.text, 'opacity-80'),
                      )}
                      style={{ left: LABEL_WIDTH + left, width, top, height: ROW_HEIGHT - 8 }}
                    >
                      {drag.conflict ? (
                        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Conflict</span>
                      ) : (
                        <span className="truncate">{drag.res.guestName} · {toStr(drag.newStart)}–{toStr(drag.newEnd)}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Unassigned reservations for this day */}
      <UnassignedList
        reservations={reservations.filter((r) => {
          let tids = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
            ? r.assignedTables
            : (r.assignedTable ? [r.assignedTable] : []);
          return tids.length === 0;
        })}
        onEdit={(res) => setModal({ open: true, reservation: res, defaultTableId: null, defaultStartTime: null })}
      />

      <ReservationGanttModal
        open={modal.open}
        onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))}
        reservation={modal.reservation}
        tables={sortedTables}
        defaultDate={selectedDate}
        defaultTableId={modal.defaultTableId}
        defaultStartTime={modal.defaultStartTime}
        allReservations={reservations}
        onSaved={() => { fetchReservations(); if (modal.reservation && onFocusConsumed) onFocusConsumed(); }}
        onDeleted={fetchReservations}
      />
    </div>
  );
}

function UnassignedList({ reservations, onEdit }) {
  if (reservations.length === 0) return null;
  return (
    <div className="bg-amber-50/40 border border-amber-300/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-bold text-amber-800">Unassigned reservations ({reservations.length})</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {reservations.map((r) => {
          const style = STATUS_STYLE[r.status] || STATUS_STYLE.Pending;
          return (
            <button
              key={r.id}
              onClick={() => onEdit(r)}
              className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs shadow-sm hover:shadow-md transition-shadow"
            >
              <span className={cn('h-2 w-2 rounded-full', style.dot)} />
              <span className="font-semibold text-foreground">{r.guestName}</span>
              <span className="text-muted-foreground">{r.partySize || r.numberOfGuests}p</span>
              <span className="notranslate text-muted-foreground" translate="no">{r.reservationTime}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-amber-700/80 mt-2">Click a reservation to assign it to a table via the modal.</p>
    </div>
  );
}

function FocusReservationPanel({
  reservation, tables, autoFitting, onAutoFit, onManualFit, onDismiss,
}) {
  const r = reservation;
  const partySize = r.partySize || r.numberOfGuests || 0;
  const kidsCount = r.kidsUnder4 ? (r.numberOfKidsUnder4 || 0) : 0;
  const chairs = r.numberOfChildrenChairs || 0;
  const assignedTableIds = Array.isArray(r.assignedTables) && r.assignedTables.length > 0
    ? r.assignedTables
    : (r.assignedTable ? [r.assignedTable] : []);
  const assignedTables = tables.filter((t) => assignedTableIds.includes(t.id));
  const style = STATUS_STYLE[r.status] || STATUS_STYLE.Pending;

  return (
    <div className="bg-card border-2 border-secondary rounded-2xl p-5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('h-3 w-3 rounded-full shrink-0', style.dot)} />
          <div className="min-w-0">
            <h3 className="text-lg font-serif font-bold text-primary leading-tight truncate">
              {r.guestName}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" /> {r.reservationCode || 'N/A'}
              <span className="mx-1">·</span>
              <span className={cn('font-semibold', style.text === 'text-white' ? 'text-foreground' : '')}>
                {style.label}
              </span>
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDismiss} className="h-8 w-8 shrink-0" aria-label="Dismiss focus">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <DetailRow icon={<Users className="h-4 w-4" />} label="Number of persons" value={`${partySize} guest${partySize !== 1 ? 's' : ''}`} />
        <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone number" value={r.phone || '—'} />
        <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={r.email || '—'} />
        <DetailRow
          icon={<CalendarClock className="h-4 w-4" />}
          label="Date & time"
          value={
            r.reservationDate
              ? `${format(parseISO((r.reservationDate || '').slice(0, 10)), 'MMM d, yyyy')} · ${r.reservationTime}${r.endTime ? `–${r.endTime}` : ''}`
              : '—'
          }
          notranslate
        />
        {kidsCount > 0 && (
          <DetailRow icon={<Baby className="h-4 w-4" />} label="Kids under 3" value={`${kidsCount}`} />
        )}
        {chairs > 0 && (
          <DetailRow icon={<Baby className="h-4 w-4" />} label="Child chairs" value={`${chairs}`} />
        )}
        <DetailRow
          icon={<LayoutGridIcon />}
          label="Assigned table"
          value={assignedTables.length > 0
            ? assignedTables.map((t) => `${t.name} (${t.room}${t.capacity ? ` · ${t.capacity}p` : ''})`).join(', ')
            : 'Unassigned'}
        />
      </div>

      {r.adminNotes && (
        <div className="mb-4 text-sm bg-muted/30 border border-border/60 rounded-lg p-3">
          <span className="font-semibold text-foreground">Special requests: </span>
          <span className="text-muted-foreground">{r.adminNotes}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={onAutoFit}
          disabled={autoFitting}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {autoFitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Auto Fit
        </Button>
        <Button onClick={onManualFit} variant="secondary" className="flex-1">
          <Hand className="h-4 w-4 mr-2" /> Manual Fit
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Auto Fit places this reservation on the first free table that fits the party (conflicts prevented). Manual Fit lets you choose the table and time on the calendar.
      </p>
    </div>
  );
}

function DetailRow({ icon, label, value, notranslate }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('text-sm font-medium text-foreground break-words', notranslate && 'notranslate')} translate={notranslate ? 'no' : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

function LayoutGridIcon() {
  // Lightweight inline icon to avoid an extra lucide import name clash.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
