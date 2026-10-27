import PocketBase from 'pocketbase';
import {randomBytes} from 'node:crypto';
import {access, readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseBackupCsv, restoreBackup} from '../apps/web/src/lib/kitchenBackup.js';

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
  // Stock list from deploy/seed, so the stock comes back after every deploy.
  try { await restoreSeedStock(pb); } catch (err) { console.error('Seed stock not restored:', err?.message || err); }
  await writeFile(marker, 'Seeded passwords replaced before public startup.\n', {mode: 0o600});
  console.log('Demo login configuration completed.');
}
}
// deploy/seed/*.csv (stock backup files), oldest first, in "mirror" mode.
export async function restoreSeedStock(pb, dir = join(dirname(fileURLToPath(import.meta.url)), 'seed')) {
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.csv')); } catch { return; }
  const backups = [];
  for (const f of files) {
    try { backups.push({f, parsed: parseBackupCsv(await readFile(join(dir, f), 'utf8'))}); }
    catch (err) { console.error(`Seed file ${f} skipped:`, err?.message || err); }
  }
  backups.sort((a, b) => String(a.parsed.meta?.savedAt || '').localeCompare(String(b.parsed.meta?.savedAt || '')));
  const idMap = {};
  for (const {f, parsed} of backups) {
    const summary = await restoreBackup(pb, parsed, {mode: 'mirror', idMap, tables: ['stock_locations', 'stock_items', 'stock_lots']});
    console.log(`Seed file ${f} restored:`, Object.entries(summary).map(([t, s]) => `${t} +${s.created} ~${s.updated} -${s.deleted}${s.failed ? ` !${s.failed}` : ''}`).join(', '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await bootstrap();
