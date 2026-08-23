// Shared delayed-state calculation for KOTs across KDS, Waiter, and Admin.
//
// A KOT is "delayed" when it is still pending (unattended by the kitchen)
// AND has been waiting for the delay threshold (5 minutes) or longer since
// its creation/received timestamp. Once the kitchen moves the KOT out of
// pending (preparing / ready / completed / cancelled) it is considered
// attended and is no longer delayed.
//
// This is the SINGLE consistent calculation used by every interface so that
// Kitchen, Waiter, and Administrator views all show the same delayed state.
// No per-screen independent timers — every view derives delayed state from
// the KOT's actual creation timestamp and current status.

export const KOT_DELAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Age of a KOT in milliseconds since its creation/received timestamp.
export function kotAgeMs(kot, now = Date.now()) {
  if (!kot || !kot.created) return 0;
  return Math.max(0, now - new Date(kot.created).getTime());
}

// A KOT is delayed when it is still pending (unattended) and has been
// waiting for the delay threshold or longer.
export function isKotDelayed(kot, now = Date.now()) {
  if (!kot) return false;
  if (kot.status !== 'pending') return false;
  return kotAgeMs(kot, now) >= KOT_DELAY_THRESHOLD_MS;
}

// Count delayed KOTs in a list (uses the same calculation).
export function countDelayedKots(kots, now = Date.now()) {
  if (!Array.isArray(kots)) return 0;
  return kots.filter((k) => isKotDelayed(k, now)).length;
}

// ---- Consistent visual styling for delayed KOTs (all interfaces) ----
// Card-level highlight: a destructive ring + faint tint to make delayed
// KOTs stand out clearly without breaking layout.
export const DELAYED_CARD_CLS =
  'ring-2 ring-destructive shadow-[0_0_0_2px_hsl(var(--destructive)/0.15)]';

// Left accent border override for delayed KOT cards (used where a card has
// a colored left border, e.g. KDS OrderCard).
export const DELAYED_BORDER_CLS = 'border-destructive';

// Badge styling for the "Delayed" indicator pill.
export const DELAYED_BADGE_CLS =
  'bg-destructive text-destructive-foreground border-destructive';
