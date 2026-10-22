import PocketBase from 'pocketbase';
import {randomBytes} from 'node:crypto';
import {access, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Render demo only: run against its fresh, private database before opening nginx.
export async function bootstrap({url = 'http://127.0.0.1:8090', marker = '/data/.demo-accounts-configured'} = {}) {
let configured = false;
try { await access(marker); configured = true; } catch { /* New ephemeral database. */ }
if (!configured) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
  for (const collection of await pb.collections.getFullList()) {
    if (collection.type !== 'auth' || collection.name === '_superusers') continue;
    for (const record of await pb.collection(collection.name).getFullList()) {
      let password = randomBytes(32).toString('hex');
      const update = {};
      if (collection.name === 'admin_users' && ['admin@restaurant.com', process.env.DEMO_ADMIN_EMAIL].includes(record.email)) {
        password = process.env.DEMO_ADMIN_PASSWORD;
        update.email = process.env.DEMO_ADMIN_EMAIL;
      } else if (collection.name === 'waiter_users' && record.username === 'waiter001') {
        password = process.env.DEMO_WAITER_PASSWORD;
      } else if (collection.name === 'kds_users' && record.username === 'kds001') {
        password = process.env.DEMO_KDS_PASSWORD;
      }
      await pb.collection(collection.name).update(record.id, {...update, password, passwordConfirm: password});
    }
  }
  for (const [collection, identity, password] of [
    ['admin_users', process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD],
    ['waiter_users', 'waiter001', process.env.DEMO_WAITER_PASSWORD],
    ['kds_users', 'kds001', process.env.DEMO_KDS_PASSWORD],
  ]) {
    await new PocketBase(url).collection(collection).authWithPassword(identity, password);
  }
  // Fixed staff logins for the other roles, so they work again after every
  // deploy (the database starts fresh). Their passwords come from Render
  // Environment; without their own variable they reuse the waiter/kitchen one.
  const staff = [
    ['kds_users', 'manager001', 'kitchen_manager', 'Kitchen Manager', 'triptikitchen.local', process.env.DEMO_KITCHEN_MANAGER_PASSWORD || process.env.DEMO_KDS_PASSWORD],
    ['waiter_users', 'cashier001', 'cashier', 'Cashier', 'triptiwaiter.local', process.env.DEMO_CASHIER_PASSWORD || process.env.DEMO_WAITER_PASSWORD],
    ['stock_users', 'stock001', '', 'Stock Manager', 'triptistock.local', process.env.DEMO_STOCK_PASSWORD || process.env.DEMO_KDS_PASSWORD],
  ];
  for (const [collection, username, role, displayName, domain, password] of staff) {
    if (!password) continue;
    try {
      const data = {username, displayName, email: `${username}@${domain}`, emailVisibility: false, password, passwordConfirm: password, ...(role ? {role} : {})};
      const existing = await pb.collection(collection).getFirstListItem(`username = "${username}"`).catch(() => null);
      if (existing) await pb.collection(collection).update(existing.id, data);
      else await pb.collection(collection).create({...data, verified: true});
      await new PocketBase(url).collection(collection).authWithPassword(username, password);
      console.log(`Demo login ${username} ready.`);
    } catch (err) {
      console.error(`Demo login ${username} could not be set up:`, err?.message || err);
    }
  }
  // The demo database is new after every deploy and its seed data has online
  // ordering switched off. Switch it on so the test site can take orders
  // straight away (set DEMO_ORDERING=off to keep it off).
  if (process.env.DEMO_ORDERING !== 'off') {
    for (const record of await pb.collection('order_settings').getFullList()) {
      await pb.collection('order_settings').update(record.id, {isOrderingEnabled: true});
    }
    console.log('Demo online ordering switched on.');
  }
  await writeFile(marker, 'Seeded passwords replaced before public startup.\n', {mode: 0o600});
  console.log('Demo login configuration completed.');
}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await bootstrap();
