import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, RefreshCw, Plus,
  AlertTriangle, Clock, Users, X, Phone, Mail, Hash, Sparkles, Hand, Baby, CalendarClock,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { cn } from '@/lib/utils';
import ReservationGanttModal from '@/components/ReservationGanttModal.jsx';
import { openGmailCompose } from '@/utils/gmailComposer.js';

// ---- Serving windows (minutes from midnight) ----
// Lunch 11:00–14:00 and dinner 17:00–21:00. Hours between 14:00 and 17:00
// are closed and collapsed on the timeline. Wednesday closure is handled
// separately via restaurant_hours.closedWeekday.
const LUNCH_START = 11 * 60;  // 660  (11:00)
const LUNCH_END = 14 * 60;    // 840  (14:00)
const DINNER_START = 17 * 60; // 1020 (17:00 / 5:00 PM)
const DINNER_END = 21 * 60;   // 1260 (21:00 / 9:00 PM)
const LUNCH_SPAN = LUNCH_END - LUNCH_START;   // 180
const DINNER_SPAN = DINNER_END - DINNER_START; // 240
// One visual column between lunch and dinner to mark closed hours.
const GAP_SPAN = 30;
const TOTAL_SPAN = LUNCH_SPAN + GAP_SPAN + DINNER_SPAN; // 450

const COL_MINUTES = 30;
const COL_WIDTH = 68;
const ROW_HEIGHT = 58;
const LABEL_WIDTH = 96;

// Column boundary labels (each = 30 min). The column between 14:00 and 17:00
// is the collapsed closed period (visual gap only).
const COL_LABELS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00',
];

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

// real minutes -> offset minutes across lunch + gap + dinner
const realToOffset = (t) => {
  if (t == null) return 0;
  if (t <= LUNCH_END) {
    return Math.max(0, Math.min(LUNCH_SPAN, t - LUNCH_START));
  }
  if (t < DINNER_START) {
    // Closed gap — pin to the middle of the visual gap column
    return LUNCH_SPAN + GAP_SPAN / 2;
  }
  return LUNCH_SPAN + GAP_SPAN + Math.max(0, Math.min(DINNER_SPAN, t - DINNER_START));
};
// offset minutes -> real minutes (gap snaps to dinner start so clicks land on a valid slot)
const offsetToReal = (off) => {
  const clamped = Math.max(0, Math.min(TOTAL_SPAN, off));
  if (clamped <= LUNCH_SPAN) return LUNCH_START + clamped;
  if (clamped < LUNCH_SPAN + GAP_SPAN) return DINNER_START;
  return DINNER_START + (clamped - LUNCH_SPAN - GAP_SPAN);
};

// Keep a start/end pair inside a single serving window (never across the gap).
const clampToServingWindow = (start, end) => {
  const mid = (start + end) / 2;
  const useDinner = mid >= (LUNCH_END + DINNER_START) / 2;
  if (useDinner) {
    let s = Math.max(DINNER_START, Math.min(DINNER_END - COL_MINUTES, start));
    let e = Math.max(s + COL_MINUTES, Math.min(DINNER_END, end));
    return [s, e];
  }
  let s = Math.max(LUNCH_START, Math.min(LUNCH_END - COL_MINUTES, start));
  let e = Math.max(s + COL_MINUTES, Math.min(LUNCH_END, end));
  return [s, e];
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

export default function GanttChart({ initialDate, focusReservationId, onFocusConsumed, refreshToken = 0, onRefreshed, onReservationsChanged }) {
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
  // Review/save window for Auto Fit & Manual Fit. The proposed placement is
  // staged here WITHOUT persisting so the admin can recheck it and send a
  // WhatsApp/Email confirmation before the assignment is finalized.
  const [fitReview, setFitReview] = useState({ open: false, reservation: null, proposed: null });
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

  const onRefreshedRef = useRef(onRefreshed);
  useEffect(() => { onRefreshedRef.current = onRefreshed; }, [onRefreshed]);
  const onReservationsChangedRef = useRef(onReservationsChanged);
  useEffect(() => { onReservationsChangedRef.current = onReservationsChanged; }, [onReservationsChanged]);

  const notifyReservationsChanged = useCallback(() => {
    if (onReservationsChangedRef.current) onReservationsChangedRef.current();
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
      if (onRefreshedRef.current) onRefreshedRef.current();
    } catch (err) {
      console.error('Failed to load reservations', err);
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Persist a reviewed fit proposal (from the FitReviewDialog "Save &
  // Confirm" action) and sync the grid, focus panel, and parent pending
  // panel. Auto Fit and Manual Fit only stage proposals — this is where
  // the assignment is actually finalized.
  const confirmFitSaved = useCallback((updated) => {
    setFocusedFallback(updated);
    setReservations((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
    notifyReservationsChanged();
    fetchReservations();
  }, [notifyReservationsChanged, fetchReservations]);

  // External refresh trigger from the parent Reservations toolbar.
  useEffect(() => {
    if (!refreshToken) return undefined;
    fetchReservations();
    return undefined;
  }, [refreshToken, fetchReservations]);

  useEffect(() => {
    pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false })
      .then((res) => { if (res.items.length > 0) setClosedWeekday(res.items[0].closedWeekday ?? 3); })
      .catch(() => {});
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    let cancelled = false;
    let unsubReservations = null;
    let unsubTables = null;

    fetchReservations();

    // Use the per-listener unsubscribe returned by subscribe(). Never call
    // bare collection.unsubscribe('*') — that kills Admin pending-panel and
    // GlobalReservationNotifications listeners too.
    void pb
      .collection('table_reservations')
      .subscribe('*', () => { if (!cancelled) fetchReservations(); }, { requestKey: 'gantt-reservations-rt' })
      .then((unsub) => {
        if (cancelled) { try { unsub?.(); } catch { /* ignore */ } return; }
        unsubReservations = unsub;
      })
      .catch((error) => console.error('Realtime subscription failed', error));

    void pb
      .collection('table_configurations')
      .subscribe('*', () => { if (!cancelled) fetchTables(); }, { requestKey: 'gantt-tables-rt' })
      .then((unsub) => {
        if (cancelled) { try { unsub?.(); } catch { /* ignore */ } return; }
        unsubTables = unsub;
      })
      .catch((error) => console.error('Realtime subscription failed', error));

    return () => {
      cancelled = true;
      try { if (typeof unsubReservations === 'function') unsubReservations(); } catch { /* ignore */ }
      try { if (typeof unsubTables === 'function') unsubTables(); } catch { /* ignore */ }
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

      // Auto Fit must never seat a party on a table whose capacity is too
      // small. Prefer a single table that fits (smallest first so we don't
      // waste large tables); if none is free, combine tables and use the
      // SUMMED capacity to seat the party. Conflict prevention is enforced
      // via conflictsOn for every candidate (single or combined).
      const cap = (t) => t.capacity || 4;
      const fitting = sortedTables
        .filter((t) => cap(t) >= partySize)
        .sort((a, b) => cap(a) - cap(b));
      // All tables, smallest first — used to build combined sets.
      const allTables = [...sortedTables].sort((a, b) => cap(a) - cap(b));

      if (allTables.length === 0) {
        toast.error('No tables configured. Add tables in the Tables tab first.');
        return;
      }

      // Largest party the restaurant could seat by combining every table.
      const maxCombinedCapacity = allTables.reduce((sum, t) => sum + cap(t), 0);

      // Find a single free table at (s,e) that individually fits the party.
      const findSingleFittingAt = (s, e) => {
        for (const t of fitting) {
          if (!conflictsOn(res.id, s, e, [t.id])) return [t];
        }
        return null;
      };

      // Find a free combined set (2-3 tables) whose summed capacity fits.
      const findCombinedFittingAt = (s, e) => {
        for (let i = 0; i < allTables.length; i++) {
          for (let j = i + 1; j < allTables.length; j++) {
            if (cap(allTables[i]) + cap(allTables[j]) < partySize) continue;
            const ids = [allTables[i].id, allTables[j].id];
            if (!conflictsOn(res.id, s, e, ids)) return [allTables[i], allTables[j]];
          }
        }
        for (let i = 0; i < allTables.length; i++) {
          for (let j = i + 1; j < allTables.length; j++) {
            for (let k = j + 1; k < allTables.length; k++) {
              if (cap(allTables[i]) + cap(allTables[j]) + cap(allTables[k]) < partySize) continue;
              const ids = [allTables[i].id, allTables[j].id, allTables[k].id];
              if (!conflictsOn(res.id, s, e, ids)) return [allTables[i], allTables[j], allTables[k]];
            }
          }
        }
        return null;
      };

      // Prefer a single fitting table; fall back to a combined set.
      const findFittingAt = (s, e) => findSingleFittingAt(s, e) || findCombinedFittingAt(s, e);

      // Prefer the window that contains the requested start (lunch or dinner).
      const preferDinner = reqStart >= DINNER_START || (reqStart > LUNCH_END && reqStart < DINNER_START && reqStart >= (LUNCH_END + DINNER_START) / 2);
      const primaryWindow = preferDinner
        ? { start: DINNER_START, end: DINNER_END }
        : { start: LUNCH_START, end: LUNCH_END };
      const secondaryWindow = preferDinner
        ? { start: LUNCH_START, end: LUNCH_END }
        : { start: DINNER_START, end: DINNER_END };

      const clampStartToWindow = (s, win) => Math.max(win.start, Math.min(win.end - COL_MINUTES, s));
      const endFor = (s, win) => {
        let e = Math.min(s + duration, win.end);
        if (e - s < COL_MINUTES) e = s + COL_MINUTES;
        return e;
      };

      // 1) Try the requested time first inside the preferred window.
      let chosenStart = clampStartToWindow(reqStart, primaryWindow);
      let chosenEnd = endFor(chosenStart, primaryWindow);
      if (chosenEnd > primaryWindow.end) {
        chosenStart = Math.max(primaryWindow.start, primaryWindow.end - duration);
        chosenEnd = endFor(chosenStart, primaryWindow);
      }
      let chosen = findFittingAt(chosenStart, chosenEnd);

      // 2) Search outward in 30-min steps within the preferred window, then the other.
      if (!chosen) {
        const tryWindow = (win) => {
          for (let step = 0; step <= 240 && !chosen; step += 30) {
            for (const sign of step === 0 ? [0] : [1, -1]) {
              let s = clampStartToWindow(reqStart + sign * step, win);
              let e = endFor(s, win);
              if (e > win.end || e - s < COL_MINUTES) continue;
              const t = findFittingAt(s, e);
              if (t) { chosen = t; chosenStart = s; chosenEnd = e; return; }
            }
          }
        };
        tryWindow(primaryWindow);
        if (!chosen) tryWindow(secondaryWindow);
      }

      if (!chosen) {
        // No single table or combination can seat this party at any free
        // slot. Surface the capacity gap so the admin knows why.
        if (maxCombinedCapacity < partySize) {
          toast.error(
            `No table can seat a party of ${partySize}. The largest combination available seats ${maxCombinedCapacity}. Try Manual Fit or add a bigger table.`,
            { duration: 9000 },
          );
        } else {
          toast.error(
            `No free table or time slot found for a party of ${partySize}. All fitting tables are booked — try Manual Fit.`,
            { duration: 9000 },
          );
        }
        return;
      }

      const chosenCapacity = chosen.reduce((sum, t) => sum + cap(t), 0);
      const chosenNames = chosen.map((t) => t.name).join(' + ');
      const chosenIds = chosen.map((t) => t.id);
      // Do NOT silently finalize the fit. Stage the proposed placement in the
      // review/save window so the admin can recheck it and send a WhatsApp or
      // Email confirmation before the assignment is persisted.
      setFitReview({
        open: true,
        reservation: res,
        proposed: {
          assignedTableIds: chosenIds,
          startTime: toStr(chosenStart),
          endTime: toStr(chosenEnd),
          status: 'Approved',
        },
      });
      toast(
        `Auto-fit proposal ready for ${res.guestName} → ${chosenNames} at ${toStr(chosenStart)}–${toStr(chosenEnd)}. Review and save to confirm.`,
        { duration: 7000 },
      );
      // Jump to the reservation's date so the placement is visible on the
      // timeline, but do not persist or touch the pending panel until the
      // admin confirms in the review dialog.
      if (dateStr && dateStr !== selectedDate) {
        setSelectedDate(dateStr);
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
    // fitMode routes the modal's "Save" through the review/save window
    // instead of persisting directly, so Manual Fit is never silently finalized.
    setModal({ open: true, reservation: res, defaultTableId: null, defaultStartTime: null, fitMode: true });
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
    // Clamp to a single serving window (lunch 11–14 or dinner 17–21)
    [newStart, newEnd] = clampToServingWindow(newStart, newEnd);

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
      .then(() => {
        toast.success('Reservation updated');
        notifyReservationsChanged();
      })
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
      notifyReservationsChanged();
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
          <Button
            variant="outline"
            onClick={fetchReservations}
            disabled={loading}
            className="h-10 gap-2"
            aria-label="Refresh reservations"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">{loading ? 'Refreshing…' : 'Refresh'}</span>
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
                  {COL_LABELS.map((label, i) => {
                    // Gap column sits between lunch end (index 6 = 14:00) and dinner start (index 7 = 17:00)
                    const isGapEdge = i === 6 || i === 7;
                    return (
                      <div
                        key={`${label}-${i}`}
                        className={cn(
                          'absolute top-0 h-full flex items-center justify-center text-[11px] font-semibold border-l border-border/60',
                          isGapEdge ? 'bg-muted/40 text-muted-foreground' : 'text-muted-foreground',
                        )}
                        style={{ left: i * COL_WIDTH, width: i === COL_LABELS.length - 1 ? undefined : COL_WIDTH }}
                      >
                        {label}
                      </div>
                    );
                  })}
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
                      {/* grid columns — gap column is the closed period between lunch and dinner */}
                      {Array.from({ length: TOTAL_SPAN / COL_MINUTES }).map((_, i) => {
                        const off = i * COL_MINUTES;
                        const isGap = off >= LUNCH_SPAN && off < LUNCH_SPAN + GAP_SPAN;
                        return (
                          <div
                            key={i}
                            className={cn(
                              'absolute top-0 h-full border-l border-border/40',
                              isGap ? 'bg-muted/50' : 'bg-amber-50/10',
                            )}
                            style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                          />
                        );
                      })}

                      {/* Blocks for this table */}
                      {tableBlocks.get(table.id)?.map((res) => {
                        const isDragging = drag && drag.id === res.id;
                        const style = STATUS_STYLE[res.status] || STATUS_STYLE.Pending;
                        const left = timeToX(res.reservationTime);
                        // Skip blocks that fall fully outside both serving windows.
                        if (left >= timelineWidth) return null;
                        let endX = timeToX(res.endTime);
                        if (endX <= left) endX = left + COL_WIDTH;
                        if (endX > timelineWidth) endX = timelineWidth;
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
        fitMode={modal.fitMode}
        onProposeFit={(data) => {
          setFitReview({
            open: true,
            reservation: data.reservation,
            proposed: {
              assignedTableIds: data.assignedTables,
              startTime: data.startTime,
              endTime: data.endTime,
              status: data.status,
            },
          });
        }}
        onSaved={() => {
          fetchReservations();
          notifyReservationsChanged();
          if (modal.reservation && onFocusConsumed) onFocusConsumed();
        }}
        onDeleted={() => {
          fetchReservations();
          notifyReservationsChanged();
        }}
      />

      {fitReview.open && fitReview.reservation && fitReview.proposed && (
        <FitReviewDialog
          open={fitReview.open}
          onOpenChange={(o) => setFitReview((f) => ({ ...f, open: o }))}
          reservation={fitReview.reservation}
          proposed={fitReview.proposed}
          tables={sortedTables}
          onSaved={confirmFitSaved}
        />
      )}
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

/** Digits-only phone for wa.me links (strip spaces, +, dashes, etc.). */
function normalizeWhatsAppPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

function buildReservationContactMessage(r, assignedTables) {
  const partySize = r.partySize || r.numberOfGuests || 0;
  const dateStr = r.reservationDate
    ? (() => {
        try {
          return format(parseISO((r.reservationDate || '').slice(0, 10)), 'MMM d, yyyy');
        } catch {
          return (r.reservationDate || '').slice(0, 10);
        }
      })()
    : '—';
  const timeStr = r.reservationTime
    ? `${r.reservationTime}${r.endTime ? `–${r.endTime}` : ''}`
    : '—';
  const tableStr = assignedTables.length > 0
    ? assignedTables.map((t) => `${t.name}${t.room ? ` (${t.room})` : ''}`).join(', ')
    : 'to be assigned';
  const code = r.reservationCode || 'N/A';
  const guest = r.guestName || 'Guest';

  return (
    `Dear ${guest},\n\n` +
    `Thank you for your reservation at Tripti Genusswelt.\n\n` +
    `Reservation details:\n` +
    `• Reference: ${code}\n` +
    `• Date: ${dateStr}\n` +
    `• Time: ${timeStr}\n` +
    `• Guests: ${partySize}\n` +
    `• Table: ${tableStr}\n\n` +
    `We look forward to welcoming you.\n\n` +
    `Kind regards,\nTripti Genusswelt`
  );
}

function buildFitConfirmationMessage(r, assignedTables, status) {
  const partySize = r.partySize || r.numberOfGuests || 0;
  const dateStr = r.reservationDate
    ? (() => {
        try {
          return format(parseISO((r.reservationDate || '').slice(0, 10)), 'MMM d, yyyy');
        } catch {
          return (r.reservationDate || '').slice(0, 10);
        }
      })()
    : '—';
  const timeStr = r.reservationTime
    ? `${r.reservationTime}${r.endTime ? `–${r.endTime}` : ''}`
    : '—';
  const tableStr = assignedTables.length > 0
    ? assignedTables.map((t) => `${t.name}${t.room ? ` (${t.room})` : ''}`).join(', ')
    : 'to be assigned';
  const code = r.reservationCode || 'N/A';
  const guest = r.guestName || 'Guest';
  const style = STATUS_STYLE[status] || STATUS_STYLE.Pending;
  return (
    `Dear ${guest},\n\n` +
    `Your reservation at Tripti Genusswelt is ${style.label.toLowerCase()}.\n\n` +
    `Reservation details:\n` +
    `• Reference: ${code}\n` +
    `• Date: ${dateStr}\n` +
    `• Time: ${timeStr}\n` +
    `• Guests: ${partySize}\n` +
    `• Table: ${tableStr}\n` +
    `• Status: ${style.label}\n\n` +
    `We look forward to welcoming you.\n\n` +
    `Kind regards,\nTripti Genusswelt`
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

  const waPhone = normalizeWhatsAppPhone(r.phone);
  const guestEmail = (r.email || '').trim();
  const contactMessage = buildReservationContactMessage(r, assignedTables);
  // Prefer first multi-assigned table, then legacy single assignedTable — same
  // table context the reservation list passes into openGmailCompose.
  const emailTable =
    assignedTables[0]
    || tables.find((t) => t.id === r.assignedTable)
    || null;
  const emailStatus = (r.status || 'pending').toLowerCase();

  const openWhatsApp = () => {
    if (!waPhone) {
      toast.error('No valid phone number for WhatsApp');
      return;
    }
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(contactMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openEmail = () => {
    if (!guestEmail) {
      toast.error('No email address on this reservation');
      return;
    }
    // Same Gmail compose + template logic as Admin reservation lists.
    void openGmailCompose(r, emailStatus, emailTable);
  };

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

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <Button
          type="button"
          onClick={openWhatsApp}
          disabled={!waPhone}
          variant="outline"
          className="flex-1 border-emerald-600/40 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 disabled:opacity-50"
          title={waPhone ? 'Open WhatsApp with prefilled message' : 'No phone number available'}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          WhatsApp
        </Button>
        <Button
          type="button"
          onClick={openEmail}
          disabled={!guestEmail}
          variant="outline"
          className="flex-1 border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50"
          title={guestEmail ? 'Open Gmail with auto-generated reservation message' : 'No email address available'}
        >
          <Mail className="h-4 w-4 mr-2" />
          Email
        </Button>
      </div>
      {(!waPhone || !guestEmail) && (
        <p className="text-[11px] text-muted-foreground mb-3">
          {!waPhone && !guestEmail
            ? 'WhatsApp and Email need a phone number and email on this reservation.'
            : !waPhone
              ? 'WhatsApp is unavailable — no valid phone number on this reservation.'
              : 'Email is unavailable — no email address on this reservation.'}
        </p>
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

function FitReviewDialog({ open, onOpenChange, reservation, proposed, tables, onSaved }) {
  const [saving, setSaving] = useState(false);
  const r = reservation;
  const assignedTableIds = (proposed && Array.isArray(proposed.assignedTableIds)) ? proposed.assignedTableIds : [];
  const assignedTables = tables.filter((t) => assignedTableIds.includes(t.id));
  const partySize = r ? (r.partySize || r.numberOfGuests || 0) : 0;
  const status = (proposed && proposed.status) || (r && r.status) || 'Pending';
  const style = STATUS_STYLE[status] || STATUS_STYLE.Pending;
  const startTime = (proposed && proposed.startTime) || (r && r.reservationTime) || '—';
  const endTime = (proposed && proposed.endTime) || (r && r.endTime) || '';
  const dateStr = r && r.reservationDate
    ? (() => {
        try {
          return format(parseISO((r.reservationDate || '').slice(0, 10)), 'EEEE, MMM d, yyyy');
        } catch {
          return (r.reservationDate || '').slice(0, 10);
        }
      })()
    : '—';
  const timeStr = `${startTime}${endTime ? `–${endTime}` : ''}`;
  const code = (r && r.reservationCode) || 'N/A';
  const guest = (r && r.guestName) || 'Guest';

  // Merged record so the existing Gmail composer + message builder reflect
  // the PROPOSED assignment (new time/tables/status), not the original.
  const merged = r
    ? {
        ...r,
        reservationTime: startTime,
        endTime: endTime,
        assignedTables: assignedTableIds,
        assignedTable: assignedTableIds[0] || '',
        status,
      }
    : r;
  const emailTable = assignedTables[0] || tables.find((t) => t.id === assignedTableIds[0]) || null;
  const message = buildFitConfirmationMessage(merged || {}, assignedTables, status);
  const waPhone = normalizeWhatsAppPhone(r ? r.phone : '');
  const guestEmail = r ? (r.email || '').trim() : '';

  const openWhatsApp = () => {
    if (!waPhone) {
      toast.error('No valid phone number for WhatsApp');
      return;
    }
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openEmail = () => {
    if (!guestEmail) {
      toast.error('No email address on this reservation');
      return;
    }
    // Same Gmail compose + template logic as Admin reservation lists, fed
    // the proposed assignment so the confirmation text matches the fit.
    void openGmailCompose(merged, status.toLowerCase(), emailTable);
  };

  const handleSave = async () => {
    if (!r || !proposed || saving) return;
    if (assignedTableIds.length === 0) {
      toast.error('No table assigned in this proposal.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        assignedTable: assignedTableIds[0] || '',
        assignedTables: assignedTableIds,
        reservationTime: proposed.startTime,
        endTime: proposed.endTime,
        status: proposed.status || 'Approved',
      };
      const updated = await pb.collection('table_reservations').update(r.id, data, { $autoCancel: false });
      toast.success(`Reservation saved: ${r.guestName} → ${assignedTables.map((t) => t.name).join(', ')} at ${proposed.startTime}–${proposed.endTime}`);
      if (onSaved) onSaved(updated);
      onOpenChange(false);
    } catch (err) {
      console.error('[FitReviewDialog] save failed', err);
      toast.error(err?.message || 'Failed to save reservation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review &amp; Save Table Assignment</DialogTitle>
          <DialogDescription>
            Please recheck the proposed assignment below. You can send a WhatsApp or Email confirmation to the guest, then save to finalize — or cancel to return without changes.
          </DialogDescription>
        </DialogHeader>

        {r && proposed && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <span className={cn('h-3 w-3 rounded-full shrink-0', style.dot)} />
              <div className="min-w-0">
                <h3 className="text-lg font-serif font-bold text-primary leading-tight truncate">{guest}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" /> {code}
                  <span className="mx-1">·</span>
                  <span className="font-semibold">{style.label}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailRow icon={<Users className="h-4 w-4" />} label="Number of persons" value={`${partySize} guest${partySize !== 1 ? 's' : ''}`} />
              <DetailRow icon={<CalendarClock className="h-4 w-4" />} label="Date & time" value={`${dateStr} · ${timeStr}`} notranslate />
              <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone number" value={(r.phone) || '—'} />
              <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={(r.email) || '—'} />
              <DetailRow
                icon={<LayoutGridIcon />}
                label="Assigned table"
                value={assignedTables.length > 0
                  ? assignedTables.map((t) => `${t.name} (${t.room}${t.capacity ? ` · ${t.capacity}p` : ''})`).join(', ')
                  : 'Unassigned'}
              />
              <DetailRow icon={<Sparkles className="h-4 w-4" />} label="Status" value={style.label} />
            </div>

            {r.adminNotes && (
              <div className="text-sm bg-muted/30 border border-border/60 rounded-lg p-3">
                <span className="font-semibold text-foreground">Special requests: </span>
                <span className="text-muted-foreground">{r.adminNotes}</span>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Send confirmation to guest</p>
              {/* Default to the Email tab so the admin lands on Gmail compose
                  right after saving an Auto/Manual Fit. WhatsApp remains a
                  click away via the other tab. Nothing is sent automatically. */}
              <Tabs defaultValue="email" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" className="gap-1.5">
                    <Mail className="h-4 w-4" /> Email
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-1.5">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="email" className="mt-3">
                  <Button
                    type="button"
                    onClick={openEmail}
                    disabled={!guestEmail}
                    variant="outline"
                    className="w-full border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50"
                    title={guestEmail ? 'Open Gmail with auto-generated confirmation' : 'No email address available'}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {guestEmail ? 'Open Gmail Confirmation' : 'No email on file'}
                  </Button>
                  {!guestEmail && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Email is unavailable — no email address on this reservation.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-3">
                  <Button
                    type="button"
                    onClick={openWhatsApp}
                    disabled={!waPhone}
                    variant="outline"
                    className="w-full border-emerald-600/40 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 disabled:opacity-50"
                    title={waPhone ? 'Open WhatsApp with prefilled confirmation' : 'No phone number available'}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {waPhone ? 'Open WhatsApp Confirmation' : 'No phone on file'}
                  </Button>
                  {!waPhone && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      WhatsApp is unavailable — no valid phone number on this reservation.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="sm:mr-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Save &amp; Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
