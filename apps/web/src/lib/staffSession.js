import pb from '@/lib/pocketbaseClient.js';
import { kdsPb, waiterPb, stockPb, auditorPb } from '@/lib/staffClients.js';

// Which staff login belongs to the page the person is on. Used by the
// assistant and by staff calls, which work on every staff page.
const PAGES = [
  { match: (p) => p.startsWith('/waiter') || p.startsWith('/cashier'), client: waiterPb },
  { match: (p) => p.startsWith('/kds'), client: kdsPb },
  { match: (p) => p.startsWith('/stock'), client: stockPb },
  { match: (p) => p.startsWith('/auditor'), client: auditorPb },
  { match: (p) => p === '/admin' || p.startsWith('/admin-dashboard') || p.startsWith('/admin-booking') || p.startsWith('/admin/') || p === '/admin-help', client: null },
];

export const ALL_STAFF_CLIENTS = [pb, waiterPb, kdsPb, stockPb, auditorPb];

export function signedInClient(pathname) {
  const page = PAGES.find((x) => x.match(pathname));
  if (!page) return null;
  if (page.client?.authStore.isValid) return page.client;
  // An admin may open the staff pages with the admin login.
  const admin = pb.authStore.isValid && (pb.authStore.record || pb.authStore.model)?.collectionName === 'admin_users';
  return admin ? pb : null;
}

export function staffRoleOf(record) {
  const col = record?.collectionName;
  if (col === 'admin_users') return 'admin';
  if (col === 'waiter_users') return record.role === 'cashier' ? 'cashier' : 'waiter';
  if (col === 'kds_users') return record.role === 'kitchen_manager' ? 'kitchen_manager' : 'kitchen';
  if (col === 'stock_users') return 'stock';
  if (col === 'auditor_users') return 'auditor';
  return '';
}

export function staffIdentity(client) {
  const r = client?.authStore.record || client?.authStore.model;
  if (!r) return null;
  return { id: r.id, name: r.displayName || r.username || (r.collectionName === 'admin_users' ? 'Admin' : r.email) || 'Staff', role: staffRoleOf(r) };
}

export const ROLE_LABELS = {
  admin: ['Admin', 'Admin'],
  waiter: ['Waiters', 'Kellner'],
  cashier: ['Cashiers', 'Kassierer'],
  kitchen: ['Kitchen', 'Küche'],
  kitchen_manager: ['Kitchen managers', 'Küchenleitung'],
  stock: ['Stock', 'Lager'],
  auditor: ['Auditors', 'Prüfer'],
  all: ['Everyone', 'Alle'],
};
