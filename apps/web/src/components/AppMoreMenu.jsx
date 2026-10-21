import React, { useState } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { MoreVertical, Languages, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// The staff app's "more" button: a bottom sheet with the less used actions
// (shift, language, help, log out), so the top bar keeps only a few buttons.
// items: [{ icon, label, sub, onClick, danger, disabled }]
export default function AppMoreMenu({ items = [], title, subtitle }) {
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const en = language === 'en';
  const run = (fn) => () => { setOpen(false); setTimeout(() => fn?.(), 150); };
  const rows = [
    ...items.filter(Boolean),
    {
      icon: Languages,
      label: en ? 'Sprache: Deutsch' : 'Language: English',
      sub: en ? 'Switch to German' : 'Auf Englisch umschalten',
      onClick: () => setLanguage(en ? 'de' : 'en'),
      keepOpen: true,
    },
  ];
  // Log out and other "danger" rows go last.
  rows.sort((a, b) => Number(!!a.danger) - Number(!!b.danger));

  return (
    <SheetPrimitive.Root open={open} onOpenChange={setOpen}>
      <SheetPrimitive.Trigger asChild>
        <button type="button" className="app-icon-btn" aria-label={en ? 'More' : 'Mehr'}>
          <MoreVertical className="h-5 w-5" />
        </button>
      </SheetPrimitive.Trigger>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className="app-action-sheet fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
          <div className="px-5 pt-3 pb-2">
            <SheetPrimitive.Title className="text-base font-bold text-primary">{title || (en ? 'More' : 'Mehr')}</SheetPrimitive.Title>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <ul className="px-3 pb-3">
            {rows.map(({ icon: Icon, label, sub, onClick, danger, disabled, keepOpen }) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={keepOpen ? onClick : run(onClick)}
                  className={`w-full flex items-center gap-3.5 rounded-2xl px-3 py-3 text-left active:bg-muted disabled:opacity-50 ${danger ? 'text-destructive' : 'text-foreground'}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-destructive/10' : 'bg-primary/10 text-primary'}`}>
                    {Icon && <Icon className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-tight">{label}</span>
                    {sub && <span className="block text-xs text-muted-foreground mt-0.5 truncate">{sub}</span>}
                  </span>
                  {!danger && !keepOpen && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
