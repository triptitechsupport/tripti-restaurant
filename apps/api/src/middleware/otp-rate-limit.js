import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';

// Rate limit for OTP requests: max 3 requests per minute per email
export const otpRequestRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please try again in 1 minute.' },
  validate: { trustProxy: false },
  keyGenerator: (req) => {
    // Get normalized IP address (handles both IPv4 and IPv6)
    const ip = ipKeyGenerator(req);
    // Get email from request body
    const email = req.body?.email || '';
    // Combine IP and email as the rate limit key
    return `${ip}:${email}`;
  },
});