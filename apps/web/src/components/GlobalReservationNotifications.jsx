import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Check, X, BellRing, CalendarClock, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { useTableReservationConfirmation } from '@/hooks/useTableReservationConfirmation.js';

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
  const { sendConfirmationEmail } = useTableReservationConfirmation();

  const [pendingReservations, setPendingReservations] = useState([]);
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

  const fetchReservations = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await pb.collection('table_reservations').getFullList({
        sort: '-created',
        $autoCancel: false,
      });

      const pending = data.filter((r) => !r.status || r.status === 'Pending');
      setPendingReservations(pending);

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
        // Mark them all as alerted immediately so they can't retrigger.
        newcomers.forEach((r) => alertedIdsRef.current.add(r.id));
        const latest = newcomers
          .slice()
          .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))[0];

        // Only surface a popup if one isn't already open.
        if (!alertOpenRef.current) {
          alertOpenRef.current = true;
          setNewReservationAlert(latest);
        }
        playNotificationChime();
        toast.info(`New reservation from ${latest.guestName}`, {
          description: `${latest.reservationDate ? format(new Date(latest.reservationDate), 'MMM d, yyyy') : ''} at ${latest.reservationTime} \u2022 ${latest.partySize || latest.numberOfGuests} guests`,
          duration: 8000,
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
      setPendingReservations([]);
      setNewReservationAlert(null);
      alertedIdsRef.current = new Set();
      initialLoadDoneRef.current = false;
      alertOpenRef.current = false;
      return undefined;
    }

    fetchReservations();

    // Real-time subscription (primary channel).
    pb.collection('table_reservations').subscribe('*', function () {
      fetchReservations();
    });

    // Polling fallback in case the realtime websocket drops through the proxy.
    const intervalId = setInterval(() => {
      fetchReservations();
    }, 20000);

    return () => {
      clearInterval(intervalId);
      pb.collection('table_reservations').unsubscribe('*');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminAuthenticated]);

  const closeAlert = () => {
    alertOpenRef.current = false;
    setNewReservationAlert(null);
  };

  const goToReservations = () => {
    // Close the dialog first, then navigate on the next tick. Navigating while
    // a Radix Dialog is still mounted can leave `pointer-events: none` on the
    // body, which freezes the destination page. Deferring the navigation lets
    // the dialog fully unmount and clean up before the route changes.
    alertOpenRef.current = false;
    setNewReservationAlert(null);
    // Safety: clear any lingering scroll/pointer lock Radix may have left behind.
    if (typeof document !== 'undefined') {
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
    }
    setTimeout(() => {
      navigate('/admin/reservations');
    }, 50);
  };

  const updateStatus = async (id, newStatus, reservation) => {
    // Close popup immediately and drop from pending list for snappy UX.
    if (newReservationAlert?.id === id) closeAlert();
    setPendingReservations((prev) => prev.filter((r) => r.id !== id));
    try {
      const payload = { status: newStatus };
      // The collection requires a reservationCode; older records may have a
      // blank one which makes a status-only PATCH fail validation. Backfill it.
      if (reservation && !reservation.reservationCode) {
        payload.reservationCode = `RSV-${(reservation.id || '').slice(-6).toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      }
      await pb.collection('table_reservations').update(id, payload, { $autoCancel: false });
      if (newStatus === 'Approved') {
        try {
          await sendConfirmationEmail(reservation);
          toast.success('Reservation approved! Confirmation email will be sent.');
        } catch {
          toast.error('Approved, but failed to trigger confirmation email.');
        }
      } else {
        toast.success(`Reservation marked as ${newStatus}`);
      }
    } catch {
      toast.error('Failed to update reservation status');
      fetchReservations();
    }
  };

  const firstPending = useMemo(() => pendingReservations[0], [pendingReservations]);

  if (!isAdminAuthenticated) return null;

  return (
    <>
      {/* Persistent ribbon banner — visible on every admin page until addressed */}
      {pendingReservations.length > 0 && firstPending && (
        <div className="fixed top-0 left-0 right-0 z-[95] bg-primary text-primary-foreground shadow-lg border-b-4 border-secondary animate-in slide-in-from-top-full duration-300">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <BellRing className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground">
                  {pendingReservations.length}
                </span>
              </span>
              <div className="min-w-0">
                <p className="font-bold text-sm leading-tight">
                  {pendingReservations.length} pending reservation{pendingReservations.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-primary-foreground/80 truncate">
                  {firstPending.guestName} • {firstPending.reservationDate ? format(new Date(firstPending.reservationDate), 'MMM d') : ''} at <span className="notranslate" translate="no" data-time={firstPending.reservationTime}>{firstPending.reservationTime}</span> • {firstPending.partySize || firstPending.numberOfGuests} guests
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="secondary" className="h-9 font-bold" onClick={goToReservations}>
                <ArrowRight className="h-4 w-4 mr-1.5" /> View
              </Button>
              <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => updateStatus(firstPending.id, 'Approved', firstPending)}>
                <Check className="h-4 w-4 mr-1.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" className="h-9 font-bold" onClick={() => updateStatus(firstPending.id, 'Declined', firstPending)}>
                <X className="h-4 w-4 mr-1.5" /> Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Popup modal — appears once per new reservation */}
      <Dialog open={!!newReservationAlert} onOpenChange={(open) => { if (!open) closeAlert(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary/20 text-primary animate-pulse-glow">
              <BellRing className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center text-2xl">New Reservation Request</DialogTitle>
            <DialogDescription className="text-center">
              A new booking request just came in and needs your attention.
            </DialogDescription>
          </DialogHeader>

          {newReservationAlert && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4 my-2">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-foreground">{newReservationAlert.guestName}</span>
                <Badge variant="outline" className="font-mono bg-muted/50">{newReservationAlert.reservationCode || 'N/A'}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4 shrink-0" />
                {newReservationAlert.reservationDate ? format(new Date(newReservationAlert.reservationDate), 'MMM d, yyyy') : 'N/A'} at <span className="notranslate" translate="no" data-time={newReservationAlert.reservationTime}>{newReservationAlert.reservationTime}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                {newReservationAlert.partySize || newReservationAlert.numberOfGuests} guests
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center gap-2">
            {newReservationAlert && (
              <Button
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => updateStatus(newReservationAlert.id, 'Approved', newReservationAlert)}
              >
                <Check className="h-4 w-4 mr-1.5" /> Approve
              </Button>
            )}
            <Button variant="outline" onClick={closeAlert} className="w-full sm:w-auto">
              Dismiss
            </Button>
            <Button onClick={goToReservations} className="w-full sm:w-auto">
              View Reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
