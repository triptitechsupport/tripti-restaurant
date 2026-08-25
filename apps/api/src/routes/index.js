import { Router } from 'express';
import healthCheck from './health-check.js';
import stripeRouter from './stripe.js';
import ordersRouter from './orders.js';
import reservationsRouter from './reservations.js';
import subscriptionsRouter from './ecommerce/subscriptions.js';
import otpRouter from './otp.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();

export default () => {
	router.get('/health', healthCheck);
	router.use('/stripe', stripeRouter);
	router.use('/orders', ordersRouter);
	router.use('/reservations', authMiddleware, reservationsRouter);
	router.use('/ecommerce/subscriptions', authMiddleware, subscriptionsRouter);
	router.use('/otp', otpRouter);

	return router;
};