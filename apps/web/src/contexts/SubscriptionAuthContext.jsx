import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { getUserSubscriptions } from '@/api/InternalEcommerceSubscriptionsApi';

/**
 * Shipped subscription state container. Mirrors the current user's auth state
 * (via PocketBase by default) AND the user's subscription list (via the shipped
 * `getUserSubscriptions` API), so the shipped subscription components do not
 * depend on the agent-created `AuthContext.jsx`. The race condition where
 * shipped files import a useAuth that doesn't exist yet during early-stage
 * lint passes is eliminated.
 */
const SubscriptionAuthContext = createContext(null);

export function SubscriptionAuthProvider({ children }) {
	const [currentUser, setCurrentUser] = useState(() =>
		pb.authStore.isValid ? pb.authStore.model : null,
	);
	const [subscriptions, setSubscriptions] = useState([]);

	// Ref keeps the latest fetch function callable without re-triggering the
	// auth-listener useEffect on every render.
	const fetchSubscriptionsRef = useRef(null);
	fetchSubscriptionsRef.current = async () => {
		// Read standard PocketBase auth OR specific custom pb_auth key logic
		const pbAuthStr = localStorage.getItem('pb_auth');
		const hasValidToken = !!pbAuthStr || pb.authStore.isValid;

		if (!hasValidToken) {
			setSubscriptions([]);
			return [];
		}

		try {
			const res = await getUserSubscriptions();
			const list = res?.subscriptions ?? [];
			setSubscriptions(list);
			return list;
		} catch (err) {
			console.error('Failed to fetch subscriptions in context:', err);
			
			// Handle 401 gracefully by clearing auth token and state
			if (err.status === 401) {
				console.log('Received 401 Unauthorized, clearing auth state');
				pb.authStore.clear();
				localStorage.removeItem('pb_auth');
			}
			
			setSubscriptions([]);
			return [];
		}
	};

	useEffect(() => {
		fetchSubscriptionsRef.current();

		const unsubscribe = pb.authStore.onChange(() => {
			setCurrentUser(pb.authStore.isValid ? pb.authStore.model : null);
			if (pb.authStore.isValid) {
				fetchSubscriptionsRef.current();
			} else {
				setSubscriptions([]);
			}
		});
		return () => unsubscribe();
	}, []);

	// Post-checkout polling. SubscribeButton writes the `subscriptionPending`
	// flag to sessionStorage just before redirecting to Ecommerce API checkout. On
	// return (regardless of where Ecommerce API lands the user), this provider polls
	// every 2s for up to ~30s until an active/trialing subscription appears,
	// then clears the flag. Any consumer reading `subscriptions` auto-updates.
	const hasActiveSubscription = subscriptions.some(
		(s) => s && (s.status === 'active' || s.status === 'trialing'),
	);
	const [postCheckoutPending, setPostCheckoutPending] = useState(
		() =>
			typeof window !== 'undefined' &&
			sessionStorage.getItem('subscriptionPending') !== null,
	);
	const [pollingExhausted, setPollingExhausted] = useState(false);

	useEffect(() => {
		if (!postCheckoutPending) return undefined;
		if (hasActiveSubscription) {
			sessionStorage.removeItem('subscriptionPending');
			setPostCheckoutPending(false);
			return undefined;
		}
		let attempts = 0;
		const maxAttempts = 15;
		fetchSubscriptionsRef.current();
		const handle = setInterval(() => {
			attempts += 1;
			if (attempts >= maxAttempts) {
				clearInterval(handle);
				sessionStorage.removeItem('subscriptionPending');
				setPostCheckoutPending(false);
				setPollingExhausted(true);
				return;
			}
			fetchSubscriptionsRef.current();
		}, 2000);
		return () => clearInterval(handle);
	}, [postCheckoutPending, hasActiveSubscription]);

	const polling = postCheckoutPending && !hasActiveSubscription;
	const refreshSubscriptions = () => fetchSubscriptionsRef.current();
	const isAuthenticated = Boolean(currentUser);

	const value = {
		currentUser,
		isAuthenticated,
		subscriptions,
		refreshSubscriptions,
		polling,
		pollingExhausted,
	};

	return (
		<SubscriptionAuthContext.Provider value={value}>
			{children}
		</SubscriptionAuthContext.Provider>
	);
}

export function useSubscriptionAuth() {
	const context = useContext(SubscriptionAuthContext);
	if (!context) {
		throw new Error(
			'useSubscriptionAuth must be used within <SubscriptionAuthProvider>',
		);
	}
	return context;
}