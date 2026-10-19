import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import staffAuth from '../middleware/staff.js';
import logger from '../utils/logger.js';
import {
  computeOptions, resolveItems, createPickupOrder, getPublicOrder, cancelByGuest,
  releaseToKitchen, staffSetStatus, markSeen, PickupError,
} from '../services/pickup.js';

const router = express.Router();

// nginx in front of the API overwrites X-Forwarded-For, so the address
// can't be faked, but on some hosts many guests share it: keep this one
// generous and also limit per email address.
const createLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { message: 'Too many orders from this device. Please call us.', code: 'rate_limited' },
});

const emailLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `mail:${String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 120)}`,
  message: { message: 'Too many orders for this email address. Please call us.', code: 'rate_limited' },
});

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof PickupError) return res.status(err.status).json({ message: err.message, code: err.code });
    logger.error(`[pickup] ${req.method} ${req.path}: ${err.message}`);
    return res.status(500).json({ message: 'Something went wrong. Please try again or call us.' });
  }
};

// Available pickup days and times for the dishes in the cart.
// items = "id:qty,id:qty" (optional; without it the default prep time is used)
router.get('/options', handle(async (req, res) => {
  const raw = String(req.query.items || '').split(',').filter(Boolean).slice(0, 60);
  const list = raw.map((p) => { const [id, q] = p.split(':'); return { id, quantity: Number(q) || 1 }; });
  let items = [];
  if (list.length) {
    try { items = await resolveItems(list); } catch (err) {
      if (err instanceof PickupError && err.code === 'unavailable') return res.status(409).json({ message: err.message, code: err.code });
      throw err;
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json(await computeOptions(items));
}));

router.post('/orders', createLimit, emailLimit, handle(async (req, res) => {
  res.status(201).json(await createPickupOrder(req.body || {}));
}));

router.get('/orders/:id', handle(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getPublicOrder(req.params.id, req.query.token));
}));

router.post('/orders/:id/cancel', handle(async (req, res) => {
  res.json(await cancelByGuest(req.params.id, req.body && req.body.token));
}));

// Staff: send an order to the kitchen now instead of waiting for its time.
router.post('/orders/:id/release', staffAuth, handle(async (req, res) => {
  const o = await releaseToKitchen(req.params.id, req.staff.name);
  res.json({ ok: true, kitchenOrder: o && o.kitchenOrder });
}));

// Staff: confirm, ready, picked up, no-show, cancel (with reason).
router.post('/orders/:id/status', staffAuth, handle(async (req, res) => {
  const o = await staffSetStatus(req.params.id, req.body || {}, req.staff);
  res.json({ ok: true, status: o && o.status });
}));

// Kitchen: "seen" on a pre-order in the preview.
router.post('/orders/:id/seen', staffAuth, handle(async (req, res) => {
  await markSeen(req.params.id, req.staff);
  res.json({ ok: true });
}));

export default router;
