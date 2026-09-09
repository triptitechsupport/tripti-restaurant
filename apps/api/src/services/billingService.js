import {randomUUID} from 'node:crypto';
import {fiskaly, fiscalConfig, FiscalError, assertFiscalReady, assertReceiptReady} from './fiskalyClient.js';
import {buildReceipt, cancellationPayload, sourceSnapshot} from './fiscalReceipt.js';
import {buildFallbackReceipt} from './fiscalFallback.js';

export function createBillingService({db, remote = fiskaly, config = fiscalConfig,
  onQueueError = (id, error) => console.error(`[RKSV queue ${id}]`, error.message)} ) {
  const txs = () => db.collection('fiskaly_transactions');
  // One local worker: serialize signing, retry-state changes and recovery checks.
  // Always reload queued rows inside this lock so stale snapshots cannot revive
  // an attempt that has just been archived or signed.
  let operation = Promise.resolve();
  function exclusive(fn) {
    const result = operation.then(fn);
    operation = result.catch(() => {});
    return result;
  }
  async function register() {
    const cfg = config();
    if (!cfg.enabled || !cfg.registerId || !cfg.scuId) throw new FiscalError('Configure SIGN AT and its register/SCU IDs first.', 503);
    const rows = await db.collection('cash_registers').getFullList({filter: db.filter('fiskalyCashRegisterId = {:id}', {id: cfg.registerId})});
    if (rows.length) {
      if (rows[0].environment !== cfg.environment) throw new FiscalError('Register environment mismatch.', 409);
      return rows[0];
    }
    return db.collection('cash_registers').create({fiskalyCashRegisterId: cfg.registerId, scuId: cfg.scuId,
      environment: cfg.environment, name: cfg.company.name, vatId: cfg.company.vatId});
  }
  async function listTransactions() { return txs().getFullList({sort: '-created'}); }
  async function generateSettlement(id, paymentType, userId) {
    assertFiscalReady(config());
    const settlement = await db.collection('payment_settlements').getOne(id);
    const key = `SETTLEMENT:${id}`;
    const existing = await txs().getFullList({filter: db.filter('businessReceiptKey = {:key}', {key})});
    if (existing.length) {
      const originalRegister = await db.collection('cash_registers').getOne(existing[0].cashRegister);
      if (originalRegister.environment !== config().environment) throw new FiscalError('Settlement belongs to a different fiscal environment.', 409);
      assertReceiptReady(existing[0], config()); return existing[0];
    }
    const data = buildReceipt([{items: settlement.items}], [], paymentType, settlement.orderId, config().company);
    data.requestPayload.metadata.settlement_id = id;
    data.receiptSnapshot.settlementId = id;
    data.receiptSnapshot.settlementNumber = settlement.settlementNumber || '';
    const cashRegister = await register();
    return db.send('/api/fiscal/prepare', {method: 'POST', body: {transaction: {
      ...data, order: settlement.order, orderId: settlement.orderId, settlement: id, cashRegister: cashRegister.id,
      paymentType, receiptType: 'NORMAL', createdBy: userId, businessReceiptKey: key,
      fiskalyReceiptId: randomUUID(), status: 'pending'}}});
  }
  async function generate(orderRecordId, paymentType, userId, receiptType = 'NORMAL') {
    assertFiscalReady(config());
    if (!['NORMAL', 'TRAINING'].includes(receiptType)) throw new FiscalError('Invalid receipt type.');
    if (receiptType === 'TRAINING' && config().environment !== 'TEST') throw new FiscalError('Training is enabled only in TEST.');
    const key = `${receiptType}:${orderRecordId}`;
    const existing = await txs().getFullList({filter: db.filter('businessReceiptKey = {:key}', {key})});
    if (existing.length) {
      const existingRegister = await db.collection('cash_registers').getOne(existing[0].cashRegister);
      if (existingRegister.environment !== config().environment) throw new FiscalError('An existing receipt for this order belongs to a different environment. TEST orders cannot be reused for LIVE billing.', 409);
      assertReceiptReady(existing[0], config());
      return existing[0];
    }
    const order = await db.collection('waiter_orders').getOne(orderRecordId);
    const kots = await db.collection('kitchen_orders').getFullList({filter: db.filter('parentOrder = {:id}', {id: order.id}), sort: 'id'});
    const menu = await db.collection('menu_items').getFullList();
    const data = buildReceipt(kots, menu, paymentType, order.orderId, config().company, receiptType);
    const cashRegister = await register();
    return db.send('/api/fiscal/prepare', {method: 'POST', body: {
      sourceKots: sourceSnapshot(kots), transaction: {...data, order: order.id, orderId: order.orderId, cashRegister: cashRegister.id,
        paymentType, receiptType, createdBy: userId, businessReceiptKey: key, fiskalyReceiptId: randomUUID(), status: 'pending'}}});
  }
  async function cancel(id, userId, reason) {
    assertFiscalReady(config());
    if (!String(reason || '').trim()) throw new FiscalError('A cancellation reason is required.');
    const original = await txs().getOne(id);
    assertReceiptReady(original, config());
    const originalRegister = await db.collection('cash_registers').getOne(original.cashRegister);
    if (originalRegister.environment !== config().environment) throw new FiscalError('The original receipt belongs to a different environment.', 409);
    if (!['signed', 'outage'].includes(original.status) || original.receiptType !== 'NORMAL') throw new FiscalError('Only an issued normal receipt can be cancelled.');
    const payload = cancellationPayload(original);
    payload.metadata.cancellation_reason = String(reason).trim().slice(0,500);
    const snapshot = structuredClone(original.receiptSnapshot);
    snapshot.lines.forEach(line => { line.quantity = String(-Number(line.quantity)); });
    snapshot.vatTotals = payload.schema.standard_v1.amounts_per_vat_rate;
    snapshot.cancellationReason = String(reason).trim();
    return db.send('/api/fiscal/prepare', {method: 'POST', body: {transaction: {
      order: original.order, orderId: original.orderId, settlement: original.settlement || '', cashRegister: original.cashRegister, paymentType: original.paymentType,
      amount: -original.amount, receiptType: 'CANCELLATION', businessReceiptKey: `CANCELLATION:${original.id}`,
      originalTransaction: original.id, createdBy: userId, fiskalyReceiptId: randomUUID(), status: 'pending',
      requestPayload: payload, receiptSnapshot: snapshot}}});
  }
  function saveReceipt(transaction, receipt) {
    const hasReceipt = receipt.qr_code_data && receipt.receipt_number && receipt.time_signature;
    if (!hasReceipt) throw new FiscalError('SIGN AT returned an incomplete receipt; reconciliation is queued.', 503, true);
    const outage = receipt.signed !== true;
    if (outage && !(receipt.hints || []).includes('Sicherheitseinrichtung ausgefallen'))
      throw new FiscalError('SIGN AT returned an unsigned receipt requiring reconciliation.', 503, true);
    return txs().update(transaction.id, {status: outage ? 'outage' : 'signed', responsePayload: receipt,
      qrCodeData: receipt.qr_code_data, fiskalyReceiptNumber: String(receipt.receipt_number), scuId: receipt.signature_creation_unit_id || '',
      signedAt: new Date(Number(receipt.time_signature)*1000).toISOString(), errorMessage: '', nextRetryAt: '', failureDetails: null,
      lastRetryAttemptAt: new Date().toISOString()});
  }
  async function processCurrent(transaction) {
    let cashRegister;
    let stage = 'configuration';
    let path;
    try {
      assertReceiptReady(transaction, config());
      cashRegister = await db.collection('cash_registers').getOne(transaction.cashRegister);
      if (cashRegister.environment !== config().environment) throw new FiscalError('Queued receipt belongs to a different environment.', 409);
      path = `/cash-register/${cashRegister.fiskalyCashRegisterId}/receipt/${transaction.fiskalyReceiptId}`;
      stage = 'lookup';
      let receipt;
      try { receipt = await remote(path); }
      catch (error) { if (error.status !== 404) throw error; }
      if (!receipt) { stage = 'sign'; receipt = await remote(path, {method: 'PUT', body: transaction.requestPayload}); }
      stage = 'save';
      return await saveReceipt(transaction, receipt);
    } catch (error) {
      // Save failures without changing the UUID or payload. A remote success followed
      // by a local write failure is reconciled with GET on the next attempt.
      const retryable = error.retryable !== false && (!(error instanceof FiscalError) || error.retryable);
      const count = Number(transaction.retryCount || 0) + 1;
      // Retain the first outage copy atomically with the queue state. Never
      // replace it on retry/reconciliation, and never print before this saves.
      const fallback = error.outageEligible && !transaction.fallbackReceipt
        ? {fallbackReceipt: buildFallbackReceipt(transaction, cashRegister.environment)} : {};
      return txs().update(transaction.id, {status: retryable ? 'queued' : 'failed', retryCount: count,
        ...fallback,
        failureDetails: {stage, httpStatus: Number(error.status) || 0, code: error.code || '', occurredAt: new Date().toISOString(),
          recoverable: stage === 'sign' && error.status === 400 && error.code === 'E_BAD_REQUEST' &&
            error.remotePath === path && error.remoteMethod === 'PUT' && !transaction.fallbackReceipt && !transaction.qrCodeData},
        errorMessage: error.message || 'Receipt processing failed.', lastRetryAttemptAt: new Date().toISOString(),
        nextRetryAt: retryable ? new Date(Date.now() + Math.min(30000 * 2 ** Math.min(count-1, 6), 1800000)).toISOString() : ''});
    }
  }
  function process(transaction) {
    return exclusive(async () => {
      const fresh = await txs().getOne(transaction.id);
      if (['signed', 'outage', 'superseded'].includes(fresh.status)) return fresh;
      return processCurrent(fresh);
    });
  }
  let running;
  function drain() {
    if (!config().enabled) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const pending = await txs().getFullList({filter: 'status = "pending" || status = "queued"', sort: 'created,id'});
      for (const transaction of pending) {
        // A backed-off receipt must not prevent later orders from attempting
        // fiscalization and retaining their own customer outage receipts.
        if (transaction.nextRetryAt && Date.parse(transaction.nextRetryAt) > Date.now()) continue;
        try { await process(transaction); }
        catch (error) {
          // Even failure-state persistence or record lookup may fail for one
          // row. Keep its saved UUID/payload untouched and try the next row.
          onQueueError(transaction.id, error);
        }
      }
    })().finally(() => { running = undefined; });
    return running;
  }
  async function retry(id) {
    assertFiscalReady(config());
    await exclusive(async () => {
      const transaction = await txs().getOne(id);
      if (transaction.status === 'superseded') throw new FiscalError('This failed attempt was released. Generate a new bill instead.', 409);
      if (['signed','outage'].includes(transaction.status)) return;
      await txs().update(id, {status: 'queued', nextRetryAt: ''});
    });
    await drain();
    return txs().getOne(id);
  }
  function recover(id, actor, reason) {
    return exclusive(async () => {
      assertFiscalReady(config());
      if (!String(reason || '').trim() || String(reason).length > 500) throw new FiscalError('Enter a recovery reason (up to 500 characters).');
      const transaction = await txs().getOne(id);
      if (transaction.status === 'superseded') return {transaction, outcome: 'released'};
      if (transaction.status !== 'failed' || !transaction.failureDetails?.recoverable || transaction.fallbackReceipt || transaction.qrCodeData)
        throw new FiscalError('Only a confirmed payload rejection without an issued receipt or outage copy can be released. Fix configuration errors and use Retry generation; uncertain requests must be reconciled.', 409);
      const cashRegister = await db.collection('cash_registers').getOne(transaction.cashRegister);
      if (!config().enabled || cashRegister.environment !== config().environment)
        throw new FiscalError('Restore this receipt’s SIGN AT environment before attempting recovery.', 409);
      const registerPath = `/cash-register/${cashRegister.fiskalyCashRegisterId}`;
      const registerState = await remote(registerPath);
      if (registerState._env !== cashRegister.environment || !['INITIALIZED', 'OUTAGE'].includes(registerState.state))
        throw new FiscalError('Verify this receipt’s original cash register before attempting recovery.', 409);
      const path = `${registerPath}/receipt/${transaction.fiskalyReceiptId}`;
      let receipt;
      try { receipt = await remote(path); }
      catch (error) {
        if (error.status !== 404 || error.code !== 'E_RECEIPT_NOT_FOUND') throw error;
        const released = await db.send('/api/fiscal/recover', {method: 'POST', body: {id, actor, reason,
          expectedFailureAt: transaction.failureDetails.occurredAt,
          proof: {code: error.code, checkedAt: new Date().toISOString(), environment: cashRegister.environment,
            registerId: cashRegister.fiskalyCashRegisterId, receiptId: transaction.fiskalyReceiptId}}});
        return {transaction: released, outcome: 'released'};
      }
      // If Fiskaly has a receipt, save it instead of unlocking or creating a new UUID.
      return {transaction: await saveReceipt(transaction, receipt), outcome: 'reconciled'};
    });
  }
  return {generateSettlement: (...args) => exclusive(() => generateSettlement(...args)), generate: (...args) => exclusive(() => generate(...args)),
    cancel: (...args) => exclusive(() => cancel(...args)),
    listTransactions, drain, retry, process, recover, exclusive};
}
