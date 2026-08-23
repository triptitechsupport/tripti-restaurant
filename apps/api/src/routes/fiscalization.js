// Fiskaly SIGN AT fiscalization routes — server-side only.
//
// All Fiskaly credentials stay server-side; no secret is ever returned.
// These endpoints are POST-End-Order operations and do not touch the
// pre-End-Order waiter/order workflow, the Pay workflow, or Free Table.
//
// Mounted under /fiscalization (see routes/index.js):
//   POST /fiscalization/test-connection
//   POST /fiscalization/setup
//   GET  /fiscalization/status
//   POST /fiscalization/orders/:orderId/fiscalize
//   GET  /fiscalization/orders/:orderId/fiscal-receipt
//   POST /fiscalization/orders/:orderId/fiscal-receipt/retry

import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import {
    authenticate,
    retrieveFonStatus,
    getFiskalyConfig,
    isFiskalyConfigured,
    isFonConfigured,
} from '../services/fiskaly.js';
import {
    provisionMainPos,
    fiscalizeOrder,
    findMainPosRecord,
} from '../services/fiskalyProvisioning.js';
import { isIntegrationConfigured, respondNotConfigured } from '../utils/integrationConfig.js';

const router = express.Router();

const FISKALY_ENV_KEYS = ['FISKALY_API_KEY', 'FISKALY_API_SECRET'];
const FON_ENV_KEYS = ['FON_PARTICIPANT_ID', 'FON_USER_ID', 'FON_USER_PIN'];

/** Look up a waiter_orders parent by record id, falling back to the orderId field. */
async function findParentOrder(orderId) {
    if (!orderId) return null;
    try {
        return await pb.collection('waiter_orders').getOne(orderId, { $autoCancel: false });
    } catch (_) {
        try {
            const list = await pb.collection('waiter_orders').getList(1, 1, {
                filter: pb.filter('orderId = {:oid}', { oid: orderId }),
                $autoCancel: false,
            });
            return list.items?.[0] || null;
        } catch (__) {
            return null;
        }
    }
}

/** Fetch all kitchen_orders (KOTs) belonging to a parent order. */
async function fetchKots(parentId) {
    try {
        return await pb.collection('kitchen_orders').getFullList({
            filter: pb.filter('parentOrder = {:pid}', { pid: parentId }),
            $autoCancel: false,
        });
    } catch (err) {
        logger.warn('fetchKots failed:', err.message);
        return [];
    }
}

/** Fetch the most recent fiscal receipt for an order (any status). */
async function findReceiptForOrder(orderId) {
    try {
        const list = await pb.collection('fiscal_receipts').getList(1, 1, {
            filter: pb.filter('order_id = {:oid}', { oid: orderId }),
            sort: '-created',
            $autoCancel: false,
        });
        return list.items?.[0] || null;
    } catch (err) {
        logger.warn('findReceiptForOrder failed:', err.message);
        return null;
    }
}

/** Public (non-sensitive) shape of a fiscal receipt for API responses. */
function publicReceipt(rec) {
    if (!rec) return null;
    return {
        id: rec.id,
        orderId: rec.order_id,
        orderNumber: rec.order_number,
        fiskalyReceiptId: rec.fiskaly_receipt_id,
        receiptType: rec.receipt_type,
        receiptNumber: rec.receipt_number,
        cashRegisterSerialNumber: rec.cash_register_serial_number,
        timeSignature: rec.time_signature,
        qrCodeData: rec.qr_code_data,
        totalAmount: rec.total_amount,
        paymentType: rec.payment_type,
        vatData: rec.vat_data,
        status: rec.status,
        errorMessage: rec.error_message,
        errorCode: rec.error_code,
        created: rec.created,
        updated: rec.updated,
    };
}

/**
 * Non-sensitive restaurant/legal-entity information for the printed bill.
 * Sourced from server-side Fiskaly config (env) — never exposes secrets.
 */
function restaurantInfo() {
    const config = getFiskalyConfig();
    return {
        name: config.legalEntityName || 'Tripti Genusswelt',
        vatId: config.vatId || '',
        environment: config.environment,
    };
}

/**
 * POST /fiscalization/test-connection
 * Validates that the Fiskaly API credentials authenticate. Does not provision.
 */
router.post('/test-connection', async (req, res) => {
    if (!isIntegrationConfigured(...FISKALY_ENV_KEYS)) {
        return respondNotConfigured(res, { integration: 'Fiskaly', envKeys: FISKALY_ENV_KEYS });
    }
    const result = await authenticate();
    res.json({
        connected: true,
        environment: result.access_token_claims?.env || getFiskalyConfig().environment,
        organizationId: result.access_token_claims?.organization_id || null,
    });
});

/**
 * POST /fiscalization/setup
 * Idempotently provisions the Main POS cash register (FON auth, SCU, cash
 * register lifecycle). Safe to call repeatedly — no duplicate resources.
 */
router.post('/setup', async (req, res) => {
    if (!isIntegrationConfigured(...FISKALY_ENV_KEYS)) {
        return respondNotConfigured(res, { integration: 'Fiskaly', envKeys: FISKALY_ENV_KEYS });
    }
    if (!isIntegrationConfigured(...FON_ENV_KEYS)) {
        return respondNotConfigured(res, { integration: 'Fiskaly FinanzOnline', envKeys: FON_ENV_KEYS });
    }
    const { record, scu, cashRegister, fonStatus } = await provisionMainPos();
    res.json({
        provisioned: true,
        environment: record.environment,
        cashRegister: {
            id: record.fiskaly_cash_register_id,
            name: record.name,
            status: record.status,
            serialNumber: record.serial_number,
        },
        scu: {
            id: record.fiskaly_scu_id,
            status: record.scu_status,
            certificateSerialNumber: record.certificate_serial_number,
        },
        fonStatus,
        scuState: scu?.state,
        cashRegisterState: cashRegister?.state,
    });
});

/**
 * GET /fiscalization/status
 * Non-sensitive overview of the Fiskaly integration. Never returns secrets.
 */
router.get('/status', async (req, res) => {
    const config = getFiskalyConfig();
    const fiskalyConfigured = isFiskalyConfigured();
    const fonConfigured = isFonConfigured();

    const status = {
        environment: config.environment,
        configured: fiskalyConfigured,
        fonConfigured,
        fiskalyConnection: 'UNKNOWN',
        organizationId: null,
        cashRegister: null,
        scu: null,
        fonStatus: null,
        lastFiscalReceipt: null,
        lastFiscalization: null,
    };

    // Live connection check (best-effort; never throws to the client).
    if (fiskalyConfigured) {
        try {
            const auth = await authenticate();
            status.fiskalyConnection = 'OK';
            status.environment = auth.access_token_claims?.env || config.environment;
            status.organizationId = auth.access_token_claims?.organization_id || null;
        } catch (err) {
            status.fiskalyConnection = `ERROR: ${err.fiskalyCode || err.message}`;
        }
    }

    // FON status (best-effort).
    if (fiskalyConfigured) {
        try {
            const fon = await retrieveFonStatus();
            status.fonStatus = fon?.authentication_status || null;
        } catch (err) {
            status.fonStatus = `ERROR: ${err.fiskalyCode || err.message}`;
        }
    }

    // Persisted Main POS register.
    const register = await findMainPosRecord();
    if (register) {
        status.cashRegister = {
            id: register.fiskaly_cash_register_id,
            name: register.name,
            description: register.description,
            environment: register.environment,
            status: register.status,
            serialNumber: register.serial_number,
        };
        status.scu = {
            id: register.fiskaly_scu_id,
            status: register.scu_status,
            certificateSerialNumber: register.certificate_serial_number,
        };
        status.fonStatus = status.fonStatus === null ? register.fon_status : status.fonStatus;
    }

    // Last fiscal receipt (most recent across all orders).
    try {
        const last = await pb.collection('fiscal_receipts').getList(1, 1, {
            sort: '-created',
            $autoCancel: false,
        });
        const rec = last.items?.[0];
        if (rec) {
            status.lastFiscalReceipt = publicReceipt(rec);
            status.lastFiscalization = rec.created;
        }
    } catch (err) {
        logger.warn('status: last fiscal receipt lookup failed:', err.message);
    }

    res.json(status);
});

/**
 * POST /fiscalization/orders/:orderId/fiscalize
 * Fiscalize an ENDED order (orderStatus must be 'closed'). Idempotent: if a
 * SIGNED receipt already exists for this order, it is returned without
 * re-signing. Does not mutate payment state.
 */
router.post('/orders/:orderId/fiscalize', async (req, res) => {
    const { orderId } = req.params;
    if (!orderId) {
        return res.status(422).json({ error: 'orderId is required' });
    }

    const parent = await findParentOrder(orderId);
    if (!parent) {
        return res.status(404).json({ error: 'Order not found' });
    }

    // POST-End-Order gating — Fiskaly only runs on ended orders.
    if (parent.orderStatus !== 'closed') {
        return res.status(422).json({
            error: 'Order must be ended (End Order) before fiscalization.',
            currentStatus: parent.orderStatus,
        });
    }

    // Idempotent: a previously SIGNED receipt is returned as-is.
    const existing = await findReceiptForOrder(parent.id);
    if (existing && existing.status === 'SIGNED') {
        return res.json({ receipt: publicReceipt(existing), restaurant: restaurantInfo(), alreadySigned: true });
    }
    if (existing && existing.status === 'PENDING') {
        return res.status(409).json({ error: 'A fiscalization is already in progress for this order.', receipt: publicReceipt(existing) });
    }
    if (existing && existing.status === 'FAILED') {
        return res.status(409).json({ error: 'A previous fiscalization failed. Use the retry endpoint to re-attempt.', receipt: publicReceipt(existing) });
    }

    const kots = await fetchKots(parent.id);
    const receipt = await fiscalizeOrder(parent, kots);
    res.json({ receipt: publicReceipt(receipt), restaurant: restaurantInfo(), alreadySigned: false });
});

/**
 * GET /fiscalization/orders/:orderId/fiscal-receipt
 * Retrieve the stored fiscal receipt for an order (any status).
 */
router.get('/orders/:orderId/fiscal-receipt', async (req, res) => {
    const { orderId } = req.params;
    if (!orderId) {
        return res.status(422).json({ error: 'orderId is required' });
    }
    const parent = await findParentOrder(orderId);
    if (!parent) {
        return res.status(404).json({ error: 'Order not found' });
    }
    const receipt = await findReceiptForOrder(parent.id);
    if (!receipt) {
        return res.status(404).json({ error: 'No fiscal receipt found for this order.' });
    }
    res.json({ receipt: publicReceipt(receipt), restaurant: restaurantInfo() });
});

/**
 * POST /fiscalization/orders/:orderId/fiscal-receipt/retry
 * Re-attempt fiscalization for an order whose previous attempt FAILED (or
 * that has no receipt yet). A SIGNED receipt is never re-signed.
 */
router.post('/orders/:orderId/fiscal-receipt/retry', async (req, res) => {
    const { orderId } = req.params;
    if (!orderId) {
        return res.status(422).json({ error: 'orderId is required' });
    }

    const parent = await findParentOrder(orderId);
    if (!parent) {
        return res.status(404).json({ error: 'Order not found' });
    }
    if (parent.orderStatus !== 'closed') {
        return res.status(422).json({
            error: 'Order must be ended (End Order) before fiscalization.',
            currentStatus: parent.orderStatus,
        });
    }

    const existing = await findReceiptForOrder(parent.id);
    if (existing && existing.status === 'SIGNED') {
        return res.json({ receipt: publicReceipt(existing), restaurant: restaurantInfo(), alreadySigned: true });
    }

    const kots = await fetchKots(parent.id);
    // Reuse the existing (FAILED) row in place — never create a second row.
    const receipt = await fiscalizeOrder(parent, kots, existing);
    res.json({ receipt: publicReceipt(receipt), restaurant: restaurantInfo(), retried: true });
});

export default router;
