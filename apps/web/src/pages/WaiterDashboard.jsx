import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { waiterPb } from '@/lib/staffClients.js';
import pbDefault from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { ConciergeBell, LogOut, Zap, Clock, LogIn, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import OrderPlacement from '@/components/OrderPlacement.jsx';
import StaffChat from '@/components/StaffChat.jsx';
import ContactKitchenButton from '@/components/ContactKitchenButton.jsx';
import {
  clockIn as tsClockIn,
  clockOut as tsClockOut,
  getActiveTimesheet,
  formatDuration,
} from '@/utils/timesheetService.js';
import { toast } from 'sonner';

export default function WaiterDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Authorization: a real waiter (waiter_users on the waiter auth store) OR
  // an authenticated admin (admin_users on the default auth store). Admins
  // reuse their own admin session/client — no duplicate waiter account or
  // separate waiter session is created. The effective `pb` client is the
  // waiter client for waiters and the default (admin) client for admins, so
  // all data operations carry the correct authenticated token.
  const waiterAuthModel = waiterPb.authStore.model || waiterPb.authStore.record;
  const adminAuthModel = pbDefault.authStore.model || pbDefault.authStore.record;
  const isWaiter = waiterPb.authStore.isValid && waiterAuthModel?.collectionName === 'waiter_users';
  const isAdmin = pbDefault.authStore.isValid && adminAuthModel?.collectionName === 'admin_users';
  const authed = isWaiter || isAdmin;
  const pb = isWaiter ? waiterPb : pbDefault;
  const authModel = isWaiter ? waiterAuthModel : adminAuthModel;
  const displayName = authModel?.displayName || authModel?.username || authModel?.name || authModel?.email || 'Waiter';
  const waiterId = authModel?.id;
  const orderPlacementRef = React.useRef(null);

  const [activeTimesheet, setActiveTimesheet] = useState(null);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!authed) {
      navigate('/waiter-login', { replace: true });
      return;
    }
    // Sync active timesheet state on mount.
    let cancelled = false;
    getActiveTimesheet(waiterId, pb)
      .then((rec) => {
        if (!cancelled) setActiveTimesheet(rec);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authed, navigate, waiterId, pb]);

  // When the WaiterHeader logo is clicked it navigates to
  // /waiter-dashboard?tab=place. Consume that here by switching
  // OrderPlacement to the "New Order" tab via its exposed ref handle.
  useEffect(() => {
    if (searchParams.get('tab') === 'place' && orderPlacementRef.current?.setTabToPlace) {
      orderPlacementRef.current.setTabToPlace();
    }
  }, [searchParams]);

  // Activate Waiter Mode: navigate to 'place' tab in OrderPlacement
  const handleWaiterMode = () => {
    if (orderPlacementRef.current && orderPlacementRef.current.setTabToPlace) {
      orderPlacementRef.current.setTabToPlace();
    }
  };

  const handleManualClockIn = async () => {
    if (!waiterId || timesheetLoading) return;
    setTimesheetLoading(true);
    try {
      const rec = await tsClockIn(waiterId, pb);
      setActiveTimesheet(rec);
      if (rec) toast.success(t('waiter_clockedIn'));
      else toast.error(t('waiter_clockedInFailed'));
    } catch (err) {
      console.error('[WaiterDashboard] manual clock-in failed', err);
      toast.error('Could not clock in');
    } finally {
      setTimesheetLoading(false);
    }
  };

  const handleManualClockOut = async () => {
    if (!waiterId || timesheetLoading) return;
    setTimesheetLoading(true);
    try {
      await tsClockOut(waiterId, pb);
      setActiveTimesheet(null);
      toast.success(t('waiter_clockedOut'));
    } catch (err) {
      console.error('[WaiterDashboard] manual clock-out failed', err);
      toast.error(t('waiter_clockedOutFailed'));
    } finally {
      setTimesheetLoading(false);
    }
  };

  // Logout is an EXPLICIT user action only. It is never triggered by device
  // sleep, backgrounding, visibility changes, or token refresh failures —
  // those events must not clear the waiter auth store (see Prompt 11
  // persistence). Only this function, wired to the Logout button, clears auth.
  const logout = async () => {
    // An admin viewing the Waiter Dashboard returns to the Admin Dashboard
    // without touching the admin's own auth session. Only real waiters go
    // through the full waiter logout (clock-out + auth clear) below.
    if (isAdmin) {
      navigate('/admin-dashboard', { replace: true });
      return;
    }
    // Automatic clock-out: close the active timesheet before clearing auth.
    if (waiterId) {
      try {
        await tsClockOut(waiterId, pb);
      } catch (err) {
        console.error('[WaiterDashboard] clock-out on logout failed', err);
      }
    }

    // Tear down any realtime subscriptions on the waiter client first so they
    // don't race the auth clear or fire errors after the store is emptied.
    try { pb.collection('kitchen_orders').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('waiter_orders').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('table_configurations').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('table_settings').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('menu_items').unsubscribe('*'); } catch (_) { /* ignore */ }

    // Fully clear the waiter auth store (token + model + localStorage).
    pb.authStore.clear();

    // In-app redirect.
    navigate('/waiter-login', { replace: true });

    // Safety net: if a still-mounted subscriber intercepts the navigate(),
    // force a hard redirect to the login page.
    setTimeout(() => {
      if (window.location.pathname !== '/waiter-login') {
        window.location.assign('/waiter-login');
      }
    }, 120);
  };

  // Live elapsed shift duration for the active timesheet.
  const [elapsedMin, setElapsedMin] = useState(null);
  useEffect(() => {
    if (!activeTimesheet?.clockIn) {
      setElapsedMin(null);
      return;
    }
    const tick = () => {
      const start = new Date(activeTimesheet.clockIn).getTime();
      setElapsedMin(Math.max(0, Math.round((Date.now() - start) / 60000)));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [activeTimesheet]);

  return (
    <>
      <Helmet>
        <title>Waiter Dashboard - Tripti Genusswelt</title>
      </Helmet>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-3 sm:px-4 py-3 flex items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <ConciergeBell className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
            <h1 className="text-base sm:text-xl font-serif font-bold shrink-0 hidden sm:block">{t('waiter_station')}</h1>
            <span className="text-sm sm:text-base opacity-90 truncate min-w-0 font-medium" title={displayName} aria-label={`Signed in as ${displayName}`}>
              {displayName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/admin-dashboard')}
                className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90"
                aria-label="Back to Admin Dashboard"
                title="Back to Admin Dashboard"
              >
                <ArrowLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden lg:inline">Admin</span>
              </Button>
            )}
            {/* Shift status + manual clock in/out (optional convenience) */}
            <div className="hidden md:flex items-center gap-2 mr-1 px-3 py-1.5 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-semibold notranslate" translate="no">
                {activeTimesheet
                  ? `${t('waiter_shift')} ${formatDuration(elapsedMin)}`
                  : t('waiter_notClockedIn')}
              </span>
            </div>
            {activeTimesheet ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManualClockOut}
                disabled={timesheetLoading}
                className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90"
                aria-label={t('waiter_clockOut')}
                title={t('waiter_clockOut')}
              >
                <LogIn className="h-4 w-4 sm:mr-1 rotate-180" />
                <span className="hidden lg:inline">{t('waiter_clockOut')}</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManualClockIn}
                disabled={timesheetLoading}
                className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90"
                aria-label={t('waiter_clockIn')}
                title={t('waiter_clockIn')}
              >
                <LogIn className="h-4 w-4 sm:mr-1" />
                <span className="hidden lg:inline">{t('waiter_clockIn')}</span>
              </Button>
            )}
            <ContactKitchenButton pbClient={pb} displayName={displayName} />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleWaiterMode}
              className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90"
              aria-label={t('waiter_mode')}
              title={t('waiter_mode')}
            >
              <Zap className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('waiter_mode')}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={logout}
              className="shrink-0 h-10 min-h-[44px] px-3 sm:px-4"
              aria-label={t('logout')}
            >
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </Button>
          </div>
        </header>

        <main className="p-4 max-w-6xl mx-auto">
          <OrderPlacement
            ref={orderPlacementRef}
            pbClient={pb}
            placedBy={displayName}
            placedByRole="waiter"
          />
        </main>
      </div>
      {authed && <StaffChat role="waiter" pbClient={pb} displayName={displayName} />}
    </>
  );
}
