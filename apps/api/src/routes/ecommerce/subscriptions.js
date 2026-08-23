import { Router } from 'express';
import Stripe from 'stripe';
import logger from '../../utils/logger.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Fetches user's active subscriptions from Stripe
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of subscription objects
 */
async function getUserSubscriptions({ userId }) {
	if (!userId || typeof userId !== 'string') {
		logger.warn('getUserSubscriptions called with invalid userId');
		return [];
	}

	try {
		// Query Stripe for subscriptions with metadata matching the userId
		const subscriptions = await stripe.subscriptions.list({
			limit: 100,
		});

		// Filter subscriptions by userId metadata
		const userSubscriptions = subscriptions.data.filter(
			(sub) => sub.metadata?.userId === userId && sub.status === 'active'
		);

		return userSubscriptions.map((sub) => ({
			id: sub.id,
			status: sub.status,
			currentPeriodStart: sub.current_period_start,
			currentPeriodEnd: sub.current_period_end,
			productId: sub.items.data[0]?.price?.product,
			priceId: sub.items.data[0]?.price?.id,
		}));
	} catch (error) {
		logger.error('Error fetching user subscriptions:', error.message);
		return [];
	}
}

/**
 * Creates a Stripe Customer Portal URL for managing subscriptions
 * @param {Object} params - Parameters object
 * @param {string} params.userId - The user ID
 * @param {string} params.returnUrl - URL to return to after managing subscriptions
 * @param {string} params.subscriptionId - The subscription ID (optional)
 * @returns {Promise<string>} The customer portal URL
 */
async function createManageUserSubscriptionUrl({ userId, returnUrl, subscriptionId }) {
	if (!userId || typeof userId !== 'string') {
		throw new Error('User ID is required');
	}

	if (!returnUrl || typeof returnUrl !== 'string') {
		throw new Error('Return URL is required');
	}

	try {
		// Get the subscription to find the customer ID
		const subscription = await stripe.subscriptions.retrieve(subscriptionId);

		if (!subscription) {
			throw new Error('Subscription not found');
		}

		const customerId = subscription.customer;

		if (!customerId) {
			throw new Error('No Stripe payment provider configured');
		}

		// Create a billing portal session
		const session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: returnUrl,
		});

		return session.url;
	} catch (error) {
		logger.error('Error creating manage subscription URL:', error.message);
		throw error;
	}
}

/**
 * Shape of `req.user` after your JWT middleware verifies the token and attaches the decoded payload
 * (e.g. `passport-jwt`, `express-jwt`, or `jwt.verify` then `req.user = payload`).
 *
 * @typedef {object} JwtUserPayload
 * @property {string} [sub] Standard JWT **subject** — commonly your application user id.
 * @property {string} [id] Some stacks put the user id here instead of (or in addition to) `sub`.
 */

/**
 * Returns the authenticated user id from the JWT payload on `req.user`.
 * Assumes an auth middleware has already run and rejected unauthenticated requests.
 *
 * @param {import('express').Request & { user?: JwtUserPayload }} req
 * @returns {string | null} `null` if no usable id claim is present.
 */
function getUserIdFromRequest(req) {
	const user = req.user;

	if (!user || typeof user !== 'object') {
		return null;
	}

	const fromSub = typeof user.sub === 'string' ? user.sub.trim() : '';
	
	if (fromSub) {
		return fromSub;
	}

	const fromId = typeof user.id === 'string' ? user.id.trim() : '';

	return fromId || null;
}

/**
 * Lists subscriptions for the resolved user (see {@link getUserIdFromRequest}).
 * Returns empty subscriptions array if user is not authenticated.
 */
router.get('/', async (req, res) => {
	const userId = getUserIdFromRequest(req);

	if (!userId) {
		logger.info('Subscriptions request without authenticated user - returning empty array');
		return res.json({ subscriptions: [] });
	}

	const subscriptions = await getUserSubscriptions({ userId });

	return res.json({ subscriptions });
});

/**
 * Create and return the manage subscriptions URL for the resolved user (see {@link getUserIdFromRequest}).
 * Returns error response if user is not authenticated.
 */
router.post('/manage', async (req, res) => {
	const { returnUrl, subscriptionId } = req.body;
	const userId = getUserIdFromRequest(req);

	if (!userId) {
		logger.warn('Manage subscriptions request without authenticated user');
		return res.status(401).json({ error: 'Authentication required' });
	}

	if (typeof returnUrl !== 'string' || returnUrl.trim() === '' || typeof subscriptionId !== 'string' || subscriptionId.trim() === '') {
		return res.status(400).json({ error: 'Return URL and Subscription ID are required' });
	}

	try {
		const url = await createManageUserSubscriptionUrl({ userId, returnUrl: returnUrl.trim(), subscriptionId });
		return res.json({ url });
	} catch (error) {
		if (error.message?.includes('No Stripe payment provider configured')) {
			return res.json({
				code: 'STRIPE_NOT_CONFIGURED',
				message: "Test subscriptions can't be managed. Purchase with a real payment method to enable full access",
			});
		}
		throw error;
	}
});

export default router;