import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeriodicMonitor, periodicValidation} from '../src/services/periodicReceipts.js';
const receipt = (extra = {}) => ({_id: 'receipt', _env: 'TEST', cash_register_id: 'register',
  receipt_type: 'MONTHLY_CLOSE', time_signature: 100, fon_validations: [], ...extra});
test('missing validation is not reported, never successful', () => {
  assert.equal(periodicValidation(receipt()).status, 'NOT_REPORTED');
});
test('latest validation determines status while preserving failed history', () => {
  const result = periodicValidation(receipt({fon_validations: [
    {time_validation: 20, validation_result: 'SUCCESS'}, {time_validation: 10, validation_result: 'ERROR_UNSPECIFIED'}]}));
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.validations.length, 2);
  assert.equal(periodicValidation(receipt({fon_validations: [{time_validation: 30, validation_result: 'ERROR_UNSPECIFIED'}]})).status, 'FAILED');
});
test('monitor fetches all pages of both types using GET only and caches repeated reads', async () => {
  const calls = [];
  const service = createPeriodicMonitor({config: () => ({enabled: true, environment: 'TEST', registerId: 'register'}), remote: async (path, options) => {
    assert.equal(options, undefined); calls.push(path);
    if (path === '/configuration') return {monthly_receipt_validation_enabled: false, yearly_receipt_validation_enabled: true};
    assert.ok(path.includes('receipt_types%5B%5D='));
    if (path.includes('YEARLY_CLOSE')) return {_env: 'TEST', data: [receipt({receipt_type: 'YEARLY_CLOSE'})]};
    return {_env: 'TEST', data: path.includes('offset=0') ? Array.from({length: 100}, (_, i) => receipt({_id: String(i)})) : [receipt()]};
  }});
  const result = await service.read(); await service.read();
  assert.equal(calls.length, 4); assert.equal(result.receipts.length, 102);
  assert.equal(result.monthlyEnabled, false); assert.equal(result.yearlyEnabled, true);
});
test('expired cache cannot conceal a remote failure', async () => {
  let time = 0, fail = false;
  const service = createPeriodicMonitor({now: () => time, config: () => ({enabled: true, environment: 'TEST', registerId: 'register'}), remote: async path => {
    if (fail) throw new Error('offline');
    return path === '/configuration' ? {} : {_env: 'TEST', data: []};
  }});
  await service.read(); time = 61000; fail = true;
  await assert.rejects(service.read(), /offline/);
});
test('wrong register receipt is rejected', async () => {
  const service = createPeriodicMonitor({config: () => ({enabled: true, environment: 'TEST', registerId: 'register'}), remote: async path =>
    path === '/configuration' ? {} : {_env: 'TEST', data: [receipt({cash_register_id: 'other'})]}});
  await assert.rejects(service.read(), /identity mismatch/);
});
