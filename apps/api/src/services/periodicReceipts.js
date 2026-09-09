import {fiskaly, fiscalConfig, assertFiscalReady, FiscalError} from './fiskalyClient.js';

export function periodicValidation(receipt) {
  const history = [...(receipt.fon_validations || [])].sort((a, b) => b.time_validation - a.time_validation);
  const latest = history[0];
  return {id: receipt._id, type: receipt.receipt_type, number: receipt.receipt_number,
    signedAt: receipt.time_signature, validations: history,
    status: latest?.validation_result === 'SUCCESS' ? 'SUCCESS' : latest ? 'FAILED' : 'NOT_REPORTED'};
}

export function createPeriodicMonitor({remote = fiskaly, config = fiscalConfig, now = () => Date.now()} = {}) {
  let cache, pending, identity;
  async function read() {
    const cfg = config();
    assertFiscalReady(cfg);
    if (!cfg.registerId) throw new FiscalError('Configure a cash register first.', 409);
    const key = `${cfg.environment}:${cfg.registerId}`;
    if (identity === key && cache && now() - cache.checkedAtMs < 60000) return cache;
    if (identity === key && pending) return pending;
    identity = key; cache = null;
    const request = (async () => {
      const settings = await remote('/configuration');
      const receipts = [];
      for (const type of ['MONTHLY_CLOSE', 'YEARLY_CLOSE']) {
        for (let offset = 0; ; offset += 100) {
          const page = await remote(`/cash-register/${cfg.registerId}/receipt?receipt_types%5B%5D=${type}&order=DESC&limit=100&offset=${offset}`);
          if (!Array.isArray(page.data) || page._env !== cfg.environment)
            throw new FiscalError('Cannot verify periodic receipt response.', 502);
          for (const receipt of page.data) {
            if (receipt._env !== cfg.environment || receipt.cash_register_id !== cfg.registerId || receipt.receipt_type !== type)
              throw new FiscalError('Periodic receipt identity mismatch.', 502);
            receipts.push(periodicValidation(receipt));
          }
          if (page.data.length < 100) break;
        }
      }
      const result = {environment: cfg.environment, registerId: cfg.registerId, checkedAtMs: now(),
        checkedAt: new Date(now()).toISOString(),
        monthlyEnabled: settings.monthly_receipt_validation_enabled === true,
        yearlyEnabled: settings.yearly_receipt_validation_enabled === true,
        receipts: receipts.sort((a, b) => b.signedAt - a.signedAt)};
      if (identity === key) cache = result;
      return result;
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  }
  return {read};
}
export const periodicMonitor = createPeriodicMonitor();
