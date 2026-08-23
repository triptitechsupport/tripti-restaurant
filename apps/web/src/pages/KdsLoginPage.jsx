import React from 'react';
import { ChefHat } from 'lucide-react';
import StaffLogin from '@/components/StaffLogin.jsx';
import { kdsPb } from '@/lib/staffClients.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function KdsLoginPage() {
  const { t } = useLanguage();
  return (
    <StaffLogin
      collection="kds_users"
      title={t('kds_loginTitle')}
      description={t('kds_loginDesc')}
      redirectTo="/kds-dashboard"
      icon={ChefHat}
      pbClient={kdsPb}
    />
  );
}
