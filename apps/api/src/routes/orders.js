import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /orders
 * Create a new order
 * Body: { customerId, items: [{menuItemId, quantity, price}], totalPrice, paymentStatus, deliveryAddress, customerEmail, customerPhone }
 * Returns: { orderId, estimatedDeliveryTime }
 */
router.post('/', async (req, res) => {
	const { customerId, items, totalPrice, paymentStatus, deliveryAddress, customerEmail, customerPhone } = req.body;

	if (!customerId || typeof customerId !== 'string') {
		return res.status(400).json({ error: 'Customer ID is required' });
	}

	if (!items || !Array.isArray(items) || items.length === 0) {
		return res.status(400).json({ error: 'Items array is required and must not be empty' });
	}

	if (totalPrice === undefined || typeof totalPrice !== 'number') {
		return res.status(400).json({ error: 'Total price is required' });
	}

	if (!paymentStatus || typeof paymentStatus !== 'string') {
		return res.status(400).json({ error: 'Payment status is required' });
	}

	if (!deliveryAddress || typeof deliveryAddress !== 'string') {
		return res.status(400).json({ error: 'Delivery address is required' });
	}

	if (!customerEmail || typeof customerEmail !== 'string') {
		return res.status(400).json({ error: 'Customer email is required' });
	}

	if (!customerPhone || typeof customerPhone !== 'string') {
		return res.status(400).json({ error: 'Customer phone is required' });
	}

	const record = await pb.collection('orders').create({
		customerId,
		items,
		totalPrice,
		paymentStatus,
		deliveryAddress,
		customerEmail,
		customerPhone,
		createdAt: new Date().toISOString(),
	});

	logger.info(`Order created: ${record.id}`);

	res.json({
		orderId: record.id,
		estimatedDeliveryTime: '30-45 minutes',
	});
});

/**
 * GET /orders/:orderId
 * Retrieve an order by ID
 * Returns: order details with items
 */
router.get('/:orderId', async (req, res) => {
	const { orderId } = req.params;

	if (!orderId || typeof orderId !== 'string') {
		return res.status(400).json({ error: 'Order ID is required' });
	}

	const record = await pb.collection('orders').getOne(orderId);

	logger.info(`Retrieved order: ${record.id}`);

	res.json(record);
});

export default router;