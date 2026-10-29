import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { viennaToday, formatPickupDay } from '@/lib/pickupApi.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { pickupChime } from './PickupOrdersBoard.jsx';

// Keeps a staff screen informed about online pickup orders while the list is
// closed: count of open orders in the next `days` days, a chime and a toast
// when a new one comes in.
export default function usePickupWatch(client, { days = 2, sound = true } = {}) {
  const [count, setCount] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const known = useRef(null);
  const timer = useRef(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const { language } = useLanguage();
  const langRef = useRef(language);
  langRef.current = language === 'en' ? 'en' : 'de';

  const busy = useRef(false);
  const again = useRef(false);
  const load = useCallback(async () => {
    if (!client?.authStore?.isValid) return;
    // One load at a time (two at once would chime twice); run again after if asked.
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      const list = await client.collection('orders').getFullList({
        filter: client.filter(
          'orderType = "pickup" && pickupDate >= {:from} && pickupDate <= {:to} && (status = "received" || status = "confirmed" || status = "in_kitchen" || status = "ready")',
          { from: viennaToday(0), to: viennaToday(days) },
        ),
        fields: 'id,orderNumber,pickupDate,pickupTime,status,kitchenSeenAt',
        $autoCancel: false,
      });
      if (known.current) {
        const fresh = list.filter((o) => !known.current.has(o.id));
        if (fresh.length) {
          if (soundRef.current) pickupChime();
          fresh.forEach((o) => toast(`${langRef.current === 'en' ? 'New pre-order' : 'Neue Vorbestellung'} ${o.orderNumber}: ${formatPickupDay(o.pickupDate, langRef.current)} ${o.pickupTime}`, { icon: '🛍️', duration: 12000 }));
        }
      }
      known.current = new Set(list.map((o) => o.id));
      setCount(list.length);
      setUnseen(list.filter((o) => !o.kitchenSeenAt).length);
    } catch { /* keep last numbers */ } finally {
      busy.current = false;
      if (again.current) { again.current = false; setTimeout(() => load(), 0); }
    }
  }, [client, days]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 60000);
    let unsub = null;
    let gone = false;
    client?.collection('orders').subscribe('*', (e) => {
      if (e.record?.orderType !== 'pickup') return;
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 500);
    }).then((u) => { if (gone) Promise.resolve(u()).catch(() => {}); else unsub = u; }).catch(() => {});
    return () => {
      gone = true;
      clearInterval(poll);
      clearTimeout(timer.current);
      if (unsub) Promise.resolve(unsub()).catch(() => {});
    };
  }, [client, load]);

  return { count, unseen, reload: load };
}
