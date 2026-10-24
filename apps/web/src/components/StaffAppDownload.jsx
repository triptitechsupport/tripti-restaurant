import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Download } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Where the newest Tripti Staff APK is published by the GitHub build.
export const STAFF_APP_URL = 'https://github.com/triptitechsupport/tripti-restaurant/releases/download/staff-app-latest/tripti-staff.apk';

const T = {
  de: {
    title: 'Tripti Staff App (Android)',
    desc: 'Eine App für alle: Admin, Service, Kasse, Küche, Küchenleitung, Lager und Prüfer. Nach der Anmeldung öffnet sich automatisch der eigene Arbeitsbereich.',
    steps: ['QR-Code mit dem Handy oder Tablet scannen (oder den Link öffnen).', '„tripti-staff.apk“ herunterladen und öffnen.', 'Einmalig „Installation aus unbekannten Quellen“ erlauben.', 'App „Tripti Staff“ öffnen und mit Benutzername und Passwort anmelden.'],
    download: 'APK herunterladen',
  },
  en: {
    title: 'Tripti Staff app (Android)',
    desc: 'One app for everyone: admin, waiter, cashier, kitchen, kitchen manager, stock and auditor. After signing in, each person lands on their own screen.',
    steps: ['Scan the QR code with the phone or tablet (or open the link).', 'Download "tripti-staff.apk" and open it.', 'Allow "install unknown apps" once.', 'Open "Tripti Staff" and sign in with username and password.'],
    download: 'Download APK',
  },
};

export default function StaffAppDownload({ compact = false }) {
  const { language } = useLanguage();
  const tx = T[language === 'en' ? 'en' : 'de'];
  return (
    <div className="bg-card border-2 border-border rounded-2xl p-5 shadow-md flex flex-col sm:flex-row gap-5 items-start">
      <div className="bg-white p-3 rounded-xl border shrink-0 self-center">
        <QRCodeSVG value={STAFF_APP_URL} size={compact ? 120 : 150} />
      </div>
      <div className="space-y-3 min-w-0">
        <h3 className="flex items-center gap-2 text-lg font-bold text-primary"><Smartphone className="h-5 w-5" />{tx.title}</h3>
        <p className="text-sm text-muted-foreground">{tx.desc}</p>
        {!compact && (
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {tx.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        )}
        <a href={STAFF_APP_URL} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          <Download className="h-4 w-4" />{tx.download}
        </a>
      </div>
    </div>
  );
}
