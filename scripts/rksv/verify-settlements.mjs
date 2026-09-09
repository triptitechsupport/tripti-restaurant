// Isolated database only; remote fiscal signing is mocked.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import PocketBase from 'pocketbase';
import {createBillingService} from '../../apps/api/src/services/billingService.js';
import {FiscalError} from '../../apps/api/src/services/fiskalyClient.js';
const db = new PocketBase('http://127.0.0.1:8091'); db.autoCancellation(false);
await db.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
const admin = (await db.collection('admin_users').getList(1, 1)).items[0];
const staff = await db.collection('admin_users').impersonate(admin.id, 600); staff.autoCancellation(false);
const order = await db.collection('waiter_orders').create({orderId: `SPLIT-${Date.now()}`, orderType: 'walkin', tableNumber: 'T1', orderStatus: 'closed'});
const kot = await db.collection('kitchen_orders').create({parentOrder: order.id, tableNumber: 'T1', status: 'completed', items: [
  {name:'Food A', quantity:2, price:10, vat_Rate:'REDUCED_1', cleared:false},
  {name:'Drink B', quantity:1, price:5, vat_Rate:'STANDARD', cleared:false}]});
const body = {order:order.id, requestKey:randomUUID(), selections:[{kot:kot.id, lines:[{index:0, expected:kot.items[0]}]}]};
const confirm = body => staff.send('/api/payment-settlements/confirm', {method:'POST',body,requestKey:null});
await assert.rejects(staff.collection('kitchen_orders').update(kot.id,{items:kot.items.map(item=>({...item,cleared:true}))}));
await assert.rejects(confirm({...body,requestKey:randomUUID(),selections:[{kot:kot.id,lines:[
  {index:0,expected:kot.items[0]},{index:1,expected:{...kot.items[1],price:999}}]}]}));
assert.equal((await db.collection('kitchen_orders').getOne(kot.id)).items[0].cleared,false);
const first = await confirm(body);
assert.match(first.settlementNumber, /^S\d{2,}$/);
assert.equal((await confirm(body)).settlementNumber, first.settlementNumber);
assert.equal(first.amount,20); assert.equal(first.items.length,1);
assert.equal((await confirm(body)).id,first.id);
assert.equal((await db.collection('waiter_orders').getOne(order.id)).paymentStatus,'partial');
await assert.rejects(confirm({...body,requestKey:randomUUID()}));
const current = await db.collection('kitchen_orders').getOne(kot.id);
const secondBody={order:order.id,requestKey:randomUUID(),selections:[{kot:kot.id,lines:[{index:1,expected:current.items[1]}]}]};
const race=await Promise.allSettled([confirm(secondBody),confirm({...secondBody,requestKey:randomUUID()})]);
assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
const second=race.find(r=>r.status==='fulfilled').value;
assert.equal(Number(second.settlementNumber.slice(1)), Number(first.settlementNumber.slice(1)) + 1);
assert.equal((await db.collection('waiter_orders').getOne(order.id)).paymentStatus,'paid');
await assert.rejects(db.collection('payment_settlements').update(first.id,{amount:1}));
await assert.rejects(db.collection('kitchen_orders').update(kot.id,{items:[]}));
await assert.rejects(db.collection('kitchen_orders').delete(kot.id));
await assert.rejects(db.collection('waiter_orders').delete(order.id));
const receipts=new Map(); let number=100, rejectNext=false;
const service=createBillingService({db,remote:async (path,options)=>{
  if (!path.includes('/receipt/')) return {_env:'TEST',state:'INITIALIZED'};
  if(!options){if(receipts.has(path))return receipts.get(path);throw Object.assign(new FiscalError('missing',404),{code:'E_RECEIPT_NOT_FOUND'});}
  if(rejectNext){rejectNext=false;throw Object.assign(new FiscalError('rejected',400),{code:'E_BAD_REQUEST',remotePath:path,remoteMethod:'PUT'});}
  const r={signed:true,receipt_number:++number,time_signature:Math.floor(Date.now()/1000),qr_code_data:'SYNTHETIC',_env:'TEST'};
  receipts.set(path,r);return r;
}});
const a=await service.generateSettlement(first.id,'CASH',admin.id);
const b=await service.generateSettlement(second.id,'CARD',admin.id);
assert.equal(a.receiptSnapshot.settlementNumber, first.settlementNumber);
assert.equal(a.amount,20);assert.equal(b.amount,5);assert.notEqual(a.fiskalyReceiptId,b.fiskalyReceiptId);
assert.equal(a.requestPayload.schema.standard_v1.line_items.length,1);
assert.equal(b.requestPayload.schema.standard_v1.line_items[0].text,'Drink B');
assert.equal((await service.generateSettlement(first.id,'CASH',admin.id)).id,a.id);
assert.equal((await db.collection('waiter_orders').getOne(order.id)).fiscalLocked,false);
await assert.rejects(service.generate(order.id,'CASH',admin.id));
rejectNext=true;
const failed=await service.process(a);assert.equal(failed.status,'failed');
assert.equal((await service.recover(a.id,admin.id,'Synthetic rejection recovery')).outcome,'released');
const replacement=await service.generateSettlement(first.id,'CASH',admin.id);
assert.notEqual(replacement.id,a.id);assert.deepEqual(replacement.requestPayload,a.requestPayload);
const signedA=await service.process(replacement),signedB=await service.process(b);
assert.notEqual(signedA.fiskalyReceiptNumber,signedB.fiskalyReceiptNumber);
const cancel=await service.cancel(replacement.id,admin.id,'Synthetic split cancellation');
assert.equal(cancel.settlement,first.id);assert.equal(cancel.amount,-20);
assert.equal((await db.collection('fiskaly_transactions').getOne(b.id)).status,'signed');
console.log('PASS: atomic settlements, idempotency, concurrent duplicate protection, item retention, separate receipts and scoped cancellation.');
