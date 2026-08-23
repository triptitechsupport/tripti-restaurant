import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export default function MobileTableCard({
  header,
  subHeader,
  sideContent,
  expandedContent,
  actions,
  className
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col", className)}>
      <div className="p-4 flex justify-between items-start gap-3">
        <div className="flex-1 space-y-1 min-w-0">
          {header}
          {subHeader}
        </div>
        {sideContent && (
          <div className="shrink-0 flex flex-col items-end gap-2 text-right">
            {sideContent}
          </div>
        )}
      </div>

      {expandedContent && (
        <div className="px-4 pb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-muted/40 hover:bg-muted/60 text-xs font-medium text-foreground rounded-lg transition-colors min-h-[44px]"
          >
            {expanded ? 'Show Less' : 'Show Details'}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      )}

      {expanded && expandedContent && (
        <div className="px-4 pb-4 pt-2 border-t border-border/50 bg-muted/10 text-sm animate-in slide-in-from-top-2 duration-200">
          {expandedContent}
        </div>
      )}

      {actions && (
        <div className="p-4 border-t border-border/50 bg-muted/5 flex flex-col gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}