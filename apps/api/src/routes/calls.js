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

export default router;
