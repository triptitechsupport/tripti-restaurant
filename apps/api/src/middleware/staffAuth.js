import PocketBase from 'pocketbase';

// Checks a staff token (any staff account type) and sets req.staff, so each
// request reads and writes PocketBase with that person's own rights.
const PB_URL = 'http://127.0.0.1:8090';
const COLLECTIONS = ['admin_users', 'waiter_users', 'kds_users', 'stock_users'];

export function roleOf(collection, record) {
  const r = record.role || '';
  if (collection === 'admin_users') return 'admin';
  if (collection === 'waiter_users') return r === 'cashier' ? 'cashier' : 'waiter';
  if (collection === 'kds_users') return r === 'kitchen_manager' ? 'kitchen_manager' : 'kitchen';
  return 'stock';
}

export async function signIn(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Staff sign-in required.' });
  for (const name of COLLECTIONS) {
    const pb = new PocketBase(PB_URL);
    pb.autoCancellation(false);
    pb.authStore.save(token);
    try {
      const auth = await pb.collection(name).authRefresh();
      const rec = auth.record;
      req.staff = { pb, id: rec.id, role: roleOf(name, rec), name: rec.displayName || rec.username || rec.email || name };
      return next();
    } catch { /* try the next account type */ }
  }
  return res.status(401).json({ message: 'Staff session is invalid or expired.' });
}
