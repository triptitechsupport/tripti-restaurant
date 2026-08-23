import React from 'react';

export default function TempleFloating() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" aria-hidden="true">
      {/* Distant small temple - left */}
      <div 
        className="absolute bottom-[5%] left-[5%] opacity-20 animate-temple-bob"
        style={{ '--bob-distance': '-8px', animationDuration: '4.5s', animationDelay: '0s' }}
      >
        <TempleSilhouette width={120} height={180} />
      </div>

      {/* Medium temple - right */}
      <div 
        className="absolute bottom-[2%] right-[8%] opacity-30 animate-temple-bob"
        style={{ '--bob-distance': '-12px', animationDuration: '3.8s', animationDelay: '1.2s' }}
      >
        <TempleSilhouette width={180} height={260} />
      </div>

      {/* Large faint temple - center-left */}
      <div 
        className="absolute -bottom-[5%] left-[25%] opacity-15 animate-temple-bob"
        style={{ '--bob-distance': '-15px', animationDuration: '5s', animationDelay: '2.5s' }}
      >
        <TempleSilhouette width={280} height={400} />
      </div>
    </div>
  );
}

function TempleSilhouette({ width, height }) {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 100 150" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="text-[hsl(var(--hero-bg-edge))]"
    >
      <path 
        d="M50 0L52 10H48L50 0ZM50 15C55 25 65 40 70 70C72 85 75 120 75 150H25C25 120 28 85 30 70C35 40 45 25 50 15ZM35 150V90C35 80 40 75 50 75C60 75 65 80 65 90V150H35Z" 
        fill="currentColor" 
      />
      {/* Simple tiered accents */}
      <rect x="42" y="30" width="16" height="3" fill="currentColor" fillOpacity="0.5" />
      <rect x="38" y="45" width="24" height="3" fill="currentColor" fillOpacity="0.5" />
      <rect x="34" y="60" width="32" height="3" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}