import db from '../utils/pocketbaseClient.js';
import {createBillingService} from './billingService.js';
import {createFiscalLifecycle} from './fiscalLifecycle.js';
export const billing = createBillingService({db});
export const lifecycle = createFiscalLifecycle({exclusive: billing.exclusive, pending: async registerId => {
  const transactions = await db.collection('fiskaly_transactions').getFullList({
    filter: 'status = "pending" || status = "queued" || status = "failed"'});
  if (!registerId) return transactions.length > 0;
  for (const transaction of transactions) {
    const register = await db.collection('cash_registers').getOne(transaction.cashRegister);
    if (register.fiskalyCashRegisterId === registerId) return true;
  }
  return false;
}});
