import assert from 'node:assert/strict';
import PocketBase from 'pocketbase';
import {createBillingService} from '../../apps/api/src/services/billingService.js';
import {fiskaly, fiscalConfig} from '../../apps/api/src/services/fiskalyClient.js';
const pb = new PocketBase('http://127.0.0.1:8091'); // Isolated backup copy ONLY.
await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
pb.autoCancellation(false);
const menu = await pb.collection('menu_items').getFullList();
assert(menu.every(m => m.vat_Rate));
assert(menu.filter(m => /beverages|getränke/i.test(m.category)).every(m => m.vat_Rate === 'STANDARD'));
console.log('Clone schema/VAT verified.');
// Synthetic fixture only. Do not send copied restaurant orders to Fiskaly.
const fixture = await pb.collection('waiter_orders').create({orderId: `RKSV-TEST-${Date.now()}`, orderType:'walkin', tableNumber:'T1', orderStatus:'closed', totalAmount:2.20});
const parent = fixture.id;
const testKot = await pb.collection('kitchen_orders').create({parentOrder:parent,tableNumber:'T1',status:'completed',items:[
  {name:'Synthetic test food',quantity:1,price:1.10,vat_Rate:'REDUCED_1'},
  {name:'Synthetic test drink',quantity:1,price:1.10,vat_Rate:'STANDARD'},
]});
const kots=[testKot];
const service = createBillingService({db: pb});
try {
  const tx = await service.generate(parent,'CASH','smoke-test');
  console.log('Durable transaction prepared:', tx.status);
  const again = await service.generate(parent,'CARD','smoke-test');
  assert.equal(tx.id, again.id); assert.equal(again.paymentType,'CASH');
  assert.equal((await pb.collection('waiter_orders').getOne(parent)).fiscalLocked,true);
  const kot = kots.find(k => k.parentOrder === parent && k.status !== 'cancelled');
  await assert.rejects(pb.collection('kitchen_orders').update(kot.id,{status:'cancelled'}));
  console.log('Duplicate prevention and finalized-item protection verified.');
  if (process.argv.includes('--remote')) {
    const cfg=fiscalConfig();
    const register=await fiskaly(`/cash-register/${cfg.registerId}`);
    console.log('Remote register:', register._env, register.state);
    assert.equal(register._env,'TEST'); assert.equal(register.state,'INITIALIZED');
    await service.process(tx);
    const signed=await pb.collection('fiskaly_transactions').getOne(tx.id);
    console.log('SIGN AT result:', signed.status, signed.errorMessage || '', 'QR present:',Boolean(signed.qrCodeData));
    assert.equal(signed.status,'signed');
    const reversal=await service.cancel(tx.id,'smoke-test','Development integration test reversal');
    await service.process(reversal);
    const cancelled=await pb.collection('fiskaly_transactions').getOne(reversal.id);
    console.log('Cancellation:', cancelled.status); assert.equal(cancelled.status,'signed');
    const dep = await fiskaly(`/cash-register/${cfg.registerId}/export`);
    assert(Array.isArray(dep['Belege-Gruppe'])); console.log('DEP7 export verified.');
  }
} catch (error) {
  console.error('Smoke failure:', error.message, error.response?.data || error.response?.message || '');
  process.exitCode=1;
}

