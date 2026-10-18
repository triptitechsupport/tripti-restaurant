import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient.js';

const AdminAuthContext = createContext();

export function AdminAuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Sync the React state with the PocketBase auth store. We subscribe to
    // pb.authStore.onChange() — a LOCAL, synchronous event (no network/realtime
    // call) — so the context stays in sync when the store is cleared elsewhere
    // (e.g. a staff login clearing a stale admin session). Without this, a
    // stale admin_users model could keep `isAdminAuthenticated` true even
    // after the underlying token was cleared, letting a non-admin reach admin
    // pages. The earlier ClientResponseError 0 came from realtime
    // subscriptions, not from authStore.onChange, so this is safe.
    const syncFromStore = () => {
      const model = pb.authStore.isValid ? (pb.authStore.model || pb.authStore.record) : null;
      setCurrentUser(model);
    };

    syncFromStore();
    setInitialLoading(false);

    const unsubscribe = pb.authStore.onChange(syncFromStore);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Admin login via admin_users collection.
  // Identity is email only. Trim it so a trailing space from autofill does
  // not fail a valid password. The SDK attaches any saved token to this
  // request; an expired token is rejected before the password is checked,
  // which looks like a bad password. Clear the shared store first. Waiter,
  // KDS, and stock sessions use their own stores and stay signed in.
  const adminLogin = async (email, password) => {
    const identity = String(email || '').trim().toLowerCase();
    const secret = String(password || '');
    if (!identity || !secret) {
      const missing = new Error('Missing credentials');
      missing.status = 400;
      throw missing;
    }

    if (pb.authStore.token) {
      pb.authStore.clear();
    }

    const authData = await pb.collection('admin_users').authWithPassword(identity, secret, { $autoCancel: false });
    const record = authData?.record;
    // A successful auth against admin_users is enough. Do not reject it when
    // the API omits collectionName — that used to look like a bad password.
    if (!record || (record.collectionName && record.collectionName !== 'admin_users')) {
      pb.authStore.clear();
      setCurrentUser(null);
      const rejected = new Error('Not an admin account');
      rejected.status = 403;
      throw rejected;
    }
    if (!record.collectionName) {
      record.collectionName = 'admin_users';
      if (authData.token) pb.authStore.save(authData.token, record);
    }
    setCurrentUser(record);
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