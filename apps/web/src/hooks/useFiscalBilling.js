import {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import {billingApi} from '@/lib/billingApi.js';
export const fiscalStatusLabel = t => {
  if (t?.status === 'queued' && t.fallbackReceipt) return 'Outage receipt available — signing queued';
  return {pending: 'Processing', queued: 'Queued — retry scheduled', signed: 'Generated', outage: 'Issued — SCU outage', failed: 'Failed', superseded: 'Rejected attempt released'}[t?.status] || 'Not Generated';
};
export const paymentOptions = ['CASH','CARD','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','ONLINE','NEXI','ONLINEBON','PAYPAL'];
export default function useFiscalBilling() {
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const [payments, setPayments] = useState({});
  const [registerChoices, setRegisterChoices] = useState({});
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [data, config] = await Promise.all([billingApi('/transactions'), billingApi('/configuration')]);
      setTransactions(data.transactions);
      setTransactionsLoaded(true);
      setConfiguration(config);
      setError(config.readiness?.issues?.length ? config.readiness.issues.join(' ') : '');
    }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);
  const transactionFor = order => transactions.find(t => (order.settlementId ? t.settlement === order.settlementId : t.order === order.id && !t.settlement) && t.receiptType === 'NORMAL' && t.status !== 'superseded');
  const paymentFor = order => transactionFor(order)?.paymentType || payments[order.id] || 'CASH';
  const registerFor = order => transactionFor(order)?.cashRegister || registerChoices[order.id] ||
    configuration?.registers?.find(r => r.isDefault && r.enabledForBilling)?.id ||
    configuration?.registers?.find(r => r.fiskalyCashRegisterId === configuration.registerId && r.enabledForBilling)?.id || "";
  async function generate(order, receiptType = 'NORMAL') {
    if (receiptType === 'NORMAL' && !window.confirm(`Generate the receipt for ${order.settlementNumber || order.orderId}? The saved items will be fiscalized.`)) return;
    setBusy(order.id);
    try {
      const data = await billingApi(order.settlementId ? `/settlements/${order.settlementId}/generate` : `/orders/${order.id}/generate`, {paymentType: paymentFor(order), receiptType, cashRegisterId: registerFor(order)});
      setTransactions(prev => [data.transaction, ...prev.filter(t => t.id !== data.transaction.id)]);
      toast.success('Receipt saved for generation.');
      await refresh();
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function retry(t) {
    setBusy(t.settlement || t.order);
    try { await billingApi(`/transactions/${t.id}/retry`, {}); await refresh(); }
    catch (e) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function cancel(t) {
    const reason = window.prompt('Reason for cancelling this entire receipt? A separate negative cancellation receipt will be issued.');
    if (!reason?.trim()) return;
    setBusy(t.settlement || t.order);
    try { await billingApi(`/transactions/${t.id}/cancel`, {reason}); await refresh(); toast.success('Cancellation saved for generation.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function recover(t) {
    const reason = window.prompt(t.receiptType === 'NORMAL'
      ? 'Release this rejected bill so the order can be corrected and billed again? Fiskaly must first confirm that no receipt exists. The failed attempt stays in history. Enter a reason:'
      : 'Release this rejected attempt so it can be created again? The original sale stays locked. Fiskaly must first confirm that no receipt exists. Enter a reason:');
    if (!reason?.trim()) return;
    setBusy(t.settlement || t.order);
    try {
      const result = await billingApi(`/transactions/${t.id}/recover`, {reason: reason.trim()});
      toast.success(result.outcome === 'reconciled' ? 'An existing receipt was recovered. The order remains locked.' : 'Rejected attempt released. Correct the details and generate again.');
    } catch (e) { toast.error(e.message); }
    finally { await refresh(); setBusy(null); }
  }
  return {transactions, transactionsLoaded, configuration, transactionFor, paymentFor, setPayments, registerFor, setRegisterChoices, busy, generate, retry, cancel, recover, refresh, preview, setPreview, error};
}
