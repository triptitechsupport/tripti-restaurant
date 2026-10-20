import PocketBase, { LocalAuthStore } from 'pocketbase';

const POCKETBASE_API_URL = '/hcgi/platform';

// Independent auth stores so KDS and Waiter (and Admin, which uses the default
// client) can each stay logged in simultaneously without clobbering each other.
export const kdsPb = new PocketBase(
  POCKETBASE_API_URL,
  new LocalAuthStore('pb_kds_auth')
);

export const waiterPb = new PocketBase(
  POCKETBASE_API_URL,
  new LocalAuthStore('pb_waiter_auth')
);

// Stock/Waste management staff — independent auth store so stock staff can be
// logged in alongside waiters/KDS/admins without clobbering any session.
export const stockPb = new PocketBase(
  POCKETBASE_API_URL,
  new LocalAuthStore('pb_stock_auth')
);

// Auditors (view only) — their own store as well.
export const auditorPb = new PocketBase(
  POCKETBASE_API_URL,
  new LocalAuthStore('pb_auditor_auth')
);

// Sign out a saved kitchen or waiter login the server no longer knows (for
// example after the test server was redeployed with a fresh database).
function dropStaleLogin(client, collection) {
  try {
    const model = client.authStore.isValid ? (client.authStore.model || client.authStore.record) : null;
    if (!model || model.collectionName !== collection) return;
    client.collection(collection).authRefresh({ $autoCancel: false }).catch((err) => {
      if ([401, 403, 404].includes(err?.status)) client.authStore.clear();
    });
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  dropStaleLogin(kdsPb, 'kds_users');
  dropStaleLogin(waiterPb, 'waiter_users');
  dropStaleLogin(auditorPb, 'auditor_users');
}
