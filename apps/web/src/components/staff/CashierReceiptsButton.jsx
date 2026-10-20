import React, { useState } from 'react';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { setBillingClient } from '@/lib/billingApi.js';
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
  return (
    <>
      <Button variant="secondary" size="sm" className="touch-target px-2 sm:px-3" onClick={() => show(true)} title={en ? 'Receipts' : 'Belege'}>
        <Receipt className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">{en ? 'Receipts' : 'Belege'}</span>
      </Button>
      <Sheet open={open} onOpenChange={show}>
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-6xl overflow-y-auto p-0">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle>{en ? 'Receipts' : 'Belege'}</SheetTitle>
            <SheetDescription>
              {en ? 'Create and print the signed receipt for every payment.' : 'Für jede Zahlung den signierten Beleg erstellen und drucken.'}
            </SheetDescription>
          </SheetHeader>
          {open && <SettlementBillingView cashier />}
        </SheetContent>
      </Sheet>
    </>
  );
}
