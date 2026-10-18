// Shared KOT print-options dialog.
//
// Presented wherever a user manually initiates a KOT print (Waiter / Admin
// place-order / KDS reprint). It offers the "Separate categories for
// cutting" option (default off — preserves the original continuous category
// layout) and, on confirm, calls `printKOT(order, { separateCategories })`
// from the existing kotPrint.js iframe flow. An optional `onPrinted(order,
// options)` callback is invoked after the print is dispatched so callers can
// record print-tracking metadata (printedAt / printCount) exactly as before.
//
// When `alreadyPrinted` is true, an informational note is shown (replacing
// the separate duplicate-warning dialogs) so the user knows they are
// reprinting an already-sent ticket. When `printAllowed` is false, the Print
// action is disabled with an explanatory message — mirroring the existing
// admin print-permission gate.
//
// Auto-print paths (no user interaction) bypass this dialog and use the
// default option values, preserving current behavior.

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Printer, AlertTriangle } from 'lucide-react';
import { printKOT, resolveOrderId } from '@/lib/kotPrint.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

function KotPrintOptionsDialog({
  open,
  order,
  onClose,
  onPrinted,
  alreadyPrinted = false,
  printAllowed = true,
  busy = false,
}) {
  const { t } = useLanguage();
  const [separateCategories, setSeparateCategories] = useState(true);

  // Start manual prints with category cut separators enabled. The checkbox
  // remains available when a continuous ticket is preferred, and the choice
  // is reset for every fresh print so it cannot leak into the next ticket.
  useEffect(() => {
    if (open) setSeparateCategories(true);
  }, [open, order && order.id]);

  const handlePrint = () => {
    if (!order || !printAllowed) return;
    const options = { separateCategories };
    printKOT(order, options);
    if (typeof onPrinted === 'function') onPrinted(order, options);
    onClose();
  };

  const kotLabel = order ? resolveOrderId(order) : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md w-[92vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary shrink-0" /> {t('kot_printOptionsTitle')}
          </DialogTitle>
          <DialogDescription className="text-left">
            {order
              ? `${t('kot_printOptionsDesc')}${kotLabel ? ` · #${kotLabel}` : ''}${order.tableNumber ? ` · ${order.tableNumber}` : ''}`
              : t('kot_printOptionsDesc')}
          </DialogDescription>
        </DialogHeader>

        {alreadyPrinted ? (
          <div className="flex items-start gap-2 rounded-md border border-secondary/50 bg-secondary/10 px-3 py-2 text-sm text-primary">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-secondary" />
            <span>{t('kot_alreadySentNote')}</span>
          </div>
        ) : null}

        <div className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-3">
          <Checkbox
            id="kot-separate-categories"
            checked={separateCategories}
            onCheckedChange={(v) => setSeparateCategories(!!v)}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="kot-separate-categories" className="text-sm font-semibold cursor-pointer">
              {t('kot_separateCategories')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('kot_separateCategoriesDesc')}</p>
          </div>
        </div>

        {!printAllowed ? (
          <p className="text-sm font-semibold text-destructive">{t('kot_printDisabled')}</p>
        ) : null}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" className="w-full sm:w-auto mt-0" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={handlePrint} disabled={!order || !printAllowed || busy}>
            <Printer className="h-4 w-4 mr-1" /> {t('kot_print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default KotPrintOptionsDialog;
