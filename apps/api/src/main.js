import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.js';
import { globalRateLimit, billingReadRateLimit } from './middleware/global-rate-limit.js';
import logger from './utils/logger.js';
import { BodyLimit } from './constants/common.js';
import {billing} from './services/billingRuntime.js';
import {fiscalConfig} from './services/fiskalyClient.js';
import {fiscalReadiness} from './services/fiscalReadiness.js';

const app = express();
const startupFiscalConfig = fiscalConfig();
const startupReadiness = fiscalReadiness(startupFiscalConfig);
if (startupFiscalConfig.enabled && startupReadiness.issues.length)
  logger.error(`SIGN AT operations are blocked: ${startupReadiness.issues.join(' ')}`);
const fiscalRetryTimer = setInterval(() => {
  void billing.drain().catch(error => logger.error('[RKSV queue]', error.message));
}, 30000);
fiscalRetryTimer.unref();

app.set('trust proxy', true);

process.on('uncaughtException', (error) => {
	logger.error('Uncaught exception:', error);
});
  
process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
	logger.info('Interrupted');
	process.exit(0);
});

process.on('SIGTERM', async () => {
	logger.info('SIGTERM signal received');

	await new Promise(resolve => setTimeout(resolve, 3000));

	logger.info('Exiting');
	process.exit();
});

app.use(helmet());
app.use(cors({
	origin: process.env.CORS_ORIGIN,
	credentials: true,
}));
app.use(morgan('combined'));
app.use(globalRateLimit);
app.use(billingReadRateLimit);

// Increase header and body size limits to prevent HTTP 431 errors
// These limits must be set BEFORE route handlers
app.use(express.json({
	limit: '50mb',
}));
app.use(express.urlencoded({ 
	extended: true,
	limit: '50mb',
}));
app.use(express.raw({
	limit: '50mb',
}));

app.use('/', routes());

app.use(errorMiddleware);

app.use((req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

const port = process.env.PORT || 3001;

app.listen(port, process.env.HOST || '0.0.0.0', () => {
	logger.info(`🚀 API Server running on http://localhost:${port}`);
});

export default app;
