// Online pickup orders: calls to the API server (/hcgi/api/pickup).
import { API_SERVER_URL } from '@/lib/apiServerClient.js';

const BASE = `${API_SERVER_URL}/pickup`;

// The API answers in English; German guests get these instead.
const DE_TEXT = {
  name: 'Bitte geben Sie Ihren Namen ein.',
  email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  phone: 'Bitte geben Sie eine Telefonnummer ein.',
  slot: 'Bitte wählen Sie eine Abholzeit.',
  slot_taken: 'Diese Abholzeit ist nicht mehr frei. Bitte wählen Sie eine andere.',
  disabled: 'Online-Bestellungen sind gerade ausgeschaltet.',
  empty: 'Ihr Warenkorb ist leer.',
  invalid_item: 'Ein Gericht im Warenkorb ist ungültig. Bitte Warenkorb neu füllen.',
  too_many: 'Zu viele Gerichte für eine Online-Bestellung. Bitte rufen Sie uns an.',
  not_found: 'Bestellung nicht gefunden.',
  too_late: 'Die Bestellung wird schon zubereitet. Bitte rufen Sie uns an.',
  rate_limited: 'Zu viele Bestellungen in kurzer Zeit. Bitte rufen Sie uns an.',
};

function localMessage(data, en) {
  if (!data || !data.message) return '';
  if (en) return data.message;
  if (data.code === 'unavailable') return data.message.replace(/^Not available for pickup:/, 'Online nicht bestellbar:');
  return DE_TEXT[data.code] || data.message;
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const en = (() => { try { return localStorage.getItem('language') === 'en'; } catch { return false; } })();
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const err = new Error(en ? 'No connection to the restaurant server. Please check your internet and try again.'
      : 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    err.code = 'network';
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const busy = !data || res.status >= 502;
    const fallback = res.status === 429
      ? (en ? 'Too many attempts. Please wait a few minutes or call us.' : 'Zu viele Versuche. Bitte ein paar Minuten warten oder anrufen.')
      : busy
        ? (en ? 'The server is restarting. Please try again in a minute.' : 'Der Server startet gerade neu. Bitte in einer Minute erneut versuchen.')
        : `Request failed (${res.status})`;
    const err = new Error(localMessage(data, en) || fallback);
    err.code = data && data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const pickupOptions = (cartItems) => {
  const items = (cartItems || []).map((i) => `${i.id}:${i.quantity}`).join(',');
  return call(`/options${items ? `?items=${encodeURIComponent(items)}` : ''}`);
};
export const placePickupOrder = (body) => call('/orders', { method: 'POST', body });
export const getPickupOrder = (id, token) => call(`/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
export const cancelPickupOrder = (id, token) => call(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { token } });

// Staff (token = the signed-in PocketBase staff token)
export const staffRelease = (id, token) => call(`/orders/${id}/release`, { method: 'POST', token, body: {} });
export const staffSetStatus = (id, status, token, reason) => call(`/orders/${id}/status`, { method: 'POST', token, body: { status, reason } });
export const staffMarkSeen = (id, token) => call(`/orders/${id}/seen`, { method: 'POST', token, body: {} });

/* ---------- shared display helpers ---------- */

export const PICKUP_STATUS = {
  received: { de: 'Eingegangen', en: 'Received', tone: 'amber' },
  confirmed: { de: 'Bestätigt', en: 'Confirmed', tone: 'blue' },
  in_kitchen: { de: 'In der Küche', en: 'Being prepared', tone: 'orange' },
  ready: { de: 'Abholbereit', en: 'Ready for pickup', tone: 'green' },
  picked_up: { de: 'Abgeholt', en: 'Picked up', tone: 'gray' },
  cancelled: { de: 'Storniert', en: 'Cancelled', tone: 'red' },
  no_show: { de: 'Nicht abgeholt', en: 'Not picked up', tone: 'red' },
};

export const TONE_CLASS = {
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  blue: 'bg-blue-100 text-blue-900 border-blue-300',
  orange: 'bg-orange-100 text-orange-900 border-orange-300',
  green: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  gray: 'bg-slate-100 text-slate-700 border-slate-300',
  red: 'bg-red-100 text-red-900 border-red-300',
};

const TZ = 'Europe/Vienna';
// Today's date in Vienna plus N calendar days ("YYYY-MM-DD"); safe across clock changes.
export function viennaToday(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!offsetDays) return today;
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

export function formatPickupDay(dateStr, lang = 'de', { long = false } = {}) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const locale = lang === 'en' ? 'en-GB' : 'de-AT';
  if (dateStr === viennaToday(0)) return lang === 'en' ? 'Today' : 'Heute';
  if (dateStr === viennaToday(1)) return lang === 'en' ? 'Tomorrow' : 'Morgen';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'numeric',
  }).format(date);
}

export const euro = (n) => `€ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;
