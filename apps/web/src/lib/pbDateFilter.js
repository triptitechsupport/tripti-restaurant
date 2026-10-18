// PocketBase date-field filters require the "YYYY-MM-DD HH:MM:SS" (UTC) shape.
// Passing an ISO 8601 string (with "T" and "Z") silently matches ZERO rows,
// which made the KDS queue and Waiter active lists appear empty even though
// the records existed. Always format date literals for PB filters with this.
export function pbDateFilter(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    '-' +
    pad(d.getUTCMonth() + 1) +
    '-' +
    pad(d.getUTCDate()) +
    ' ' +
    pad(d.getUTCHours()) +
    ':' +
    pad(d.getUTCMinutes()) +
    ':' +
    pad(d.getUTCSeconds())
  );
}
