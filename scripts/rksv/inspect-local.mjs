import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
const collections = await pb.collections.getFullList();
console.log('RKSV collections present:', collections.filter(c => ['cash_registers','fiskaly_transactions'].includes(c.name)).map(c => c.name));
const backupName = `before-rksv-${Date.now()}.zip`;
await pb.backups.create(backupName);
console.log('PocketBase backup:', backupName);
console.log('Menu items:', (await pb.collection('menu_items').getList(1,1)).totalItems);
