import {Router} from 'express';
import pb from '../utils/pocketbaseClient.js';
import fiscalAdmin from '../middleware/fiscal-admin.js';
import {billing, lifecycle, registers} from '../services/billingRuntime.js';
import {fiskaly, fiscalConfig, FiscalError} from '../services/fiskalyClient.js';
import {fiscalReadiness} from '../services/fiscalReadiness.js';
import {createPeriodicMonitor} from '../services/periodicReceipts.js';
const monitors = new Map();
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
router.get('/transactions/:id', handle(async (req,res) => res.json({transaction: await pb.collection('fiskaly_transactions').getOne(req.params.id)})));
// End-of-day report for the cashier, admin and auditor: takings by payment
// type and whether every payment has its signed RKSV receipt.
// ?from=&to= are the start and end of the local day as ISO times.
const pbTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new FiscalError('Invalid day.', 400);
  return d.toISOString().replace('T', ' ');
};
router.get('/day-report', handle(async (req, res) => {
  const from = pbTime(req.query.from), to = pbTime(req.query.to);
  if (to <= from || new Date(req.query.to) - new Date(req.query.from) > 49 * 3600 * 1000) throw new FiscalError('Choose one day.', 400);
  const range = pb.filter('created >= {:from} && created < {:to}', {from, to});
  const [settlements, allTransactions, orders] = await Promise.all([
    pb.collection('payment_settlements').getFullList({filter: range, sort: 'created'}),
    pb.collection('fiskaly_transactions').getFullList({filter: range, sort: 'created'}),
    pb.collection('waiter_orders').getFullList({filter: range}),
  ]);
  const cents = (v) => Math.round(Number(v || 0) * 100);
  // A released failed attempt (superseded) is history, not a receipt.
  const transactions = allTransactions.filter((t) => t.status !== 'superseded');
  const receiptFor = new Map(transactions.filter((t) => t.settlement).map((t) => [t.settlement, t]));
  const byType = {};
  const statuses = {};
  let cancelled = 0;
  for (const t of transactions) {
    if (t.receiptType === 'TRAINING') continue;
    statuses[t.status] = (statuses[t.status] || 0) + 1;
    if (t.receiptType === 'CANCELLATION') { cancelled += cents(t.amount); continue; }
    const type = t.paymentType || 'OTHER';
    byType[type] = (byType[type] || 0) + cents(t.amount);
  }
  const missing = settlements.filter((s) => !receiptFor.has(s.id));
  const problems = transactions.filter((t) => t.receiptType !== 'TRAINING' && !['signed', 'outage'].includes(t.status));
  const open = orders.filter((o) => o.orderStatus !== 'closed');
  res.json({report: {
    from: req.query.from, to: req.query.to,
    payments: settlements.length,
    paid: settlements.reduce((sum, s) => sum + cents(s.amount), 0) / 100,
    byPaymentType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v / 100])),
    cancellations: cancelled / 100,
    receipts: {statuses, signed: (statuses.signed || 0) + (statuses.outage || 0), outage: statuses.outage || 0,
      notSigned: problems.length, missing: missing.length, missingAmount: missing.reduce((sum, s) => sum + cents(s.amount), 0) / 100},
    orders: {count: orders.length, open: open.length, due: open.reduce((sum, o) => sum + cents(o.outstandingAmount), 0) / 100},
  }});
}));
router.get('/settlements', handle(async (_req,res) => res.json({settlements: await pb.collection('payment_settlements').getFullList({sort: '-created', expand: 'order'})})));
router.post('/settlements/:id/generate', handle(async (req,res) => {
  const transaction = await billing.generateSettlement(req.params.id, req.body.paymentType, req.fiscalAdmin, req.body.cashRegisterId);
  void billing.drain().catch(error => console.error('[RKSV queue]', error.message));
  res.status(202).json({transaction});
}));
router.get('/periodic-receipts', handle(async (req,res) => {
  const row = await registers.resolve(req.query.cashRegisterId);
  const key = `${row.environment}:${row.id}:${row.scuId}`;
  if (!monitors.has(key)) monitors.set(key, createPeriodicMonitor({config: () => registers.scoped(row)}));
  res.json(await monitors.get(key).read());
}));
router.get('/registers', handle(async (_req,res) => res.json({registers: await registers.list()})));
router.post('/registers', handle(async (req,res) => res.json({register: await registers.add(req.body)})));
for (const [action, fn] of Object.entries({setup: registers.setup, refresh: registers.refresh, default: registers.makeDefault, 'validate-initial': registers.validateInitial})) {
  router.post(`/registers/:id/${action}`, handle(async (req,res) => res.json({register: await fn(req.params.id)})));
}
router.post('/registers/:id/action/:action', handle(async (req,res) => res.json(await registers.action(req.params.id, req.params.action, req.body))));
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
    registerId: cfg.registerId, scuId: cfg.scuId, registers: await registers.list(), readiness: fiscalReadiness(cfg)});
}));
router.get('/fon/status', handle(async (_req, res) => {
  const result = await fiskaly('/fon/auth');
  res.json({authenticationStatus: result.authentication_status || 'UNKNOWN'});
}));
router.get('/status', handle(async (req,res) => {
  const cfg = req.query.cashRegisterId ? registers.scoped(await registers.get(req.query.cashRegisterId)) : fiscalConfig();
  const paths = {register: `/cash-register/${cfg.registerId}`, scu: `/signature-creation-unit/${cfg.scuId}`, fon: '/fon/auth', configuration: '/configuration'};
  const result = {};
  for (const [key,path] of Object.entries(paths)) {
    try { result[key] = await fiskaly(path); } catch (error) { result[key] = {error: error.message}; }
  }
  res.json(result);
}));
router.post('/setup/:action', handle(async (req,res) => {
  res.json(req.body.cashRegisterId ? await registers.action(req.body.cashRegisterId, req.params.action, req.body) : await lifecycle.execute(req.params.action, req.body));
}));
router.get('/lifecycle/receipts', handle(async (req,res) => {
  const cfg = registers.scoped(await registers.resolve(req.query.cashRegisterId));
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
  const selected = await registers.resolve(req.body.cashRegisterId);
  const base = `/cash-register/${selected.fiskalyCashRegisterId}`;
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
  const selected = await registers.resolve(req.query.cashRegisterId);
  const data = await fiskaly(`/cash-register/${selected.fiskalyCashRegisterId}/export?${query}`);
  res.setHeader('Content-Disposition', `attachment; filename="dep7-${selected.fiskalyCashRegisterId}.json"`); res.json(data);
}));
export default router;
