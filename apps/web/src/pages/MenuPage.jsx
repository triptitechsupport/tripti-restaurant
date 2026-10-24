import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import OrderingHint from '@/components/menu/OrderingHint.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import PdfMenuDisplay from '@/components/PdfMenuDisplay.jsx';
import MenuBook from '@/components/menu/MenuBook.jsx';
import PageCover from '@/components/menu/PageCover.jsx';
import DishRow from '@/components/menu/DishRow.jsx';
import { useMenuData, buildCats, normalizeItem } from '@/components/menu/menuData.js';
import { ALG } from '@/pages/home/homeData.js';
import pb from '@/lib/pocketbaseClient.js';
import '@/pages/home/home.css';
import '@/components/menu/menubook.css';
import imgCornerA from '@/assets/home/corner-a.webp';
import imgCornerB from '@/assets/home/corner-b.webp';
import imgDividerSrc from '@/assets/home/divider.webp';

/* ─── Category config ─────────────────────────────────────────────────────── */
const CATEGORY_DEFS = [
  { id: 'Appetizers', tKey: 'cat_appetizers' },
  { id: 'South Indian Classics', tKey: 'cat_south_indian' },
  { id: 'Biryani', tKey: 'cat_biryani' },
  { id: 'Curries', tKey: 'cat_curries' },
  { id: 'Thalis', tKey: 'cat_thalis' },
  { id: 'Soups', tKey: 'cat_soups' },
  { id: 'Salads', tKey: 'cat_salads' },
  { id: 'Drinks', tKey: 'cat_drinks' },
  { id: 'Desserts', tKey: 'cat_desserts' },
  { id: 'One-pot rice specials', tKey: 'cat_onepot_rice' },
];


/* ─── Static fallback data ────────────────────────────────────────────────── */
const STATIC_ITEMS = [
  // Appetizers (all served with mint chutney)
  { id: 'a1', nameEN: 'Chicken Pakoda NV', nameDE: 'Chicken Pakoda NV', descriptionEN: 'Crispy spiced chicken fritters, served with mint chutney.', descriptionDE: 'Knusprige, gewürzte Hähnchenfrittier, serviert mit Minzchutney.', price: 8.50, category: 'Appetizers', isVegetarian: false, image: null },
  { id: 'a2', nameEN: 'Onion Pakoda', nameDE: 'Onion Pakoda', descriptionEN: 'Golden fried onion fritters with herbs and spices, served with mint chutney.', descriptionDE: 'Goldbraun gebratene Zwiebelfrittier mit Kräutern und Gewürzen, serviert mit Minzchutney.', price: 5.90, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 'a3', nameEN: 'Sabji Pakoda', nameDE: 'Sabji Pakoda', descriptionEN: 'Assorted vegetable fritters in spiced gram flour, served with mint chutney.', descriptionDE: 'Gemischte Gemüsefrittier in gewürztem Kichererbsenmehl, serviert mit Minzchutney.', price: 5.90, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 'a4', nameEN: 'Paneer Bajji', nameDE: 'Paneer Bajji', descriptionEN: 'Indian cottage cheese slices in a spiced batter, served with mint chutney.', descriptionDE: 'Indischer Frischkäse in gewürztem Teig, serviert mit Minzchutney.', price: 6.90, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 'a5', nameEN: 'Aloo Bajji', nameDE: 'Aloo Bajji', descriptionEN: 'Spiced potato slices dipped in batter and fried, served with mint chutney.', descriptionDE: 'Gewürzte Kartoffelscheiben im Teig frittiert, serviert mit Minzchutney.', price: 5.50, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 'a6', nameEN: 'Mirchi Bajji', nameDE: 'Mirchi Bajji', descriptionEN: 'Green chilies stuffed and fried in a spiced batter, served with mint chutney.', descriptionDE: 'Gefüllte grüne Chilis in gewürztem Teig frittiert, serviert mit Minzchutney.', price: 5.90, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 'a7', nameEN: 'Egg Bajji E', nameDE: 'Egg Bajji E', descriptionEN: 'Hard-boiled eggs in spiced batter, fried golden, served with mint chutney.', descriptionDE: 'Hartgekochte Eier in gewürztem Teig goldbraun frittiert, serviert mit Minzchutney.', price: 6.50, category: 'Appetizers', isVegetarian: false, image: null },

  // South Indian Classics
  { id: 'si1', nameEN: 'Idly', nameDE: 'Idly', descriptionEN: 'Steamed rice cakes served with sambar and peanut, coconut, ginger and tomato chutneys.', descriptionDE: 'Gedämpfte Reisküchlein, serviert mit Sambar und Erdnuss-, Kokos-, Ingwer- und Tomatenchutney.', price: 7.50, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si2', nameEN: 'Plain Dosa', nameDE: 'Plain Dosa', descriptionEN: 'Crispy rice and lentil crepe served with chutney and sambar.', descriptionDE: 'Knuspriger Reis-Linsen-Crêpe, serviert mit Chutney und Sambar.', price: 8.50, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si3', nameEN: 'Masala Dosa', nameDE: 'Masala Dosa', descriptionEN: 'Crispy dosa stuffed with spiced potato masala, served with chutney and sambar.', descriptionDE: 'Knusprige Dosa gefüllt mit gewürztem Kartoffelmasala, serviert mit Chutney und Sambar.', price: 9.90, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si4', nameEN: 'Pesarattu', nameDE: 'Pesarattu', descriptionEN: 'Green gram savoury pancake served with upma.', descriptionDE: 'Herzhafter Pfannkuchen aus Mungbohnen, serviert mit Upma.', price: 9.50, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si5', nameEN: 'Garelu', nameDE: 'Garelu', descriptionEN: 'Crispy lentil vadas served with chutney.', descriptionDE: 'Knusprige Linsen-Vadas, serviert mit Chutney.', price: 7.90, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si6', nameEN: 'Masala Vada', nameDE: 'Masala Vada', descriptionEN: 'Spiced chana dal vadas with onion and herbs.', descriptionDE: 'Gewürzte Chana-Dal-Vadas mit Zwiebeln und Kräutern.', price: 7.90, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si7', nameEN: 'Idiyappam', nameDE: 'Idiyappam', descriptionEN: 'Delicate rice flour string hoppers.', descriptionDE: 'Zarte Reisnudel-Nester aus Reismehl.', price: 8.50, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si8', nameEN: 'Appam', nameDE: 'Appam', descriptionEN: 'Lacy soft rice pancakes with a tender centre.', descriptionDE: 'Zarte Reispfannkuchen mit weicher Mitte.', price: 8.50, category: 'South Indian Classics', isVegetarian: true, image: null },
  { id: 'si9', nameEN: 'Mini Tiffin', nameDE: 'Mini Tiffin', descriptionEN: 'Small portions of dosa, idly, vada, kesari and pongal.', descriptionDE: 'Kleine Portionen von Dosa, Idly, Vada, Kesari und Pongal.', price: 11.90, category: 'South Indian Classics', isVegetarian: true, image: null },

  // Biryani
  { id: 'bi1', nameEN: 'Veg dum Biryani', nameDE: 'Veg dum Biryani', descriptionEN: 'Fragrant basmati rice layered with vegetables and spices, served with raita.', descriptionDE: 'Duftender Basmati-Reis mit Gemüse und Gewürzen, serviert mit Raita.', price: 14.50, category: 'Biryani', isVegetarian: true, image: null },
  { id: 'bi2', nameEN: 'Chicken dum Biryani NV', nameDE: 'Chicken dum Biryani NV', descriptionEN: 'Basmati rice layered with spiced chicken, cooked dum-style, served with raita.', descriptionDE: 'Basmati-Reis mit gewürztem Hähnchen, im Dum-Stil gegart, serviert mit Raita.', price: 16.90, category: 'Biryani', isVegetarian: false, image: null },
  { id: 'bi3', nameEN: 'Mutton dum Biryani NV', nameDE: 'Mutton dum Biryani NV', descriptionEN: 'Basmati rice layered with tender spiced mutton, served with raita.', descriptionDE: 'Basmati-Reis mit zartem gewürztem Lammfleisch, serviert mit Raita.', price: 18.50, category: 'Biryani', isVegetarian: false, image: null },

  // Curries
  { id: 'c1', nameEN: 'Butter Chicken NV', nameDE: 'Butter Chicken NV', descriptionEN: 'Tender chicken in a rich, creamy tomato sauce with aromatic spices.', descriptionDE: 'Zartes Hühnchen in einer reichhaltigen, cremigen Tomatensauce mit aromatischen Gewürzen.', price: 17.90, category: 'Curries', isVegetarian: false, image: null },
  { id: 'c2', nameEN: 'Kadai Paneer', nameDE: 'Kadai Paneer', descriptionEN: 'Paneer and peppers cooked in a spicy kadai masala.', descriptionDE: 'Paneer und Paprika in würziger Kadai-Masala gegart.', price: 15.90, category: 'Curries', isVegetarian: true, image: null },
  { id: 'c3', nameEN: 'Mutton Marag NV', nameDE: 'Mutton Marag NV', descriptionEN: 'Hyderabadi-style mutton stew, served with Idiyappam or Appam.', descriptionDE: 'Lamm-Eintopf nach Hyderabadi-Art, serviert mit Idiyappam oder Appam.', price: 19.50, category: 'Curries', isVegetarian: false, image: null },

  // Thalis
  { id: 't1', nameEN: 'Veg Thali', nameDE: 'Veg Thali', descriptionEN: 'Dal with veg, a fry, white rice, sambar, sweet and pickle.', descriptionDE: 'Dal mit Gemüse, einer Beilage, weißem Reis, Sambar, Süßigkeit und Pickle.', price: 16.50, category: 'Thalis', isVegetarian: true, image: null },
  { id: 't2', nameEN: 'Non-Veg Thali NV', nameDE: 'Non-Veg Thali NV', descriptionEN: 'Curry, fry, white rice, rasam, sweet and pickle.', descriptionDE: 'Curry, Beilage, weißer Reis, Rasam, Süßigkeit und Pickle.', price: 18.90, category: 'Thalis', isVegetarian: false, image: null },

  // Soups
  { id: 'so1', nameEN: 'Dal Soup', nameDE: 'Dal-Suppe', descriptionEN: 'Light yellow lentil soup tempered with spices.', descriptionDE: 'Leichte gelbe Linsensuppe, mit Gewürzen abgeschmeckt.', price: 4.90, category: 'Soups', isVegetarian: true, image: null },
  { id: 'so2', nameEN: 'Rasam', nameDE: 'Rasam', descriptionEN: 'Tangy spiced tamarind-pepper soup.', descriptionDE: 'Würzige Tamarinden-Pfeffer-Suppe.', price: 4.50, category: 'Soups', isVegetarian: true, image: null },
  { id: 'so3', nameEN: 'Chicken Soup NV', nameDE: 'Chicken Soup NV', descriptionEN: 'Hearty chicken broth with aromatic spices.', descriptionDE: 'Herzhafte Hühnerbrühe mit aromatischen Gewürzen.', price: 5.90, category: 'Soups', isVegetarian: false, image: null },

  // Salads
  { id: 'sa1', nameEN: 'Tawa Chicken Salad NV', nameDE: 'Tawa Chicken Salad NV', descriptionEN: 'Grilled tawa chicken tossed with fresh salad greens.', descriptionDE: 'Gegrilltes Tawa-Hähnchen auf frischen Salatblättern.', price: 9.50, category: 'Salads', isVegetarian: false, image: null },
  { id: 'sa2', nameEN: 'Green Salad', nameDE: 'Green Salad', descriptionEN: 'Fresh seasonal greens with cucumber, tomato and onion.', descriptionDE: 'Frisches Saisongemüse mit Gurke, Tomate und Zwiebel.', price: 6.50, category: 'Salads', isVegetarian: true, image: null },

  // Drinks
  { id: 'dr1', nameEN: 'Indian Tea', nameDE: 'Indischer Tee', descriptionEN: 'Spiced Indian tea brewed with milk.', descriptionDE: 'Gewürzter indischer Tee, mit Milch gebrüht.', price: 2.90, category: 'Drinks', isVegetarian: true, image: null },
  { id: 'dr2', nameEN: 'Sweet Lassi', nameDE: 'Sweet Lassi', descriptionEN: 'Chilled sweet yogurt drink.', descriptionDE: 'Gekühltes süßes Joghurtgetränk.', price: 3.90, category: 'Drinks', isVegetarian: true, image: null },
  { id: 'dr3', nameEN: 'Salt Lassi', nameDE: 'Salt Lassi', descriptionEN: 'Chilled salty yogurt drink with cumin.', descriptionDE: 'Gekühltes salziges Joghurtgetränk mit Kreuzkümmel.', price: 3.90, category: 'Drinks', isVegetarian: true, image: null },
  { id: 'dr4', nameEN: 'Mango Lassi', nameDE: 'Mango Lassi', descriptionEN: 'Chilled yogurt drink blended with sweet mango.', descriptionDE: 'Gekühltes Joghurtgetränk mit süßer Mango.', price: 4.50, category: 'Drinks', isVegetarian: true, image: null },
  { id: 'dr5', nameEN: 'Elderflower Juice (Holunder Saft)', nameDE: 'Elderflower Juice (Holunder Saft)', descriptionEN: 'Refreshing elderflower juice.', descriptionDE: 'Erfrischender Holundersaft.', price: 4.50, category: 'Drinks', isVegetarian: true, image: null },

  // Desserts
  { id: 'de1', nameEN: 'Gulab Jamun', nameDE: 'Gulab Jamun', descriptionEN: 'Soft milk-solid dumplings soaked in rose-cardamom sugar syrup.', descriptionDE: 'Weiche Milchklöße in Rosen-Kardamom-Zuckersirup.', price: 5.90, category: 'Desserts', isVegetarian: true, image: null },
  { id: 'de2', nameEN: 'Laddu', nameDE: 'Laddu', descriptionEN: 'Sweet gram flour balls with ghee and nuts.', descriptionDE: 'Süße Kichererbsenmehl-Kugeln mit Ghee und Nüssen.', price: 5.50, category: 'Desserts', isVegetarian: true, image: null },
  { id: 'de3', nameEN: 'Rava Kesari', nameDE: 'Rava Kesari', descriptionEN: 'Semolina pudding with ghee, saffron and nuts.', descriptionDE: 'Grießpudding mit Ghee, Safran und Nüssen.', price: 5.90, category: 'Desserts', isVegetarian: true, image: null },
  { id: 'de4', nameEN: 'Payasam', nameDE: 'Payasam', descriptionEN: 'Traditional rice and milk pudding with jaggery and nuts.', descriptionDE: 'Traditioneller Reis-Milch-Pudding mit Jaggery und Nüssen.', price: 6.50, category: 'Desserts', isVegetarian: true, image: null },

  // One-pot rice specials
  { id: 'op1', nameEN: 'Dal Rice', nameDE: 'Dal Rice', descriptionEN: 'Rice cooked with spiced dal.', descriptionDE: 'Reis mit gewürztem Dal gekocht.', price: 9.90, category: 'One-pot rice specials', isVegetarian: true, image: null },
  { id: 'op2', nameEN: 'Bisibelebath', nameDE: 'Bisibelebath', descriptionEN: 'Spicy rice and lentil dish with vegetables and tamarind.', descriptionDE: 'Würzige Reis-Linsen-Speise mit Gemüse und Tamarinde.', price: 10.90, category: 'One-pot rice specials', isVegetarian: true, image: null },
  { id: 'op3', nameEN: 'Pongal', nameDE: 'Pongal', descriptionEN: 'Creamy rice and moong dal with pepper and ghee.', descriptionDE: 'Cremiger Reis mit Mungbohnen, Pfeffer und Ghee.', price: 9.50, category: 'One-pot rice specials', isVegetarian: true, image: null },
  { id: 'op4', nameEN: 'Uppma & Kesari', nameDE: 'Uppma & Kesari', descriptionEN: 'Savoury semolina upma served with sweet rava kesari.', descriptionDE: 'Herzhaftes Grieß-Upma mit süßem Rava-Kesari.', price: 9.90, category: 'One-pot rice specials', isVegetarian: true, image: null },
];

const TX = {
  de: {
    eyebrow: 'Speisekarte · Menu', lead: 'Südindische Küche, frisch gekocht in Villach. Wählen Sie „Alle“, um jedes Gericht zu sehen, oder eine Kategorie.',
    book: 'Speisekarte aufschlagen', reserve: 'Tisch reservieren', cart: 'Zum Warenkorb',
    search: 'Gericht suchen, z. B. Dosa', all: 'Alle', veg: 'Vegetarisch', nv: 'Mit Fleisch',
    pdf: 'Speisekarte als PDF', empty: 'Keine passenden Gerichte gefunden.', results: 'Suchergebnisse',
    count: '{n} Gerichte', loading: 'Speisekarte wird geladen …',
    order: 'Bestellmodus: Gerichte in den Warenkorb legen', orderHint: 'Mit + hinzufügen, mit − entfernen.',
    allergens: 'Allergene (Kennzeichnung nach österreichischem Lebensmittelrecht)', note: 'Preise in Euro inkl. MwSt.',
  },
  en: {
    eyebrow: 'Menu · Speisekarte', lead: 'South Indian cooking, made fresh in Villach. Choose “All” to see every dish, or pick a category.',
    book: 'Open the menu book', reserve: 'Book a table', cart: 'Go to cart',
    search: 'Search dishes, e.g. dosa', all: 'All', veg: 'Vegetarian', nv: 'Meat',
    pdf: 'Menu as PDF', empty: 'No matching dishes.', results: 'Search results',
    count: '{n} dishes', loading: 'Loading the menu …',
    order: 'Ordering mode: add dishes to your cart', orderHint: 'Tap + to add, − to remove.',
    allergens: 'Allergens (Austrian labelling codes)', note: 'Prices in euro incl. VAT.',
  },
};

const FALLBACK_ITEMS = STATIC_ITEMS.map(normalizeItem);

function dishImage(d) {
  if (!d.raw || !d.raw.image) return null;
  try { return pb.files.getURL(d.raw, d.raw.image, { thumb: '100x100' }); } catch { return null; }
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function MenuPage() {
  const { t, language, isOrderingEnabled } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = TX[lang];
  const [searchParams, setSearchParams] = useSearchParams();
  const { cartItems, addToCart, updateQuantity } = useCart();
  const { isAdminAuthenticated } = useAuth();
  // Guests can add dishes whenever online ordering is on; ?order=1 only
  // switches the page into ordering layout (no PDF, book closed).
  const canOrder = !!isOrderingEnabled && !isAdminAuthenticated;
  const orderMode = searchParams.get('order') === '1' && canOrder;
  const listView = searchParams.get('view') === 'list';

  const [pdfSettings, setPdfSettings] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [marquee, setMarquee] = useState(null);
  const [cat, setCat] = useState('*');
  const [diet, setDiet] = useState('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [bookOpen, setBookOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const autoOpened = useRef(false);
  const rootRef = useRef(null);
  const stickRef = useRef(null);

  /* Fetch marquee settings */
  useEffect(() => {
    let alive = true;
    pb.collection('marquee_settings')
      .getFirstListItem('', { requestKey: 'menu-marquee', $autoCancel: false })
      .then(rec => { if (alive) setMarquee(rec); })
      .catch(() => { });
    pb.collection('marquee_settings').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') setMarquee(e.record);
      if (e.action === 'delete') setMarquee(null);
    }).catch(() => { });
    return () => {
      alive = false;
      void pb.collection('marquee_settings').unsubscribe('*').catch(() => { });
    };
  }, []);

  /* Fetch PDF settings */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await pb.collection('pdf_menu_settings').getList(1, 1, { $autoCancel: false });
        if (!alive) return;
        if (res.items.length > 0) setPdfSettings(res.items[0]);
      } catch { }
      if (alive) setPdfLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const hasPdfFiles = !!(pdfSettings?.pdfMenuDE || pdfSettings?.pdfMenuEN);
  const hasMenuImages = !!(pdfSettings?.menuImageDE || pdfSettings?.menuImageEN);
  const isPdfEnabled = pdfSettings?.pdfMenuEnabled !== false && hasPdfFiles;
  const isImgEnabled = pdfSettings?.imageMenuEnabled === true && hasMenuImages;
  const showStatic = (isPdfEnabled || isImgEnabled) && !orderMode;

  /* Live dishes (shared with the menu book); the built-in list is only a fallback */
  const { loading, items: liveItems, categories } = useMenuData(true);
  const items = !loading && liveItems.length === 0 ? FALLBACK_ITEMS : liveItems;
  const cats = useMemo(() => {
    const list = categories.length
      ? categories
      : CATEGORY_DEFS.map((c) => ({ name: c.id, name_de: t(c.tKey) }));
    return buildCats(items, list);
  }, [items, categories, t]);

  /* Clicking "Speisekarte" opens the menu book straight away, like being handed a menu. */
  useEffect(() => {
    if (autoOpened.current || pdfLoading) return;
    autoOpened.current = true;
    if (!orderMode && !listView && !showStatic) setBookOpen(true);
  }, [pdfLoading, orderMode, listView, showStatic]);

  const closeBook = () => {
    setBookOpen(false);
    if (!listView) {
      const p = new URLSearchParams(searchParams);
      p.set('view', 'list');
      setSearchParams(p, { replace: true });
    }
  };

  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput.trim().toLowerCase()), 120);
    return () => clearTimeout(id);
  }, [queryInput]);

  /* The filter bar sticks under the site header while scrolling */
  useEffect(() => {
    const hdr = document.querySelector('.sticky-header');
    const setHdr = () => {
      if (rootRef.current) rootRef.current.style.setProperty('--tg-hdr', `${hdr ? hdr.offsetHeight : 0}px`);
    };
    setHdr();
    const onScroll = () => {
      const el = stickRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setStuck(top <= (hdr ? hdr.offsetHeight : 0) + 1 && window.scrollY > 200);
    };
    window.addEventListener('resize', setHdr);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('resize', setHdr); window.removeEventListener('scroll', onScroll); };
  }, []);

  const visible = useMemo(() => items.filter((d) => {
    if (diet === 'v' && !d.veg) return false;
    if (diet === 'n' && d.veg) return false;
    if (query) return `${d.de} ${d.en} ${d.descDe} ${d.descEn}`.toLowerCase().includes(query);
    return cat === '*' || d.cat === cat;
  }), [items, diet, query, cat]);

  const catTitle = (c) => (lang === 'de' ? c.de : c.en);
  const catSub = (c) => (c.de !== c.en ? (lang === 'de' ? c.en : c.de) : '');
  const groups = useMemo(() => {
    if (query) return visible.length ? [{ key: 'q', title: tx.results, sub: tx.count.replace('{n}', visible.length), its: visible }] : [];
    return cats
      .filter((c) => cat === '*' || c.id === cat)
      .map((c) => ({ key: c.id, title: catTitle(c), sub: catSub(c), its: visible.filter((d) => d.cat === c.id) }))
      .filter((g) => g.its.length);
  }, [query, visible, cats, cat, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCat = (id) => {
    setCat(id);
    setQueryInput('');
    setQuery('');
    const top = rootRef.current?.querySelector('.menu-body');
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth' });
  };

  const qtyOf = (id) => cartItems.find((c) => c.id === id)?.quantity || 0;
  const cartCount = cartItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const onAdd = (d) => addToCart({ ...d.raw, name: lang === 'de' ? d.de : d.en });
  const onLess = (d) => updateQuantity(d.id, qtyOf(d.id) - 1);

  const pdfField = language === 'de'
    ? (pdfSettings?.pdfMenuDE || pdfSettings?.pdfMenuEN)
    : (pdfSettings?.pdfMenuEN || pdfSettings?.pdfMenuDE);
  const pdfUrl = hasPdfFiles && pdfField ? pb.files.getURL(pdfSettings, pdfField) : null;

  return (
    <div className="tg-home tg-menu" ref={rootRef}>
      <Helmet>
        <title>{t('menuTitle') || 'Our Menu'} - Tripti Genusswelt</title>
        <meta name="description" content="Explore authentic Indian dishes at Tripti Genusswelt — vegetarian and non-vegetarian options." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,500;0,600;1,400;1,500&family=Hind:wght@400;500;600&display=swap" />
      </Helmet>

      <PageCover eyebrow={tx.eyebrow} title={t('menuTitle') || 'Unsere Speisekarte'} lead={tx.lead}>
        <button type="button" className="btn btn-gold" onClick={() => setBookOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5c3-1.5 6.5-1.5 10 1 3.5-2.5 7-2.5 10-1v14c-3-1.5-6.5-1.5-10 1-3.5-2.5-7-2.5-10-1z" /><path d="M12 6v14" /></svg>
          <span>{tx.book}</span>
        </button>
        {canOrder && cartCount > 0 ? (
          <Link className="btn btn-line" to="/cart">{tx.cart} ({cartCount})</Link>
        ) : (
          <Link className="btn btn-line" to="/table-reservation">{tx.reserve}</Link>
        )}
      </PageCover>

      <div className="wrap menu-body">
        <OrderingHint />
        {canOrder && (
          <div className="order-note">
            <span>{tx.order} <small>{tx.orderHint}</small></span>
            {cartCount > 0 && <Link className="btn btn-maroon" style={{ padding: '.7em 1.2em' }} to="/cart">{tx.cart} ({cartCount})</Link>}
          </div>
        )}

        {marquee?.enabled && (marquee.textDE || marquee.textEN) && (
          <div className="marquee-wrap overflow-hidden rounded-xl border-2 border-secondary bg-primary text-primary-foreground relative" style={{ height: '2.6rem' }}>
            <div className="absolute top-0 left-0 flex items-center h-full whitespace-nowrap" style={{ animation: 'marquee-scroll 28s linear infinite', willChange: 'transform' }}>
              {[1, 2, 3].map(i => (
                <span key={i} className="inline-flex items-center gap-4 px-8 text-sm font-semibold tracking-wide">
                  <span className="text-secondary">✦</span>
                  {language === 'de' ? (marquee.textDE || marquee.textEN) : (marquee.textEN || marquee.textDE)}
                  <span className="text-secondary">✦</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {showStatic ? (
          pdfLoading
            ? <p className="menu-loading">{t('loadingMenu')}</p>
            : <PdfMenuDisplay pdfSettings={pdfSettings} language={language} t={t} />
        ) : (
          <div className="frame book">
            <img className="c tl" src={imgCornerA} alt="" />
            <img className="c tr" src={imgCornerB} alt="" />
            {loading ? (
              <p className="menu-loading">{tx.loading}</p>
            ) : (
              <>
                <div className={`stick${stuck ? ' stuck' : ''}`} ref={stickRef}>
                  <div className="book-tools">
                    <label className="search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                      <input type="search" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder={tx.search} aria-label={tx.search} />
                    </label>
                    <div className="seg" role="group" aria-label="Filter">
                      {[['all', tx.all], ['v', tx.veg], ['n', tx.nv]].map(([k, label]) => (
                        <button key={k} type="button" aria-pressed={diet === k} onClick={() => setDiet(k)}>{label}</button>
                      ))}
                    </div>
                    {pdfUrl && (
                      <button type="button" className="pdf-btn" onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}>{tx.pdf}</button>
                    )}
                  </div>
                  <div className="tabs" role="group" aria-label={t('categories') || 'Kategorien'}>
                    <button type="button" aria-pressed={cat === '*' && !query} onClick={() => pickCat('*')}>{tx.all}</button>
                    {cats.map((c) => (
                      <button key={c.id} type="button" aria-pressed={cat === c.id && !query} onClick={() => pickCat(c.id)}>{catTitle(c)}</button>
                    ))}
                  </div>
                </div>

                {groups.length === 0 && <p className="empty" style={{ padding: '40px 0' }}>{tx.empty}</p>}
                {groups.map((g) => (
                  <section key={g.key} className="grp" aria-label={g.title}>
                    <div className="cat-head">
                      <h3>{g.title}</h3>
                      {g.sub && <div className="sub">{g.sub}</div>}
                      <img src={imgDividerSrc} alt="" />
                      {g.key !== 'q' && <div className="count">{tx.count.replace('{n}', g.its.length)}</div>}
                    </div>
                    <ul className="items">
                      {g.its.map((d) => (
                        <DishRow key={d.id} d={d} lang={lang} canOrder={canOrder} qty={qtyOf(d.id)} onAdd={onAdd} onLess={onLess} image={dishImage(d)} />
                      ))}
                    </ul>
                  </section>
                ))}

                <div className="book-foot">
                  <details className="allergens">
                    <summary>{tx.allergens}</summary>
                    <ul>
                      {Object.keys(ALG).map((k) => <li key={k}><b>{k}</b>{ALG[k][lang === 'de' ? 0 : 1]}</li>)}
                    </ul>
                  </details>
                  <span>{tx.note}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <MenuBook open={bookOpen} onClose={closeBook} startCat={cat !== '*' ? cat : ''} onShowList={() => {}} />
    </div>
  );
}
