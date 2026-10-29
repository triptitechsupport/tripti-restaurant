import pb from "@/lib/pocketbaseClient.js";
import api from "@/lib/apiServerClient.js";
// The admin's login is used by default. The cashier screen switches to the
// cashier's login while it is open (see setBillingClient).
let billingClient = null;
export function setBillingClient(client) { billingClient = client || null; }
export async function billingApi(path, body, client) {
  const response = await api.fetch(`/billing${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${(client || billingClient || pb).authStore.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = {};
  try { data = await response.json(); }
  catch { if (response.ok) throw new Error('The billing server sent an unreadable answer.'); }
  if (response.status >= 502 && !data.message) throw new Error('The billing server is not reachable. Try again in a moment.');
  if (!response.ok) throw new Error(data.message || data.error || `Billing request failed (${response.status}).`);
  return data;
}
