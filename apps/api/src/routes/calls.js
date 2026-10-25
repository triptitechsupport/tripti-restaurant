import express from 'express';
import rateLimit from 'express-rate-limit';
import adminPb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { signIn, roleOf } from './assistant.js';

// Staff calls: the list of people a staff member can call. The calls
// themselves go through PocketBase (call_rooms / call_members / call_signals).
const router = express.Router();

const limit = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } });
const ACCOUNTS = ['admin_users', 'waiter_users', 'kds_users', 'stock_users', 'auditor_users'];

router.get('/staff', limit, signIn, async (req, res) => {
  try {
    const people = [];
    for (const col of ACCOUNTS) {
      let list = [];
      try {
        list = await adminPb.collection(col).getFullList({ batch: 500 });
      } catch (err) {
        logger.warn(`[calls] list ${col}: ${err.message}`);
      }
      for (const r of list) {
        if (r.active === false || r.isActive === false) continue;
        if (r.id === req.staff.id) continue;
        people.push({ id: r.id, name: r.displayName || r.username || (r.email ? String(r.email).split('@')[0] : '') || (col === 'admin_users' ? 'Admin' : col), role: roleOf(col, r) });
      }
    }
    return res.json({ me: { id: req.staff.id, name: req.staff.name, role: req.staff.role }, people });
  } catch (err) {
    logger.error(`[calls] staff list: ${err.message}`);
    return res.status(500).json({ message: 'Could not load the staff list.' });
  }
});

// Servers that help two devices find a path for the audio. STUN only works
// when both devices can reach each other directly; a TURN server relays the
// audio when a network blocks that (mobile data, guest Wi-Fi, some routers).
// Set either Cloudflare TURN (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN)
// or any TURN service (TURN_URLS comma separated, TURN_USERNAME, TURN_CREDENTIAL).
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let cfCache = null;

async function cloudflareIce() {
  const id = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!id || !token) return null;
  if (cfCache && cfCache.until > Date.now()) return cfCache.servers;
  const base = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials`;
  const opts = { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }) };
  let r = await fetch(`${base}/generate-ice-servers`, opts);
  if (r.status === 404) r = await fetch(`${base}/generate`, opts);
  if (!r.ok) throw new Error(`Cloudflare TURN ${r.status}`);
  const d = await r.json();
  const list = Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
  cfCache = { servers: list, until: Date.now() + 12 * 60 * 60 * 1000 };
  return list;
}

function staticTurn() {
  const urls = String(process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return [];
  return [{ urls, username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' }];
}

router.get('/ice', limit, signIn, async (req, res) => {
  let turn = [];
  try {
    turn = (await cloudflareIce()) || [];
  } catch (err) {
    logger.warn(`[calls] ${err.message}`);
  }
  if (!turn.length) turn = staticTurn();
  return res.json({ iceServers: [...STUN, ...turn], relay: turn.length > 0 });
});

export default router;
