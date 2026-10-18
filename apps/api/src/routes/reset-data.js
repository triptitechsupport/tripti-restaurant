import express from 'express';
import Pocketbase from 'pocketbase';
import pb from '../utils/pocketbaseClient.js';
import authMiddleware from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

const POCKETBASE_HOST = 'http://localhost:8090';

/**
 * POST /reset-data
 *
 * Admin-only, password-protected hard reset of operational order data.
 *
 * Reset scope (per the owner's explicit decision):
 *   - DELETED: kitchen_orders (KOTs) — cascades kot_counters via parentOrder
 *   - DELETED: orders (customer online orders)
 *   - KEPT:    waiter_orders (bills / payment totals / billing history)
 *   - KEPT:    logs (analysis / audit history), menu, accounts, settings,
 *              stock, reservations, feedback, staff chat, timesheets, etc.
 *
 * Authorization is enforced server-side, not only by hiding UI:
 *   1. authMiddleware decodes the Bearer JWT → req.user.id
 *   2. the caller must exist on the `admin_users` auth collection
 *   3. the supplied password is verified against admin_users via a throwaway
 *      PocketBase client (so the shared superuser session is never clobbered
 *      and the plaintext password is never stored or logged)
 *   4. a literal confirmation token ("RESET") must accompany the request to
 *      guard against accidental invocation
 *
 * Waiter / KDS / unauthenticated users can never reach the deletion step:
 * they either lack a valid admin JWT (401) or fail the admin_users lookup
 * (403) before any record is touched.
 */
router.post('/reset-data', authMiddleware, async (req, res) => {
	try {
		if (!req.user || !req.user.id) {
			return res.status(401).json({ error: 'Authentication required' });
		}

		// 1) Confirm the caller is an admin_users record.
		let adminRec;
		try {
			adminRec = await pb.collection('admin_users').getOne(req.user.id);
		} catch (_) {
			return res.status(403).json({ error: 'Admin access required' });
		}

		const { password, confirm } = req.body || {};

		if (!password || typeof password !== 'string') {
			return res.status(400).json({ error: 'Password is required' });
		}
		// Explicit confirmation token — prevents accidental resets.
		if (confirm !== 'RESET') {
			return res.status(400).json({ error: 'Confirmation token missing or invalid' });
		}

		// 2) Verify the admin password using a throwaway client so the
		//    shared superuser auth store is never overwritten. The plaintext
		//    password lives only in this request scope and is never logged.
		const verifyClient = new Pocketbase(POCKETBASE_HOST);
		verifyClient.autoCancellation(false);
		try {
			await verifyClient.collection('admin_users').authWithPassword(
				adminRec.email,
				password,
			);
		} catch (_) {
			return res.status(403).json({ error: 'Invalid admin password' });
		}

		// 3) Delete all KOTs (kitchen_orders). The parentOrder relation on
		//    kot_counters has cascadeDelete, so each KOT's counter row is
		//    removed automatically. waiter_orders (bills/payments) are NOT
		//    touched — only the KOT children are removed.
		const kots = await pb.collection('kitchen_orders').getFullList({
			fields: 'id',
			$autoCancel: false,
		});
		await Promise.all(
			kots.map((k) =>
				pb.collection('kitchen_orders').delete(k.id, { $autoCancel: false }),
			),
		);

		// 4) Delete all customer online orders. No cascading relations to
		//    preserve — billing/payment totals live on waiter_orders, which
		//    are retained.
		const orders = await pb.collection('orders').getFullList({
			fields: 'id',
			$autoCancel: false,
		});
		await Promise.all(
			orders.map((o) =>
				pb.collection('orders').delete(o.id, { $autoCancel: false }),
			),
		);

		logger.info(
			`[reset-data] Admin ${adminRec.email} cleared ${kots.length} KOT(s) and ${orders.length} customer order(s). waiter_orders, logs, and analysis history retained.`,
		);

		res.json({
			success: true,
			deleted: {
				kots: kots.length,
				orders: orders.length,
			},
		});
	} catch (err) {
		logger.error('Reset data failed:', err);
		res.status(500).json({ error: 'Reset failed' });
	}
});

export default router;
