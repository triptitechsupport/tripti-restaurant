import React from 'react';

export default function DecorativeElements() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden" aria-hidden="true">
      {/* Top Left Corner */}
      <div className="absolute top-0 left-0 p-4 md:p-8 animate-decorative-pulse" style={{ animationDelay: '0s' }}>
        <CornerPattern className="w-24 h-24 md:w-40 md:h-40 text-[hsl(var(--hero-text-gold))]" />
      </div>

      {/* Top Right Corner */}
      <div className="absolute top-0 right-0 p-4 md:p-8 animate-decorative-pulse" style={{ animationDelay: '1s' }}>
        <CornerPattern className="w-24 h-24 md:w-40 md:h-40 text-[hsl(var(--hero-text-gold))] rotate-90" />
      </div>

      {/* Bottom Left Corner */}
      <div className="absolute bottom-0 left-0 p-4 md:p-8 animate-decorative-pulse" style={{ animationDelay: '2s' }}>
        <CornerPattern className="w-24 h-24 md:w-40 md:h-40 text-[hsl(var(--hero-text-gold))] -rotate-90" />
      </div>

      {/* Bottom Right Corner */}
      <div className="absolute bottom-0 right-0 p-4 md:p-8 animate-decorative-pulse" style={{ animationDelay: '1.5s' }}>
        <CornerPattern className="w-24 h-24 md:w-40 md:h-40 text-[hsl(var(--hero-text-gold))] rotate-180" />
      </div>
    </div>
  );
}

function CornerPattern({ className }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        d="M0 0 L100 0 C100 0 80 10 70 30 C60 50 50 60 30 70 C10 80 0 100 0 100 L0 0 Z" 
        fill="currentColor" 
        fillOpacity="0.15" 
      />
      <path 
        d="M0 0 L80 0 C80 0 65 10 55 25 C45 40 40 45 25 55 C10 65 0 80 0 80 L0 0 Z" 
        stroke="currentColor" 
        strokeWidth="1.5"
        strokeOpacity="0.8" 
      />
      <path 
        d="M0 0 L60 0 C60 0 45 10 35 25 C25 40 20 45 15 55 C10 65 0 60 0 60 L0 0 Z" 
        stroke="currentColor" 
        strokeWidth="1"
        strokeOpacity="0.5" 
      />
      <circle cx="15" cy="15" r="3" fill="currentColor" fillOpacity="0.8" />
      <circle cx="30" cy="15" r="2" fill="currentColor" fillOpacity="0.6" />
      <circle cx="15" cy="30" r="2" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}