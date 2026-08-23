import { useState, useEffect } from 'react';
import pb from '@/lib/pocketbaseClient.js';

export function useOrderSettings() {
  const [ordersEnabled, setOrdersEnabled] = useState(false);
  const [isOrderingEnabled, setIsOrderingEnabled] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchSettings = async () => {
      try {
        setLoading(true);
        // Using getList to safely attempt fetching without an explicit ID
        const result = await pb.collection('order_settings').getList(1, 1, {
          $autoCancel: false,
        });
        
        if (isMounted) {
          if (result.items.length > 0) {
            setOrdersEnabled(!!result.items[0].ordersEnabled);
            setIsOrderingEnabled(!!result.items[0].isOrderingEnabled);
            setStartTime(result.items[0].startTime || '');
            setEndTime(result.items[0].endTime || '');
          }
        }
      } catch (err) {
        console.warn('[useOrderSettings] Fetch failed. Using defaults. Details:', err.message || err);
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSettings();

    const subscribeToSettings = async () => {
      try {
        await pb.collection('order_settings').subscribe('*', (e) => {
          if (e.action === 'update' || e.action === 'create') {
            setOrdersEnabled(!!e.record.ordersEnabled);
            setIsOrderingEnabled(!!e.record.isOrderingEnabled);
            setStartTime(e.record.startTime || '');
            setEndTime(e.record.endTime || '');
          }
        });
      } catch (err) {
        console.warn('[useOrderSettings] Failed to subscribe to order_settings:', err.message || err);
      }
    };

    subscribeToSettings();

    return () => {
      isMounted = false;
      try {
        pb.collection('order_settings').unsubscribe('*');
      } catch (err) {
        console.warn('[useOrderSettings] Cleanup unsubscribe failed:', err.message || err);
      }
    };
  }, []);

  const canOrder = ordersEnabled || isOrderingEnabled;

  return { 
    ordersEnabled, 
    isOrderingEnabled,
    canOrder, // Exporting the combined OR logic explicitly
    startTime, 
    endTime, 
    loading, 
    error,
    settings: { ordersEnabled, isOrderingEnabled, canOrder, startTime, endTime }
  };
}