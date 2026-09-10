import test from 'node:test';
import assert from 'node:assert/strict';
import {createCashRegisters, registerUsable} from '../src/services/cashRegisters.js';
import {createBillingService} from '../src/services/billingService.js';
import {FiscalError} from '../src/services/fiskalyClient.js';
const scuId = '22222222-2222-4222-8222-222222222222';
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const rows = [], calls = [], resources = new Map();
  const cfg = {enabled: true, environment: 'TEST', registerId: firstId, scuId, company: {name: 'Test shop', address: 'Test address', vatId: 'ATU12345678'}};
  let failure, validation = 'SUCCESS';
  const db = {filter: (query, values) => ({query, values}), collection: () => ({
    getOne: async id => { const r = rows.find(r => r.id === id); if (!r) throw new Error('Missing local register'); return {...r}; },
    getFullList: async ({filter} = {}) => rows.filter(r => !filter || (filter.values.env ? r.environment === filter.values.env : r.fiskalyCashRegisterId === filter.values.id)).map(r => ({...r})),
    create: async data => { const r = {...data, id: String(rows.length + 1)}; rows.push(r); return {...r}; },
    update: async (id, data) => { const r = rows.find(r => r.id === id); Object.assign(r, data); return {...r}; },
  })};
  const remote = async (path, request) => {
    calls.push({path, request});
    if (failure) throw failure;
    if (path === '/fon/auth') return {authentication_status: 'AUTHENTICATED'};
    if (path === '/configuration') return {};
    if (path.includes('/receipt/')) return {_env: cfg.environment, cash_register_id: path.split('/')[2], fon_validations: validation ? [{time_validation: 1, validation_result: validation}] : []};
    const kind = path.includes('signature-creation-unit') ? 'scu' : 'register';
    if (request?.method === 'PUT') resources.set(path, {_id: path.split('/')[2], _env: cfg.environment, state: 'CREATED'});
    const r = resources.get(path);
    if (!r) throw Object.assign(new FiscalError('Missing', 404), {code: kind === 'scu' ? 'E_SCU_NOT_FOUND' : 'E_CASH_REGISTER_NOT_FOUND'});
    if (request?.method === 'PATCH') {
      r.state = request.body.state;
      if (kind === 'register' && r.state === 'INITIALIZED') r.initialization_receipt_id = 'initial';
    }
    return {...r};
  };
  const service = createCashRegisters({db, remote, config: () => cfg});
  return {service, cfg, rows, calls, resources, fail: e => { failure = e; }, validation: v => { validation = v; }};
}
test('setup creates one SCU, initializes two registers, and resumes without duplicate creation', async () => {
  const f = fixture();
  const a = await f.service.add({name: 'Main', registerId: firstId});
  const b = await f.service.add({name: 'Terrace', registerId: secondId});
  assert.equal((await f.service.add({name: 'Retry', registerId: firstId})).id, a.id);
  assert.equal((await f.service.setup(a.id)).enabledForBilling, true);
  assert.equal((await f.service.setup(b.id)).enabledForBilling, true);
  await f.service.setup(a.id);
  assert.equal(f.calls.filter(c => c.request?.method === 'PUT' && c.path.includes('signature-creation-unit')).length, 1);
  assert.equal(f.calls.filter(c => c.request?.method === 'PUT' && c.path.startsWith('/cash-register/')).length, 2);
  assert.deepEqual(f.calls.filter(c => c.path === `/cash-register/${firstId}` && c.request?.method === 'PATCH').map(c => c.request.body.state), ['REGISTERED', 'INITIALIZED']);
  await f.service.makeDefault(b.id);
  assert.equal((await f.service.resolve()).id, b.id);
});
test('unknown identity and environment never become selectable; LIVE requires successful initial validation', async () => {
  const f = fixture(), a = await f.service.add({name: 'Main', registerId: firstId});
  await f.service.setup(a.id);
  f.resources.get(`/cash-register/${firstId}`)._env = 'LIVE';
  await assert.rejects(f.service.refresh(a.id), /identity/);
  assert.equal(f.rows[0].enabledForBilling, false);
  const row = {enabledForBilling:true,status:'INITIALIZED',scuStatus:'INITIALIZED',environment:'LIVE',initialValidation:'NOT_REPORTED'};
  assert.equal(registerUsable(row), false);
  assert.equal(registerUsable({...row,initialValidation:'SUCCESS'}), true);
  await assert.rejects(f.service.get('unknown'));
});
test('outage retains verified register selection; unverified registers remain blocked', async () => {
  const f = fixture(), a = await f.service.add({name: 'Main', registerId: firstId});
  await f.service.setup(a.id);
  const b = await f.service.add({name: 'Terrace', registerId: secondId});
  f.fail(new FiscalError('Network outage', 503, true, true));
  assert.equal((await f.service.forBilling(a.id)).id, a.id);
  await assert.rejects(f.service.forBilling(b.id), /not ready/);
  await assert.rejects(f.service.setup(b.id), /Network outage/);
  assert.equal(f.rows[1].fiskalyCashRegisterId, secondId);
  f.fail(null);
  assert.equal((await f.service.setup(b.id)).enabledForBilling, true);
});
test('pending SCU setup resumes using the same register and failed initial validation blocks billing', async () => {
  const f = fixture(), a = await f.service.add({name: 'Main', registerId: firstId});
  f.resources.set(`/signature-creation-unit/${scuId}`, {_id:scuId,_env:'TEST',state:'PENDING'});
  await assert.rejects(f.service.setup(a.id), /SCU is PENDING/);
  assert.equal(f.rows[0].enabledForBilling, false);
  f.resources.get(`/signature-creation-unit/${scuId}`).state='CREATED';
  f.validation('FAILED');
  assert.equal((await f.service.setup(a.id)).enabledForBilling, false);
  f.validation('SUCCESS');
  assert.equal((await f.service.validateInitial(a.id)).enabledForBilling, true);
  assert.equal(f.calls.filter(c=>c.request?.method==='PUT' && c.path.startsWith('/cash-register/')).length,1);
});
test('settlement register is pinned through duplicate requests, signing, and cancellation', async () => {
  const transactions = [], paths = [];
  const registers = {a: {id:'a', name:'Main', environment:'TEST', fiskalyCashRegisterId:firstId}, b:{id:'b',name:'Terrace',environment:'TEST',fiskalyCashRegisterId:secondId}};
  const db = {filter: (_query, values) => values, collection: name => ({
    getOne: async id => name === 'payment_settlements' ? {id,order:'o',orderId:'WI1',items:[{name:'Food',quantity:1,price:5,vat_Rate:'STANDARD'}]} : name === 'cash_registers' ? registers[id] : transactions.find(t => t.id === id),
    getFullList: async ({filter} = {}) => transactions.filter(t => !filter || t.businessReceiptKey === filter.key),
    update: async (id, data) => Object.assign(transactions.find(t => t.id === id),data),
    create: async data => {const t={...data,id:String(transactions.length)}; transactions.push(t);return t;},
  }), send: async (_path,{body}) => {const t={...body.transaction,id:String(transactions.length)}; transactions.push(t);return t;} };
  const remote = async (path, request) => { paths.push(path); if (!request) throw Object.assign(new FiscalError('Missing',404),{code:'E_RECEIPT_NOT_FOUND'});return {signed:true,qr_code_data:'qr',receipt_number:paths.length,time_signature:1234567890}; };
  const service=createBillingService({db,remote,config:()=>({enabled:true,environment:'TEST',company:{name:'Test',address:'Test',vatId:'ATU12345678'}}),resolveRegister:async id=>registers[id]});
  const a=await service.generateSettlement('s1','CASH','admin','a');
  const b=await service.generateSettlement('s2','CARD','admin','b');
  await assert.rejects(service.generateSettlement('s1','CASH','admin','b'),/different cash register/);
  assert.equal((await service.generateSettlement('s1','CASH','admin','a')).id,a.id);
  await service.process(a); await service.process(b);
  assert.ok(paths.some(p=>p.startsWith(`/cash-register/${firstId}/receipt/`)));
  assert.ok(paths.some(p=>p.startsWith(`/cash-register/${secondId}/receipt/`)));
  const cancellation=await service.cancel(a.id,'admin','Test cancellation');
  assert.equal(cancellation.cashRegister,'a');
  assert.equal(a.receiptSnapshot.cashRegisterName,'Main');
});
