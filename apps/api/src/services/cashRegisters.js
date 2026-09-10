import {fiskaly, fiscalConfig, assertFiscalReady, FiscalError} from './fiskalyClient.js';
import {createFiscalLifecycle} from './fiscalLifecycle.js';
import {periodicValidation} from './periodicReceipts.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function registerUsable(row) {
  return row.enabledForBilling && row.initialValidation !== 'FAILED' && ['INITIALIZED', 'OUTAGE'].includes(row.status) && row.scuStatus === 'INITIALIZED' &&
    (row.environment !== 'LIVE' || row.initialValidation === 'SUCCESS');
}
export function createCashRegisters({db, remote = fiskaly, config = fiscalConfig, exclusive = fn => fn(), pending} = {}) {
  const records = () => db.collection('cash_registers');
  async function list() {
    return records().getFullList({filter: db.filter('environment = {:env}', {env: config().environment}), sort: 'created'});
  }
  async function get(id) {
    const row = await records().getOne(id);
    if (row.environment !== config().environment || row.scuId !== config().scuId)
      throw new FiscalError('Cash register does not belong to the configured environment and SCU.', 409);
    return row;
  }
  function scoped(row) { return {...config(), registerId: row.fiskalyCashRegisterId, scuId: row.scuId}; }
  function lifecycle(row) { return createFiscalLifecycle({remote, config: () => scoped(row), pending}); }
  async function add({name, registerId}) {
    assertFiscalReady(config());
    if (!name?.trim() || name.length > 100 || !uuid.test(registerId) || !uuid.test(config().scuId) || registerId === config().scuId)
      throw new FiscalError('Enter a register name and distinct register/SCU UUIDv4 IDs.');
    const existing = await records().getFullList({filter: db.filter('fiskalyCashRegisterId = {:id}', {id: registerId})});
    if (existing.length) return get(existing[0].id);
    // Persist identity BEFORE remote creation, so interrupted setup can resume.
    return records().create({name: name.trim(), fiskalyCashRegisterId: registerId, scuId: config().scuId,
      vatId: config().company.vatId, environment: config().environment, status: 'NOT_CREATED', enabledForBilling: false});
  }
  async function refresh(id) {
    const row = await get(id);
    try {
      const register = await remote(`/cash-register/${row.fiskalyCashRegisterId}`);
      const scu = await remote(`/signature-creation-unit/${row.scuId}`);
      if (register._id !== row.fiskalyCashRegisterId || register._env !== row.environment || scu._id !== row.scuId || scu._env !== row.environment)
        throw new FiscalError('Fiskaly resource identity mismatch.', 409);
      if (scu.legal_entity_id?.vat_id && scu.legal_entity_id.vat_id !== config().company.vatId)
        throw new FiscalError('SCU VAT ID differs from the configured merchant.', 409);
      let initialValidation = 'NOT_REPORTED';
      if (register.initialization_receipt_id) {
        const receipt = await remote(`/cash-register/${row.fiskalyCashRegisterId}/receipt/${register.initialization_receipt_id}`);
        if (receipt.cash_register_id !== row.fiskalyCashRegisterId || receipt._env !== row.environment)
          throw new FiscalError('Initialization receipt identity mismatch.', 409);
        initialValidation = periodicValidation(receipt).status;
      }
      const data = {status: register.state, scuStatus: scu.state, serialNumber: register.serial_number || '',
        initialValidation, checkedAt: new Date().toISOString(), setupError: ''};
      // A successful verification activates a new register; terminal resources stay unavailable.
      data.enabledForBilling = Boolean(register.initialization_receipt_id) && registerUsable({...row, ...data, enabledForBilling: true});
      return records().update(id, data);
    } catch (error) {
      const temporary = error.retryable || error.outageEligible || [408, 429, 500, 502, 503, 504].includes(error.status);
      await records().update(id, {setupError: error.message, ...(!temporary ? {enabledForBilling: false} : {})});
      throw error;
    }
  }
  async function setup(id) {
    const row = await get(id), steps = lifecycle(row);
    await records().update(id, {enabledForBilling: false, setupError: ''});
    try {
      let fon;
      try { fon = await remote('/fon/auth'); } catch (e) { if (e.code !== 'E_MISSING_FON_CREDENTIALS') throw e; }
      if (fon?.authentication_status !== 'AUTHENTICATED') await steps.execute('authenticate-fon');
      const scu = await steps.execute('create-scu');
      if (scu.state === 'CREATED') await steps.execute('initialize-scu');
      else if (scu.state !== 'INITIALIZED') throw new FiscalError(`SCU is ${scu.state}. Refresh and resume setup when creation completes.`, 409);
      const register = await steps.execute('create-register', {description: row.name});
      if (register.state === 'CREATED') await steps.execute('register');
      if (['CREATED', 'REGISTERED'].includes(register.state)) await steps.execute('initialize-register');
      else if (register.state !== 'INITIALIZED') throw new FiscalError(`Cannot initialize a register in ${register.state}.`, 409);
      await steps.execute('enable-validations');
      return refresh(id);
    } catch (e) { await records().update(id, {setupError: e.message}); throw e; }
  }
  async function makeDefault(id) {
    const row = await get(id);
    if (!registerUsable(row)) throw new FiscalError('Verify and initialize this register before making it the default.', 409);
    for (const other of await list()) if (other.isDefault && other.id !== id) await records().update(other.id, {isDefault: false});
    return records().update(id, {isDefault: true});
  }
  async function resolve(id) {
    if (id) return get(id);
    const rows = await list();
    const row = rows.find(r => r.isDefault) || rows.find(r => r.fiskalyCashRegisterId === config().registerId);
    if (!row) throw new FiscalError('Add and set up a cash register in RKSV Diagnostics first.', 409);
    return get(row.id);
  }
  async function forBilling(id) {
    let row = await resolve(id);
    try { row = await refresh(row.id); }
    catch (e) {
      // A verified register remains pinned during connectivity outages; queue/outage handling still works.
      if (!(e.retryable || e.outageEligible || [408, 429, 500, 502, 503, 504].includes(e.status))) throw e;
    }
    if (!registerUsable(row)) throw new FiscalError('The selected register is not ready. Complete setup and initial validation in RKSV Diagnostics.', 409);
    return row;
  }
  async function validateInitial(id) {
    const row = await get(id), base = `/cash-register/${row.fiskalyCashRegisterId}`;
    const register = await remote(base);
    if (!register.initialization_receipt_id) throw new FiscalError('No initialization receipt exists yet.', 409);
    await remote(`${base}/receipt/${register.initialization_receipt_id}/validation`, {method: 'POST'});
    return refresh(id);
  }
  return {list, get, resolve, scoped, forBilling,
    add: input => exclusive(() => add(input)), refresh: id => exclusive(() => refresh(id)),
    setup: id => exclusive(() => setup(id)), makeDefault: id => exclusive(() => makeDefault(id)),
    validateInitial: id => exclusive(() => validateInitial(id)),
    action: (id, action, input) => exclusive(async () => { const row = await get(id); const result = await lifecycle(row).execute(action, input); await refresh(id); return result; })};
}
