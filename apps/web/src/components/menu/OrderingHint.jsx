import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Shown to signed-in admins only: explains why the menu has no order buttons.
export default function OrderingHint({ style }) {
  const { isAdminAuthenticated } = useAuth();
  const { isOrderingEnabled, language } = useLanguage();
  const en = language === 'en';
  if (!isAdminAuthenticated) return null;
  const off = !isOrderingEnabled;
  return (
    <div
      role="note"
      style={{
        margin: '0 auto 18px', maxWidth: 900, padding: '10px 14px', borderRadius: 10,
        border: '1px solid #e8c77a', background: '#fff6dc', color: '#5a3b12',
        fontFamily: 'Hind, system-ui, sans-serif', fontSize: '.92rem', lineHeight: 1.45, ...style,
      }}
    >
      {en ? (
        <>
          <strong>Only visible to admins: </strong>
          {off ? (
            <>Online ordering is <strong>switched off</strong>, so guests see no “Add” buttons. Switch it on under{' '}
              <Link to="/admin-dashboard" style={{ textDecoration: 'underline' }}>Admin → Orders → Settings</Link>.</>
          ) : (
            <>Online ordering is on. The order buttons are hidden here because you are signed in as admin.
              To test as a guest, open a private window or sign out.</>
          )}
        </>
      ) : (
        <>
          <strong>Nur für Admins sichtbar: </strong>
          {off ? (
            <>Online-Bestellung ist <strong>ausgeschaltet</strong>, darum sehen Gäste keine „Hinzufügen“-Knöpfe. Einschalten unter{' '}
              <Link to="/admin-dashboard" style={{ textDecoration: 'underline' }}>Admin → Bestellungen → Einstellungen</Link>.</>
          ) : (
            <>Online-Bestellung ist eingeschaltet. Weil Sie als Admin angemeldet sind, sind die Bestell-Knöpfe hier ausgeblendet.
              Zum Testen als Gast ein privates Fenster öffnen oder abmelden.</>
          )}
        </>
      )}
    </div>
  );
}
