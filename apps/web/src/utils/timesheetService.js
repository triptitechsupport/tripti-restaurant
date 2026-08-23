import pb from '@/lib/pocketbaseClient.js';

/**
 * Timesheet (clock-in / clock-out) helpers for waiter shifts.
 *
 * One active timesheet per waiter is enforced server-side via a partial unique
 * index on (waiter) WHERE clockOut IS NULL. These helpers gracefully handle the
 * "forgot to clock out" case by auto-closing any stale active shift before
 * opening a new one.
 */

const COLLECTION = 'waiter_timesheets';

/**
 * Close any active (clockOut = null) timesheet for the given waiter id.
 * Sets clockOut to now and computes shiftDuration in minutes.
 * @param {string} waiterId
 * @param {PocketBase} [client] - optional PB client (defaults to shared client)
 * @returns {Promise<void>}
 */
export async function closeActiveTimesheet(waiterId, client = pb) {
  if (!waiterId) return;
  try {
    const active = await client
      .collection(COLLECTION)
      .getFirstListItem(
        `waiter = "${waiterId}" && clockOut = null`,
        { $autoCancel: false }
      )
      .catch(() => null);

    if (!active) return;

    const now = new Date();
    const clockInDate = active.clockIn ? new Date(active.clockIn) : now;
    const durationMin = Math.max(
      0,
      Math.round((now.getTime() - clockInDate.getTime()) / 60000)
    );

    await client
      .collection(COLLECTION)
      .update(
        active.id,
        { clockOut: now.toISOString(), shiftDuration: durationMin },
        { $autoCancel: false }
      )
      .catch(() => {});
  } catch (err) {
    console.error('[timesheet] closeActiveTimesheet failed', err);
  }
}

/**
 * Clock in: close any stale active shift for this waiter, then create a new
 * active timesheet with clockIn = now.
 * @param {string} waiterId
 * @param {PocketBase} [client]
 * @returns {Promise<object|null>} the created timesheet record, or null on failure
 */
export async function clockIn(waiterId, client = pb) {
  if (!waiterId) return null;
  try {
    // Gracefully close a previous forgotten-to-clock-out shift first so the
    // unique partial index doesn't reject the new record.
    await closeActiveTimesheet(waiterId, client);

    const rec = await client.collection(COLLECTION).create(
      {
        waiter: waiterId,
        clockIn: new Date().toISOString(),
        clockOut: null,
        shiftDuration: null,
      },
      { $autoCancel: false }
    );
    return rec;
  } catch (err) {
    console.error('[timesheet] clockIn failed', err);
    return null;
  }
}

/**
 * Clock out: close the active timesheet for this waiter (if any).
 * @param {string} waiterId
 * @param {PocketBase} [client]
 * @returns {Promise<void>}
 */
export async function clockOut(waiterId, client = pb) {
  return closeActiveTimesheet(waiterId, client);
}

/**
 * Fetch the active (in-progress) timesheet for a waiter, if any.
 * @param {string} waiterId
 * @param {PocketBase} [client]
 * @returns {Promise<object|null>}
 */
export async function getActiveTimesheet(waiterId, client = pb) {
  if (!waiterId) return null;
  try {
    return await client
      .collection(COLLECTION)
      .getFirstListItem(
        `waiter = "${waiterId}" && clockOut = null`,
        { $autoCancel: false }
      )
      .catch(() => null);
  } catch (err) {
    return null;
  }
}

/**
 * Format a shift duration (in minutes) as "Hh Mm" or "Mm".
 * @param {number|null|undefined} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if (minutes == null || isNaN(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0) return `${h}h ${rem}m`;
  return `${rem}m`;
}

/**
 * Format an ISO datetime for display (date + time), locale-aware.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '—';
  }
}
