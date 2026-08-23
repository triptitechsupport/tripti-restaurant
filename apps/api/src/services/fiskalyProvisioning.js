// Fiskaly SIGN AT provisioning & fiscalization orchestration.
//
// Uses the pure Fiskaly API client (services/fiskaly.js) plus the server-side
// PocketBase client to provision the single "Main POS" cash register
// idempotently and to fiscalize ended orders. Idempotent: re-running setup
// never creates duplicate SCUs or cash registers — existing Fiskaly resources
// are retrieved and their state synchronized/advanced instead.
//
// Provisioning order (per Fiskaly SIGN AT docs):
//   1. Authenticate FON (once, with taxpayer credentials).
//   2. Create SCU (PUT) -> CREATED, then initialize (PATCH INITIALIZED).
//   3. Create Cash Register (PUT) -> CREATED.
//   4. Register Cash Register (PATCH REGISTERED) -> reports to FON.
//   5. Initialize Cash Register (PATCH INITIALIZED) -> fiscalizes initial
//      receipt and validates it with FON.
//
// Fiscalization is a POST-End-Order operation. The caller MUST verify the
// parent waiter_orders order is closed (orderStatus === 'closed') before
// calling fiscalizeOrder. This module never mutates waiter_orders payment
// fields — payment and fiscalization states are independent.

import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import {
    authenticate,
    authenticateFon,
    retrieveFonStatus,
    createScu,
    retrieveScu,
    listScus,
    initializeScu,
    createCashRegister,
    retrieveCashRegister,
    listCashRegisters,
    registerCashRegister,
    initializeCashRegister,
    signReceipt,
    getFiskalyConfig,
    isFiskalyConfigured,
    isFonConfigured,
    randomUUID,
} from './fiskaly.js';

const MAIN_POS_NAME = 'Main POS';

/**
 * Find the single "Main POS" fiscal cash register record in PocketBase.
 */
async function findMainPosRecord() {
    try {
        const list = await pb.collection('fiscal_cash_registers').getList(1, 1, {
            filter: pb.filter('name = {:name}', { name: MAIN_POS_NAME }),
            $autoCancel: false,
        });
        return list.items?.[0] || null;
    } catch (err) {
        logger.warn('findMainPosRecord failed:', err.message);
        return null;
    }
}

/**
 * Persist/update the Main POS record with the latest Fiskaly resource state.
 */
async function upsertMainPosRecord(data) {
    const existing = await findMainPosRecord();
    const payload = {
        name: MAIN_POS_NAME,
        ...data,
    };
    if (existing) {
        return pb.collection('fiscal_cash_registers').update(existing.id, payload, { $autoCancel: false });
    }
    return pb.collection('fiscal_cash_registers').create(payload, { $autoCancel: false });
}

/**
 * Resolve or create an initialized SCU. Idempotent:
 *   - If a record already holds an scu_id, retrieve it and (if needed) init.
 *   - Otherwise list existing SCUs; reuse an INITIALIZED/CREATED one, else
 *     create a new one and initialize it.
 * Returns { scuId, scu } where scu is the latest SCU response.
 */
async function resolveInitializedScu(existingRecord) {
    const config = getFiskalyConfig();

    // 1. Reuse stored SCU id.
    if (existingRecord?.fiskaly_scu_id) {
        const scu = await retrieveScu(existingRecord.fiskaly_scu_id);
        if (scu.state !== 'INITIALIZED') {
            const initialized = await initializeScu(existingRecord.fiskaly_scu_id);
            return { scuId: existingRecord.fiskaly_scu_id, scu: initialized };
        }
        return { scuId: existingRecord.fiskaly_scu_id, scu };
    }

    // 2. Look for an existing reusable SCU on the Fiskaly side.
    let scuId = null;
    let scu = null;
    try {
        const listed = await listScus();
        const items = Array.isArray(listed) ? listed : listed?.data || [];
        const reusable = items.find((s) => s.state === 'INITIALIZED') || items.find((s) => s.state === 'CREATED' || s.state === 'PENDING');
        if (reusable) {
            scuId = reusable._id;
            scu = reusable;
        }
    } catch (err) {
        // E_NO_INITIALIZED_SCU etc. — fall through to creation.
        logger.warn('listScus during provisioning returned an error (will create):', err.message);
    }

    // 3. Create a new SCU.
    if (!scuId) {
        scuId = randomUUID();
        scu = await createScu(scuId, { legalEntityName: config.legalEntityName, vatId: config.vatId });
    }

    // 4. Initialize if not yet initialized.
    if (scu.state !== 'INITIALIZED') {
        scu = await initializeScu(scuId);
    }
    return { scuId, scu };
}

/**
 * Resolve or create an initialized Cash Register. Idempotent:
 *   - If a record already holds a cash_register_id, retrieve it and advance
 *     its state (CREATED -> REGISTERED -> INITIALIZED) as needed.
 *   - Otherwise list existing registers; reuse an INITIALIZED/REGISTERED/
 *     CREATED one, else create + register + initialize a new one.
 */
async function resolveInitializedCashRegister(existingRecord) {
    // 1. Reuse stored cash register id.
    if (existingRecord?.fiskaly_cash_register_id) {
        let cr = await retrieveCashRegister(existingRecord.fiskaly_cash_register_id);
        if (cr.state === 'CREATED') {
            cr = await registerCashRegister(existingRecord.fiskaly_cash_register_id);
        }
        if (cr.state === 'REGISTERED') {
            cr = await initializeCashRegister(existingRecord.fiskaly_cash_register_id);
        }
        return { cashRegisterId: existingRecord.fiskaly_cash_register_id, cashRegister: cr };
    }

    // 2. Look for an existing reusable cash register on the Fiskaly side.
    let cashRegisterId = null;
    let cr = null;
    try {
        const listed = await listCashRegisters();
        const items = Array.isArray(listed) ? listed : listed?.data || [];
        const reusable =
            items.find((r) => r.state === 'INITIALIZED') ||
            items.find((r) => r.state === 'REGISTERED') ||
            items.find((r) => r.state === 'CREATED');
        if (reusable) {
            cashRegisterId = reusable._id;
            cr = reusable;
        }
    } catch (err) {
        logger.warn('listCashRegisters during provisioning returned an error (will create):', err.message);
    }

    // 3. Create a new cash register.
    if (!cashRegisterId) {
        cashRegisterId = randomUUID();
        cr = await createCashRegister(cashRegisterId, { description: MAIN_POS_NAME });
    }

    // 4. Advance through the lifecycle: CREATED -> REGISTERED -> INITIALIZED.
    if (cr.state === 'CREATED') {
        cr = await registerCashRegister(cashRegisterId);
    }
    if (cr.state === 'REGISTERED') {
        cr = await initializeCashRegister(cashRegisterId);
    }
    return { cashRegisterId, cashRegister: cr };
}

/**
 * Idempotently provision the Main POS cash register:
 *   - authenticate FON
 *   - ensure an initialized SCU
 *   - ensure an initialized Cash Register
 *   - persist the result in fiscal_cash_registers
 * Returns the persisted PocketBase record plus the raw Fiskaly resources.
 */
export async function provisionMainPos() {
    if (!isFiskalyConfigured()) {
        const err = new Error('Fiskaly API credentials are not configured');
        err.fiskalyCode = 'E_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }
    if (!isFonConfigured()) {
        const err = new Error('FinanzOnline credentials are not configured');
        err.fiskalyCode = 'E_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }

    // Ensure a valid API JWT before any resource call.
    await authenticate();

    // 1. FinanzOnline authentication.
    let fonStatus = 'UNAUTHENTICATED';
    try {
        await authenticateFon();
        const status = await retrieveFonStatus();
        fonStatus = status?.authentication_status || 'AUTHENTICATED';
    } catch (err) {
        logger.error('FON authentication failed during provisioning:', err.message);
        fonStatus = 'ERROR_UNSPECIFIED';
        // Persist partial state but surface the error to the caller.
        const existing = await findMainPosRecord();
        await upsertMainPosRecord({
            fiskaly_cash_register_id: existing?.fiskaly_cash_register_id || '',
            fiskaly_scu_id: existing?.fiskaly_scu_id || '',
            environment: getFiskalyConfig().environment,
            status: existing?.status || 'CREATED',
            scu_status: existing?.scu_status || 'CREATED',
            fon_status: fonStatus,
            last_setup_at: new Date().toISOString(),
        });
        throw err;
    }

    const existing = await findMainPosRecord();

    // 2. SCU.
    const { scuId, scu } = await resolveInitializedScu(existing);

    // 3. Cash Register.
    const { cashRegisterId, cashRegister } = await resolveInitializedCashRegister(existing);

    // 4. Persist.
    const record = await upsertMainPosRecord({
        fiskaly_cash_register_id: cashRegisterId,
        fiskaly_scu_id: scuId,
        environment: getFiskalyConfig().environment,
        status: cashRegister.state,
        scu_status: scu.state,
        serial_number: cashRegister.serial_number || '',
        certificate_serial_number: scu.certificate_serial_number || '',
        fon_status: fonStatus,
        last_setup_at: new Date().toISOString(),
    });

    return { record, scu, cashRegister, fonStatus };
}

/**
 * Build the Fiskaly standard_v1 receipt schema from a parent order's KOTs.
 *
 * All line items are attributed to the STANDARD (20%) VAT rate container by
 * default — the menu does not currently carry per-item VAT rates. This is a
 * safe default for the TEST environment; Phase 3 can refine per-item VAT.
 *
 * Cancelled KOTs and zero-quantity lines are excluded.
 */
export function buildReceiptSchema(kots, paymentType = 'CASH') {
    const lineItems = [];
    let grossTotal = 0;

    for (const kot of kots) {
        if (!kot || kot.status === 'cancelled') continue;
        for (const it of kot.items || []) {
            const qty = Number(it.quantity) || 0;
            const price = Number(it.price) || 0;
            if (qty <= 0) continue;
            const lineGross = qty * price;
            grossTotal += lineGross;
            lineItems.push({
                quantity: String(qty),
                text: String(it.name || 'Item').slice(0, 255),
                price_per_unit: price.toFixed(2),
            });
        }
    }

    const grossStr = grossTotal.toFixed(2);
    const vatData = [{ vat_rate: 'STANDARD', amount: grossStr }];

    const schema = {
        standard_v1: {
            amounts_per_vat_rate: [{ vat_rate: 'STANDARD', amount: grossStr }],
            amounts_per_payment_type: [
                { payment_type: paymentType, amount: grossStr, currency_code: 'EUR' },
            ],
            line_items: lineItems,
        },
    };

    return { schema, grossTotal, vatData, lineItemCount: lineItems.length };
}

/**
 * Fiscalize an ended order: sign a receipt with the Main POS cash register
 * and persist the result in fiscal_receipts.
 *
 * @param {object} parentOrder - waiter_orders record (MUST be orderStatus 'closed')
 * @param {array}  kots        - kitchen_orders belonging to the parent
 * @param {object} [existingReceipt] - optional existing fiscal_receipts row to
 *   reuse on retry. When provided (e.g. a FAILED row), it is flipped back to
 *   PENDING and re-signed IN PLACE instead of creating a new row. This keeps
 *   exactly one receipt row per order across retries and works with the
 *   partial UNIQUE index on (order_id WHERE status='SIGNED').
 * @returns {Promise<object>} the persisted fiscal_receipts record
 */
export async function fiscalizeOrder(parentOrder, kots, existingReceipt = null) {
    const config = getFiskalyConfig();
    const register = await findMainPosRecord();
    if (!register || !register.fiskaly_cash_register_id) {
        const err = new Error('Main POS cash register is not provisioned. Run setup first.');
        err.fiskalyCode = 'E_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }
    if (register.status !== 'INITIALIZED') {
        const err = new Error(`Main POS cash register is not initialized (current state: ${register.status}). Run setup first.`);
        err.fiskalyCode = 'E_INITIAL_RECEIPT_MISSING';
        err.status = 503;
        throw err;
    }

    const { schema, grossTotal, vatData, lineItemCount } = buildReceiptSchema(kots, config.defaultPaymentType);
    if (lineItemCount === 0 || grossTotal <= 0) {
        const err = new Error('Order has no fiscalizable line items (all cancelled or zero quantity).');
        err.fiskalyCode = 'E_EMPTY_RECEIPT';
        err.status = 422;
        throw err;
    }

    const receiptId = randomUUID();
    const paymentType = config.defaultPaymentType;

    // Persist a PENDING record first so a failure is always traceable. On a
    // retry we REUSE the existing (FAILED) row in place — never create a
    // second row — so there is exactly one receipt row per order.
    const pendingPayload = {
        order_id: parentOrder.id,
        order_number: parentOrder.orderId || '',
        cash_register: register.id,
        receipt_type: 'NORMAL',
        payment_type: paymentType,
        total_amount: Number(grossTotal.toFixed(2)),
        vat_data: vatData,
        status: 'PENDING',
        // Clear any previous failure info when re-attempting.
        error_message: '',
        error_code: '',
    };
    let pending;
    if (existingReceipt && existingReceipt.id) {
        pending = await pb.collection('fiscal_receipts').update(
            existingReceipt.id,
            pendingPayload,
            { $autoCancel: false },
        );
    } else {
        pending = await pb.collection('fiscal_receipts').create(
            pendingPayload,
            { $autoCancel: false },
        );
    }

    try {
        const signed = await signReceipt(register.fiskaly_cash_register_id, receiptId, {
            receipt_type: 'NORMAL',
            schema,
            metadata: {
                order_id: parentOrder.id,
                order_number: String(parentOrder.orderId || '').slice(0, 40),
            },
        });

        const finalized = await pb.collection('fiscal_receipts').update(pending.id, {
            fiskaly_receipt_id: signed._id || receiptId,
            receipt_number: String(signed.receipt_number || ''),
            cash_register_serial_number: String(signed.cash_register_serial_number || ''),
            time_signature: Number(signed.time_signature) || 0,
            qr_code_data: String(signed.qr_code_data || ''),
            status: signed.signed === false ? 'FAILED' : 'SIGNED',
            error_message: signed.signed === false ? 'Sicherheitseinrichtung ausgefallen (unsigned receipt)' : '',
        }, { $autoCancel: false });

        return finalized;
    } catch (err) {
        logger.error('Fiskaly signReceipt failed:', err.message);
        // Record the failure (recoverable) without mutating any payment state.
        const failed = await pb.collection('fiscal_receipts').update(pending.id, {
            fiskaly_receipt_id: receiptId,
            status: 'FAILED',
            error_message: String(err.message || '').slice(0, 2000),
            error_code: String(err.fiskalyCode || '').slice(0, 100),
        }, { $autoCancel: false });
        // Keep the original Error intact (message/stack) so errorMiddleware
        // logs it; attach the persisted receipt for any caller that wants it.
        err.persistedReceipt = failed;
        throw err;
    }
}

export { findMainPosRecord, MAIN_POS_NAME };
