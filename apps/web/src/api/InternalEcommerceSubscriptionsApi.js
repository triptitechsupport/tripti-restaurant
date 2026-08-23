import pb from '@/lib/pocketbaseClient';
import apiServerClient from '@/lib/apiServerClient';

/**
 * Helper to extract JWT token primarily from localStorage 'pb_auth' 
 * or fallback to PocketBase authStore.
 */
const getAuthToken = () => {
  try {
    const tokenStr = localStorage.getItem('pb_auth');
    if (tokenStr) {
      const parsed = JSON.parse(tokenStr);
      if (parsed.token) return parsed.token;
    }
  } catch (e) {
    console.warn('Failed to parse pb_auth from localStorage:', e);
  }
  
  // Fallback to standard PocketBase auth store
  return pb.authStore.token;
};

const authHeader = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * GET `/ecommerce/subscriptions` — list the signed-in user's subscriptions.
 *
 * Usage (load into AuthContext, then pass `subscriptions` to tier helpers / Manage button):
 *   import { getUserSubscriptions } from '@/api/InternalEcommerceSubscriptionsApi';
 *   const { subscriptions } = await getUserSubscriptions();
 *
 * @returns {Promise<{ subscriptions: Array<{
 *   id: string,
 *   product_id: string,
 *   product_title: string,
 *   variant_title: string,
 *   billing_interval: string,
 *   status: string,
 *   current_period_start: string,
 *   current_period_end: string,
 *   trial_period_days?: number,
 * }> }>}
 */
export async function getUserSubscriptions() {
  const token = getAuthToken();
  
  if (!token) {
    console.log('No auth token found, gracefully skipping subscriptions fetch');
    return { subscriptions: [] };
  }

  const res = await apiServerClient.fetch('/ecommerce/subscriptions', {
    headers: authHeader(),
  });
  
  if (!res.ok) {
    const bodyText = await res.text();
    console.error(`[InternalEcommerceSubscriptionsApi] Fetch failed: Status ${res.status}`, bodyText);
    
    const error = new Error(`Failed to fetch subscriptions: ${res.status}`);
    error.status = res.status;
    
    try {
      error.body = JSON.parse(bodyText);
    } catch {
      error.body = bodyText;
    }
    throw error;
  }
  
  return res.json();
}

/**
 * POST `/ecommerce/subscriptions/manage` — billing portal URL for an existing subscription.
 *
 * Usage (Manage subscription button — redirect with `window.location`):
 *   import { getManageSubscriptionUrl } from '@/api/InternalEcommerceSubscriptionsApi';
 *   const active = activeSubscription(subscriptions);
 *   const { url } = await getManageSubscriptionUrl({
 *     subscriptionId: active.id,
 *     returnUrl: window.location.href,
 *   });
 *   window.location = url;
 *
 * @param {{ subscriptionId: string, returnUrl: string }} params
 * @returns {Promise<{ url: string }>}
 */
export async function getManageSubscriptionUrl({ subscriptionId, returnUrl }) {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Authentication required to manage subscriptions');
  }

  const response = await apiServerClient.fetch('/ecommerce/subscriptions/manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ subscriptionId, returnUrl }),
  });
  
  if (!response.ok) {
    const bodyText = await response.text();
    console.error(`[InternalEcommerceSubscriptionsApi] Manage URL fetch failed: Status ${response.status}`, bodyText);
    
    let body = null;
    try { body = JSON.parse(bodyText); } catch { /* body was not JSON */ }
    
    const error = new Error(body?.message ?? `Failed to fetch manage URL: ${response.status}`);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  
  const body = await response.json();
  if (body?.code) {
    const error = new Error(body.message);
    error.code = body.code;
    throw error;
  }
  
  return body;
}