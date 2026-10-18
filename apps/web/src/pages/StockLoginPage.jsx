import React from 'react';
import { PackageCheck } from 'lucide-react';
import StaffLogin from '@/components/StaffLogin.jsx';
import { stockPb } from '@/lib/staffClients.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function StockLoginPage() {
  const { t } = useLanguage();
  return (
    <StaffLogin
      collection="stock_users"
      title={t('stock_loginTitle')}
      description={t('stock_loginDesc')}
      redirectTo="/stock-dashboard"
      icon={PackageCheck}
      pbClient={stockPb}
    />
  );
}
