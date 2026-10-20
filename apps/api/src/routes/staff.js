import express from 'express';
import staffAuth from '../middleware/staff.js';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

// Tools for the kitchen manager (and admin) on the kitchen screen.
const router = express.Router();

const managerOnly = (req, res, next) => {
  const s = req.staff;
  if (s.role === 'admin_users' || (s.role === 'kds_users' && s.staffRole === 'kitchen_manager')) return next();
  return res.status(403).json({ message: 'Only the kitchen manager or admin can do this.' });
};

// Mark a dish as sold out (or available again). Sold-out dishes disappear
// from the website menu and can't be ordered online.
router.post('/menu/:id/availability', staffAuth, managerOnly, async (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-z0-9]{15}$/.test(id) || typeof (req.body && req.body.available) !== 'boolean') {
    return res.status(400).json({ message: 'Invalid request.' });
  }
  try {
    const rec = await pb.collection('menu_items').update(id, { availability: req.body.available });
    logger.info(`[staff] ${req.staff.name} set ${rec.name} ${req.body.available ? 'available' : 'sold out'}`);
    return res.json({ id: rec.id, availability: rec.availability });
  } catch (err) {
    if (err?.status === 404) return res.status(404).json({ message: 'Dish not found.' });
    logger.error(`[staff] availability: ${err.message}`);
    return res.status(500).json({ message: 'Could not save. Please try again.' });
  }
});

export default router;
