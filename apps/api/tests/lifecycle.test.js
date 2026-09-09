import test from 'node:test';
import assert from 'node:assert/strict';
import {createFiscalLifecycle} from '../src/services/fiscalLifecycle.js';
const registerId = '11111111-1111-4111-8111-111111111111';
const scuId = '22222222-2222-4222-8222-222222222222';
function fixture(options = {}) {
  const calls = [];
  const register = {_id: registerId, _env: 'TEST', state: options.state || 'INITIALIZED'};
  const scu = {_id: scuId, _env: 'TEST', state: 'INITIALIZED'};
  const remote = async (path, request) => {
    calls.push({path, request});
    if (options.remote) return options.remote(path, request, register, scu);
    if (path === '/fon/auth') return {authentication_status: 'AUTHENTICATED'};
    if (path.startsWith('/cash-register?')) return {data: options.registers || [register]};
    const resource = path.startsWith('/signature-creation-unit/') ? scu : register;
    if (request) resource.state = request.body.state;
    return {...resource};
  };
  const service = createFiscalLifecycle({remote, config: () => ({enabled: true, environment: 'TEST', registerId, scuId}),
    pending: async () => options.pending || false});
  return {service, calls, register, scu};
}
test('register outage and restoration follow supported transitions', async () => {
  const f = fixture();
  assert.equal((await f.service.execute('report-outage')).state, 'OUTAGE');
  assert.equal((await f.service.execute('restore-register')).state, 'INITIALIZED');
});
test('repeat transition observes current state without patching again', async () => {
  const f = fixture({state: 'OUTAGE'});
  await f.service.execute('report-outage');
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
test('terminal register cannot be restored', async () => {
  const f = fixture({state: 'DEFECTIVE'});
  await assert.rejects(f.service.execute('restore-register'), /Cannot/);
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
test('permanent changes require explicit confirmation and no unresolved receipts', async () => {
  const f = fixture({pending: true});
  await assert.rejects(f.service.execute('defective-register'), /Type DEFECTIVE/);
  await assert.rejects(f.service.execute('defective-register', {confirmation: 'DEFECTIVE'}), /Resolve pending/);
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
test('irreparable register can be reported as defective', async () => {
  const f = fixture();
  assert.equal((await f.service.execute('defective-register', {confirmation: 'DEFECTIVE'})).state, 'DEFECTIVE');
});
test('SCU retirement is blocked while any organization register remains active', async () => {
  const f = fixture();
  await assert.rejects(f.service.execute('decommission-scu', {confirmation: 'DECOMMISSION'}), /all organization/);
});
test('SCU retirement checks subsequent pages', async () => {
  const f = fixture({remote: async (path, request, register, scu) => {
    if (path.includes('offset=0')) return {data: Array.from({length: 100}, () => ({_env: 'TEST', state: 'DECOMMISSIONED'}))};
    if (path.includes('offset=100')) return {data: [register]};
    return scu;
  }});
  await assert.rejects(f.service.execute('decommission-scu', {confirmation: 'DECOMMISSION'}), /all organization/);
  assert.ok(f.calls.some(x => x.path.includes('offset=100')));
});
test('SCU retirement succeeds after registers are terminal', async () => {
  const f = fixture({state: 'DECOMMISSIONED'});
  assert.equal((await f.service.execute('decommission-scu', {confirmation: 'DECOMMISSION'})).state, 'DECOMMISSIONED');
});
test('initialization requires an initialized SCU', async () => {
  const f = fixture({state: 'REGISTERED'}); f.scu.state = 'CREATED';
  await assert.rejects(f.service.execute('initialize-register'), /SCU must be initialized/);
});
test('timeout after a committed transition is reconciled without a duplicate PATCH', async () => {
  const f = fixture({remote: async (path, request, register) => {
    if (path === '/fon/auth') return {authentication_status: 'AUTHENTICATED'};
    if (request) { register.state = request.body.state; throw Object.assign(new Error('timeout'), {status: 504}); }
    return {...register};
  }});
  assert.equal((await f.service.execute('report-outage')).state, 'OUTAGE');
  assert.equal(f.calls.filter(x => x.request).length, 1);
});
test('unresolved timeout is explicit and does not roll back', async () => {
  const f = fixture({remote: async (path, request, register) => {
    if (path === '/fon/auth') return {authentication_status: 'AUTHENTICATED'};
    if (request) throw Object.assign(new Error('timeout'), {status: 504});
    return register;
  }});
  await assert.rejects(f.service.execute('report-outage'), /uncertain/);
  assert.equal(f.calls.filter(x => x.request).length, 1);
});
test('wrong environment and unsupported SCU defective transition fail closed', async () => {
  const f = fixture(); f.register._env = 'LIVE';
  await assert.rejects(f.service.execute('report-outage'), /mismatch/);
  await assert.rejects(f.service.execute('defective-scu'), /unsupported/);
});
test('existing resource creation is idempotent and preserves its identity', async () => {
  const f = fixture();
  assert.equal((await f.service.execute('create-register'))._id, registerId);
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
test('a generic 404 does not authorize resource creation', async () => {
  const f = fixture({remote: async () => { throw Object.assign(new Error('proxy 404'), {status: 404}); }});
  await assert.rejects(f.service.execute('create-scu'), /proxy 404/);
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
test('unauthenticated FON blocks state mutation', async () => {
  const f = fixture({remote: async (path, request, register) =>
    path === '/fon/auth' ? {authentication_status: 'UNAUTHENTICATED'} : register});
  await assert.rejects(f.service.execute('report-outage'), /Authenticate FinanzOnline/);
  assert.equal(f.calls.filter(x => x.request).length, 0);
});
