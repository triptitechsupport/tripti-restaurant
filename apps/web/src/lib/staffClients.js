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
