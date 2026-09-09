// This is an outage notice QR, not an invented RKSV signature/receipt number.
// https://workspace.fiskaly.com/countries/austria/faq/sign-at-what-happens-if-i-cannot-reach-the-sign-at-api-4961028134546/
export const OUTAGE_NOTICE = 'Sicherheitseinrichtung ausgefallen';

export function buildFallbackReceipt(transaction, environment, issuedAt = new Date().toISOString()) {
  if (!transaction.fiskalyReceiptId || !transaction.receiptSnapshot?.lines?.length)
    throw new Error('Cannot retain an outage receipt without its UUID and receipt snapshot.');
  return {
    version: 1,
    environment,
    issuedAt,
    reference: `OUT-${transaction.fiskalyReceiptId}`,
    notice: OUTAGE_NOTICE,
    qrCodeData: OUTAGE_NOTICE,
    receiptType: transaction.receiptType,
    orderId: transaction.orderId,
    paymentType: transaction.paymentType,
    amount: transaction.amount,
    receiptSnapshot: structuredClone(transaction.receiptSnapshot),
  };
}
