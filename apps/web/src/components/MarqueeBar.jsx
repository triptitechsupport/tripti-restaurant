import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';

function isTodayInRange(startStr, endStr) {
  if (!startStr || !endStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startStr.slice(0, 10) + 'T00:00:00');
  const end = new Date(endStr.slice(0, 10) + 'T00:00:00');
  return today >= start && today <= end;
}

function isTodayClosed(closedWeekday, closedDates) {
  const today = new Date();
  if (closedWeekday !== null && closedWeekday !== undefined && today.getDay() === closedWeekday) {
    return true;
  }
  if (closedDates && closedDates.length > 0) {
    for (const d of closedDates) {
      if (isTodayInRange(d.start_date, d.end_date)) return true;
    }
  }
  return false;
}

export default function MarqueeBar() {
  const { language } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [closedWeekday, setClosedWeekday] = useState(null);
  const [closedDates, setClosedDates] = useState([]);
  const barRef = useRef(null);
  const [barHeight, setBarHeight] = useState(40);

  useEffect(() => {
    const loadMarquee = async () => {
      try {
        const res = await pb.collection('marquee_settings').getList(1, 1, { $autoCancel: false });
        if (res.items.length > 0) setSettings(res.items[0]);
      } catch (_) {}
    };
    loadMarquee();
    void pb.collection('marquee_settings').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') setSettings(e.record);
      if (e.action === 'delete') setSettings(null);
    }).catch(() => {});

    const loadHours = async () => {
      try {
        const res = await pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false });
        if (res.items.length > 0) setClosedWeekday(res.items[0].closedWeekday);
      } catch (_) {}
    };
    loadHours();
    void pb.collection('restaurant_hours').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') setClosedWeekday(e.record.closedWeekday);
    }).catch(() => {});

    const loadClosedDates = async () => {
      try {
        const res = await pb.collection('closed_dates').getFullList({ $autoCancel: false });
        setClosedDates(res);
      } catch (_) {}
    };
    loadClosedDates();
    void pb.collection('closed_dates').subscribe('*', async () => {
      try {
        const res = await pb.collection('closed_dates').getFullList({ $autoCancel: false });
        setClosedDates(res);
      } catch (_) {}
    }).catch(() => {});

    return () => {
      void pb.collection('marquee_settings').unsubscribe('*').catch(() => {});
      void pb.collection('restaurant_hours').unsubscribe('*').catch(() => {});
      void pb.collection('closed_dates').unsubscribe('*').catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (barRef.current) {
      setBarHeight(barRef.current.offsetHeight);
    }
  });

  const closed = isTodayClosed(closedWeekday, closedDates);

  let text = null;
  let isClosureMsg = false;

  if (closed) {
    text = language === 'de'
      ? 'Heute haben wir geschlossen. Wir freuen uns, Sie morgen wieder begrüßen zu dürfen.'
      : 'Today we are closed. Please visit us tomorrow.';
    isClosureMsg = true;
  } else if (settings && settings.enabled && settings.text?.trim()) {
    text = settings.text.trim();
  }

  if (!text) return null;

  const bgColor = isClosureMsg ? 'hsl(var(--destructive))' : 'hsl(var(--primary))';
  const textColor = isClosureMsg ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--secondary))';

  return (
    <>
      <style>{`
        .marquee-bar-sticky {
          position: fixed;
          left: 0;
          right: 0;
          z-index: 40;
          top: var(--nav-height-mobile);
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .marquee-bar-sticky {
            top: var(--nav-height-desktop);
          }
        }
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      {/* Fixed marquee bar sits directly below the sticky header */}
      <div
        ref={barRef}
        className="marquee-bar-sticky"
        style={{
          backgroundColor: bgColor,
          borderBottom: '2px solid hsl(var(--secondary))',
        }}
      >
        <div
          className="flex items-center py-2 gap-0"
          style={{ animation: 'marquee-scroll 30s linear infinite', whiteSpace: 'nowrap' }}
        >
          {[...Array(4)].map((_, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-4 text-sm font-semibold tracking-wide px-12"
              style={{ color: textColor }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: textColor }}
              />
              {text}
            </span>
          ))}
        </div>
      </div>
      {/* Spacer to prevent content from hiding behind the fixed marquee */}
      <div style={{ height: barHeight }} aria-hidden />
    </>
  );
}
