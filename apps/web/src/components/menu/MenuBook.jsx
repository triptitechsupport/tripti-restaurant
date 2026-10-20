// The menu as a "real" printed menu that opens over the page: a cover, a
// contents page, one page per category and a back page with the allergen
// codes. Pages turn with a 3D page-flip (arrows, swipe or arrow keys).
// On wide screens it shows two pages side by side like an open book.
// A long category continues on the next page, so every dish is visible
// without scrolling inside a page (page breaks are measured, not guessed).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import { useMenuData, buildCats } from '@/components/menu/menuData.js';
import OrderingHint from './OrderingHint.jsx';
import DishRow, { VegMark } from '@/components/menu/DishRow.jsx';
import { ALG, PHONE, PHONE_TEL } from '@/pages/home/homeData.js';
import { swish } from '@/pages/home/homeSound.js';
import '@/pages/home/home.css';
import '@/components/menu/menubook.css';

import imgLogo from '@/assets/home/logo.webp';
import imgLogoMark from '@/assets/home/logo-mark.webp';
import imgCornerMandala from '@/assets/home/corner-mandala.webp';
import imgDivider from '@/assets/home/divider.webp';
import imgMandala from '@/assets/home/mandala.webp';

const TX = {
  de: {
    label: 'Speisekarte', open: 'Aufschlagen', toc: 'Inhalt', page: 'Seite',
    prev: 'Zurück blättern', next: 'Weiter blättern', close: 'Speisekarte schließen',
    chapter: 'Kapitel', cover: 'Umschlag', back: 'Allergene & Hinweise',
    all: 'Alle', veg: 'Vegetarisch', nv: 'Mit Fleisch',
    tag: 'Indische Küche aus dem Süden', addr: 'Italiener Straße 17 · 9500 Villach',
    welcome: 'Herzlich willkommen!', appetit: 'Guten Appetit!',
    how: 'Blättern Sie mit den Pfeilen, durch Wischen oder mit den Pfeiltasten. Jede Seite ist ein Kapitel unserer Küche.',
    legend: 'Zeichen auf der Karte', list: 'Alle Gerichte als Liste',
    dishes: '{n} Gerichte', allergens: 'Allergene (Kennzeichnung nach österreichischem Lebensmittelrecht)',
    note: 'Preise in Euro inkl. MwSt. Fragen Sie uns gerne nach Schärfe und Zutaten.',
    reserve: 'Tisch reservieren', call: 'Anrufen', cart: 'Warenkorb',
    loading: 'Speisekarte wird geladen …', failed: 'Die Speisekarte konnte gerade nicht geladen werden. Bitte versuchen Sie es später noch einmal.',
    thanks: 'Danke für Ihren Besuch', swipe: 'Wischen zum Blättern',
    more: 'Weiter auf der nächsten Seite', cont: 'Fortsetzung',
  },
  en: {
    label: 'Menu', open: 'Open the menu', toc: 'Contents', page: 'Page',
    prev: 'Previous page', next: 'Next page', close: 'Close the menu',
    chapter: 'Chapter', cover: 'Cover', back: 'Allergens & notes',
    all: 'All', veg: 'Vegetarian', nv: 'Meat',
    tag: 'Indian cuisine from the south', addr: 'Italiener Straße 17 · 9500 Villach',
    welcome: 'Welcome!', appetit: 'Enjoy your meal!',
    how: 'Turn the pages with the arrows, by swiping or with the arrow keys. Every page is a chapter of our kitchen.',
    legend: 'Symbols on the menu', list: 'All dishes as a list',
    dishes: '{n} dishes', allergens: 'Allergens (Austrian labelling codes)',
    note: 'Prices in euro incl. VAT. Ask us about spice levels and ingredients.',
    reserve: 'Book a table', call: 'Call', cart: 'Cart',
    loading: 'Loading the menu …', failed: 'The menu could not be loaded right now. Please try again later.',
    thanks: 'Thank you for visiting', swipe: 'Swipe to turn the page',
    more: 'Continued on the next page', cont: 'continued',
  },
};

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const WIDE_Q = '(min-width: 960px) and (min-height: 560px)';
function useWide() {
  const get = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia(WIDE_Q).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE_Q);
    const on = () => setWide(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  return wide;
}

export default function MenuBook({ open, onClose, startCat = '', onShowList }) {
  const { language, isOrderingEnabled } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = TX[lang];
  const { isAdminAuthenticated } = useAuth();
  const { cartItems, addToCart, updateQuantity } = useCart();
  const canOrder = !!isOrderingEnabled && !isAdminAuthenticated;
  const navigate = useNavigate();
  const wide = useWide();

  const { loading, failed, items, categories } = useMenuData(open);
  const [diet, setDiet] = useState('all');
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState(null);
  const wantCat = useRef(null);
  const closeRef = useRef(null);
  const lastFocus = useRef(null);
  const turnTimer = useRef(null);
  const swipe = useRef(null);
  const shownPage = useRef(null);

  const cats = useMemo(() => buildCats(items, categories), [items, categories]);

  // Dishes per category for the current filter.
  const catLists = useMemo(() => cats
    .map((c) => ({ c, its: items.filter((i) => i.cat === c.id && (diet === 'all' || (diet === 'v' ? i.veg : !i.veg))) }))
    .filter((x) => x.its.length), [cats, items, diet]);

  // How many dishes fit on each page of a category: { catId: [n1, n2, ...] }.
  const [fit, setFit] = useState(null);
  const [box, setBox] = useState(null);
  const [fontsTick, setFontsTick] = useState(0);
  const bookRef = useRef(null);
  const measureRef = useRef(null);

  const pages = useMemo(() => {
    const list = [{ k: 'cover' }, { k: 'toc' }];
    catLists.forEach(({ c, its }, ci) => {
      const want = fit && fit[c.id];
      const sizes = want && want.reduce((a, n) => a + n, 0) === its.length ? want : [its.length];
      let from = 0;
      sizes.forEach((n, part) => {
        list.push({ k: 'cat', c, its: its.slice(from, from + n), part, parts: sizes.length, chap: ci + 1 });
        from += n;
      });
    });
    list.push({ k: 'back' });
    return list;
  }, [catLists, fit]);

  /* page <-> view (a view is one page, or a two-page spread on wide screens) */
  const viewCount = wide ? Math.floor(pages.length / 2) + 1 : pages.length;
  const viewOf = useCallback((p) => (wide ? Math.floor((p + 1) / 2) : p), [wide]);
  const pageOf = useCallback((v) => (wide ? (v === 0 ? 0 : 2 * v - 1) : v), [wide]);
  const view = viewOf(page);
  const viewPages = (v) => (wide ? [v === 0 ? { k: 'inside' } : pages[2 * v - 1], pages[2 * v] || { k: 'end' }] : [pages[v]]);

  /* page size: re-measure when the window (and so the book) changes size */
  useEffect(() => {
    const el = bookRef.current;
    if (!open || !el) return undefined;
    const read = () => {
      const slot = el.querySelector('.bk-slot');
      if (!slot) return;
      const w = Math.round(slot.clientWidth);
      const h = Math.round(slot.clientHeight);
      if (w > 0 && h > 0) setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, loading, wide, catLists.length]);

  useEffect(() => {
    if (!open || !document.fonts || !document.fonts.ready) return;
    let alive = true;
    document.fonts.ready.then(() => { if (alive) setFontsTick((n) => n + 1); });
    return () => { alive = false; };
  }, [open]);

  /* split each category into pages that fit, using a hidden copy of the page */
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || !box) return;
    const body = root.querySelector('.pg-body');
    if (!body) return;
    const cs = getComputedStyle(body);
    const avail = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6;
    const next = {};
    root.querySelectorAll('section[data-cat]').forEach((sec) => {
      const headH = sec.querySelector('[data-part="head"]').getBoundingClientRect().height;
      const contH = sec.querySelector('[data-part="cont"]').getBoundingClientRect().height;
      const wrap = sec.querySelector('[data-part="list"]');
      const lis = [...wrap.querySelectorAll('li')];
      const bottom = wrap.getBoundingClientRect().bottom;
      const tops = lis.map((li) => li.getBoundingClientRect().top);
      const sizes = [];
      let n = 0;
      let used = headH;
      tops.forEach((t, i) => {
        const h = (i + 1 < tops.length ? tops[i + 1] : bottom) - t;
        if (n > 0 && used + h > avail) { sizes.push(n); n = 0; used = contH; }
        n += 1;
        used += h;
      });
      if (n) sizes.push(n);
      next[sec.dataset.cat] = sizes;
    });
    setFit((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : next));
  }, [box, catLists, lang, canOrder, fontsTick, isAdminAuthenticated]);

  /* contents and back page: shrink a little when they don't fit the page */
  useLayoutEffect(() => {
    if (!open) return;
    document.querySelectorAll('.tg-book .bk-book .pg-body > .fit').forEach((el) => {
      const bodyEl = el.parentElement;
      const cs = getComputedStyle(bodyEl);
      const avail = bodyEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      el.style.zoom = '';
      const h = el.getBoundingClientRect().height;
      if (avail > 0 && h > avail) el.style.zoom = String(Math.max(0.55, Math.floor((avail / h) * 100) / 100));
    });
  });

  /* open / close */
  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTurn(null);
    setPage(0);
    wantCat.current = startCat || null;
    const id = setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      clearTimeout(id);
      clearTimeout(turnTimer.current);
      document.body.style.overflow = prevOverflow;
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
    };
  }, [open, startCat]);

  /* keep the reader on the same chapter when the filter changes; jump to startCat */
  useEffect(() => {
    if (wantCat.current && !loading) {
      const idx = pages.findIndex((p) => p.c && p.c.id === wantCat.current);
      wantCat.current = null;
      setPage(idx >= 0 ? idx : 1);
      return;
    }
    const was = shownPage.current;
    if (was && was.k === 'cat' && !pages.includes(was)) {
      const first = was.its[0] && was.its[0].id;
      let idx = pages.findIndex((p) => p.k === 'cat' && p.its.some((d) => d.id === first));
      if (idx < 0) idx = pages.findIndex((p) => p.k === 'cat' && p.c.id === was.c.id);
      if (idx >= 0) { setPage(idx); return; }
    }
    if (was && was.k === 'back') { setPage(pages.length - 1); return; }
    if (page > pages.length - 1) setPage(pages.length - 1);
  }, [pages, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { shownPage.current = pages[page] || null; }, [page, pages]);

  const goView = useCallback((to) => {
    if (turn) return;
    const target = Math.max(0, Math.min(viewCount - 1, to));
    if (target === view) return;
    if (reduceMotion()) { setPage(pageOf(target)); return; }
    swish();
    setTurn({ from: view, to: target, dir: target > view ? 1 : -1 });
    clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => { setPage(pageOf(target)); setTurn(null); }, 900);
  }, [turn, view, viewCount, pageOf]);

  const finishTurn = () => {
    if (!turn) return;
    clearTimeout(turnTimer.current);
    setPage(pageOf(turn.to));
    setTurn(null);
  };

  const next = useCallback(() => goView(view + 1), [goView, view]);
  const prev = useCallback(() => goView(view - 1), [goView, view]);
  const goPage = (p) => goView(viewOf(p));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      const tag = e.target && e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      if (e.key === 'Tab') {
        // keep keyboard focus inside the menu while it is open
        const box = document.querySelector('.tg-book .bk-dialog');
        if (!box) return;
        const f = [...box.querySelectorAll('a[href],button:not([disabled]),select,[tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.closest('[inert],[aria-hidden="true"]'));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, onClose]);

  const onPointerDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  };

  if (!open || typeof document === 'undefined') return null;

  const qtyOf = (id) => cartItems.find((c) => c.id === id)?.quantity || 0;
  const cartCount = cartItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const onAdd = (d) => addToCart({ ...d.raw, name: lang === 'de' ? d.de : d.en });
  const onLess = (d) => updateQuantity(d.id, qtyOf(d.id) - 1);
  const catName = (c) => (lang === 'de' ? c.de : c.en);
  const showList = () => {
    onClose();
    if (onShowList) onShowList();
    else navigate('/menu?view=list');
  };

  const catHead = (c, chap) => {
    const other = lang === 'de' ? c.en : c.de;
    return (
      <>
        <div className="cat-head">
          <div className="caps pg-eyebrow">{tx.chapter} {chap}</div>
          <h3>{catName(c)}</h3>
          {other !== catName(c) && <div className="sub">{other}</div>}
          <img src={imgDivider} alt="" width="346" height="39" />
        </div>
        <OrderingHint style={{ margin: '0 0 14px', fontSize: '.85rem' }} />
      </>
    );
  };
  const contHead = (c, chap) => (
    <div className="cat-head cat-cont">
      <div className="caps pg-eyebrow">{tx.chapter} {chap} · {tx.cont}</div>
      <h3>{catName(c)}</h3>
    </div>
  );

  /* ---------- page faces ---------- */
  const renderPage = (pg, side, live) => {
    if (!pg) return null;
    const idx = pages.indexOf(pg);
    const num = idx > 0 ? <div className="pg-num">{idx}</div> : null;
    const cls = `pg pg-${pg.k} side-${side}`;
    if (pg.k === 'cover') {
      return (
        <div className={cls}>
          <div className="grain" />
          <img className="cm tl" src={imgCornerMandala} alt="" />
          <img className="cm tr" src={imgCornerMandala} alt="" />
          <img className="cm bl" src={imgCornerMandala} alt="" />
          <img className="cm br" src={imgCornerMandala} alt="" />
          <div className="cv-in">
            <img className="cv-mandala" src={imgMandala} alt="" />
            <div className="caps cv-eyebrow">{tx.label}{lang === 'de' ? ' · Menu' : ' · Speisekarte'}</div>
            <div className="cv-plaque"><img className="cv-logo" src={imgLogo} alt="Tripti Genusswelt" /></div>
            <p className="cv-tag">{tx.tag}</p>
            <img className="cv-div" src={imgDivider} alt="" />
            <p className="cv-addr">{tx.addr}</p>
            {live && (
              <button type="button" className="btn btn-gold cv-open" onClick={next}>{tx.open}</button>
            )}
          </div>
        </div>
      );
    }
    if (pg.k === 'inside' || pg.k === 'end') {
      return (
        <div className={`${cls} pg-endpaper`}>
          <img className="ep-mandala" src={imgMandala} alt="" />
          {pg.k === 'inside' && <p className="ep-text">{tx.appetit}</p>}
          {pg.k === 'end' && <p className="ep-text">{tx.thanks}</p>}
        </div>
      );
    }
    if (pg.k === 'toc') {
      return (
        <div className={cls}>
          <div className="pg-body">
            <div className="fit">
            <div className="cat-head">
              <img className="pg-mark" src={imgLogoMark} alt="" width="1070" height="365" />
              <h3>{tx.welcome}</h3>
              <img src={imgDivider} alt="" width="346" height="39" />
            </div>
            <p className="toc-how">{tx.how}</p>
            <h4 className="caps toc-h">{tx.toc}</h4>
            <ol className="toc">
              {pages.map((p, i) => (p.k === 'cat' && p.part === 0 ? (
                <li key={p.c.id}>
                  <button type="button" onClick={() => goPage(i)} tabIndex={live ? 0 : -1}>
                    <span className="toc-name">{catName(p.c)}</span>
                    <span className="lead-dots" />
                    <span className="toc-num">{i}</span>
                  </button>
                </li>
              ) : null))}
              <li>
                <button type="button" onClick={() => goPage(pages.length - 1)} tabIndex={live ? 0 : -1}>
                  <span className="toc-name">{tx.back}</span>
                  <span className="lead-dots" />
                  <span className="toc-num">{pages.length - 1}</span>
                </button>
              </li>
            </ol>
            <div className="toc-legend">
              <span><VegMark veg lang={lang} /> {tx.veg}</span>
              <span><VegMark veg={false} lang={lang} /> {tx.nv}</span>
            </div>
            {live && <button type="button" className="btn btn-out toc-list" onClick={showList}>{tx.list}</button>}
            </div>
          </div>
          {num}
        </div>
      );
    }
    if (pg.k === 'back') {
      return (
        <div className={cls}>
          <div className="pg-body">
            <div className="fit">
            <div className="cat-head">
              <h3>{tx.back}</h3>
              <img src={imgDivider} alt="" width="346" height="39" />
            </div>
            <p className="back-h">{tx.allergens}</p>
            <ul className="alg-list">
              {Object.keys(ALG).map((k) => <li key={k}><b>{k}</b>{ALG[k][lang === 'de' ? 0 : 1]}</li>)}
            </ul>
            <p className="back-note">{tx.note}</p>
            {live && (
              <div className="back-cta">
                <Link className="btn btn-maroon" to="/table-reservation" onClick={onClose}>{tx.reserve}</Link>
                <a className="btn btn-out" href={`tel:${PHONE_TEL}`}>{tx.call} {PHONE}</a>
              </div>
            )}
            </div>
          </div>
          {num}
        </div>
      );
    }
    // category page (a long category continues on the following pages)
    const more = pg.part < pg.parts - 1;
    return (
      <div className={cls}>
        <div className="pg-body">
          {pg.part === 0 ? catHead(pg.c, pg.chap) : contHead(pg.c, pg.chap)}
          <ul className="items one">
            {pg.its.map((d) => (
              <DishRow key={d.id} d={d} lang={lang} canOrder={canOrder && live} qty={qtyOf(d.id)} onAdd={onAdd} onLess={onLess} />
            ))}
          </ul>
        </div>
        <div className="pg-num">
          {idx}
          {more && (live
            ? <button type="button" className="pg-more" onClick={next}>{tx.more} →</button>
            : <span className="pg-more">{tx.more} →</span>)}
        </div>
      </div>
    );
  };

  /* ---------- what is shown while a page turns ---------- */
  const cur = viewPages(turn ? turn.from : view);
  let base = cur;
  let leaf = null;
  if (turn) {
    const to = viewPages(turn.to);
    if (wide) {
      base = turn.dir > 0 ? [cur[0], to[1]] : [to[0], cur[1]];
      leaf = turn.dir > 0
        ? { pos: 'r', front: cur[1], back: to[0], frontSide: 'r', backSide: 'l' }
        : { pos: 'l', front: cur[0], back: to[1], frontSide: 'l', backSide: 'r' };
    } else {
      base = turn.dir > 0 ? to : cur;
      leaf = { pos: 's', front: turn.dir > 0 ? cur[0] : to[0], frontSide: 's' };
    }
  }
  const sides = wide ? ['l', 'r'] : ['s'];
  const curCatPage = pages[page] && pages[page].k === 'cat'
    ? pages.findIndex((p) => p.k === 'cat' && p.c.id === pages[page].c.id) : '';

  const body = (
    <div className="tg-home tg-book" role="dialog" aria-modal="true" aria-label={tx.label}>
      <div className="bk-backdrop" onClick={onClose} />
      {box && !loading && (
        <div ref={measureRef} className="bk-measure" aria-hidden="true" inert="" onLoadCapture={() => setFontsTick((n) => n + 1)} style={{ width: box.w, height: box.h }}>
          <div className={`pg pg-cat side-${wide ? 'r' : 's'}`}>
            <div className="pg-body">
              {catLists.map(({ c, its }) => (
                <section key={c.id} data-cat={c.id}>
                  <div data-part="head">{catHead(c, 1)}</div>
                  <div data-part="cont">{contHead(c, 1)}</div>
                  <div data-part="list">
                    <ul className="items one">
                      {its.map((d) => <DishRow key={d.id} d={d} lang={lang} canOrder={canOrder} qty={0} onAdd={() => {}} onLess={() => {}} />)}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
            <div className="pg-num">12<span className="pg-more">{tx.more} →</span></div>
          </div>
        </div>
      )}
      <div className="bk-dialog">
        <div className="bk-bar">
          <div className="seg" role="group" aria-label="Filter">
            {[['all', tx.all], ['v', tx.veg], ['n', tx.nv]].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={diet === k}
                onClick={() => { wantCat.current = pages[page] && pages[page].c ? pages[page].c.id : null; setDiet(k); }}>
                {label}
              </button>
            ))}
          </div>
          <label className="bk-chapter">
            <span className="sr-only">{tx.chapter}</span>
            <select value={curCatPage} onChange={(e) => { if (e.target.value !== '') goPage(Number(e.target.value)); }} aria-label={tx.chapter}>
              <option value="">{tx.chapter} …</option>
              {pages.map((p, i) => (p.k === 'cat' && p.part === 0 ? <option key={p.c.id} value={i}>{catName(p.c)}</option> : null))}
            </select>
          </label>
          {canOrder && cartCount > 0 && (
            <Link className="bk-cart" to="/cart" onClick={onClose}>{tx.cart} ({cartCount})</Link>
          )}
          <button ref={closeRef} type="button" className="bk-close" onClick={onClose} aria-label={tx.close}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="bk-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }}>
          {loading ? (
            <p className="bk-msg">{tx.loading}</p>
          ) : failed && items.length === 0 ? (
            <p className="bk-msg">{tx.failed}</p>
          ) : (
            <div ref={bookRef} onLoadCapture={() => setFontsTick((n) => n + 1)} className={`bk-book ${wide ? 'wide' : 'narrow'}${turn ? ' turning' : ''}`}>
              {sides.map((s, i) => (
                <div key={s} className={`bk-slot slot-${s}`}>
                  {renderPage(base[i], s, !turn)}
                </div>
              ))}
              {leaf && (
                <div className={`bk-leaf leaf-${leaf.pos} ${turn.dir > 0 ? 'fwd' : 'bwd'}`} aria-hidden="true" inert=""
                  onAnimationEnd={finishTurn}>
                  <div className="face front">{renderPage(leaf.front, leaf.frontSide, false)}</div>
                  {leaf.back && <div className="face back">{renderPage(leaf.back, leaf.backSide, false)}</div>}
                </div>
              )}
              {wide && <div className="bk-spine" aria-hidden="true" />}
            </div>
          )}
        </div>

        {!loading && !(failed && items.length === 0) && (
          <div className="bk-nav">
            <button type="button" className="bk-arrow" onClick={prev} disabled={view === 0} aria-label={tx.prev}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <div className="bk-dots" role="group" aria-label={tx.page}>
              {Array.from({ length: viewCount }).map((_, v) => (
                <button key={v} type="button" aria-pressed={v === view} aria-label={`${tx.page} ${pageOf(v) || tx.cover}`} onClick={() => goView(v)} />
              ))}
            </div>
            <span className="bk-count" aria-live="polite">
              {view === 0 ? tx.cover : `${tx.page} ${wide ? `${pageOf(view)}${pages[pageOf(view) + 1] ? `–${pageOf(view) + 1}` : ''}` : page} / ${pages.length - 1}`}
            </span>
            <button type="button" className="bk-arrow" onClick={next} disabled={view >= viewCount - 1} aria-label={tx.next}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
