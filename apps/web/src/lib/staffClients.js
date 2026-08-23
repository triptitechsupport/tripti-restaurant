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
