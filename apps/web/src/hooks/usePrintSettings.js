import { useState, useEffect } from 'react';
import defaultPb from '@/lib/pocketbaseClient.js';

/**
 * usePrintSettings — loads the single print_settings record and keeps it
 * in sync via realtime. Returns { settings, loading }.
 *
 * `settings` is the raw PocketBase record (or null while loading / if the
 * collection is empty). Use `canPrint()` / `shouldAutoPrint()` from this
 * module to evaluate permissions against it.
 */
export function usePrintSettings(pbClient) {
  const pb = pbClient || defaultPb;
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const records = await pb
          .collection('print_settings')
          .getFullList({ $autoCancel: false });
        if (active && records && records.length > 0) {
          setSettings(records[0]);
        }
      } catch (err) {
        // Non-fatal: print gating falls back to defaults (allow).
        console.error('Failed to load print settings', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    void pb
      .collection('print_settings')
      .subscribe('*', (e) => {
        if (e.action === 'create' || e.action === 'update') {
          setSettings(e.record);
        } else if (e.action === 'delete') {
          setSettings(null);
        }
      })
      .catch((err) => console.error('print_settings subscribe failed', err));

    return () => {
      active = false;
      void pb
        .collection('print_settings')
        .unsubscribe('*')
        .catch(() => {});
    };
  }, [pb]);

  return { settings, loading };
}

/**
 * Restaurant-wide print toggle. Defaults to true when settings are missing
 * or the field is unset, so a fresh install behaves as "printing on".
 */
export function restaurantWideEnabled(settings) {
  return !settings || settings.restaurantWidePrintEnabled !== false;
}

/**
 * Per-waiter print permission. A waiter may print only if the restaurant-
 * wide toggle is on AND their own per-waiter entry is not explicitly
 * disabled. Per-waiter can only restrict, never expand. admin_users always
 * pass (they are not waiters and retain full print access).
 */
export function canPrint(settings, role, waiterId) {
  if (role === 'admin') return true;
  if (!restaurantWideEnabled(settings)) return false;
  if (!waiterId) return true; // unknown waiter — default allow
  const per = settings?.perWaiterPrintSettings || {};
  const entry = per[waiterId];
  if (entry && entry.enabled === false) return false;
  return true;
}

/**
 * Whether a newly-created KOT should auto-print. True only when the caller
 * has print permission AND the admin autoPrintKOT toggle is on.
 */
export function shouldAutoPrint(settings, role, waiterId) {
  if (!canPrint(settings, role, waiterId)) return false;
  return !!settings && settings.autoPrintKOT === true;
}
