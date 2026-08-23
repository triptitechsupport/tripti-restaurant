import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient.js';

const AdminAuthContext = createContext();

export function AdminAuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Initial check from local store
    if (pb.authStore.isValid) {
      setCurrentUser(pb.authStore.model);
    } else {
      setCurrentUser(null);
    }
    setInitialLoading(false);

    // Explicitly REMOVED pb.authStore.onChange() and pb.collection().subscribe() 
    // to prevent ClientResponseError 0 related to real-time connections dropping.
    // Auth state relies purely on manual updates during login/logout actions.
  }, []);

  // Admin login via admin_users collection
  const adminLogin = async (email, password) => {
    const authData = await pb.collection('admin_users').authWithPassword(email, password, { $autoCancel: false });
    setCurrentUser(authData.record);
    return authData;
  };

  // Standard login via users collection (if needed for fallback/consistency)
  const login = async (email, password) => {
    try {
      return await adminLogin(email, password);
    } catch (err) {
      // Fallback to regular user login if admin fails, for generic usage
      const authData = await pb.collection('users').authWithPassword(email, password, { $autoCancel: false });
      setCurrentUser(authData.record);
      return authData;
    }
  };

  // General signup function to fulfill requirements
  const signup = async (email, password, passwordConfirm = password) => {
    const record = await pb.collection('users').create({ 
      email, 
      password, 
      passwordConfirm 
    }, { $autoCancel: false });
    return record;
  };

  // New OTP Flow: Request OTP
  const requestOTP = async (email) => {
    try {
      console.log(`[OTP Flow] Initiating OTP request for email: ${email}`);
      
      if (!email) {
        throw new Error('Email parameter is missing or invalid.');
      }

      console.log(`[OTP Flow] Calling pb.collection('users').requestOTP('${email}')`);
      const result = await pb.collection('users').requestOTP(email, { $autoCancel: false });
      
      console.log(`[OTP Flow] Successfully requested OTP. Received OTP ID: ${result.otpId}`);
      return { success: true, otpId: result.otpId };
    } catch (error) {
      console.error('[OTP Flow] Failed to request OTP:', error);
      throw error;
    }
  };

  // New OTP Flow: Verify OTP
  const verifyOTP = async (otpId, code) => {
    const authData = await pb.collection('users').authWithOTP(otpId, code, { $autoCancel: false });
    setCurrentUser(authData.record);
    return authData;
  };

  // Legacy guest methods preserved for backward compatibility
  const requestGuestOTP = requestOTP;
  const guestOtpLogin = verifyOTP;

  const logout = () => {
    pb.authStore.clear();
    setCurrentUser(null);
    navigate('/', { replace: true });
  };

  const currentAdmin = currentUser?.collectionName === 'admin_users' ? currentUser : null;
  const currentGuest = (currentUser?.collectionName === 'users' || currentUser?.collectionName === 'guests') ? currentUser : null;
  
  const isAdminAuthenticated = Boolean(currentAdmin);
  const isGuestAuthenticated = Boolean(currentGuest);
  const isAuthenticated = Boolean(currentUser);
  
  const userRole = currentAdmin ? 'admin' : (currentGuest ? 'guest' : null);

  return (
    <AdminAuthContext.Provider value={{ 
      currentUser, 
      currentAdmin,
      currentGuest,
      isAuthenticated,
      isAdminAuthenticated, 
      isGuestAuthenticated,
      userRole,
      login, 
      adminLogin, 
      signup,
      requestOTP,
      verifyOTP,
      requestGuestOTP, 
      guestOtpLogin,   
      logout, 
      initialLoading 
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AdminAuthProvider');
  }
  return context;
}