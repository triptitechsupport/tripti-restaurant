import React, { Suspense, lazy, useEffect, useState } from 'react';
import NotFoundPage from '@/pages/NotFoundPage.jsx';
import { Route, Routes, BrowserRouter as Router, Navigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext.jsx';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext.jsx';
import { SubscriptionAuthProvider } from '@/contexts/SubscriptionAuthContext.jsx';
import { CartProvider } from '@/hooks/useCart.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import pb from '@/lib/pocketbaseClient.js';
import { AlertCircle } from 'lucide-react';

import Header from '@/components/Header.jsx';
import WaiterHeader from '@/components/WaiterHeader.jsx';
import KdsHeader from '@/components/KdsHeader.jsx';
import StockHeader from '@/components/StockHeader.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import MarqueeBar from '@/components/MarqueeBar.jsx';

import HomePage from '@/pages/HomePage.jsx';
import MenuPage from '@/pages/MenuPage.jsx';
import TableReservationPage from '@/pages/TableReservationPage.jsx';
const ReservationConfirmationPage = lazy(() => import('@/pages/ReservationConfirmationPage.jsx'));
import ContactPage from '@/pages/ContactPage.jsx';
import CartPage from '@/pages/CartPage.jsx';
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage.jsx'));
const OrderConfirmationPage = lazy(() => import('@/pages/OrderConfirmationPage.jsx'));
const AdminLoginPage = lazy(() => import('@/pages/AdminLoginPage.jsx'));
const KdsLoginPage = lazy(() => import('@/pages/KdsLoginPage.jsx'));
const WaiterLoginPage = lazy(() => import('@/pages/WaiterLoginPage.jsx'));
const KdsDashboard = lazy(() => import('@/pages/KdsDashboard.jsx'));
const WaiterDashboard = lazy(() => import('@/pages/WaiterDashboard.jsx'));
const AdminPlaceOrderPage = lazy(() => import('@/pages/AdminPlaceOrderPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage.jsx'));
const TermsOfServicePage = lazy(() => import('@/pages/TermsOfServicePage.jsx'));

// Dashboards & Admin
const AdminMenuPage = lazy(() => import('@/pages/AdminMenuPage.jsx'));
const AdminBookingDashboard = lazy(() => import('@/pages/AdminBookingDashboard.jsx'));
const AdminReservationApprovalPage = lazy(() => import('@/pages/AdminReservationApprovalPage.jsx'));
const GuestDashboard = lazy(() => import('@/pages/GuestDashboard.jsx'));
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute.jsx';
const WaiterHelpPage = lazy(() => import('@/pages/WaiterHelpPage.jsx'));
const AdminHelpPage = lazy(() => import('@/pages/AdminHelpPage.jsx'));
const StockLoginPage = lazy(() => import('@/pages/StockLoginPage.jsx'));
const StockDashboard = lazy(() => import('@/pages/StockDashboard.jsx'));
const StockHelpPage = lazy(() => import('@/pages/StockHelpPage.jsx'));

// Subscriptions
const SubscriptionsPage = lazy(() => import('@/pages/SubscriptionsPage.jsx'));
import WhatsAppButton from '@/components/WhatsAppButton.jsx';
import GlobalReservationNotifications from '@/components/GlobalReservationNotifications.jsx';
import { LOGIN_PATH, MANAGE_PATH } from '@/config/subscriptionRoutes.js';

// Global Connection Monitor Component
function ConnectionMonitor() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let intervalId;

    const checkConnection = async () => {
      try {
        await pb.health.check({ $autoCancel: false });
        setIsOffline(false);
      } catch (error) {
        console.error('[Diagnostic - App] Backend connection lost:', error);
        setIsOffline(true);
      }
    };

    checkConnection();
    intervalId = setInterval(checkConnection, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm shadow-md animate-in slide-in-from-top-full duration-300">
      <AlertCircle className="w-4 h-4" />
      <span className="font-medium">Connection to server lost. Attempting to reconnect...</span>
    </div>
  );
}

// Staff, admin and checkout pages load only when opened, so guests on phones
// download far less code for the home page and menu.
function PageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center py-24" role="status" aria-live="polite">
      <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

function Layout() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const location = useLocation();
  // Waiter Station pages get a minimal header (logo + language switcher
  // only) instead of the full public restaurant header. All other routes
  // keep the public Header with its full nav, phone, Order Now, and cart.
  const isWaiterRoute = location.pathname.startsWith('/waiter-');
  const isKdsRoute = location.pathname.startsWith('/kds-');
  const isStockRoute = location.pathname.startsWith('/stock-');
  const isAdminDashboardRoute = location.pathname === '/admin-dashboard'
    || location.pathname === '/admin-booking-dashboard'
    || location.pathname === '/admin'
    || location.pathname === '/admin-help'
    || location.pathname.startsWith('/admin/');
  const showFooter = !isWaiterRoute && !isKdsRoute && !isStockRoute && !isAdminDashboardRoute;

  return (
    <div className="flex flex-col min-h-screen">
      {isWaiterRoute ? <WaiterHeader /> : isKdsRoute ? <KdsHeader /> : isStockRoute ? <StockHeader /> : <Header setIsCartOpen={setIsCartOpen} />}
      <MarqueeBar />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <GlobalReservationNotifications />
      
      <div className="flex-1 flex flex-col">
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          
          <Route path="/table-reservation" element={<TableReservationPage />} />
          <Route path="/reservations" element={<Navigate to="/table-reservation" replace />} />
          {/* Changed :id to :code for new reservation ID system */}
          <Route path="/reservation-confirmation/:code" element={<ReservationConfirmationPage />} />
          
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation/:id" element={<OrderConfirmationPage />} />
          
          {/* Admin Login (Publicly accessible) */}
          <Route path="/admin-login" element={<AdminLoginPage />} />

          {/* KDS & Waiter Login + Dashboards */}
          <Route path="/kds-login" element={<KdsLoginPage />} />
          <Route path="/kds-dashboard" element={<KdsDashboard />} />
          <Route path="/waiter-login" element={<WaiterLoginPage />} />
          <Route path="/waiter-dashboard" element={<WaiterDashboard />} />
          <Route path="/waiter-help" element={<WaiterHelpPage />} />

          {/* Stock & Waste Management Login + Dashboard */}
          <Route path="/stock-login" element={<StockLoginPage />} />
          <Route path="/stock-dashboard" element={<StockDashboard />} />
          <Route path="/stock-help" element={<StockHelpPage />} />
          
          {/* Unprotected Dashboard Routes */}
          <Route path="/guest-dashboard" element={<GuestDashboard />} />
          
          {/* Protected Admin Routes */}
          <Route 
            path="/admin-dashboard" 
            element={
              <ProtectedAdminRoute>
                <AdminBookingDashboard />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <ProtectedAdminRoute>
                <AdminBookingDashboard />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin/place-order" 
            element={
              <ProtectedAdminRoute>
                <AdminPlaceOrderPage />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin/menu" 
            element={
              <ProtectedAdminRoute>
                <AdminMenuPage />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin/bookings" 
            element={
              <ProtectedAdminRoute>
                <AdminBookingDashboard />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin/reservations" 
            element={
              <ProtectedAdminRoute>
                <AdminReservationApprovalPage />
              </ProtectedAdminRoute>
            } 
          />
          <Route 
            path="/admin-help" 
            element={
              <ProtectedAdminRoute>
                <AdminHelpPage />
              </ProtectedAdminRoute>
            } 
          />

          {/* Subscription Routes */}
          <Route path={LOGIN_PATH} element={<Navigate to="/" replace />} />
          <Route path={MANAGE_PATH} element={<SubscriptionsPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </div>
      
      {showFooter ? <Footer /> : null}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AdminAuthProvider>
        <LanguageProvider>
          <SubscriptionAuthProvider>
            <CartProvider>
              <ScrollToTop />
              <Routes>
                <Route
                  path="*"
                  element={
                    <>
                      <ConnectionMonitor />
                      <Layout />
                      <WhatsAppButton />
                    </>
                  }
                />
              </Routes>
            </CartProvider>
          </SubscriptionAuthProvider>
        </LanguageProvider>
      </AdminAuthProvider>
    </Router>
  );
}

export default App;