import React from 'react';
import { Banknote } from 'lucide-react';
import StaffLogin from '@/components/StaffLogin.jsx';
import { waiterPb } from '@/lib/staffClients.js';
import { clockIn } from '@/utils/timesheetService.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Cashiers are service logins with the role "cashier" (created by the admin).
// They use the service screen, which adds the Receipts button for them.
export default function CashierLoginPage() {
  const { t } = useLanguage();
  const handleLoginSuccess = async (pbClient) => {
    const model = pbClient.authStore.model || pbClient.authStore.record;
    if (model?.id) await clockIn(model.id, pbClient);
  };
  return (
    <StaffLogin
      collection="waiter_users"
      title={t('cashier_loginTitle')}
      description={t('cashier_loginDesc')}
      redirectTo="/waiter-dashboard"
      icon={Banknote}
      pbClient={waiterPb}
      onLoginSuccess={handleLoginSuccess}
    />
  );
}
