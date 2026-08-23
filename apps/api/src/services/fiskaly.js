// Fiskaly SIGN AT (RKSV) API client — server-side only.
//
// Implements the current Fiskaly SIGN AT REST API (v1.2.6,
// https://rksv.fiskaly.com/api/v1) lifecycle operations:
//   - API authentication (api_key/api_secret -> JWT, with refresh)
//   - FinanzOnline (FON) authentication & status
//   - Signature Creation Unit (SCU): create / retrieve / list / initialize
//   - Cash Register: create / retrieve / list / register / initialize
//   - Receipt: sign / retrieve / list
//
// All Fiskaly credentials live in server-side env (apps/api/.env) and are
// NEVER exposed to the browser. This module is imported only by Express
// route modules that need server-side Fiskaly access.
//
// Retry policy: 5xx, 408 (FON timeout), 429 (rate limit) and network errors
// are retried with exponential backoff. 4xx (non-401) are thrown immediately
// (not retryable per Fiskaly docs). 401 triggers a single re-auth + retry.
//
// Fiskaly is a POST-End-Order feature. Nothing here is referenced by the
// pre-End-Order waiter/order workflow.

import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';

const FISKALY_BASE_URL = 'https://rksv.fiskaly.com/api/v1';

// Retryable HTTP status codes (per Fiskaly docs: 5xx + 408 FON timeout + 429).
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// In-memory JWT cache. Token state is process-local; on restart we re-auth.
let tokenState = {
    accessToken: null,
    accessTokenExpiresAt: 0, // unix seconds
    refreshToken: null,
    refreshTokenExpiresAt: 0, // unix seconds
    env: null,
    organizationId: null,
};

/**
 * Read the server-side Fiskaly configuration from env. Never logged in full
 * (secrets are masked elsewhere). Used by routes to report non-sensitive
 * status and to gate "not configured" responses.
 */
export function getFiskalyConfig() {
    return {
        apiKey: process.env.FISKALY_API_KEY,
        apiSecret: process.env.FISKALY_API_SECRET,
        environment: (process.env.FISKALY_ENVIRONMENT || 'test').toUpperCase(),
        fonParticipantId: process.env.FON_PARTICIPANT_ID,
        fonUserId: process.env.FON_USER_ID,
        fonUserPin: process.env.FON_USER_PIN,
        vatId: process.env.FISKALY_VAT_ID,
        legalEntityName: process.env.FISKALY_LEGAL_ENTITY_NAME || 'Tripti Genusswelt',
        defaultPaymentType: (process.env.FISKALY_DEFAULT_PAYMENT_TYPE || 'CASH').toUpperCase(),
    };
}

/** True only when the Fiskaly API key + secret are both set. */
export function isFiskalyConfigured() {
    const c = getFiskalyConfig();
    return Boolean(c.apiKey && c.apiSecret);
}

function requireCredentials() {
    const c = getFiskalyConfig();
    if (!c.apiKey || !c.apiSecret) {
        const err = new Error('Fiskaly API credentials are not configured (FISKALY_API_KEY / FISKALY_API_SECRET)');
        err.fiskalyCode = 'E_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }
    return c;
}

function isFonConfigured() {
    const c = getFiskalyConfig();
    return Boolean(c.fonParticipantId && c.fonUserId && c.fonUserPin);
}

// ---- Low-level HTTP with retry ----

async function fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
                const delayMs = Math.min(500 * 2 ** attempt, 8000);
                logger.warn(`Fiskaly retryable status ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise((r) => setTimeout(r, delayMs));
                continue;
            }
            return response;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delayMs = Math.min(500 * 2 ** attempt, 8000);
                logger.warn(`Fiskaly fetch error, retrying in ${delayMs}ms: ${err.message}`);
                await new Promise((r) => setTimeout(r, delayMs));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

async function parseBody(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch (_) {
        return { raw: text };
    }
}

function buildFiskalyError(response, body) {
    const code = body?.code || body?.error || `HTTP_${response.status}`;
    const message = body?.message || body?.error || response.statusText || 'Unknown Fiskaly error';
    const err = new Error(`Fiskaly API error: ${response.status} ${response.statusText} — ${code}: ${message}`);
    err.status = response.status;
    err.fiskalyCode = code;
    err.fiskalyBody = body;
    return err;
}

// ---- Authentication ----

/** Authenticate with api_key/api_secret (or refresh_token) and cache the JWT. */
export async function authenticate() {
    const c = requireCredentials();
    const response = await fetchWithRetry(`${FISKALY_BASE_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: c.apiKey, api_secret: c.apiSecret }),
    });
    const parsed = await parseBody(response);
    if (!response.ok) {
        throw buildFiskalyError(response, parsed);
    }
    tokenState = {
        accessToken: parsed.access_token,
        accessTokenExpiresAt: parsed.access_token_expires_at || 0,
        refreshToken: parsed.refresh_token,
        refreshTokenExpiresAt: parsed.refresh_token_expires_at || 0,
        env: parsed.access_token_claims?.env || null,
        organizationId: parsed.access_token_claims?.organization_id || null,
    };
    return parsed;
}

async function refreshWithToken() {
    if (!tokenState.refreshToken) {
        return authenticate();
    }
    const response = await fetchWithRetry(`${FISKALY_BASE_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokenState.refreshToken }),
    });
    const parsed = await parseBody(response);
    if (!response.ok) {
        logger.warn('Fiskaly refresh token failed, re-authenticating with API key');
        return authenticate();
    }
    tokenState = {
        accessToken: parsed.access_token,
        accessTokenExpiresAt: parsed.access_token_expires_at || 0,
        refreshToken: parsed.refresh_token,
        refreshTokenExpiresAt: parsed.refresh_token_expires_at || 0,
        env: parsed.access_token_claims?.env || tokenState.env,
        organizationId: parsed.access_token_claims?.organization_id || tokenState.organizationId,
    };
    return parsed;
}

/** Return a valid (non-expired) access token, refreshing/re-authing as needed. */
async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (tokenState.accessToken && tokenState.accessTokenExpiresAt - now > 60) {
        return tokenState.accessToken;
    }
    if (tokenState.refreshToken && tokenState.refreshTokenExpiresAt - now > 60) {
        await refreshWithToken();
    } else {
        await authenticate();
    }
    return tokenState.accessToken;
}

/**
 * Authenticated request to the Fiskaly API. Handles 401 by re-authenticating
 * and retrying the request once.
 */
async function fiskalyRequest(path, options = {}) {
    const token = await getAccessToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
    };
    const response = await fetchWithRetry(`${FISKALY_BASE_URL}${path}`, {
        ...options,
        headers,
    });
    const parsed = await parseBody(response);
    if (!response.ok) {
        if (response.status === 401) {
            logger.warn('Fiskaly 401 Unauthorized, re-authenticating and retrying once');
            await authenticate();
            const retryResp = await fetchWithRetry(`${FISKALY_BASE_URL}${path}`, {
                ...options,
                headers: { ...headers, Authorization: `Bearer ${tokenState.accessToken}` },
            });
            const retryParsed = await parseBody(retryResp);
            if (!retryResp.ok) {
                throw buildFiskalyError(retryResp, retryParsed);
            }
            return retryParsed;
        }
        throw buildFiskalyError(response, parsed);
    }
    return parsed;
}

// ---- FinanzOnline (FON) ----

/** Authenticate the taxpayer with FinanzOnline using their FON credentials. */
export async function authenticateFon() {
    const c = requireCredentials();
    if (!isFonConfigured()) {
        const err = new Error('FinanzOnline credentials are not configured (FON_PARTICIPANT_ID / FON_USER_ID / FON_USER_PIN)');
        err.fiskalyCode = 'E_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }
    return fiskalyRequest('/fon/auth', {
        method: 'PUT',
        body: JSON.stringify({
            fon_participant_id: c.fonParticipantId,
            fon_user_id: c.fonUserId,
            fon_user_pin: c.fonUserPin,
        }),
    });
}

/** Retrieve the current FinanzOnline authentication status. */
export async function retrieveFonStatus() {
    return fiskalyRequest('/fon/auth', { method: 'GET' });
}

// ---- Signature Creation Unit (SCU) ----

/** Create a Signature Creation Unit (PUT, idempotent by scu_id). */
export async function createScu(scuId, { legalEntityName, vatId } = {}) {
    const c = requireCredentials();
    return fiskalyRequest(`/signature-creation-unit/${scuId}`, {
        method: 'PUT',
        body: JSON.stringify({
            legal_entity_id: { vat_id: vatId || c.vatId },
            legal_entity_name: legalEntityName || c.legalEntityName,
        }),
    });
}

/** Retrieve a Signature Creation Unit by id. */
export async function retrieveScu(scuId) {
    return fiskalyRequest(`/signature-creation-unit/${scuId}`, { method: 'GET' });
}

/** List all Signature Creation Units. */
export async function listScus() {
    return fiskalyRequest('/signature-creation-unit', { method: 'GET' });
}

/** Transition a Signature Creation Unit to INITIALIZED (registers with FON). */
export async function initializeScu(scuId) {
    return fiskalyRequest(`/signature-creation-unit/${scuId}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'INITIALIZED' }),
    });
}

// ---- Cash Register ----

/** Create a Cash Register (PUT, idempotent by cash_register_id). */
export async function createCashRegister(cashRegisterId, { description } = {}) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}`, {
        method: 'PUT',
        body: JSON.stringify({ description: description || 'Main POS' }),
    });
}

/** Retrieve a Cash Register by id. */
export async function retrieveCashRegister(cashRegisterId) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}`, { method: 'GET' });
}

/** List Cash Registers. */
export async function listCashRegisters() {
    return fiskalyRequest('/cash-register', { method: 'GET' });
}

/** Transition a Cash Register to REGISTERED (reports to FinanzOnline). */
export async function registerCashRegister(cashRegisterId) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'REGISTERED' }),
    });
}

/** Transition a Cash Register to INITIALIZED (fiscalizes initial receipt). */
export async function initializeCashRegister(cashRegisterId) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'INITIALIZED' }),
    });
}

// ---- Receipts ----

/**
 * Sign a Receipt (fiscalize). Idempotent by receipt_id — re-sending the same
 * request body with the same receipt_id signs the receipt only once.
 *
 * @param {string} cashRegisterId - Fiskaly cash register UUID
 * @param {string} receiptId - caller-generated UUIDv4 for this receipt
 * @param {object} payload - { receipt_type, schema, metadata }
 */
export async function signReceipt(cashRegisterId, receiptId, payload) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}/receipt/${receiptId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

/** Retrieve a signed receipt by id or receipt number. */
export async function retrieveReceipt(cashRegisterId, receiptIdOrNumber) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}/receipt/${receiptIdOrNumber}`, {
        method: 'GET',
    });
}

/** List receipts belonging to a cash register. */
export async function listCashRegisterReceipts(cashRegisterId) {
    return fiskalyRequest(`/cash-register/${cashRegisterId}/receipt`, { method: 'GET' });
}

// ---- Helpers exposed for orchestration ----

export { randomUUID, isFonConfigured };
