import express from 'express';
import Stripe from 'stripe';
import logger from '../utils/logger.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// In-memory store for session metadata (sessionId -> { deliveryAddress, customerEmail, customerName, items })
// In production, use Redis or a database for persistence
const sessionStore = new Map();

// Clean up expired sessions every 30 minutes (24-hour expiry)
setInterval(() => {
	const now = Date.now();
	for (const [sessionId, data] of sessionStore.entries()) {
		if (now - data.createdAt > 24 * 60 * 60 * 1000) {
			sessionStore.delete(sessionId);
			logger.info(`Cleaned up expired session: ${sessionId}`);
		}
	}
}, 30 * 60 * 1000);

/**
 * POST /stripe/create-checkout
 * Create a Stripe Checkout Session
 * Body: { items: [{id, quantity, price}], customerEmail, customerName, successUrl, cancelUrl, deliveryAddress }
 * Returns: { sessionId, url }
 */
router.post('/create-checkout', async (req, res) => {
	const { items, customerEmail, customerName, successUrl, cancelUrl, deliveryAddress } = req.body;

	if (!items || !Array.isArray(items) || items.length === 0) {
		return res.status(400).json({ error: 'Items array is required and must not be empty' });
	}

	if (!customerEmail || typeof customerEmail !== 'string') {
		return res.status(400).json({ error: 'Customer email is required' });
	}

	if (!customerName || typeof customerName !== 'string') {
		return res.status(400).json({ error: 'Customer name is required' });
	}

	if (!successUrl || typeof successUrl !== 'string') {
		return res.status(400).json({ error: 'Success URL is required' });
	}

	if (!cancelUrl || typeof cancelUrl !== 'string') {
		return res.status(400).json({ error: 'Cancel URL is required' });
	}

	if (!deliveryAddress || typeof deliveryAddress !== 'string') {
		return res.status(400).json({ error: 'Delivery address is required' });
	}

	const lineItems = items.map((item) => {
		if (!item.id || !item.quantity || item.price === undefined) {
			throw new Error('Each item must have id, quantity, and price');
		}

		return {
			price_data: {
				currency: 'usd',
				product_data: {
					name: item.id,
				},
				unit_amount: Math.round(item.price * 100),
			},
			quantity: item.quantity,
		};
	});

	const session = await stripe.checkout.sessions.create({
		payment_method_types: ['card'],
		line_items: lineItems,
		mode: 'payment',
		customer_email: customerEmail,
		success_url: successUrl,
		cancel_url: cancelUrl,
	});

	// Store session metadata in memory for later retrieval
	sessionStore.set(session.id, {
		deliveryAddress,
		customerEmail,
		customerName,
		items,
		createdAt: Date.now(),
	});

	logger.info(`Checkout session created: ${session.id} for ${customerEmail}`);

	res.json({
		sessionId: session.id,
		url: session.url,
	});
});

/**
 * GET /stripe/session/:sessionId
 * Retrieve a Stripe Checkout Session and its stored metadata
 * Returns: { id, status, amountTotal, customerEmail, deliveryAddress, customerName, items }
 */
router.get('/session/:sessionId', async (req, res) => {
	const { sessionId } = req.params;

	if (!sessionId || typeof sessionId !== 'string') {
		return res.status(400).json({ error: 'Session ID is required' });
	}

	const session = await stripe.checkout.sessions.retrieve(sessionId);

	if (!session) {
		throw new Error(`Session not found: ${sessionId}`);
	}

	// Retrieve stored metadata
	const metadata = sessionStore.get(sessionId) || {};

	logger.info(`Retrieved checkout session: ${session.id}`);

	res.json({
		id: session.id,
		status: session.payment_status,
		amountTotal: session.amount_total,
		customerEmail: session.customer_details?.email || metadata.customerEmail,
		deliveryAddress: metadata.deliveryAddress,
		customerName: metadata.customerName,
		items: metadata.items,
	});
});

export default router;