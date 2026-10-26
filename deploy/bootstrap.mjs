import PocketBase from 'pocketbase';
import {randomBytes} from 'node:crypto';
import {access, readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBackupCsv, restoreBackup} from '../apps/web/src/lib/kitchenBackup.js';
import {pathToFileURL} from 'node:url';

// Email for order confirmations, reservations and sign-in codes. PocketBase
// keeps its mail settings in the database, which is new after every deploy,
// so they are applied from Render Environment on every start:
// SMTP_HOST, SMTP_PORT (default 587), SMTP_USERNAME, SMTP_PASSWORD,
// SMTP_TLS (true for port 465), MAIL_SENDER_ADDRESS, MAIL_SENDER_NAME, and
// APP_URL (site address for links in emails, default RENDER_EXTERNAL_URL).
export async function configureMail({url = 'http://127.0.0.1:8090', env = process.env} = {}) {
  const host = String(env.SMTP_HOST || '').trim();
  const appURL = String(env.APP_URL || env.CORS_ORIGIN || env.RENDER_EXTERNAL_URL || '').trim();
  if (!host && !appURL) return false;
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  const current = await pb.settings.getAll();
  const meta = {...current.meta};
  if (appURL) meta.appURL = appURL;
  const update = {meta};
  if (host) {
    const port = Number(env.SMTP_PORT) || 587;
    const sender = String(env.MAIL_SENDER_ADDRESS || env.SMTP_USERNAME || '').trim();
    if (!sender.includes('@')) {
      console.error('Mail not set up: MAIL_SENDER_ADDRESS (or an email SMTP_USERNAME) is missing.');
    } else {
      meta.senderAddress = sender;
      meta.senderName = String(env.MAIL_SENDER_NAME || 'Tripti Genusswelt').trim();
      update.smtp = {
        enabled: true,
        host,
        port,
        username: String(env.SMTP_USERNAME || ''),
        password: String(env.SMTP_PASSWORD || ''),
        tls: env.SMTP_TLS ? String(env.SMTP_TLS) === 'true' : port === 465,
        authMethod: 'PLAIN',
      };
    }
  }
  await pb.settings.update(update);
  console.log(update.smtp ? `Mail set up: ${update.smtp.host}:${update.smtp.port}, sender ${meta.senderAddress}.` : 'Site address for emails set.');
  return !!update.smtp;
}

// Render demo only: run against its fresh, private database before opening nginx.
export async function bootstrap({url = 'http://127.0.0.1:8090', marker = '/data/.demo-accounts-configured'} = {}) {
try {
  await configureMail({url});
} catch (err) {
  console.error('Mail settings could not be applied:', err?.message || err);
}
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
  // Restore the backup files kept in deploy/seed (CSV from the staff apps'
  // Backup screen), so menu, recipes and stock come back after every deploy.
  await restoreSeedBackups(pb);
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
// deploy/seed/*.csv, oldest first, each restored in "mirror" mode.
export async function restoreSeedBackups(pb, dir = join(dirname(fileURLToPath(import.meta.url)), 'seed')) {
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.csv')); } catch { return; }
  const backups = [];
  for (const f of files) {
    try { backups.push({f, parsed: parseBackupCsv(await readFile(join(dir, f), 'utf8'))}); }
    catch (err) { console.error(`Seed backup ${f} skipped:`, err?.message || err); }
  }
  backups.sort((a, b) => String(a.parsed.meta?.savedAt || '').localeCompare(String(b.parsed.meta?.savedAt || '')));
  // Newest restored file per area, so a device only restores its own backup
  // when that is newer than the seed file for the same area.
  const newest = {};
  const later = (field, at) => { if (at && (!newest[field] || at > newest[field])) newest[field] = at; };
  const idMap = {}; // shared, so the stock file can link to dishes from the kitchen file
  for (const {f, parsed} of backups) {
    const summary = await restoreBackup(pb, parsed, {mode: 'mirror', idMap});
    console.log(`Seed backup ${f} restored:`, Object.entries(summary).map(([t, s]) => `${t} +${s.created} ~${s.updated} -${s.deleted}${s.failed ? ` !${s.failed}` : ''}`).join(', '));
    const at = parsed.meta?.savedAt;
    const role = parsed.meta?.role;
    if (role === 'stock') later('stockBackupAt', at);
    else if (role === 'kitchen_manager') later('kitchenBackupAt', at);
    else if (role === 'admin') { later('kitchenBackupAt', at); later('stockBackupAt', at); }
    else later('seedBackupAt', at);
  }
  if (Object.keys(newest).length) {
    try {
      const info = (await pb.collection('instance_info').getList(1, 1)).items[0];
      if (info) await pb.collection('instance_info').update(info.id, newest);
    } catch (err) { console.error('instance_info not updated:', err?.message || err); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await bootstrap();
