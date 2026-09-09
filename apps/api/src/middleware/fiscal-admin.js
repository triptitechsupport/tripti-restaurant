import PocketBase from 'pocketbase';
// Validate with PocketBase; decoding a JWT alone does not authenticate a user.
export default async function fiscalAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({message: 'Admin sign-in required.'});
  const client = new PocketBase('http://127.0.0.1:8090');
  client.authStore.save(token);
  try {
    const auth = await client.collection('admin_users').authRefresh();
    req.fiscalAdmin = auth.record.id;
    next();
  } catch { res.status(401).json({message: 'Admin session is invalid or expired.'}); }
}
