import { Router } from 'express';
import healthCheck from './health-check.js';
import stripeRouter from './stripe.js';
import pickupRouter from './pickup.js';
import reservationsRouter from './reservations.js';
import subscriptionsRouter from './ecommerce/subscriptions.js';
import otpRouter from './otp.js';
import authMiddleware from '../middleware/auth.js';
import billingRouter from './billing.js';
import staffRouter from './staff.js';
import assistantRouter from './assistant.js';
import callsRouter from './calls.js';
import stockAiRouter from './stockAi.js';

const router = Router();

export default () => {
	router.get('/health', healthCheck);
	router.use('/billing', billingRouter);
	router.use('/stripe', stripeRouter);
	router.use('/pickup', pickupRouter);
	router.use('/staff', staffRouter);
	router.use('/assistant', assistantRouter);
	router.use('/calls', callsRouter);
	router.use('/stock-ai', stockAiRouter);
	router.use('/reservations', authMiddleware, reservationsRouter);
	router.use('/ecommerce/subscriptions', authMiddleware, subscriptionsRouter);
	router.use('/otp', otpRouter);

	return router;
};
