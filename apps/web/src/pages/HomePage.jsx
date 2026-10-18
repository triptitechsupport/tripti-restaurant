import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import CustomerFeedback from '@/components/CustomerFeedback.jsx';
import MenuBook from '@/components/menu/MenuBook.jsx';
import pb from '@/lib/pocketbaseClient.js';

import { T, ALG, EXCLUDABLE, SIGNATURES, GLOSS, SPOTS, SERVICE, PHONE, PHONE_TEL } from '@/pages/home/homeData.js';
import { bell, swish, tick, setSound, stopSound, isSoundOn } from '@/pages/home/homeSound.js';
import '@/pages/home/home.css';

import imgArch from '@/assets/home/arch.webp';
import imgBanner from '@/assets/home/banner.webp';
import imgCornerA from '@/assets/home/corner-a.webp';
import imgCornerB from '@/assets/home/corner-b.webp';
import imgCornerMandala from '@/assets/home/corner-mandala.webp';
import imgDivider from '@/assets/home/divider.webp';
import imgFlower from '@/assets/home/flower.webp';
import imgLamp0 from '@/assets/home/lamp0.webp';
import imgLamp1 from '@/assets/home/lamp1.webp';
import imgLogoMark from '@/assets/home/logo-mark.webp';
import imgMandala from '@/assets/home/mandala.webp';
import imgShip from '@/assets/home/ship.webp';
import imgTemple from '@/assets/home/temple.webp';
import imgThali from '@/assets/home/thali.webp';

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const fmtPrice = (p, lang) => {
  const n = Number(p) || 0;
  return lang === 'de' ? `${n.toFixed(2).replace('.', ',')} €` : `€${n.toFixed(2)}`;
};

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const dur = (m, lang) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return lang === 'de' ? `${h ? `${h} Std. ` : ''}${mm} Min.` : `${h ? `${h} h ` : ''}${mm} min`;
};

// Current weekday (0 = Sunday, like Admin > Closures), minutes and date in Vienna.
function viennaNow() {
  const o = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).forEach((p) => { o[p.type] = p.value; });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  return { day: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday], min: +o.hour * 60 + +o.minute, date };
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isHoliday(isoDate, closedDates) {
  return closedDates.some((d) => d.start_date && d.end_date
    && isoDate >= d.start_date.slice(0, 10) && isoDate <= d.end_date.slice(0, 10));
}

function openingStatus(lang, closedWeekday, closedDates) {
  const tx = T[lang];
  const n = viennaNow();
  const closedToday = n.day === closedWeekday || isHoliday(n.date, closedDates);
  if (!closedToday) {
    for (const [a, b] of SERVICE) {
      if (n.min >= a && n.min < b) return { open: true, text: tx['st.open'].replace('{t}', hm(b)) };
    }
    if (n.min < SERVICE[0][0]) {
      return { open: false, text: `${tx['st.later'].replace('{t}', hm(SERVICE[0][0]))} · ${tx['st.in'].replace('{d}', dur(SERVICE[0][0] - n.min, lang))}` };
    }
    if (n.min < SERVICE[1][0]) {
      return { open: false, text: `${tx['st.break'].replace('{t}', hm(SERVICE[1][0]))} · ${tx['st.in'].replace('{d}', dur(SERVICE[1][0] - n.min, lang))}` };
    }
  }
  // Find the next day we are open (skip the closing weekday and holidays).
  for (let i = 1; i <= 60; i++) {
    const date = addDays(n.date, i);
    const day = (n.day + i) % 7;
    if (day === closedWeekday || isHoliday(date, closedDates)) continue;
    const when = i === 1 ? tx['st.tom'] : (i < 7 ? tx.days[day] : new Intl.DateTimeFormat(lang === 'de' ? 'de-AT' : 'en-GB', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`)));
    return { open: false, text: tx['st.closed'].replace('{d}', when).replace('{t}', hm(SERVICE[0][0])) };
  }
  return { open: false, text: tx['st.holiday'] };
}

// Menu records from Admin > Menu Management, in one shape for this page.
function normalizeItem(r) {
  const alg = Array.isArray(r.allergens) ? r.allergens : (typeof r.allergens === 'string' && r.allergens ? r.allergens.split(',') : []);
  return {
    id: r.id,
    raw: r,
    de: r.nameDE || r.name || r.nameEN || '',
    en: r.nameEN || r.name || r.nameDE || '',
    descDe: r.descriptionDE || r.description || '',
    descEn: r.descriptionEN || r.description || '',
    price: Number(r.price) || 0,
    cat: r.category || '',
    veg: r.isVegetarian === true,
    alg: alg.map((a) => String(a).trim()).filter(Boolean),
  };
}

const matches = (item, words) => {
  const hay = `${item.de} ${item.en}`.toLowerCase();
  return words.some((w) => hay.includes(w));
};

/* ─── data ────────────────────────────────────────────────────────────────── */

function useHomeData() {
  const [state, setState] = useState({
    loading: true, items: [], categories: [], closedWeekday: 3, closedDates: [], section: null,
  });

  useEffect(() => {
    let alive = true;
    const opts = { $autoCancel: false };
    Promise.allSettled([
      pb.collection('menu_items').getList(1, 500, { filter: 'availability = true', sort: 'category,nameEN', ...opts }),
      pb.collection('categories').getFullList({ sort: 'display_order,name', ...opts }),
      pb.collection('restaurant_hours').getList(1, 1, opts),
      pb.collection('closed_dates').getFullList(opts),
      pb.collection('restaurant_section').getList(1, 1, opts),
    ]).then(([items, cats, hours, closed, section]) => {
      if (!alive) return;
      const ok = (r) => r.status === 'fulfilled';
      setState({
        loading: false,
        items: ok(items) ? items.value.items.map(normalizeItem) : [],
        categories: ok(cats) ? cats.value : [],
        closedWeekday: ok(hours) && hours.value.items.length ? (hours.value.items[0].closedWeekday ?? 3) : 3,
        closedDates: ok(closed) ? closed.value : [],
        section: ok(section) && section.value.items.length ? section.value.items[0] : null,
      });
    });
    return () => { alive = false; };
  }, []);

  return state;
}

/* ─── small pieces ────────────────────────────────────────────────────────── */

const Corners = ({ src }) => (
  <>
    <img className="cm tl" src={src} alt="" />
    <img className="cm tr" src={src} alt="" />
    <img className="cm bl" src={src} alt="" />
    <img className="cm br" src={src} alt="" />
  </>
);

const FrameCorners = ({ all = true }) => (
  <>
    <img className="c tl" src={imgCornerA} alt="" />
    <img className="c tr" src={imgCornerB} alt="" />
    {all && <img className="c bl" src={imgCornerA} alt="" />}
    {all && <img className="c br" src={imgCornerB} alt="" />}
  </>
);

const VegMark = ({ veg, tx }) => <span className={`vm ${veg ? 'v' : 'n'}`} title={veg ? tx.veg : tx.nv} />;

function Petals() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || reduceMotion() || !cv.getContext) return undefined;
    const cx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0; let H = 0; let run = true; let raf = 0;
    const size = () => {
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    const COLS = ['#f2a23a', '#e8892a', '#f6c453', '#fff4e0', '#c9452e'];
    const P = Array.from({ length: 22 }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H, r: 4 + Math.random() * 5, vy: 0.25 + Math.random() * 0.55,
      sw: Math.random() * 6.28, ss: 0.008 + Math.random() * 0.015, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.03, c: COLS[i % COLS.length],
    }));
    const draw = () => {
      if (!run) return;
      cx.clearRect(0, 0, W, H);
      P.forEach((p) => {
        p.y += p.vy; p.sw += p.ss; p.x += Math.sin(p.sw) * 0.5; p.rot += p.vr;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.sw * 2)));
        cx.globalAlpha = 0.75; cx.fillStyle = p.c; cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.283); cx.fill(); cx.restore();
      });
      raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !run) { run = true; draw(); } else if (!e.isIntersecting) { run = false; cancelAnimationFrame(raf); }
    });
    io.observe(cv);
    draw();
    return () => { run = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', size); };
  }, []);
  return <canvas id="petals" ref={ref} aria-hidden="true" />;
}

const STARS = [[22, 12], [30, 9], [71, 10], [78, 14], [64, 7], [36, 15], [18, 47], [26, 52], [74, 49], [82, 53], [58, 46], [44, 50]];
const LAMP_NOTES = [587.33, 880, 739.99, 493.88];

/* ─── page ────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const { language, isOrderingEnabled } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = T[lang];
  const { isAdminAuthenticated } = useAuth();
  const { cartItems, addToCart } = useCart();
  const canOrder = !!isOrderingEnabled && !isAdminAuthenticated;

  const { loading, items, categories, closedWeekday, closedDates, section } = useHomeData();

  const [soundOn, setSoundOn] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [status, setStatus] = useState({ open: false, text: '…' });
  const [dusk, setDusk] = useState(false);
  const [cat, setCat] = useState('');
  const [diet, setDiet] = useState('all');
  const [query, setQuery] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [excl, setExcl] = useState({});
  const [spot, setSpot] = useState(-1);
  const [flashId, setFlashId] = useState('');
  const [turnKey, setTurnKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const sceneRef = useRef(null);
  const templeRef = useRef(null);
  const thaliRef = useRef(null);
  const toastTimer = useRef(null);
  const rootRef = useRef(null);

  const nm = useCallback((d) => (lang === 'de' ? d.de : d.en), [lang]);
  const alt = useCallback((d) => (lang === 'de' ? d.en : d.de), [lang]);
  const ds = useCallback((d) => (lang === 'de' ? d.descDe : d.descEn), [lang]);

  const toast = useCallback((s) => {
    setToastMsg(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);

  /* categories that have dishes, in the admin's order */
  const cats = useMemo(() => {
    const used = new Set(items.map((i) => i.cat));
    const list = categories
      .filter((c) => used.has(c.name))
      .map((c) => ({ id: c.name, de: c.name_de || c.name, en: c.name }));
    const known = new Set(list.map((c) => c.id));
    [...used].filter((c) => c && !known.has(c)).forEach((c) => list.push({ id: c, de: c, en: c }));
    return list;
  }, [items, categories]);

  useEffect(() => {
    if (!cat && cats.length) setCat(cats[0].id);
  }, [cats, cat]);

  const signatures = useMemo(() => {
    const picked = [];
    SIGNATURES.forEach((s) => {
      const d = items.find((i) => !picked.some((p) => p.d.id === i.id) && matches(i, s.match));
      if (d) picked.push({ d, region: s.region });
    });
    for (const c of cats) {
      if (picked.length >= 6) break;
      const d = items.find((i) => i.cat === c.id && !picked.some((p) => p.d.id === i.id));
      if (d) picked.push({ d, region: lang === 'de' ? c.de : c.en });
    }
    return picked.slice(0, 6);
  }, [items, cats, lang]);

  const spotItems = useMemo(() => SPOTS.map((s) => items.find((i) => matches(i, s.match)) || null), [items]);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter((d) => {
      if (d.alg.some((a) => excl[a])) return false;
      if (q) {
        if (!`${d.de} ${d.en} ${d.descDe} ${d.descEn}`.toLowerCase().includes(q)) return false;
      } else if (cat !== '*' && d.cat !== cat) return false;
      if (diet === 'v' && !d.veg) return false;
      if (diet === 'n' && d.veg) return false;
      return true;
    });
  }, [items, query, cat, diet, excl]);

  const curCat = cats.find((c) => c.id === cat);
  const catTitle = (c) => (lang === 'de' ? c.de : c.en);
  const catSub = (c) => (c.de !== c.en ? (lang === 'de' ? c.en : c.de) : '');
  // "Alle" lists every dish, grouped by category in the admin's order.
  const groups = useMemo(() => {
    if (query) return visible.length ? [{ key: 'q', title: tx['menu.results'], sub: tx['menu.found'].replace('{n}', visible.length), its: visible }] : [];
    if (cat === '*') {
      return cats
        .map((c) => ({ key: c.id, title: catTitle(c), sub: catSub(c), its: visible.filter((d) => d.cat === c.id) }))
        .filter((g) => g.its.length);
    }
    return visible.length && curCat ? [{ key: curCat.id, title: catTitle(curCat), sub: catSub(curCat), its: visible }] : [];
  }, [query, cat, cats, visible, curCat, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const vegCount = items.filter((i) => i.veg).length;
  const inCart = (id) => cartItems.find((c) => c.id === id)?.quantity || 0;

  /* opening status, refreshed every minute */
  useEffect(() => {
    const upd = () => {
      setStatus(openingStatus(lang, closedWeekday, closedDates));
      const n = viennaNow();
      setDusk(n.min >= 1050 || n.min < 420);
    };
    upd();
    const id = setInterval(upd, 60000);
    return () => clearInterval(id);
  }, [lang, closedWeekday, closedDates]);

  /* sound: fade out when leaving the page; resume a remembered choice on first tap */
  useEffect(() => {
    let once = null;
    try {
      if (localStorage.getItem('tg-sound') === '1') {
        once = (e) => {
          if (e.target.closest && e.target.closest('#soundBtn')) return;
          if (setSound(true)) setSoundOn(true);
          window.removeEventListener('pointerdown', once);
        };
        window.addEventListener('pointerdown', once);
      }
    } catch { /* storage blocked */ }
    return () => {
      if (once) window.removeEventListener('pointerdown', once);
      stopSound();
      clearTimeout(toastTimer.current);
    };
  }, []);

  const toggleSound = () => {
    const on = !isSoundOn();
    if (!setSound(on)) { toast('Audio not supported'); return; }
    setSoundOn(on);
    toast(on ? tx['toast.on'] : tx['toast.off']);
  };

  const ringLamp = (e, i) => {
    const l = e.currentTarget;
    l.classList.remove('ring');
    void l.offsetWidth; // restart the animation
    l.classList.add('ring');
    if (!isSoundOn() && setSound(true)) setSoundOn(true);
    bell(LAMP_NOTES[i], 0.24);
  };

  /* parallax on the hero scene */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || reduceMotion() || !window.matchMedia('(pointer:fine)').matches) return undefined;
    const move = (e) => {
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      if (templeRef.current) templeRef.current.style.transform = `translate(${x * -10}px,${y * -6}px)`;
      if (thaliRef.current) thaliRef.current.style.translate = `${x * 8}px ${y * 4}px`;
    };
    const leave = () => {
      if (templeRef.current) templeRef.current.style.transform = '';
      if (thaliRef.current) thaliRef.current.style.translate = '';
    };
    scene.addEventListener('pointermove', move);
    scene.addEventListener('pointerleave', leave);
    return () => { scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerleave', leave); };
  }, []);

  /* scroll reveal: transform only, text is always visible */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduceMotion() || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.rv:not([data-rv])').forEach((el, i) => {
      el.setAttribute('data-rv', '1');
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('pre');
        el.style.transitionDelay = `${el.classList.contains('card') ? (i % 3) * 90 : 0}ms`;
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, [loading, signatures.length]);

  /* menu book interactions */
  const turnPage = () => { setTurnKey((k) => k + 1); swish(); };
  const pickCat = (id) => { setCat(id); setQuery(''); setQueryInput(''); turnPage(); };
  const pickDiet = (d) => { setDiet(d); setTurnKey((k) => k + 1); tick(); };
  const toggleExcl = (k) => { setExcl((p) => ({ ...p, [k]: !p[k] })); turnPage(); };

  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput.trim()), 120);
    return () => clearTimeout(id);
  }, [queryInput]);

  const goToDish = (d) => {
    setCat(d.cat); setQuery(''); setQueryInput(''); setDiet('all'); setExcl({}); turnPage();
    const reduce = reduceMotion();
    document.getElementById('speisekarte')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(() => {
      const li = document.querySelector(`.tg-home [data-item="${d.id}"]`);
      if (li) {
        li.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        setFlashId(d.id);
        setTimeout(() => setFlashId(''), 1800);
      }
    }, 500);
  };

  const add = (d) => {
    addToCart({ ...d.raw, name: nm(d) });
    bell(1318.5, 0.1);
    toast(tx['toast.added'].replace('{n}', nm(d)));
  };

  const pickSpot = (i) => {
    setSpot(i);
    bell([523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5, 1174.66][i], 0.14);
  };

  const copyPhone = () => {
    try {
      navigator.clipboard.writeText(PHONE).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
    } catch { /* no clipboard */ }
  };

  const onClickCapture = (e) => {
    if (e.target.closest('.btn,.card') && !e.target.closest('#soundBtn')) tick();
  };

  const sectionText = section && section.enabled
    ? (lang === 'de' ? (section.description_de || section.description_en || section.description) : (section.description_en || section.description))
    : '';

  const days = [1, 2, 3, 4, 5, 6, 0];
  const today = viennaNow().day;

  return (
    <div className="tg-home" ref={rootRef} onClickCapture={onClickCapture} style={{ '--tg-arch': `url(${imgArch})` }}>
      <Helmet>
        <title>Tripti Genusswelt – Indisches Restaurant in Villach</title>
        <meta name="description" content={tx['hero.lead']} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,500;0,600;1,400;1,500&family=Hind:wght@400;500;600&display=swap" />
      </Helmet>

      {/* ================= HERO (menu cover) ================= */}
      <section className={`cover hero${dusk ? ' dusk' : ''}`} id="hero">
        <div className="grain" />
        <Corners src={imgCornerMandala} />
        <Petals />
        <div className="wrap hero-grid">
          <div className="scene" ref={sceneRef}>
            <img className="arch" src={imgArch} alt="" />
            <div className="s-sky" aria-hidden="true">
              {STARS.map(([x, y], i) => (
                <span key={i} className="star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.37}s` }} />
              ))}
            </div>
            <img className="s-mandala" src={imgMandala} alt="" />
            <p className="s-tag" aria-hidden="true">{T.de['hero.tag']}</p>
            <img className="s-logo" src={imgLogoMark} alt="" />
            <p className="s-welcome" aria-hidden="true">{tx['hero.welcome']}</p>
            <img className="s-temple" ref={templeRef} src={imgTemple} alt="" />
            <svg className="s-water" viewBox="0 0 400 60" preserveAspectRatio="none">
              <path d="M0 14 Q 50 6 100 14 T 200 14 T 300 14 T 400 14" />
              <path d="M0 30 Q 50 22 100 30 T 200 30 T 300 30 T 400 30" />
              <path d="M0 46 Q 50 38 100 46 T 200 46 T 300 46 T 400 46" />
            </svg>
            <img className="s-ship" src={imgShip} alt="" />
            <svg className="s-steam" viewBox="0 0 120 60">
              <path d="M30 58 C 20 44, 40 34, 30 18 S 34 4, 30 0" />
              <path d="M60 58 C 50 44, 70 34, 60 18 S 64 4, 60 0" />
              <path d="M90 58 C 80 44, 100 34, 90 18 S 94 4, 90 0" />
            </svg>
            <img className="fl l" src={imgFlower} alt="" />
            <img className="fl r" src={imgFlower} alt="" />
            <img
              className="s-thali"
              ref={thaliRef}
              src={imgThali}
              alt=""
              onClick={() => { document.getElementById('tiffin')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); bell(1046.5, 0.12); }}
            />
            {[imgLamp0, imgLamp1, imgLamp1, imgLamp0].map((src, i) => (
              <button key={i} className={`lamp l${i + 1}`} type="button" aria-label={tx.lamp} onClick={(e) => ringLamp(e, i)}
                onAnimationEnd={(e) => { if (e.animationName === 'tg-ring') e.currentTarget.classList.remove('ring'); }}>
                <img src={src} alt="" />
                <span className="flame" />
              </button>
            ))}
          </div>

          <div className="hero-copy">
            <div className="eyebrow">{tx['hero.eyebrow']}</div>
            <h1>{tx['hero.title1']}<em>{tx['hero.title2']}</em></h1>
            <img className="orn" src={imgDivider} alt="" />
            <p className="lead">{tx['hero.lead']}</p>
            <div className="actions">
              <Link className="btn btn-gold" to="/table-reservation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                <span>{tx['cta.reserve']}</span>
              </Link>
              {canOrder ? (
                <Link className="btn btn-line" to="/menu?order=1">{tx['cta.order']}</Link>
              ) : (
                <button className="btn btn-line" type="button" onClick={() => setBookOpen(true)}>{tx['cta.menu']}</button>
              )}
            </div>
            <div className={`status${status.open ? ' open' : ''}`} aria-live="polite"><span className="dot" /><span>{status.text}</span></div>
            <div className="facts">
              <div><b>{tx['f.hours']}</b><span>{tx['f.hoursV']}</span></div>
              <div><b>{tx['f.rest']}</b><span>{tx.days[closedWeekday] || '–'}</span></div>
              <div><b>{tx['f.phone']}</b><a href={`tel:${PHONE_TEL}`}>{PHONE}</a></div>
            </div>
            <div className="hero-tools">
              <button className={`icon-btn${soundOn ? ' sound-on' : ''}`} id="soundBtn" type="button" aria-pressed={soundOn} onClick={toggleSound}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                <span className="bars" aria-hidden="true"><i /><i /><i /></span>
                <span className="lbl">{tx.sound}</span>
              </button>
              <p className="hint">{tx['hero.hint']}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SIGNATURES ================= */}
      {signatures.length > 0 && (
        <section className="page-sec" id="empfehlungen">
          <div className="wrap">
            <div className="sec-title rv">
              <div className="eyebrow caps">{tx['sig.eyebrow']}</div>
              <h2>{tx['sig.title']}</h2>
              <img className="div" src={imgDivider} alt="" />
              <p>{tx['sig.lead']}</p>
            </div>
            <div className="sig">
              {signatures.map(({ d, region }) => (
                <button key={d.id} className="card rv" type="button" onClick={() => goToDish(d)}>
                  <img src={imgMandala} alt="" />
                  <span className="tag"><VegMark veg={d.veg} tx={tx} />{region}</span>
                  <h3>{nm(d)}</h3>
                  <p>{ds(d)}</p>
                  <span className="pr">{fmtPrice(d.price, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= MENU BOOK (live from Admin > Menu Management) ================= */}
      <section className="page-sec" id="speisekarte" style={signatures.length ? { paddingTop: 0 } : undefined}>
        <div className="wrap">
          <div className="sec-title rv">
            <div className="eyebrow caps">{tx['menu.eyebrow']}</div>
            <h2>{tx['menu.title']}</h2>
            <img className="div" src={imgDivider} alt="" />
          </div>
          <div className="frame book rv">
            <FrameCorners />
            {loading ? (
              <p className="menu-loading">{tx['menu.loading']}</p>
            ) : (
              <>
                <div className="book-tools">
                  <label className="search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                    <input type="search" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder={tx['menu.search']} aria-label={tx['menu.search']} />
                  </label>
                  <div className="seg" role="group" aria-label="Filter">
                    {[['all', 'menu.all'], ['v', 'menu.veg'], ['n', 'menu.nv']].map(([k, label]) => (
                      <button key={k} type="button" aria-pressed={diet === k} onClick={() => pickDiet(k)}>{tx[label]}</button>
                    ))}
                  </div>
                </div>
                <div className="tabs" role="group" aria-label="Kategorien">
                  <button type="button" aria-pressed={cat === '*' && !query} onClick={() => pickCat('*')}>{tx['menu.all']}</button>
                  {cats.map((c) => (
                    <button key={c.id} type="button" aria-pressed={cat === c.id && !query} onClick={() => pickCat(c.id)}>{lang === 'de' ? c.de : c.en}</button>
                  ))}
                </div>
                <div className="excl" role="group" aria-label={tx['ex.label']}>
                  <span>{tx['ex.label']}</span>
                  {EXCLUDABLE.map((k) => (
                    <button key={k} type="button" aria-pressed={!!excl[k]} title={tx['ex.note']} onClick={() => toggleExcl(k)}>{ALG[k][lang === 'de' ? 0 : 1]}</button>
                  ))}
                </div>
                <div className="leaf">
                  <div className={`leaf-inner${turnKey && !reduceMotion() ? ' turn' : ''}`} key={turnKey}>
                    {groups.length === 0 && (
                      <ul className="items"><li className="empty">{tx['menu.empty']}</li></ul>
                    )}
                    {groups.map((group) => (
                      <React.Fragment key={group.key}>
                        <div className="cat-head">
                          <h3>{group.title}</h3>
                          {group.sub && <div className="sub">{group.sub}</div>}
                          <img src={imgDivider} alt="" />
                        </div>
                        <ul className="items">
                          {group.its.map((d) => {
                            const q = inCart(d.id);
                            return (
                              <li key={d.id} className={`it${flashId === d.id ? ' flash' : ''}`} data-item={d.id}>
                                <div className="it-top">
                                  <VegMark veg={d.veg} tx={tx} />
                                  <span className="it-name">{nm(d)}</span>
                                  <span className="lead-dots" />
                                  <span className="it-price">{fmtPrice(d.price, lang)}</span>
                                </div>
                                {alt(d) && alt(d) !== nm(d) && <div className="it-alt">{alt(d)}</div>}
                                {ds(d) && <p className="it-desc">{ds(d)}</p>}
                                <div className="it-meta">
                                  {d.alg.map((a) => (
                                    <span key={a} className="al" title={ALG[a] ? ALG[a][lang === 'de' ? 0 : 1] : ''}>{a}</span>
                                  ))}
                                  {canOrder && (
                                    <button className={`add${q ? ' on' : ''}`} type="button" onClick={() => add(d)}>
                                      {q ? `${tx.added}${q > 1 ? ` (${q})` : ''}` : tx.add}
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="book-foot">
                  <details className="allergens">
                    <summary>{tx['menu.allergens']}</summary>
                    <ul>
                      {Object.keys(ALG).map((k) => <li key={k}><b>{k}</b>{ALG[k][lang === 'de' ? 0 : 1]}</li>)}
                    </ul>
                  </details>
                  <span>{tx['menu.note']}</span>
                </div>
              </>
            )}
          </div>
          <div className="menu-more">
            <button className="btn btn-maroon" type="button" onClick={() => setBookOpen(true)}>{tx['menu.book']}</button>
            <Link className="btn btn-out" to={canOrder ? '/menu?order=1' : '/menu?view=list'}>{canOrder ? tx['cta.order'] : tx['menu.full']}</Link>
          </div>
          <MenuBook open={bookOpen} onClose={() => setBookOpen(false)} startCat={cat && cat !== '*' ? cat : ''} />
        </div>
      </section>

      {/* ================= TIFFIN PLATE ================= */}
      <section className="page-sec" id="tiffin" style={{ background: 'linear-gradient(180deg,var(--paper),#f3e3c3 40%,var(--paper))' }}>
        <div className="wrap">
          <div className="sec-title rv">
            <div className="eyebrow caps">{tx['tif.eyebrow']}</div>
            <h2>{tx['tif.title']}</h2>
            <img className="div" src={imgDivider} alt="" />
            <p>{tx['tif.lead']}</p>
          </div>
          <div className="tiffin">
            <div className="plate rv">
              <img loading="lazy" src={imgThali} alt="Idli, Masala Dosa, Vada, Sambar, Chutneys" width="640" height="371" />
              {SPOTS.map((s, i) => (
                <button key={i} className="spot" type="button" style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  aria-label={s[lang][0]} aria-pressed={spot === i} onClick={() => pickSpot(i)}>
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
            <ul className="plate-list">
              {SPOTS.map((s, i) => {
                const d = spotItems[i];
                return (
                  <li key={i}>
                    <button type="button" aria-pressed={spot === i} onClick={() => pickSpot(i)}>
                      <span className="n">{i + 1}</span>
                      <span><strong>{d ? nm(d) : s[lang][0]}</strong><small>{s[lang][1]}</small></span>
                      <span className="pp">{d ? fmtPrice(d.price, lang) : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* ================= STORY ================= */}
      <section className="page-sec" id="ueber-uns">
        <div className="wrap story">
          <div className="story-copy rv">
            <div className="eyebrow caps" style={{ color: 'var(--red)' }}>{tx['story.eyebrow']}</div>
            <p className="quote">{tx['story.quote1']}<em>{tx['story.quote2']}</em>{tx['story.quote3']}</p>
            <img src={imgDivider} alt="" style={{ width: 200 }} />
            {sectionText ? (
              <p style={{ whiteSpace: 'pre-line' }}>{sectionText}</p>
            ) : (
              <>
                <p>{tx['story.p1']}</p>
                <p>{tx['story.p2']}</p>
              </>
            )}
            {items.length > 0 && (
              <div className="nums">
                <div><b>{items.length}</b><span>{tx['story.nAll']}</span></div>
                <div><b>{vegCount}</b><span>{tx['story.nVeg']}</span></div>
                <div><b>{cats.length}</b><span>{tx['story.nCat']}</span></div>
              </div>
            )}
            {section && section.enabled && section.media && (
              <img src={pb.files.getURL(section, section.media)} alt="Tripti Genusswelt" loading="lazy"
                style={{ borderRadius: 6, boxShadow: '0 0 0 1px var(--gold),0 20px 40px -26px rgba(74,8,20,.6)', maxHeight: 360, objectFit: 'cover', width: '100%' }} />
            )}
          </div>
          <div className="frame gloss rv">
            <FrameCorners all={false} />
            <h3>{tx['gloss.title']}</h3>
            <dl>
              {GLOSS.map((g) => (
                <div key={g[0]}><dt>{g[0]}</dt><dd>{lang === 'de' ? g[1] : g[2]}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ================= RESERVATION ================= */}
      <section className="cover res" id="reservieren">
        <div className="grain" />
        <Corners src={imgCornerMandala} />
        <div className="wrap" style={{ position: 'relative', zIndex: 2 }}>
          <div className="sec-title">
            <div className="eyebrow caps">{tx['res.eyebrow']}</div>
            <h2>{tx['res.title']}</h2>
            <img className="div" src={imgDivider} alt="" />
            <p>{tx['res.lead']}</p>
          </div>
          <div className="res-grid">
            <div className="res-main">
              <h3>{tx['res.formT']}</h3>
              <p>{tx['res.formP']}</p>
              <ul>
                <li>{tx['f.hoursV']}</li>
                <li>{tx['f.rest']}: {tx.days[closedWeekday] || '–'}</li>
              </ul>
              <Link className="btn btn-gold" to="/table-reservation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                <span>{tx['res.go']}</span>
              </Link>
            </div>
            <div className="side">
              <div className="box">
                <h3>{tx['res.callT']}</h3>
                <p>{tx['res.callP']}</p>
                <div className="phone">
                  <strong><a href={`tel:${PHONE_TEL}`} style={{ textDecoration: 'none' }}>{PHONE}</a></strong>
                  <button className="chip" type="button" onClick={copyPhone}>{copied ? tx['res.copied'] : tx['res.copy']}</button>
                </div>
              </div>
              <div className="box">
                <h3>{tx['res.groupT']}</h3>
                <p>{tx['res.groupP']}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Guest reviews (Admin > Feedback Management) */}
      <CustomerFeedback />

      {/* ================= VISIT ================= */}
      <section className="page-sec" id="besuch">
        <div className="wrap">
          <div className="sec-title rv">
            <div className="eyebrow caps">{tx['visit.eyebrow']}</div>
            <h2>{tx['visit.title']}</h2>
            <img className="div" src={imgDivider} alt="" />
          </div>
          <div className="banner rv"><img loading="lazy" src={imgBanner} alt="Tripti Genusswelt – Das authentische indische Restaurant" width="1913" height="412" /></div>
          <div className="visit">
            <div className="frame rv">
              <FrameCorners all={false} />
              <h3>{tx['visit.hours']}</h3>
              <table className="hours">
                <tbody>
                  {days.map((i) => (
                    <tr key={i} className={`${i === today ? 'today ' : ''}${i === closedWeekday ? 'closed' : ''}`}>
                      <td>{tx.days[i]}</td>
                      <td>{i === closedWeekday ? tx.closed : `${hm(SERVICE[0][0])} – ${hm(SERVICE[0][1])} · ${hm(SERVICE[1][0])} – ${hm(SERVICE[1][1])}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="frame rv">
              <FrameCorners all={false} />
              <h3>{tx['visit.where']}</h3>
              <address>Tripti Genusswelt<br />Italiener Straße 17<br />9500 Villach</address>
              <ul className="contact">
                <li>{tx['f.phone']}: <a href={`tel:${PHONE_TEL}`}>{PHONE}</a></li>
                <li>E-Mail: <a href="mailto:info@triptigenusswelt.at">info@triptigenusswelt.at</a></li>
              </ul>
              <div className="links">
                <a className="btn btn-maroon" href="https://www.google.com/maps/dir/?api=1&destination=Italiener+Stra%C3%9Fe+17,+9500+Villach" target="_blank" rel="noopener noreferrer">{tx['visit.route']}</a>
                <a className="btn btn-out" href="https://www.google.com/maps/search/?api=1&query=Tripti+Genusswelt+Villach" target="_blank" rel="noopener noreferrer">{tx['visit.review']}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CLOSING (back cover) ================= */}
      <section className="cover closing">
        <div className="grain" />
        <Corners src={imgCornerMandala} />
        <div className="wrap closing-inner">
          <img className="mand" src={imgMandala} alt="" />
          <h2>{tx['closing.title']}<span>{tx['closing.sub']}</span></h2>
          <div className="etch" aria-hidden="true"><img className="t" src={imgTemple} alt="" /><img className="s" src={imgShip} alt="" /></div>
          <img src={imgDivider} alt="" style={{ width: 200, filter: 'sepia(1) saturate(3) hue-rotate(-12deg) brightness(1.25)' }} />
          <p className="thanks">{tx['closing.thanks']}</p>
        </div>
      </section>

      <div className={`toast${toastMsg ? ' show' : ''}`} role="status">{toastMsg}</div>
    </div>
  );
}
