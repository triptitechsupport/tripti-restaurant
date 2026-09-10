import db from '../utils/pocketbaseClient.js';
import {createBillingService} from './billingService.js';
import {createFiscalLifecycle} from './fiscalLifecycle.js';
import {createCashRegisters} from './cashRegisters.js';
export const billing = createBillingService({db, resolveRegister: id => registers.forBilling(id)});
const pending = async registerId => {
  const transactions = await db.collection('fiskaly_transactions').getFullList({
    filter: 'status = "pending" || status = "queued" || status = "failed"'});
  if (!registerId) return transactions.length > 0;
  for (const transaction of transactions) {
    const register = await db.collection('cash_registers').getOne(transaction.cashRegister);
    if (register.fiskalyCashRegisterId === registerId) return true;
  }
  return false;
};
export const registers = createCashRegisters({db, exclusive: billing.exclusive, pending});
export const lifecycle = createFiscalLifecycle({exclusive: billing.exclusive, pending});
