import {Router} from 'express';
import pb from '../utils/pocketbaseClient.js';
import fiscalAdmin from '../middleware/fiscal-admin.js';
import {billing, lifecycle} from '../services/billingRuntime.js';
import {fiskaly, fiscalConfig, FiscalError} from '../services/fiskalyClient.js';
import {fiscalReadiness} from '../services/fiscalReadiness.js';
import {periodicMonitor} from '../services/periodicReceipts.js';
const router = Router();
router.use(fiscalAdmin);
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    const status = error instanceof FiscalError ? error.status : error.status === 404 ? 404 : 400;
    res.status(status).json({message: error.message || 'Billing operation failed.'});
  }
};
router.get('/transactions', handle(async (_req,res) => res.json({transactions: await billing.listTransactions()})));
router.get('/settlements', handle(async (_req,res) => res.json({settlements: await pb.collection('payment_settlements').getFullList({sort: '-created', expand: 'order'})})));
router.post('/settlements/:id/generate', handle(async (req,res) => {
  const transaction = await billing.generateSettlement(req.params.id, req.body.paymentType, req.fiscalAdmin);
  void billing.drain().catch(error => console.error('[RKSV queue]', error.message));
  res.status(202).json({transaction});
}));
router.get('/periodic-receipts', handle(async (_req,res) => res.json(await periodicMonitor.read())));
router.post('/orders/:id/generate', handle(async (req,res) => {
  const transaction = await billing.generate(req.params.id, req.body.paymentType, req.fiscalAdmin, req.body.receiptType);
  // The durable queue survives browser disconnection and API restart.
  void billing.drain().catch(error => console.error('[RKSV queue]', error.message));
  res.status(202).json({transaction});
}));
router.post('/transactions/:id/retry', handle(async (req,res) => res.json({transaction: await billing.retry(req.params.id)})));
router.post('/transactions/:id/recover', handle(async (req,res) =>
  res.json(await billing.recover(req.params.id, req.fiscalAdmin, req.body.reason))));
router.post('/transactions/:id/cancel', handle(async (req,res) => {
  const transaction = await billing.cancel(req.params.id, req.fiscalAdmin, req.body.reason);
  void billing.drain().catch(error => console.error('[RKSV queue]', error.message));
  res.status(202).json({transaction});
}));
router.post('/transactions/:id/validate', handle(async (req,res) => {
  const transaction = await pb.collection('fiskaly_transactions').getOne(req.params.id);
  const register = await pb.collection('cash_registers').getOne(transaction.cashRegister);
  const result = await fiskaly(`/cash-register/${register.fiskalyCashRegisterId}/receipt/${transaction.fiskalyReceiptId}/validation`, {method: 'POST'});
  await pb.collection('fiskaly_transactions').update(transaction.id, {validationResult: result});
  res.json(result);
}));
router.get('/configuration', handle(async (_req,res) => {
  const cfg = fiscalConfig();
  res.json({enabled: cfg.enabled, environment: cfg.environment, company: cfg.company,
    fonCredentialsConfigured: ['FON_PARTICIPANT_ID', 'FON_USER_ID', 'FON_PIN'].every(key => Boolean(process.env[key]?.trim())),
    registerId: cfg.registerId, scuId: cfg.scuId, readiness: fiscalReadiness(cfg)});
}));
router.get('/fon/status', handle(async (_req, res) => {
  const result = await fiskaly('/fon/auth');
  res.json({authenticationStatus: result.authentication_status || 'UNKNOWN'});
}));
router.get('/status', handle(async (_req,res) => {
  const cfg = fiscalConfig();
  const paths = {register: `/cash-register/${cfg.registerId}`, scu: `/signature-creation-unit/${cfg.scuId}`, fon: '/fon/auth', configuration: '/configuration'};
  const result = {};
  for (const [key,path] of Object.entries(paths)) {
    try { result[key] = await fiskaly(path); } catch (error) { result[key] = {error: error.message}; }
  }
  res.json(result);
}));
router.post('/setup/:action', handle(async (req,res) => {
  res.json(await lifecycle.execute(req.params.action, req.body));
}));
router.get('/lifecycle/receipts', handle(async (_req,res) => {
  const cfg = fiscalConfig();
  const base = `/cash-register/${cfg.registerId}`;
  const register = await fiskaly(base);
  const receipts = {};
  for (const [kind, id] of Object.entries({initialization: register.initialization_receipt_id,
    decommission: register.decommission_receipt_id})) {
    if (id) receipts[kind] = await fiskaly(`${base}/receipt/${id}`);
  }
  res.json({register, receipts});
}));
router.post('/lifecycle/receipts/:kind/validate', handle(async (req,res) => {
  const fields = {initialization: 'initialization_receipt_id', decommission: 'decommission_receipt_id'};
  const field = fields[req.params.kind];
  if (!field) throw new FiscalError('Choose initialization or decommission receipt.');
  const base = `/cash-register/${fiscalConfig().registerId}`;
  const register = await fiskaly(base);
  if (!register[field]) throw new FiscalError('This lifecycle receipt does not exist yet.', 404);
  res.json(await fiskaly(`${base}/receipt/${register[field]}/validation`, {method: 'POST'}));
}));
router.get('/dep7', handle(async (req,res) => {
  const query = new URLSearchParams();
  for (const key of ['start_receipt_number','end_receipt_number','start_time_signature','end_time_signature']) {
    if (req.query[key]) {
      if (!/^\d+$/.test(req.query[key])) throw new FiscalError(`Invalid ${key}.`);
      query.set(key, req.query[key]);
    }
  }
  const data = await fiskaly(`/cash-register/${fiscalConfig().registerId}/export?${query}`);
  res.setHeader('Content-Disposition', 'attachment; filename="dep7.json"'); res.json(data);
}));
export default router;
