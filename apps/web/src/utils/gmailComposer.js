import { format } from 'date-fns';
import pb from '@/lib/pocketbaseClient.js';

// Correct restaurant contact defaults used across email templates.
export const RESTAURANT_DEFAULTS = {
  restaurantPhone: '+43 664 1219289',
  restaurantEmail: 'info@triptigenusswelt.at',
  restaurantWebsite: 'https://triptigenusswelt.at',
};

// Default editable templates. Admins can customize these in
// Admin Dashboard > Settings > Email Templates while keeping the {placeholders}.
export const DEFAULT_EMAIL_TEMPLATES = {
  approvedSubject: 'Your Reservation at Tripti Genusswelt - Confirmed \u2713',
  approvedBody: `Dear {guestName},

Thank you for your reservation request! We are delighted to confirm your booking at Tripti Genusswelt.

RESERVATION DETAILS
------------------------------------------------------------
Date:           {reservationDate}
Time:           {reservationTime}
Party Size:     {partySize}
Table:          {tableNumber}
Room:           {roomNumber}

RESTAURANT INFORMATION
------------------------------------------------------------
Tripti Genusswelt - The Indian Restaurant

Phone:          {restaurantPhone}
Website:        {restaurantWebsite}
Email:          {restaurantEmail}

IMPORTANT NOTES
------------------------------------------------------------
- Please arrive 10-15 minutes before your reservation time
- If you need to make changes or cancel, please contact us as soon as possible
- We look forward to welcoming you and your guests!

Warm regards,
The Tripti Genusswelt Team`,
  declinedSubject: 'Your Reservation at Tripti Genusswelt - Alternative Time Available',
  declinedBody: `Dear {guestName},

Thank you for your interest in dining at Tripti Genusswelt. Unfortunately, we are unable to accommodate your reservation request for the following:

ORIGINAL REQUEST
------------------------------------------------------------
Date:           {reservationDate}
Time:           {reservationTime}
Party Size:     {partySize}

We are fully booked at your requested time. We would be happy to welcome you at an alternative time - please reply to this email or contact us directly.

CONTACT US
------------------------------------------------------------
Tripti Genusswelt - The Indian Restaurant

Phone:          {restaurantPhone}
Website:        {restaurantWebsite}
Email:          {restaurantEmail}

We sincerely apologize for any inconvenience and hope to welcome you soon.

Best regards,
The Tripti Genusswelt Team`,
  pendingSubject: 'Your Reservation at Tripti Genusswelt - Under Review',
  pendingBody: `Dear {guestName},

Thank you for your reservation request at Tripti Genusswelt! We have received your booking and are currently reviewing your request.

RESERVATION DETAILS
------------------------------------------------------------
Date:           {reservationDate}
Time:           {reservationTime}
Party Size:     {partySize}

NEXT STEPS
------------------------------------------------------------
We will confirm your reservation within 24 hours. You will receive a confirmation email with all the details.

RESTAURANT INFORMATION
------------------------------------------------------------
Tripti Genusswelt - The Indian Restaurant

Phone:          {restaurantPhone}
Website:        {restaurantWebsite}
Email:          {restaurantEmail}

Thank you for choosing Tripti Genusswelt!

Best regards,
The Tripti Genusswelt Team`,
  ...RESTAURANT_DEFAULTS,
};

export const TEMPLATE_PLACEHOLDERS = [
  '{guestName}',
  '{reservationDate}',
  '{reservationTime}',
  '{partySize}',
  '{tableNumber}',
  '{roomNumber}',
  '{restaurantPhone}',
  '{restaurantEmail}',
  '{restaurantWebsite}',
];

/**
 * Generate a Gmail compose URL with pre-filled content
 */
export function generateGmailUrl({ to, subject, body }) {
  const params = new URLSearchParams();
  params.set('view', 'cm');
  params.set('fs', '1');
  params.set('to', to || '');
  params.set('su', subject || '');
  params.set('body', body || '');
  return `https://mail.google.com/mail/?${params.toString()}`;
}

let cachedTemplates = null;

/**
 * Load the saved email templates from PocketBase, falling back to defaults.
 */
export async function loadEmailTemplates() {
  try {
    const list = await pb.collection('email_templates').getList(1, 1, { $autoCancel: false });
    if (list.items.length > 0) {
      const rec = list.items[0];
      const merged = { ...DEFAULT_EMAIL_TEMPLATES };
      Object.keys(DEFAULT_EMAIL_TEMPLATES).forEach((key) => {
        if (rec[key] !== undefined && rec[key] !== null && rec[key] !== '') {
          merged[key] = rec[key];
        }
      });
      cachedTemplates = merged;
      return merged;
    }
  } catch (err) {
    console.error('Failed to load email templates', err);
  }
  return { ...DEFAULT_EMAIL_TEMPLATES };
}

function fillPlaceholders(text, values) {
  if (!text) return '';
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] !== undefined && values[key] !== null ? String(values[key]) : match;
  });
}

function buildValues(reservation, table, templates) {
  const guestName = reservation.guestName || 'Guest';
  const reservationDate = reservation.reservationDate
    ? format(new Date(reservation.reservationDate), 'EEEE, MMMM d, yyyy')
    : 'N/A';
  const reservationTime = reservation.reservationTime || 'N/A';
  const guests = reservation.numberOfGuests || reservation.partySize || 0;
  const partySize = `${guests} guest${guests !== 1 ? 's' : ''}`;
  const tableNumber = table?.name || 'To be assigned';
  const roomNumber = table?.room || 'To be assigned';

  return {
    guestName,
    reservationDate,
    reservationTime,
    partySize,
    tableNumber,
    roomNumber,
    restaurantPhone: templates.restaurantPhone || RESTAURANT_DEFAULTS.restaurantPhone,
    restaurantEmail: templates.restaurantEmail || RESTAURANT_DEFAULTS.restaurantEmail,
    restaurantWebsite: templates.restaurantWebsite || RESTAURANT_DEFAULTS.restaurantWebsite,
  };
}

/**
 * Open Gmail compose window using the saved (or default) template for the status.
 */
export async function openGmailCompose(reservation, status = 'pending', table = null) {
  // Open the window synchronously within the click gesture to avoid popup
  // blockers, then navigate it once the templates have loaded.
  const win = window.open('', '_blank', 'width=800,height=600');

  const templates = cachedTemplates || (await loadEmailTemplates());
  const values = buildValues(reservation, table, templates);

  let subjectTpl;
  let bodyTpl;
  switch (status) {
    case 'approved':
      subjectTpl = templates.approvedSubject;
      bodyTpl = templates.approvedBody;
      break;
    case 'declined':
      subjectTpl = templates.declinedSubject;
      bodyTpl = templates.declinedBody;
      break;
    case 'pending':
    default:
      subjectTpl = templates.pendingSubject;
      bodyTpl = templates.pendingBody;
      break;
  }

  const gmailUrl = generateGmailUrl({
    to: reservation.email || '',
    subject: fillPlaceholders(subjectTpl, values),
    body: fillPlaceholders(bodyTpl, values),
  });

  if (win) {
    win.location.href = gmailUrl;
  } else {
    window.open(gmailUrl, '_blank', 'width=800,height=600');
  }
}
