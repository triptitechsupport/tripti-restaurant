import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { DELAYED_BADGE_CLS } from '@/lib/kotDelayed.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Reusable "Delayed" indicator pill shown on KOT cards in KDS, Waiter, and
// Admin. Uses the shared delayed-state styling so the indicator is visually
// consistent across all three interfaces.
export default function KotDelayedBadge({ className = '', pulse = true }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${DELAYED_BADGE_CLS} ${pulse ? 'animate-pulse' : ''} ${className}`}
      title={t('kot_delayedTitle')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" /> {t('kot_delayed')}
    </span>
  );
}
