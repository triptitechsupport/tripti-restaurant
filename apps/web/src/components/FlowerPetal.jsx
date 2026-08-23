import React, { useMemo } from 'react';

export default function FlowerPetal({ count = 25 }) {
  const petals = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const isMarigold = Math.random() > 0.4;
      const size = Math.random() * 15 + 10; // 10px to 25px
      const left = Math.random() * 100; // 0% to 100%
      const duration = Math.random() * 5 + 4; // 4s to 9s
      const delay = Math.random() * 5; // 0s to 5s
      const xDrift = (Math.random() * 30 - 15); // -15vw to +15vw
      const rotEnd = Math.random() * 720 - 360; // -360deg to +360deg
      
      return {
        id: i,
        isMarigold,
        size,
        style: {
          left: `${left}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          '--x-drift': `${xDrift}vw`,
          '--rot-end': `${rotEnd}deg`,
        }
      };
    });
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10" aria-hidden="true">
      {petals.map(petal => (
        <div 
          key={petal.id}
          className="absolute top-0 animate-falling-petal opacity-0"
          style={petal.style}
        >
          <svg 
            width={petal.size} 
            height={petal.size} 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className={petal.isMarigold ? "text-[hsl(var(--hero-accent-orange))]" : "text-[hsl(var(--hero-accent-pink))]"}
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
          >
            {petal.isMarigold ? (
              // Marigold rough shape
              <path 
                d="M12 2C13.5 5 17 4 19 6C20 8 19 10 21 12C19 14 20 16 19 18C17 20 13.5 19 12 22C10.5 19 7 20 5 18C4 16 5 14 3 12C5 10 4 8 5 6C7 4 10.5 5 12 2Z" 
                fill="currentColor" 
                fillOpacity="0.85" 
              />
            ) : (
              // Lotus/rose petal smooth shape
              <path 
                d="M12 2C15.3137 2 18 6.47715 18 12C18 17.5228 15.3137 22 12 22C8.68629 22 6 17.5228 6 12C6 6.47715 8.68629 2 12 2Z" 
                fill="currentColor" 
                fillOpacity="0.75" 
              />
            )}
          </svg>
        </div>
      ))}
    </div>
  );
}