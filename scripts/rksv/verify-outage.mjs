// Local, synthetic outage/recovery test. Never contacts Fiskaly.
// Run against the isolated PocketBase copy on port 8091 only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import {createBillingService} from '../../apps/api/src/services/billingService.js';
import {FiscalError, fiscalConfig} from '../../apps/api/src/services/fiskalyClient.js';
const pb = new PocketBase('http://127.0.0.1:8091');
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
assert.equal(fiscalConfig().environment, 'TEST');
const collection = await pb.collections.getOne('fiskaly_transactions');
assert(collection.fields.some(field => field.name === 'fallbackReceipt'));
const order = await pb.collection('waiter_orders').create({orderId:`OUTAGE-TEST-${Date.now()}`,orderType:'walkin',tableNumber:'T1',orderStatus:'closed'});
await pb.collection('kitchen_orders').create({parentOrder:order.id,tableNumber:'T1',status:'completed',items:[
  {name:'Synthetic food with a long name to check receipt wrapping',quantity:2,price:10.10,vat_Rate:'REDUCED_1'},
  {name:'Synthetic beverage',quantity:1,price:3,vat_Rate:'STANDARD'},
]});
const calls = []; let recovering = false; const receipts = new Map();
const remote = async (path, options) => {
  calls.push({path, method:options?.method || 'GET'});
  if (!recovering) throw new FiscalError('Simulated SIGN AT network outage',503,true,true);
  if (!options) {if (receipts.has(path)) return receipts.get(path); throw new FiscalError('Not found',404);}
  const response = {_env:'TEST',signed:true,receipt_number:'SYNTHETIC-42',time_signature:Math.floor(Date.now()/1000),cash_register_serial_number:'SYNTHETIC-REGISTER',qr_code_data:'SYNTHETIC SIGNED TEST QR'};
  receipts.set(path,response); return response;
};
const service = createBillingService({db:pb,remote});
const prepared = await service.generate(order.id,'CASH','synthetic-test');
const outage = await service.process(prepared);
assert.equal(outage.status,'queued'); assert(outage.fallbackReceipt);
const saved = structuredClone(outage.fallbackReceipt);
const persisted = await pb.collection('fiskaly_transactions').getOne(prepared.id);
assert.deepEqual(persisted.fallbackReceipt,saved);
await assert.rejects(pb.collection('fiskaly_transactions').update(prepared.id,{fallbackReceipt:{...saved,amount:999}}));
await assert.rejects(pb.collection('fiskaly_transactions').update(prepared.id,{fallbackReceipt:null}));
await assert.rejects(pb.collection('fiskaly_transactions').delete(prepared.id));
console.log('Migration, persisted outage copy, and copy modification/deletion guards passed.');
recovering = true;
const restarted = createBillingService({db:pb,remote});
const signed = await restarted.process(persisted);
assert.equal(signed.status,'signed'); assert.deepEqual(signed.fallbackReceipt,saved);
assert.deepEqual(signed.requestPayload,prepared.requestPayload);
assert.equal(new Set(calls.map(c=>c.path)).size,1);
assert.equal(calls.filter(c=>c.method==='PUT').length,1);
console.log('Fresh worker reconciled the same UUID; original outage copy remained unchanged.');
const cancellation = await restarted.cancel(signed.id,'synthetic-test','Synthetic cancellation');
recovering = false;
const cancelledOutage = await restarted.process(cancellation);
assert.equal(cancelledOutage.fallbackReceipt.amount,-23.2);
assert.equal(cancelledOutage.fallbackReceipt.receiptType,'CANCELLATION');
fs.writeFileSync('.rksv-test/outage-preview.json',JSON.stringify({outage,signed,cancellation:cancelledOutage},null,2));
console.log('Cancellation outage copy passed; synthetic browser fixture saved. No Fiskaly requests made.');
