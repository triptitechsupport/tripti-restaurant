import fs from 'node:fs';
import dotenv from 'dotenv';
const source = dotenv.parse(fs.readFileSync('../rksv poc/backend/.env'));
const target = 'apps/api/.env';
let existing = fs.readFileSync(target, 'utf8');
const values = {};
for (const key of ['FISKALY_API_KEY','FISKALY_API_SECRET','FISKALY_SCU_ID','FISKALY_CASH_REGISTER_ID','FON_PARTICIPANT_ID','FON_USER_ID','FON_PIN']) {
  if (source[key]) values[key] = source[key];
}
Object.assign(values, {FISKALY_ENABLED: 'true', FISKALY_ENVIRONMENT: 'TEST', FISKALY_VAT_ID: source.FISKALY_VAT_ID || 'ATU12345678',
  FISCAL_COMPANY_NAME: 'Tripti Genusswelt — DEVELOPMENT', FISCAL_COMPANY_ADDRESS: 'Musterstraße 1, 1010 Wien (TEST)'});
for (const [key,value] of Object.entries(values)) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  existing = pattern.test(existing) ? existing.replace(pattern, () => line) : existing + '\n' + line;
}
fs.writeFileSync(target, existing);
console.log('Configured local TEST integration; credential values are not displayed.');
