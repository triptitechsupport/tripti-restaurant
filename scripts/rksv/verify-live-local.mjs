import PocketBase from 'pocketbase';
import assert from 'node:assert/strict';
const pb=new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL,process.env.PB_SUPERUSER_PASSWORD);
const admins=await pb.collection('admin_users').getList(1,1);
const admin=await pb.collection('admin_users').impersonate(admins.items[0].id,60);
const request=path=>fetch(`http://127.0.0.1:3001/billing${path}`,{headers:{Authorization:`Bearer ${admin.authStore.token}`}});
const response=await request('/transactions'); assert.equal(response.status,200);
const result=await response.json(); assert.equal(result.transactions.length,0); // smoke data must remain in clone
const menu=await pb.collection('menu_items').getFullList(); assert(menu.every(m=>m.vat_Rate));
const config=await (await request('/configuration')).json(); assert.equal(config.environment,'TEST');
console.log('Local admin API, TEST configuration and VAT verified. Live-local receipt list contains no smoke data.');
const forged=`e30.${Buffer.from(JSON.stringify({id:admins.items[0].id})).toString('base64url')}.fake`;
const rejected=await fetch('http://127.0.0.1:3001/billing/transactions',{headers:{Authorization:`Bearer ${forged}`}});
assert.equal(rejected.status,401); console.log('Forged admin token rejected.');
