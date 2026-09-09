import {readFiscalConfig, fiscalReadiness, liveCompanyIssues, credentialsConfigured} from './fiscalReadiness.js';
const BASE = 'https://rksv.fiskaly.com/api/v1';
export class FiscalError extends Error {
  constructor(message, status = 400, retryable = false, outageEligible = false) {
    super(message); this.status = status; this.retryable = retryable; this.outageEligible = outageEligible;
  }
}

export const fiscalConfig = readFiscalConfig;

export function assertFiscalReady(cfg, credentials) {
  const readiness = fiscalReadiness(cfg, credentials);
  if (readiness.issues.length) throw new FiscalError(`Fiscal configuration blocked: ${readiness.issues.join(' ')}`, 409);
  if (!cfg.enabled || (credentials && !credentialsConfigured(credentials)))
    throw new FiscalError('SIGN AT is not configured. See docs/rksv/README.md.', 503);
}

export function assertReceiptReady(transaction, cfg) {
  assertFiscalReady(cfg);
  if (cfg.environment !== 'LIVE') return;
  if (transaction.receiptType === 'TRAINING') throw new FiscalError('Training receipts are disabled in LIVE.', 409);
  const issues = liveCompanyIssues(transaction.receiptSnapshot?.company);
  if (issues.length) throw new FiscalError('Saved receipt contains missing or development merchant details. It cannot be sent to LIVE; changing current settings does not change its saved contents.', 409);
  if (transaction.fallbackReceipt && transaction.fallbackReceipt.environment !== 'LIVE')
    throw new FiscalError('A TEST outage copy cannot be sent to LIVE.', 409);
}

export function createFiskalyClient({fetchImpl = fetch, config = fiscalConfig, credentials = () => ({
  api_key: process.env.FISKALY_API_KEY, api_secret: process.env.FISKALY_API_SECRET,
})} = {}) {
  let session;
  const identity = (cfg, creds) => JSON.stringify([cfg.environment, creds.api_key, creds.api_secret]);
  async function request(path, method, body, accessToken, environment) {
    let response;
    try { response = await fetchImpl(BASE + path, {method,
      headers: {'Content-Type': 'application/json', ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(25000)}); }
    catch { throw new FiscalError('SIGN AT is unreachable. The saved receipt will be retried.', 503, true, true); }
    let data;
    try { data = await response.json() || {}; }
    catch {
      // Proxies can return HTML error pages. Keep the HTTP status so a 401/400
      // never becomes an outage receipt merely because its body is not JSON.
      if (response.ok) throw new FiscalError('SIGN AT returned an unreadable response; reconciliation is queued.', 502, true, true);
      data = {};
    }
    const temporary = [408, 429].includes(response.status) || response.status >= 500;
    if (!response.ok) {
      const error = new FiscalError(data.message || `SIGN AT request failed (${response.status})`, response.status, temporary, temporary);
      error.code = typeof data.code === 'string' ? data.code : '';
      error.remotePath = path; error.remoteMethod = method;
      throw error;
    }
    if (data._env && data._env !== environment) throw new FiscalError('Fiskaly environment mismatch. Check the configured credentials.', 409);
    return data;
  }
  async function authenticate(current, cfg, creds) {
    const data = await request('/auth', 'POST', creds, undefined, cfg.environment);
    // Verify the environment BEFORE any mutating resource request.
    const claims = data.access_token_claims || JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64url').toString());
    const environment = claims.env || claims._env || data._env;
    if (environment !== cfg.environment) throw new FiscalError('Fiskaly token environment does not match FISKALY_ENVIRONMENT.', 409);
    current.token = data.access_token;
    current.expiry = Number(data.access_token_expires_at || claims.exp) * 1000 - 30000;
    return current.token;
  }
  return async function fiskaly(path, {method = 'GET', body} = {}) {
    try {
      const cfg = config(), creds = credentials();
      assertFiscalReady(cfg, creds);
      const key = identity(cfg, creds);
      if (session?.key !== key) session = {key, token: '', expiry: 0};
      const current = session;
      const checkCurrent = () => {
        const latestConfig = config(), latestCredentials = credentials();
        assertFiscalReady(latestConfig, latestCredentials);
        if (identity(latestConfig, latestCredentials) !== key)
          throw new FiscalError('Fiscal environment or credentials changed during the request. Retry with the current configuration.', 409);
      };
      if (!current.token || Date.now() >= current.expiry) {
        current.authentication ||= authenticate(current, cfg, creds).finally(() => { current.authentication = undefined; });
        await current.authentication;
      }
      checkCurrent();
      try { return await request(path, method, body, current.token, cfg.environment); }
      catch (error) {
        if (error.status !== 401) throw error;
        checkCurrent();
        current.token = ''; await authenticate(current, cfg, creds);
        checkCurrent();
        return await request(path, method, body, current.token, cfg.environment);
      }
    } catch (error) {
      if (error instanceof FiscalError) throw error;
      throw new FiscalError('SIGN AT is unreachable. The saved receipt will be retried.', 503, true);
    }
  };
}
export const fiskaly = createFiskalyClient();
