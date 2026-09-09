const env = process.env;
const required = ['PB_SUPERUSER_EMAIL', 'PB_SUPERUSER_PASSWORD', 'PB_ENCRYPTION_KEY',
  'DEMO_ADMIN_EMAIL', 'DEMO_ADMIN_PASSWORD', 'DEMO_WAITER_PASSWORD', 'DEMO_KDS_PASSWORD'];
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Set ${key} in Render Environment.`);
  if (key.endsWith('PASSWORD') && env[key].length < 16) throw new Error(`${key} must contain at least 16 characters.`);
}
if (Buffer.byteLength(env.PB_ENCRYPTION_KEY) !== 32) throw new Error('PB_ENCRYPTION_KEY must be 32 ASCII characters.');
if (env.FISKALY_ENVIRONMENT !== 'TEST') throw new Error('This ephemeral Render deployment only supports FISKALY_ENVIRONMENT=TEST.');
const port = Number(env.PORT || 10000);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 8090].includes(port)) throw new Error('Invalid public PORT.');
