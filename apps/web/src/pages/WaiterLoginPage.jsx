import React from 'react';
import { ConciergeBell } from 'lucide-react';
import StaffLogin from '@/components/StaffLogin.jsx';
import InstallWaiterApp from '@/components/InstallWaiterApp.jsx';
import { waiterPb } from '@/lib/staffClients.js';
import { clockIn } from '@/utils/timesheetService.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function WaiterLoginPage() {
  const { t } = useLanguage();
  // Automatic clock-in on successful waiter login. Creates a new active
  // timesheet (gracefully closing any stale one first). Failures are logged
  // but never block the login itself.
  const handleLoginSuccess = async (pbClient) => {
    const authModel = pbClient.authStore.model || pbClient.authStore.record;
    const waiterId = authModel?.id;
    if (waiterId) {
      await clockIn(waiterId, pbClient);
    }
  };

  return (
    <StaffLogin
      collection="waiter_users"
      title={t('waiter_loginTitle')}
      description={t('waiter_loginDesc')}
      redirectTo="/waiter-dashboard"
      icon={ConciergeBell}
      pbClient={waiterPb}
      onLoginSuccess={handleLoginSuccess}
      belowCard={<InstallWaiterApp />}
    />
  );
}
