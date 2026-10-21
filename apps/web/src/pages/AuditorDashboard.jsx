import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auditorPb } from '@/lib/staffClients.js';
import { setBillingClient } from '@/lib/billingApi.js';
import SettlementBillingView from '@/components/SettlementBillingView.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { isStaffApp } from '@/lib/staffApp.js';
import AppLangToggle from '@/components/AppLangToggle.jsx';

// Auditor: view payments and signed receipts, download the DEP7 export.
// Nothing here can change data; the billing API only allows them to read.
export default function AuditorDashboard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const en = language === 'en';
  const record = auditorPb.authStore.isValid ? (auditorPb.authStore.model || auditorPb.authStore.record) : null;
  const signedIn = record?.collectionName === 'auditor_users';

  // Set before the billing view's first request (child effects run first).
  if (signedIn) setBillingClient(auditorPb);
  useEffect(() => () => setBillingClient(null), []);

  if (!signedIn) return <Navigate to="/staff-login" replace />;

  const logout = () => {
    auditorPb.authStore.clear();
    navigate('/staff-login', { replace: true });
  };

  return (
    <>
      <Helmet><title>{en ? 'Auditor' : 'Prüfer'} - Tripti Genusswelt</title></Helmet>
      <main className="flex-1 bg-background">
        {isStaffApp && (
          <header className="app-bar sticky top-0 z-40 bg-primary text-primary-foreground px-3 py-3 flex items-center justify-between gap-2 shadow-md">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <div className="min-w-0 leading-tight">
                <h1 className="text-base font-bold truncate">{en ? 'Auditor' : 'Prüfer'}</h1>
                <p className="text-xs opacity-80 truncate">{record.displayName || record.username} · {en ? 'view only' : 'nur Ansicht'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AppLangToggle />
              <Button variant="secondary" size="sm" onClick={logout} className="h-10" aria-label={en ? 'Log out' : 'Abmelden'}><LogOut className="h-4 w-4" /></Button>
            </div>
          </header>
        )}
        <div className="max-w-7xl mx-auto">
          {!isStaffApp && <div className="flex items-center justify-between gap-3 px-4 md:px-6 pt-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <h1 className="text-2xl font-serif font-bold text-primary">{en ? 'Auditor' : 'Prüfer'}</h1>
                <p className="text-sm text-muted-foreground truncate">{record.displayName || record.username} · {en ? 'view only' : 'nur Ansicht'}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={logout} className="h-10 shrink-0" aria-label={en ? 'Log out' : 'Abmelden'}>
              <LogOut className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{en ? 'Log out' : 'Abmelden'}</span>
            </Button>
          </div>}
          <SettlementBillingView auditor />
        </div>
      </main>
    </>
  );
}
