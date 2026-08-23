import React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils.js';

export default function MobileFormField({ label, id, error, description, children, className }) {
  return (
    <div className={cn("flex flex-col space-y-1.5 md:space-y-2", className)}>
      {label && (
        <Label htmlFor={id} className="text-sm md:text-base font-medium text-foreground">
          {label}
        </Label>
      )}
      
      {/* 
        The [&_input]:min-h-[44px] etc. forces all standard nested form elements 
        to adhere to minimum touch target sizing automatically on mobile.
      */}
      <div className="relative w-full flex flex-col [&_input]:min-h-[44px] [&_select]:min-h-[44px] [&_button]:min-h-[44px] [&_textarea]:min-h-[44px]">
        {children}
      </div>
      
      {description && !error && (
        <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
      )}
      
      {error && (
        <p id={id ? `${id}-error` : undefined} className="text-xs md:text-sm text-destructive font-medium">
          {error}
        </p>
      )}
    </div>
  );
}