import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { BellRing, CalendarClock, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';

// Play a short attention-grabbing chime using the Web Audio API (no asset needed).
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* audio not available */
  }
}

export default function GlobalReservationNotifications() {
  const { isAdminAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [newReservationAlert, setNewReservationAlert] = useState(null);

  // IDs we have already shown a popup for — persists for the whole admin
  // session so the same reservation never re-triggers the popup.
  const alertedIdsRef = useRef(new Set());
  // Have we completed the first load? First load only seeds known IDs and
  // never pops up (prevents a flood of popups when the admin logs in).
  const initialLoadDoneRef = useRef(false);
  // Guard against overlapping fetches.
  const fetchingRef = useRef(false);
  // Track whether a popup is currently open so polling never re-opens it.
  const alertOpenRef = useRef(false);

  const surfaceNewcomer = (record) => {
    if (!record || !record.id) return;
    if (alertedIdsRef.current.has(record.id)) return;
    alertedIdsRef.current.add(record.id);
    if (!alertOpenRef.current) {
      alertOpenRef.current = true;
      setNewReservationAlert(record);
    }
    playNotificationChime();
    toast.info(`New reservation from ${record.guestName}`, {
      description: `${record.reservationDate ? format(new Date(record.reservationDate), 'MMM d, yyyy') : ''} at ${record.reservationTime} \u2022 ${record.partySize || record.numberOfGuests} guests`,
      duration: 8000,
    });
  };

  const fetchReservations = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await pb.collection('table_reservations').getFullList({
        sort: '-created',
        $autoCancel: false,
        requestKey: 'global-reservation-notifications',
      });

      const pending = data.filter((r) => !r.status || r.status === 'Pending');

      if (!initialLoadDoneRef.current) {
        // Seed: mark everything currently pending as already known.
        pending.forEach((r) => alertedIdsRef.current.add(r.id));
        initialLoadDoneRef.current = true;
        fetchingRef.current = false;
        return;
      }

      // Find genuinely new pending reservations we have never alerted for.
      const newcomers = pending.filter((r) => !alertedIdsRef.current.has(r.id));
      if (newcomers.length > 0) {
        const latest = newcomers
          .slice()
          .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))[0];
        // surfaceNewcomer marks all via the loop below + shows the latest.
        newcomers.forEach((r) => {
          if (r.id === latest.id) surfaceNewcomer(r);
          else alertedIdsRef.current.add(r.id);
        });
      }
    } catch {
      /* silently ignore polling errors */
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isAdminAuthenticated) {
      setNewReservationAlert(null);
      alertedIdsRef.current = new Set();
      initialLoadDoneRef.current = false;
      alertOpenRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let unsubFn = null;
    let reconnectId = null;

    void fetchReservations();

    // Real-time subscription (primary channel) — apply create events instantly
    // so the popup does not wait on a full list refetch.
    const attachRealtime = () => {
      void pb
        .collection('table_reservations')
        .subscribe('*', (e) => {
          if (cancelled) return;
          if (!initialLoadDoneRef.current) {
            // Still seeding — fall back to full fetch which will seed IDs.
            void fetchReservations();
            return;
          }
          if (e?.action === 'create' && e.record && (!e.record.status || e.record.status === 'Pending')) {
            surfaceNewcomer(e.record);
            return;
          }
          // Updates/deletes: reconcile via list so we don't miss edge cases.
          void fetchReservations();
        }, { requestKey: 'global-reservation-rt' })
        .then((unsub) => {
          if (cancelled) {
            try { unsub?.(); } catch { /* ignore */ }
            return;
          }
          unsubFn = unsub;
        })
        .catch(() => {
          if (!cancelled) reconnectId = window.setTimeout(attachRealtime, 3000);
        });
    };

    attachRealtime();

    // Faster polling fallback (was 20s — felt very delayed when realtime drops).
    const intervalId = setInterval(() => {
      if (!cancelled) void fetchReservations();
    }, 5000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void fetchReservations();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectId) window.clearTimeout(reconnectId);
      // Only detach THIS listener — bare unsubscribe('*') kills other subscribers.
      try {
        if (typeof unsubFn === 'function') unsubFn();
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminAuthenticated]);

  const closeAlert = () => {
    alertOpenRef.current = false;
    setNewReservationAlert(null);
  };

  // "View Notification" navigates directly to the reservation's date in the
  // Admin reservation calendar (Gantt timeline), focusing that reservation so
  // the admin sees its full details and can Auto/Manual fit it.
  const viewNotification = () => {
    const res = newReservationAlert;
    alertOpenRef.current = false;
    setNewReservationAlert(null);
    // Safety: clear any lingering scroll/pointer lock Radix may have left behind
    // after the Dialog unmounts (pointer-events:none on body blocks clicks).
    if (typeof document !== 'undefined') {
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
      document.body.removeAttribute('data-scroll-locked');
    }
    if (!res) return;

    // PocketBase date fields arrive as "YYYY-MM-DD ..." or ISO strings.
    const rawDate = (res.reservationDate || '').toString();
    const dateMatch = rawDate.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : '';

    const params = new URLSearchParams();
    params.set('tab', 'reservations');
    if (dateStr) params.set('date', dateStr);
    params.set('focus', res.id);
    const target = `/admin-dashboard?${params.toString()}`;

    // Defer past Dialog close animation so body locks are fully cleared and
    // the dashboard's searchParams effect can pick up the deep-link even when
    // the admin is already sitting on /admin-dashboard.
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
      }
      navigate(target, { replace: false });
    }, 100);
  };

  if (!isAdminAuthenticated) return null;

  return (
    <>
      {/* Centered popup modal — appears once per new reservation, in the
          middle of the admin screen (not at the top). No Approve action here:
          the admin reviews full details and fits the reservation on the
          calendar instead. */}
      <Dialog
        open={!!newReservationAlert}
        onOpenChange={(open) => {
          if (!open) closeAlert();
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary/20 text-primary animate-pulse-glow">
              <BellRing className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center text-2xl">
              New Reservation Request
            </DialogTitle>
            <DialogDescription className="text-center">
              A new booking request just came in and needs your attention.
            </DialogDescription>
          </DialogHeader>

          {newReservationAlert && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4 my-2">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-foreground">
                  {newReservationAlert.guestName}
                </span>
                <Badge variant="outline" className="font-mono bg-muted/50">
                  {newReservationAlert.reservationCode || 'N/A'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4 shrink-0" />
                {newReservationAlert.reservationDate
                  ? format(new Date(newReservationAlert.reservationDate), 'MMM d, yyyy')
                  : 'N/A'}{' '}
                at{' '}
                <span className="notranslate" translate="no" data-time={newReservationAlert.reservationTime}>
                  {newReservationAlert.reservationTime}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                {newReservationAlert.partySize || newReservationAlert.numberOfGuests} guests
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={closeAlert} className="w-full sm:w-auto">
              Dismiss
            </Button>
            <Button onClick={viewNotification} className="w-full sm:w-auto">
              View Notification <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
