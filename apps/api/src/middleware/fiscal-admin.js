import PocketBase from 'pocketbase';

// Receipts and payments a cashier may handle; everything else (cash register
// setup, cancellations, recovery, DEP export) stays with the admin.
const CASHIER_ROUTES = [
  ['GET', /^\/(settlements|transactions|configuration)$/],
  ['POST', /^\/(settlements|orders)\/[^/]+\/generate$/],
  ['POST', /^\/transactions\/[^/]+\/retry$/],
];
const cashierMay = (req) => CASHIER_ROUTES.some(([method, path]) => req.method === method && path.test(req.path));

// Auditors only read: receipts, payments, register list, status and DEP7.
const AUDITOR_ROUTES = /^\/(settlements|transactions|configuration|periodic-receipts|registers|status|fon\/status|lifecycle\/receipts|dep7)$/;
const auditorMay = (req) => req.method === 'GET' && AUDITOR_ROUTES.test(req.path);

// Validate with PocketBase; decoding a JWT alone does not authenticate a user.
export default async function fiscalAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({message: 'Admin sign-in required.'});
  const client = new PocketBase('http://127.0.0.1:8090');
  client.authStore.save(token);
  try {
    const auth = await client.collection('admin_users').authRefresh();
    req.fiscalAdmin = auth.record.id;
    return next();
  } catch { /* maybe a cashier */ }
  if (cashierMay(req)) {
    try {
      const auth = await client.collection('waiter_users').authRefresh();
      if (auth.record.role === 'cashier') {
        req.fiscalAdmin = auth.record.id;
        req.fiscalCashier = true;
        return next();
      }
    } catch { /* not signed in */ }
  }
  if (auditorMay(req)) {
    try {
      const auth = await client.collection('auditor_users').authRefresh();
      req.fiscalAdmin = auth.record.id;
      req.fiscalAuditor = true;
      return next();
    } catch { /* not signed in */ }
  }
  return res.status(401).json({message: 'Admin session is invalid or expired.'});
}
