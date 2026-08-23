import express from 'express';
import crypto from 'crypto';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { validateEmail, generateOtpCode } from '../utils/otp.js';
import { otpRequestRateLimit } from '../middleware/otp-rate-limit.js';

const router = express.Router();

/**
 * Generates a random password for user accounts
 * @returns {string} Random password (32 characters)
 */
function generateRandomPassword() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * POST /otp/request
 * Request an OTP code for email verification
 * Body: { email }
 * Returns: { success: true, message: 'OTP sent to email' }
 */
router.post('/request', otpRequestRateLimit, async (req, res) => {
  const { email } = req.body;

  logger.info(`[OTP Request] Received request with email: ${email ? email.substring(0, 5) + '***' : 'undefined'}`);

  // Validate email parameter exists and is a string
  if (!email || typeof email !== 'string') {
    logger.warn('[OTP Request] Email parameter missing or invalid type');
    return res.status(400).json({ error: 'Email is required' });
  }

  // Validate email format
  if (!validateEmail(email)) {
    logger.warn(`[OTP Request] Invalid email format: ${email.substring(0, 5)}***`);
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  logger.info(`[OTP Request] Email validated and normalized: ${normalizedEmail.substring(0, 5)}***`);

  try {
    // Check if user already exists
    let existingUser = null;
    logger.info(`[OTP Request] Checking if user exists in PocketBase: ${normalizedEmail.substring(0, 5)}***`);
    
    try {
      existingUser = await pb.collection('users').getFirstListItem(`email="${normalizedEmail}"`);
      logger.info(`[OTP Request] User found in PocketBase: ${existingUser.id}`);
    } catch (error) {
      // User does not exist, which is fine - we'll create one
      if (!error.status || error.status !== 404) {
        logger.error(`[OTP Request] Unexpected error checking user existence:`, error.message);
        throw error; // Re-throw if it's not a 404
      }
      logger.info(`[OTP Request] User does not exist (404), will create new user`);
    }

    // If user doesn't exist, create one with a temporary password
    if (!existingUser) {
      logger.info(`[OTP Request] Creating new user for email: ${normalizedEmail.substring(0, 5)}***`);
      const tempPassword = generateRandomPassword();
      
      try {
        existingUser = await pb.collection('users').create({
          email: normalizedEmail,
          password: tempPassword,
          passwordConfirm: tempPassword,
          verified: false,
        });
        logger.info(`[OTP Request] New user created successfully: ${existingUser.id}`);
      } catch (createError) {
        logger.error(`[OTP Request] Failed to create user:`, createError.message);
        throw new Error(`Failed to create user account: ${createError.message}`);
      }
    }

    // Request OTP for the user
    logger.info(`[OTP Request] Calling pb.collection('users').requestOTP() for: ${normalizedEmail.substring(0, 5)}***`);
    
    try {
      const otpResponse = await pb.collection('users').requestOTP(normalizedEmail);
      logger.info(`[OTP Request] OTP requested successfully for user: ${existingUser.id}`);
      logger.debug(`[OTP Request] OTP Response:`, otpResponse);
    } catch (otpError) {
      logger.error(`[OTP Request] Failed to request OTP:`, otpError.message);
      logger.error(`[OTP Request] OTP Error details:`, {
        status: otpError.status,
        statusText: otpError.statusText,
        data: otpError.data,
        message: otpError.message,
      });
      throw new Error(`OTP request failed: ${otpError.message}`);
    }

    logger.info(`[OTP Request] OTP request completed successfully for user: ${existingUser.id}`);

    res.json({
      success: true,
      message: 'OTP sent to email',
      email: normalizedEmail,
    });
  } catch (error) {
    logger.error(`[OTP Request] Unexpected error in OTP request handler:`, error.message);
    logger.error(`[OTP Request] Full error:`, error);
    
    // Return 400 with error details to frontend
    return res.status(400).json({
      error: 'Failed to request OTP',
      details: error.message,
    });
  }
});

/**
 * POST /otp/verify
 * Verify OTP code and authenticate user
 * Body: { email, code }
 * Returns: { success: true, userId, token }
 */
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;

  logger.info(`[OTP Verify] Received verification request for email: ${email ? email.substring(0, 5) + '***' : 'undefined'}`);

  if (!email || typeof email !== 'string') {
    logger.warn('[OTP Verify] Email parameter missing or invalid type');
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!code || typeof code !== 'string') {
    logger.warn('[OTP Verify] Code parameter missing or invalid type');
    return res.status(400).json({ error: 'OTP code is required' });
  }

  if (!/^\d{6}$/.test(code)) {
    logger.warn(`[OTP Verify] Invalid OTP code format: ${code}`);
    return res.status(400).json({ error: 'OTP code must be 6 digits' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  logger.info(`[OTP Verify] Email validated and normalized: ${normalizedEmail.substring(0, 5)}***`);

  try {
    logger.info(`[OTP Verify] Calling pb.collection('users').authWithOTP() for: ${normalizedEmail.substring(0, 5)}***`);
    
    // Authenticate user with OTP
    const authData = await pb.collection('users').authWithOTP(normalizedEmail, code);

    if (!authData || !authData.record) {
      logger.error('[OTP Verify] OTP authentication returned invalid response');
      throw new Error('OTP authentication failed: Invalid response from PocketBase');
    }

    logger.info(`[OTP Verify] User authenticated successfully with OTP: ${authData.record.id}`);

    res.json({
      success: true,
      userId: authData.record.id,
      token: authData.token,
    });
  } catch (error) {
    logger.error(`[OTP Verify] OTP verification failed:`, error.message);
    logger.error(`[OTP Verify] Full error:`, {
      status: error.status,
      statusText: error.statusText,
      data: error.data,
      message: error.message,
    });
    
    // Return 400 with error details to frontend
    return res.status(400).json({
      error: 'OTP verification failed',
      details: error.message,
    });
  }
});

export default router;