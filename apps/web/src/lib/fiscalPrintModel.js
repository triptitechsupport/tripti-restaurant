// Explicitly select the retained outage copy even after the transaction signs.
export function fiscalPrintModel(transaction) {
  if (!transaction) return null;
  if (transaction.printVariant !== 'fallback') return {...transaction, isFallback: false};
  const copy = transaction.fallbackReceipt;
  if (!copy?.qrCodeData || !copy?.receiptSnapshot) return null;
  return {
    isFallback: true,
    status: 'fallback',
    receiptType: copy.receiptType,
    orderId: copy.orderId,
    amount: copy.amount,
    paymentType: copy.paymentType,
    signedAt: copy.issuedAt,
    localReference: copy.reference,
    receiptSnapshot: copy.receiptSnapshot,
    qrCodeData: copy.qrCodeData,
    responsePayload: {_env: copy.environment, hints: [copy.notice]},
  };
}
