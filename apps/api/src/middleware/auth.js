import logger from '../utils/logger.js';

export default async function authMiddleware(req, res, next) {
	const header = req.headers.authorization;

	// If no Authorization header, set req.user to null and continue
	if (!header || !header.startsWith('Bearer ')) {
		req.user = null;
		return next();
	}

	const token = header.slice('Bearer '.length).trim();

	if (!token) {
		req.user = null;
		return next();
	}

	try {
		// Base64-decode the JWT payload (middle part between dots)
		const parts = token.split('.');

		if (parts.length !== 3) {
			req.user = null;
			return next();
		}

		const payload = parts[1];
		const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));

		if (!decoded?.id) {
			req.user = null;
			return next();
		}

		req.user = { id: decoded.id };
		return next();
	} catch (error) {
		logger.warn('Auth middleware error:', error.message);
		req.user = null;
		return next();
	}
}