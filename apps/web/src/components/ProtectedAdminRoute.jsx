import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Strict role-based route guard for every Admin page (Admin Dashboard,
// Admin Data Explorer, Admin Analysis, account management, place-order,
// menu management, etc.). Access requires a genuinely authenticated
// admin_users record in the default PocketBase auth store — NOT merely any
// logged-in user. Waiter, KDS, Stock Manager, and guest/customer sessions
// are never admin_users, so they are blocked here regardless of whether
// they reached this route via direct URL or in-app navigation.
//
// The AdminAuthContext now subscribes to pb.authStore.onChange(), and staff
// logins clear the default store, so a stale admin token cannot keep this
// guard open after a non-admin logs in.
export default function ProtectedAdminRoute({ children }) {
  const { isAdminAuthenticated, initialLoading } = useAuth();
  const location = useLocation();

  // Surface a clear, non-revealing unauthorized message exactly once when a
  // signed-in non-admin (or anonymous visitor) attempts to reach an admin
  // route. No sensitive information is exposed — only a generic notice.
  useEffect(() => {
    if (!initialLoading && !isAdminAuthenticated) {
      toast.error('Admin access required. Please sign in with an admin account.');
    }
  }, [initialLoading, isAdminAuthenticated, location.pathname]);

  if (initialLoading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not an admin → redirect to the admin login page (not the dashboard).
  // Admin Login is public, but waiter/KDS/stock credentials are not in
  // admin_users, so they cannot authenticate there either.
  if (!isAdminAuthenticated) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />;
  }

  return children;
}
