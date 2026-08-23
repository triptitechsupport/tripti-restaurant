import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import pb from '@/lib/pocketbaseClient.js';
import { getTranslation } from '@/lib/translations.js';
import { toast } from 'sonner';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    // Default to German ('de') if not set in localStorage
    return localStorage.getItem('language') || 'de';
  });
  
  const [isOrderingEnabled, setIsOrderingEnabledState] = useState(true);
  const [settingsId, setSettingsId] = useState(null);
  
  // Custom translations loaded from DB
  const [dbTranslations, setDbTranslations] = useState({});

  const fetchSettingsAndTranslations = useCallback(async () => {
    try {
      // 1. Fetch Order Settings
      const settingsRecords = await pb.collection('order_settings').getList(1, 1, { $autoCancel: false });
      if (settingsRecords.items.length > 0) {
        const settings = settingsRecords.items[0];
        setSettingsId(settings.id);
        setIsOrderingEnabledState(!!settings.isOrderingEnabled);
      }

      // 2. Fetch Translations from DB
      const transRecords = await pb.collection('translations').getFullList({ $autoCancel: false });
      const tMap = {};
      transRecords.forEach(record => {
        tMap[record.key] = {
          en: record.englishText || '',
          de: record.germanText || ''
        };
      });
      setDbTranslations(tMap);
    } catch (err) {
      console.error('[LanguageContext] Failed to fetch data from PocketBase:', err);
    }
  }, []);

  useEffect(() => {
    fetchSettingsAndTranslations();
  }, [fetchSettingsAndTranslations]);

  const setLanguage = (lang) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const setIsOrderingEnabled = async (enabled) => {
    setIsOrderingEnabledState(enabled);
    try {
      if (settingsId) {
        await pb.collection('order_settings').update(settingsId, {
          isOrderingEnabled: enabled
        }, { $autoCancel: false });
        toast.success(`Online ordering is now ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        // If no settings exist yet, create them
        const newSettings = await pb.collection('order_settings').create({
          isOrderingEnabled: enabled,
          ordersEnabled: enabled // Fallback/Sync for old logic if required
        }, { $autoCancel: false });
        setSettingsId(newSettings.id);
      }
    } catch (err) {
      console.error('Failed to update ordering settings:', err);
      toast.error('Failed to save ordering settings.');
    }
  };

  const t = useCallback((key) => {
    // Check DB translations first
    if (dbTranslations[key] && dbTranslations[key][language]) {
      return dbTranslations[key][language];
    }
    // Fallback to local file translations
    return getTranslation(language, key);
  }, [language, dbTranslations]);

  const refreshTranslations = () => {
    fetchSettingsAndTranslations();
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
      isOrderingEnabled, 
      setIsOrderingEnabled, 
      t,
      refreshTranslations
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}