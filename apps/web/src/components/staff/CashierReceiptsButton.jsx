import React, { useState } from 'react';
import { Receipt, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { setBillingClient } from '@/lib/billingApi.js';
import useBackToClose from '@/hooks/useBackToClose.js';
import SettlementBillingView from '@/components/SettlementBillingView.jsx';

// Cashier: issue and print the signed (RKSV) receipt for each payment.
export default function CashierReceiptsButton({ client }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [open, setOpen] = useState(false);
  const show = (v) => {
    // Billing calls use the cashier's login while this sheet is open.
    setBillingClient(v ? client : null);
    setOpen(v);
  };
  useBackToClose(open, () => show(false));
  return (
    <>
      <Button variant="secondary" size="sm" className="touch-target px-2 sm:px-3" onClick={() => show(true)} title={en ? 'Receipts' : 'Belege'}>
        <Receipt className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">{en ? 'Receipts' : 'Belege'}</span>
      </Button>
      <Sheet open={open} onOpenChange={show}>
        <SheetContent side="right" className="receipts-sheet w-full sm:max-w-3xl lg:max-w-6xl p-0 flex flex-col gap-0 [&>button.absolute]:hidden">
          {/* Fixed top bar with a back button; only the content below scrolls. */}
          <div className="shrink-0 bg-primary text-primary-foreground" style={{ paddingTop: 'var(--app-top, 0px)' }}>
            <div className="flex items-center gap-2 px-2 py-2">
              <button type="button" onClick={() => show(false)} aria-label={en ? 'Back' : 'Zurück'}
                className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20">
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div className="min-w-0 text-left">
                <SheetTitle className="text-lg font-serif font-bold text-primary-foreground leading-tight">{en ? 'Receipts' : 'Belege'}</SheetTitle>
                <SheetDescription className="text-xs text-primary-foreground/80 leading-tight truncate">
                  {en ? 'Create and print the signed receipt for every payment.' : 'Für jede Zahlung den signierten Beleg erstellen und drucken.'}
                </SheetDescription>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-bottom, 0px)' }}>
            {open && <SettlementBillingView cashier />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
