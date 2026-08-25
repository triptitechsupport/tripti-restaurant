import React, { useEffect, useState } from 'react';
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
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import MarqueeBar from '@/components/MarqueeBar.jsx';

import HomePage from '@/pages/HomePage.jsx';
import MenuPage from '@/pages/MenuPage.jsx';
import TableReservationPage from '@/pages/TableReservationPage.jsx';
import ReservationConfirmationPage from '@/pages/ReservationConfirmationPage.jsx';
import ContactPage from '@/pages/ContactPage.jsx';
import CartPage from '@/pages/CartPage.jsx';
import CheckoutPage from '@/pages/CheckoutPage.jsx';
import OrderConfirmationPage from '@/pages/OrderConfirmationPage.jsx';
import AdminLoginPage from '@/pages/AdminLoginPage.jsx';
import KdsLoginPage from '@/pages/KdsLoginPage.jsx';
import WaiterLoginPage from '@/pages/WaiterLoginPage.jsx';
import KdsDashboard from '@/pages/KdsDashboard.jsx';
import WaiterDashboard from '@/pages/WaiterDashboard.jsx';
import AdminPlaceOrderPage from '@/pages/AdminPlaceOrderPage.jsx';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage.jsx';
import TermsOfServicePage from '@/pages/TermsOfServicePage.jsx';

// Dashboards & Admin
import AdminMenuPage from '@/pages/AdminMenuPage.jsx';
import AdminBookingDashboard from '@/pages/AdminBookingDashboard.jsx';
import AdminReservationApprovalPage from '@/pages/AdminReservationApprovalPage.jsx';
import GuestDashboard from '@/pages/GuestDashboard.jsx';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute.jsx';

// Subscriptions
import SubscriptionsPage from '@/pages/SubscriptionsPage.jsx';
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

function Layout() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const location = useLocation();
  // Waiter Station pages get a minimal header (logo + language switcher
  // only) instead of the full public restaurant header. All other routes
  // keep the public Header with its full nav, phone, Order Now, and cart.
  const isWaiterRoute = location.pathname.startsWith('/waiter-');

  return (
    <div className="flex flex-col min-h-screen">
      {isWaiterRoute ? <WaiterHeader /> : <Header setIsCartOpen={setIsCartOpen} />}
      <MarqueeBar />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <GlobalReservationNotifications />
      
      <div className="flex-1 flex flex-col">
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

          {/* Subscription Routes */}
          <Route path={LOGIN_PATH} element={<Navigate to="/" replace />} />
          <Route path={MANAGE_PATH} element={<SubscriptionsPage />} />
        </Routes>
      </div>
      
      <Footer />
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