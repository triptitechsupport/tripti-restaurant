import {fiskaly, fiscalConfig, assertFiscalReady, FiscalError} from './fiskalyClient.js';

const transitions = {
  'initialize-scu': ['scu', 'INITIALIZED', ['CREATED']],
  'register': ['register', 'REGISTERED', ['CREATED']],
  'initialize-register': ['register', 'INITIALIZED', ['REGISTERED']],
  'report-outage': ['register', 'OUTAGE', ['INITIALIZED']],
  'restore-register': ['register', 'INITIALIZED', ['OUTAGE']],
  'decommission-register': ['register', 'DECOMMISSIONED', ['INITIALIZED', 'OUTAGE']],
  'defective-register': ['register', 'DEFECTIVE', ['INITIALIZED', 'OUTAGE']],
  'decommission-scu': ['scu', 'DECOMMISSIONED', ['CREATED', 'INITIALIZED']],
};
const terminal = state => ['DECOMMISSIONED', 'DEFECTIVE'].includes(state);
export function createFiscalLifecycle({remote = fiskaly, config = fiscalConfig, pending = async () => false,
  exclusive = fn => fn(), fonCredentials = () => ({fon_participant_id: process.env.FON_PARTICIPANT_ID,
    fon_user_id: process.env.FON_USER_ID, fon_user_pin: process.env.FON_PIN})} = {}) {
  async function execute(action, input = {}) {
    const cfg = config();
    assertFiscalReady(cfg);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(cfg.registerId) || !uuid.test(cfg.scuId) || cfg.registerId === cfg.scuId)
      throw new FiscalError('Configure distinct stable register and SCU UUIDv4 IDs.', 409);
    const paths = {register: `/cash-register/${cfg.registerId}`, scu: `/signature-creation-unit/${cfg.scuId}`};
    async function read(kind) {
      const resource = await remote(paths[kind]);
      if (resource._env !== cfg.environment || resource._id !== (kind === 'register' ? cfg.registerId : cfg.scuId))
        throw new FiscalError('Lifecycle resource identity/environment mismatch.', 409);
      return resource;
    }
    if (action === 'authenticate-fon') {
      const body = fonCredentials();
      if (Object.values(body).some(value => !String(value || '').trim())) throw new FiscalError('Configure FON credentials on the server.');
      return remote('/fon/auth', {method: 'PUT', body});
    }
    if (action === 'enable-validations') return remote('/configuration', {method: 'PATCH',
      body: {yearly_receipt_validation_enabled: true, monthly_receipt_validation_enabled: true}});
    if (['create-register', 'create-scu'].includes(action)) {
      const kind = action === 'create-register' ? 'register' : 'scu';
      try { return await read(kind); } catch (error) {
        const code = kind === 'register' ? 'E_CASH_REGISTER_NOT_FOUND' : 'E_SCU_NOT_FOUND';
        if (error.status !== 404 || error.code !== code) throw error;
      }
      return remote(paths[kind], {method: 'PUT', body: kind === 'register' ?
        {description: cfg.company.name} : {legal_entity_id: {vat_id: cfg.company.vatId}}});
    }
    const transition = transitions[action];
    if (!transition) throw new FiscalError('Unknown or unsupported lifecycle action.');
    const [kind, target, allowed] = transition;
    const confirmation = target === 'DECOMMISSIONED' ? 'DECOMMISSION' : target;
    if (terminal(target) && input.confirmation !== confirmation)
      throw new FiscalError(`Type ${confirmation} to confirm this permanent action.`);
    const current = await read(kind);
    if (current.state === target) return current;
    if (!allowed.includes(current.state)) throw new FiscalError(`Cannot ${action} from ${current.state}.`, 409);
    if (terminal(target) && await pending(kind === 'scu' ? null : cfg.registerId))
      throw new FiscalError('Resolve pending, queued and failed receipts before retiring this resource.', 409);
    if (action === 'decommission-scu') {
      // SCUs are organization-wide; check every page, not only this POS register.
      for (let offset = 0; ; offset += 100) {
        const page = await remote(`/cash-register?limit=100&offset=${offset}`);
        if (!Array.isArray(page.data)) throw new FiscalError('Cannot verify organization registers.', 409);
        if (page.data.some(register => register._env !== cfg.environment || !terminal(register.state)))
          throw new FiscalError('Retire all organization cash registers before decommissioning the SCU.', 409);
        if (page.data.length < 100) break;
      }
    }
    if (['initialize-register', 'restore-register'].includes(action)) {
      if ((await read('scu')).state !== 'INITIALIZED') throw new FiscalError('The configured SCU must be initialized first.', 409);
    }
    if ((await remote('/fon/auth')).authentication_status !== 'AUTHENTICATED')
      throw new FiscalError('Authenticate FinanzOnline before changing lifecycle state.', 409);
    try { return await remote(paths[kind], {method: 'PATCH', body: {state: target}}); }
    catch (error) {
      if (error.retryable || [408, 504].includes(error.status)) {
        // A timeout can occur after FON accepted the transition. Never roll back
        // or create a replacement resource to compensate for an uncertain result.
        try { const observed = await read(kind); if (observed.state === target) return observed; } catch { /* Keep original failure. */ }
        throw new FiscalError('Lifecycle result is uncertain. Refresh status and retry the same action after Fiskaly/FON synchronization.', 503, true);
      }
      throw error;
    }
  }
  return {execute: (action, input) => exclusive(() => execute(action, input))};
}
