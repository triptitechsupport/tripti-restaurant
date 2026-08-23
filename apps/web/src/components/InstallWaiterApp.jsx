import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, CheckCircle2, Share } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

/**
 * Install prompt for the "Tripti Genusswelt - Waiter" app.
 * Uses the native beforeinstallprompt event on Android/Chrome so the waiter
 * dashboard installs to the home screen as a standalone, native-like app.
 * Falls back to manual instructions when the browser doesn't expose the event.
 */
export default function InstallWaiterApp() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) setInstalled(true);

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowHelp((v) => !v);
    }
  };

  if (installed) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        {t('iwa_installed')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-secondary/50 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">{t('iwa_installTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('iwa_installDesc')}
          </p>
        </div>
      </div>

      <Button
        onClick={handleInstall}
        className="mt-3 w-full min-h-touch gap-2"
        size="lg"
      >
        <Download className="h-4 w-4" />
        {deferredPrompt ? t('iwa_installBtn') : t('iwa_howToInstall')}
      </Button>

      {showHelp && !deferredPrompt && (
        <div className="mt-3 space-y-2 rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <Share className="h-3.5 w-3.5" /> {t('iwa_android')}
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>{t('iwa_androidStep1')}</li>
            <li>{t('iwa_androidStep2')}</li>
            <li>{t('iwa_androidStep3')}</li>
          </ol>
          <p className="flex items-center gap-1.5 pt-1 font-semibold text-foreground">
            <Share className="h-3.5 w-3.5" /> {t('iwa_iphone')}
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>{t('iwa_iphoneStep1')}</li>
            <li>{t('iwa_iphoneStep2')}</li>
          </ol>
        </div>
      )}
    </div>
  );
}
