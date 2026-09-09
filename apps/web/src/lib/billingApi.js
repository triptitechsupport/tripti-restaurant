import pb from "@/lib/pocketbaseClient.js";
import api from "@/lib/apiServerClient.js";
export async function billingApi(path, body) {
  const response = await api.fetch(`/billing${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${pb.authStore.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `Billing request failed (${response.status}).`);
  return data;
}
