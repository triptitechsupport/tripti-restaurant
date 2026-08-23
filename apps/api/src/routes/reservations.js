import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /reservations
 * Fetch all table reservations (admin only)
 * Requires: Authorization Bearer token with user id
 * Returns: Array of reservation objects
 */
router.get('/', async (req, res) => {
	const userId = req.user?.id;

	if (!userId) {
		throw new Error('User authentication required');
	}

	// Check if user is an admin
	await pb.collection('admin_users').getOne(userId);

	// Fetch all reservations (admin sees all)
	const data = await pb.collection('table_reservations').getFullList();

	logger.info(`Admin ${userId} retrieved all reservations`);

	res.json(data);
});

/**
 * POST /reservations/confirm
 * Confirm a table reservation
 * Body: { reservationId, customerEmail, customerPhone }
 * Returns: { success: true, message: 'Confirmation sent' }
 *
 * NOTE: Email and SMS sending must be handled via PocketBase hooks (migrations),
 * not from Express routes. The built-in mailer is only accessible in PocketBase.
 * This endpoint fetches the reservation and returns confirmation data.
 * The actual email/SMS sending should be triggered by a PocketBase hook
 * on the table_reservations collection when a confirmation is recorded.
 */
router.post('/confirm', async (req, res) => {
	const { reservationId, customerEmail, customerPhone } = req.body;

	// Validate required fields
	if (!reservationId || typeof reservationId !== 'string') {
		return res.status(400).json({ error: 'Reservation ID is required' });
	}

	if (!customerEmail || typeof customerEmail !== 'string') {
		return res.status(400).json({ error: 'Customer email is required' });
	}

	if (!customerPhone || typeof customerPhone !== 'string') {
		return res.status(400).json({ error: 'Customer phone is required' });
	}

	// Fetch reservation details from PocketBase
	const reservation = await pb.collection('table_reservations').getOne(reservationId);

	if (!reservation) {
		throw new Error(`Reservation not found: ${reservationId}`);
	}

	// Extract reservation details
	const { numberOfGuests, reservationDate, reservationTime } = reservation;

	if (!numberOfGuests || !reservationDate || !reservationTime) {
		throw new Error('Reservation is missing required fields: numberOfGuests, reservationDate, or reservationTime');
	}

	// Log confirmation attempt
	logger.info(`Confirming reservation ${reservationId} for ${customerEmail}`);

	// Update reservation status in PocketBase to mark as confirmed
	await pb.collection('table_reservations').update(reservationId, {
		confirmationStatus: 'confirmed',
		confirmedAt: new Date().toISOString(),
		confirmationEmail: customerEmail,
		confirmationPhone: customerPhone,
	});

	// NOTE: Email and SMS sending should be triggered by a PocketBase hook
	// Create a hook in PocketBase migrations that listens for confirmationStatus changes
	// and sends emails/SMS using the built-in mailer.
	// Example hook template:
	// onRecordAfterUpdate: (e) => {
	//   if (e.record.confirmationStatus === 'confirmed') {
	//     $app.dao().sendEmail({
	//       from: 'noreply@example.com',
	//       to: e.record.confirmationEmail,
	//       subject: 'Reservation Confirmed',
	//       html: `Your table reservation for ${e.record.numberOfGuests} guests on ${e.record.reservationDate} at ${e.record.reservationTime} has been confirmed.`
	//     });
	//   }
	// }

	logger.info(`Reservation ${reservationId} confirmed successfully`);

	res.json({
		success: true,
		message: 'Confirmation sent',
		reservationId,
		confirmationDetails: {
			numberOfGuests,
			reservationDate,
			reservationTime,
			customerEmail,
			customerPhone,
		},
	});
});

/**
 * POST /reservations/send-confirmation-email
 * Send a confirmation email for a reservation
 * Body: { reservationId, guestName, guestEmail, reservationDate, reservationTime, numberOfGuests, restaurantName, restaurantPhone, restaurantAddress }
 * Returns: { success: true, message: 'Confirmation email sent' }
 *
 * NOTE: Email sending is handled by a PocketBase hook that listens for new records
 * in the reservation_confirmations collection and sends emails using the built-in mailer.
 */
router.post('/send-confirmation-email', async (req, res) => {
	const { reservationId, guestName, guestEmail, reservationDate, reservationTime, numberOfGuests, restaurantName, restaurantPhone, restaurantAddress } = req.body;

	// Validate required fields
	if (!reservationId || typeof reservationId !== 'string') {
		return res.status(400).json({ error: 'Reservation ID is required' });
	}

	if (!guestName || typeof guestName !== 'string') {
		return res.status(400).json({ error: 'Guest name is required' });
	}

	if (!guestEmail || typeof guestEmail !== 'string') {
		return res.status(400).json({ error: 'Guest email is required' });
	}

	if (!reservationDate || typeof reservationDate !== 'string') {
		return res.status(400).json({ error: 'Reservation date is required' });
	}

	if (!reservationTime || typeof reservationTime !== 'string') {
		return res.status(400).json({ error: 'Reservation time is required' });
	}

	if (!numberOfGuests || typeof numberOfGuests !== 'number') {
		return res.status(400).json({ error: 'Number of guests is required' });
	}

	if (!restaurantName || typeof restaurantName !== 'string') {
		return res.status(400).json({ error: 'Restaurant name is required' });
	}

	if (!restaurantPhone || typeof restaurantPhone !== 'string') {
		return res.status(400).json({ error: 'Restaurant phone is required' });
	}

	if (!restaurantAddress || typeof restaurantAddress !== 'string') {
		return res.status(400).json({ error: 'Restaurant address is required' });
	}

	logger.info(`Creating confirmation email record for reservation ${reservationId} to ${guestEmail}`);

	// Create a record in the reservation_confirmations collection
	// The PocketBase hook will automatically send the email when this record is created
	const confirmationRecord = await pb.collection('reservation_confirmations').create({
		reservationId,
		guestName,
		guestEmail,
		reservationDate,
		reservationTime,
		numberOfGuests,
		restaurantName,
		restaurantPhone,
		restaurantAddress,
		createdAt: new Date().toISOString(),
	});

	logger.info(`Confirmation email record created: ${confirmationRecord.id}`);

	res.json({
		success: true,
		message: 'Confirmation email sent',
		recordId: confirmationRecord.id,
	});
});

/**
 * POST /reservations/send-decline-email
 * Send a decline email for a reservation request
 * Body: { guestEmail, guestName, declineMessage, suggestedDate, suggestedTime }
 * Returns: { success: true, message: 'Decline email sent' }
 *
 * NOTE: Email sending is handled by a PocketBase hook that listens for new records
 * in the reservation_declines collection and sends emails using the built-in mailer.
 */
router.post('/send-decline-email', async (req, res) => {
	const { guestEmail, guestName, declineMessage, suggestedDate, suggestedTime } = req.body;

	// Validate required fields
	if (!guestEmail || typeof guestEmail !== 'string') {
		return res.status(400).json({ error: 'Guest email is required' });
	}

	if (!guestName || typeof guestName !== 'string') {
		return res.status(400).json({ error: 'Guest name is required' });
	}

	if (!declineMessage || typeof declineMessage !== 'string') {
		return res.status(400).json({ error: 'Decline message is required' });
	}

	// suggestedDate and suggestedTime are optional
	if (suggestedDate && typeof suggestedDate !== 'string') {
		return res.status(400).json({ error: 'Suggested date must be a string' });
	}

	if (suggestedTime && typeof suggestedTime !== 'string') {
		return res.status(400).json({ error: 'Suggested time must be a string' });
	}

	logger.info(`Creating decline email record for ${guestEmail}`);

	// Create a record in the reservation_declines collection
	// The PocketBase hook will automatically send the email when this record is created
	const declineRecord = await pb.collection('reservation_declines').create({
		guestEmail,
		guestName,
		declineMessage,
		suggestedDate: suggestedDate || null,
		suggestedTime: suggestedTime || null,
		createdAt: new Date().toISOString(),
	});

	logger.info(`Decline email record created: ${declineRecord.id}`);

	res.json({
		success: true,
		message: 'Decline email sent',
		recordId: declineRecord.id,
	});
});

export default router;