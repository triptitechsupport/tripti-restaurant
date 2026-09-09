const text = value => typeof value === 'string' ? value.trim() : '';
const placeholder = value => /\b(test|testing|demo|dummy|development|placeholder|example|sample|changeme|todo|tbd|unknown)\b|muster(?:firma|restaurant|stra(?:ße|sse))|your[_ ](?:restaurant|company|address|vat|key|secret)|<[^>]+>|\[[^\]]+\]|^n\/?a$|^x+$/i.test(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function credentialsConfigured(credentials) {
  return Boolean(text(credentials?.api_key) && text(credentials?.api_secret));
}

export function liveCompanyIssues(company = {}) {
  const issues = [];
  const name = text(company?.name), address = text(company?.address), vatId = text(company?.vatId);
  if (!name || placeholder(name)) issues.push('Set the actual legal company name in FISCAL_COMPANY_NAME.');
  if (!address || placeholder(address)) issues.push('Set the actual business address in FISCAL_COMPANY_ADDRESS.');
  if (!/^ATU\d{8}$/.test(vatId) || /^(ATU12345678|ATU87654321|ATU(\d)\2{7})$/.test(vatId))
    issues.push('Set the actual Austrian VAT ID in FISKALY_VAT_ID (ATU followed by eight digits; no sample values).');
  return issues;
}

export function fiscalReadiness(cfg, credentials) {
  const issues = [];
  if (!['TEST', 'LIVE'].includes(cfg.environment)) issues.push('FISKALY_ENVIRONMENT must be TEST or LIVE.');
  if (cfg.environment === 'LIVE') {
    issues.push(...liveCompanyIssues(cfg.company));
    if (!uuid.test(text(cfg.registerId))) issues.push('Set a valid LIVE cash-register UUIDv4 in FISKALY_CASH_REGISTER_ID.');
    if (!uuid.test(text(cfg.scuId))) issues.push('Set a valid LIVE SCU UUIDv4 in FISKALY_SCU_ID.');
    if (cfg.registerId === cfg.scuId && cfg.registerId) issues.push('The cash register and SCU must have distinct IDs.');
    const configured = credentials ? credentialsConfigured(credentials) : cfg.credentialsConfigured;
    if (!configured) issues.push('Configure the LIVE Fiskaly API key and secret on the server.');
    if (credentials && [credentials.api_key, credentials.api_secret].some(value => placeholder(text(value))))
      issues.push('Replace placeholder Fiskaly credentials with LIVE credentials.');
    if (cfg.liveConfirmed !== true) issues.push('Review the merchant details and set FISKALY_LIVE_CONFIRMED=true before enabling LIVE operations.');
  }
  return {ready: cfg.enabled === true && issues.length === 0, issues};
}

export function readFiscalConfig(env = process.env) {
  const environment = env.FISKALY_ENVIRONMENT === undefined ? 'TEST' : text(env.FISKALY_ENVIRONMENT).toUpperCase();
  const test = environment === 'TEST';
  return {
    enabled: text(env.FISKALY_ENABLED).toLowerCase() === 'true', environment,
    registerId: text(env.FISKALY_CASH_REGISTER_ID), scuId: text(env.FISKALY_SCU_ID),
    liveConfirmed: text(env.FISKALY_LIVE_CONFIRMED).toLowerCase() === 'true',
    credentialsConfigured: credentialsConfigured({api_key:env.FISKALY_API_KEY,api_secret:env.FISKALY_API_SECRET}) &&
      (test || ![env.FISKALY_API_KEY,env.FISKALY_API_SECRET].some(value => placeholder(text(value)))),
    company: {
      name: text(env.FISCAL_COMPANY_NAME) || (test ? 'Tripti Genusswelt — DEVELOPMENT' : ''),
      address: text(env.FISCAL_COMPANY_ADDRESS) || (test ? 'Musterstraße 1, 1010 Wien (TEST)' : ''),
      vatId: text(env.FISKALY_VAT_ID) || (test ? 'ATU12345678' : ''),
    },
  };
}
