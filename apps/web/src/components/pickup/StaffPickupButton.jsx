import React, { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import PickupOrdersBoard from './PickupOrdersBoard.jsx';
import usePickupWatch from './usePickupWatch.js';

// Header button for the kitchen and service screens: shows how many online
// pickup orders are coming up and opens the list.
export default function StaffPickupButton({ client, role, manager = false, sound = true, days = 2 }) {
  const [open, setOpen] = useState(false);
  const { count, unseen, reload } = usePickupWatch(client, { days, sound });
  const { language } = useLanguage();
  const en = language === 'en';
  const label = role === 'kds' ? (en ? 'Pre-orders' : 'Vorbestellungen') : (en ? 'Pickups' : 'Abholungen');
  const alert = role === 'kds' ? unseen > 0 : false;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={`touch-target px-2 sm:px-3 relative ${alert ? 'ring-2 ring-amber-300 animate-pulse' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`${label} (${count})`}
        title={label}
      >
        <ShoppingBag className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">{label}</span>
        {count > 0 && (
          <span className="ml-1 rounded-full bg-amber-400 text-amber-950 text-xs font-bold px-1.5 min-w-[1.25rem] text-center">{count}</span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reload(); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-5xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{role === 'kds' ? (en ? 'Pickup pre-orders' : 'Vorbestellungen zur Abholung') : label}</SheetTitle>
            <SheetDescription>
              {role === 'kds'
                ? (en
                  ? 'Online orders for the next days. The ticket reaches the screen automatically in time; “Start now” sends it at once.'
                  : 'Online-Bestellungen der nächsten Tage. Das Ticket kommt automatisch rechtzeitig auf den Bildschirm; mit „Jetzt starten“ sofort.')
                : (en
                  ? 'Online orders for pickup. Guests pay at the till under “Active” with the number AB-….'
                  : 'Online-Bestellungen zur Abholung. Bezahlt wird an der Kasse unter „Aktiv“ mit der Nummer AB-….')}
            </SheetDescription>
          </SheetHeader>
          {open && <PickupOrdersBoard client={client} role={role} manager={manager} silent />}
        </SheetContent>
      </Sheet>
    </>
  );
}
