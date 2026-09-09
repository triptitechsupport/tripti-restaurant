import rateLimit from 'express-rate-limit';

export const isBillingRead = req => req.method === 'GET' &&
  /^\/billing\/(transactions|configuration|settlements|periodic-receipts)\/?$/.test(req.path);

// Three reads every five seconds already exceed the general 100/5-minute
// budget. Keep monitoring bounded without consuming the mutation budget.
export const billingReadRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1200,
  skip: req => !isBillingRead(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many monitoring requests. Please wait before refreshing.'},
  validate: {trustProxy: false},
});

export const globalRateLimit = rateLimit({
	skip: isBillingRead,
	windowMs: 5 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many requests, please try again later' },
	validate: { trustProxy: false },
});
