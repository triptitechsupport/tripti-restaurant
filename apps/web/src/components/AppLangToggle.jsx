import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { isStaffApp } from '@/lib/staffApp.js';

// One tap switches English / Deutsch. Shown in the staff app's top bars,
// where the website's language switcher is not on screen.
export default function AppLangToggle({ className = '' }) {
  const { language, setLanguage } = useLanguage();
  if (!isStaffApp) return null;
  const next = language === 'en' ? 'de' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      className={`app-icon-btn app-lang ${className}`}
      aria-label={language === 'en' ? 'Deutsch' : 'English'}
    >
      <Languages className="h-4 w-4" />
      <span className="text-[11px] font-bold uppercase">{language}</span>
    </button>
  );
}
