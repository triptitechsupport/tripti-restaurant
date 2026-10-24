import PocketBase from 'pocketbase';

// Staff sign-in check for the API: the token must belong to an admin, waiter
// or kitchen account. PocketBase validates it; decoding the JWT alone is not enough.
const COLLECTIONS = ['admin_users', 'waiter_users', 'kds_users'];

export default async function staffAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Staff sign-in required.' });
  for (const name of COLLECTIONS) {
    const client = new PocketBase('http://127.0.0.1:8090');
    client.authStore.save(token);
    try {
      const auth = await client.collection(name).authRefresh();
      // staffRole: 'kitchen_manager' or 'cashier' for those accounts, otherwise empty.
      req.staff = { id: auth.record.id, role: name, staffRole: auth.record.role || '', name: auth.record.displayName || auth.record.username || auth.record.email || name };
      return next();
    } catch { /* try the next account type */ }
  }
  return res.status(401).json({ message: 'Staff session is invalid or expired.' });
}
