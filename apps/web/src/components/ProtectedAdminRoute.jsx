import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { Loader2 } from 'lucide-react';

export default function ProtectedAdminRoute({ children }) {
  const { isAdminAuthenticated, initialLoading } = useAuth();
  const location = useLocation();

  if (initialLoading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to home instead of login page if not authenticated
  if (!isAdminAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
}