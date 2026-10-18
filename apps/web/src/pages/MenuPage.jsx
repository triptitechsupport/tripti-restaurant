import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Beef, ChevronLeft, ChevronRight, LayoutGrid, SlidersHorizontal, X, FileText, Plus, Minus, ShoppingCart } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import PdfMenuDisplay from '@/components/PdfMenuDisplay.jsx';
import useEmblaCarousel from 'embla-carousel-react';
import pb from '@/lib/pocketbaseClient.js';

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

// Returns the translated display label for a category definition.
const catLabel = (cat, t) => (cat && cat.tKey ? t(cat.tKey) : cat?.label || cat?.id || '');

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

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&h=200&fit=crop';

function getItemImage(item) {
  if (!item.image) return PLACEHOLDER_IMG;
  try { return pb.files.getURL(item, item.image, { thumb: '200x200' }); }
  catch { return PLACEHOLDER_IMG; }
}

/* ─── breakpoint hook ─────────────────────────────────────────────────────── */
function useBreakpoint() {
  const get = () => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth < 640) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  };
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const handler = () => setBp(get());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return bp;
}

/* ─── Items per page by breakpoint ───────────────────────────────────────── */
function itemsPerPage(bp) {
  if (bp === 'mobile') return 5;
  if (bp === 'tablet') return 8;   // 2 cols × 4 rows
  return 12;                        // 3 cols × 4 rows
}

/* ─── Item Card ───────────────────────────────────────────────────────────── */
function MenuItemCard({ item, language, orderMode, t }) {
  const title = language === 'de' ? (item.nameDE || item.name) : (item.nameEN || item.name);
  const desc = language === 'de' ? (item.descriptionDE || item.description || '') : (item.descriptionEN || item.description || '');
  const imgSrc = getItemImage(item);
  const { cartItems, addToCart, updateQuantity } = useCart();
  const qty = cartItems.find(i => i.id === item.id)?.quantity || 0;

  const handleAdd = () => addToCart({ ...item, name: title });
  const handleInc = () => addToCart({ ...item, name: title });
  const handleDec = () => updateQuantity(item.id, Math.max(0, qty - 1));

  const vegBadge = item.isVegetarian ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded px-1.5 py-0.5">
      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{t('vegetarian')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5">
      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{t('nonVeg')}
    </span>
  );

  if (orderMode) {
    return (
      <div className="group w-full flex flex-row rounded-xl overflow-hidden bg-card border border-border hover:border-secondary shadow-sm hover:shadow-lg transition-all duration-300 min-h-[88px]">
        <div className="w-[90px] sm:w-[110px] shrink-0 min-h-[88px] sm:min-h-[110px] bg-muted overflow-hidden">
          <img
            src={imgSrc}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER_IMG; }}
          />
        </div>
        <div className="flex flex-col flex-1 p-3 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <span className="font-serif font-bold text-primary text-sm leading-snug line-clamp-1 flex-1">{title}</span>
            <span className="font-bold text-secondary text-sm shrink-0">€{Number(item.price).toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            {vegBadge}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">
            {desc || (language === 'de' ? 'Keine Beschreibung verfügbar.' : 'No description available.')}
          </p>
          <div className="mt-2 flex items-center justify-end">
            {qty === 0 ? (
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-primary/90 active:scale-95 transition-all min-h-[36px]"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {language === 'de' ? 'Hinzufügen' : 'Add'}
              </button>
            ) : (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                <button
                  onClick={handleDec}
                  aria-label="Decrease quantity"
                  className="flex items-center justify-center w-8 h-8 rounded-md text-primary hover:bg-secondary/20 active:scale-90 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-7 text-center text-sm font-bold text-primary tabular-nums">{qty}</span>
                <button
                  onClick={handleInc}
                  aria-label="Increase quantity"
                  className="flex items-center justify-center w-8 h-8 rounded-md text-primary hover:bg-secondary/20 active:scale-90 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group w-full flex flex-row rounded-xl overflow-hidden bg-card border border-border hover:border-secondary shadow-sm hover:shadow-lg transition-all duration-300 text-left min-h-[88px]"
    >
      <div className="w-[90px] sm:w-[110px] shrink-0 min-h-[88px] sm:min-h-[110px] bg-muted overflow-hidden">
        <img
          src={imgSrc}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER_IMG; }}
        />
      </div>
      <div className="flex flex-col flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className="font-serif font-bold text-primary text-sm leading-snug line-clamp-1 flex-1">{title}</span>
          <span className="font-bold text-secondary text-sm shrink-0">€{Number(item.price).toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          {vegBadge}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">
          {desc || 'No description available.'}
        </p>
      </div>
    </div>
  );
}

/* ─── Inner carousel (items within one category) ─────────────────────────── */
function InnerCarousel({ categoryItems, language, bp, isActive, orderMode, t }) {
  const perPage = itemsPerPage(bp);
  const pages = [];
  for (let i = 0; i < categoryItems.length; i += perPage) pages.push(categoryItems.slice(i, i + perPage));
  const pageCount = pages.length;

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [current, setCurrent] = useState(0);

  // Reset to slide 0 when this category becomes active
  useEffect(() => {
    if (isActive && emblaApi) {
      emblaApi.scrollTo(0);
      setCurrent(0);
    }
  }, [isActive, emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  const goTo = useCallback((i) => {
    if (emblaApi) emblaApi.scrollTo(i);
  }, [emblaApi]);

  if (!pages.length) return null;

  const gridCols = bp === 'mobile' ? 'grid-cols-1' : bp === 'tablet' ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {pages.map((pageItems, pi) => (
            <div key={pi} className="flex-[0_0_100%] min-w-0">
              <div className={`grid ${gridCols} gap-3`}>
                {pageItems.map(item => (
                  <MenuItemCard key={item.id} item={item} language={language} orderMode={orderMode} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inner arrows — desktop/tablet only */}
      {pageCount > 1 && (
        <>
          <button
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            aria-label="Previous items"
            className="hidden sm:flex absolute -left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card border border-border shadow-md items-center justify-center text-primary hover:bg-secondary hover:text-card transition-colors disabled:opacity-30 disabled:pointer-events-none z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo(current + 1)}
            disabled={current === pageCount - 1}
            aria-label="Next items"
            className="hidden sm:flex absolute -right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card border border-border shadow-md items-center justify-center text-primary hover:bg-secondary hover:text-card transition-colors disabled:opacity-30 disabled:pointer-events-none z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Inner dots */}
      {pageCount > 1 && (
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Items page ${i + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === current ? 'bg-primary scale-125' : 'bg-border hover:bg-secondary'}`}
            />
          ))}
        </div>
      )}

      {/* Mobile swipe hint for inner carousel */}
      {pageCount > 1 && bp === 'mobile' && (
        <p className="text-center text-[11px] text-muted-foreground mt-2 opacity-60">{t('swipeToSeeMore')}</p>
      )}
    </div>
  );
}

/* ─── Main category carousel ──────────────────────────────────────────────── */
function CategoryCarousel({ visibleCategories, allItems, language, bp, orderMode, t }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Re-init when visible categories change, reset to first
  useEffect(() => {
    if (emblaApi) { emblaApi.reInit(); setCurrent(0); }
  }, [emblaApi, visibleCategories.length]);

  const goTo = useCallback((i) => {
    if (emblaApi) emblaApi.scrollTo(i);
  }, [emblaApi]);

  if (!visibleCategories.length) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <LayoutGrid className="w-12 h-12 text-muted-foreground/40" />
      <p className="font-serif text-xl text-primary font-bold">{t('noCategoriesSelected')}</p>
      <p className="text-muted-foreground text-sm">{t('noCategoriesSelectedDesc')}</p>
    </div>
  );

  return (
    <div>
      {/* Top navigation: arrows on sides, category heading in center */}
      {visibleCategories.length > 1 && (
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-6">
          <button
            onClick={() => { if (emblaApi) emblaApi.scrollPrev(); }}
            aria-label={t('previousCategory')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card text-primary hover:bg-secondary hover:text-card transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 text-center">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-primary tracking-wide">
              {catLabel(visibleCategories[current], t)}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-medium tracking-wide max-w-none">
              ({current + 1} / {visibleCategories.length})
            </p>
          </div>

          <button
            onClick={() => { if (emblaApi) emblaApi.scrollNext(); }}
            aria-label={t('nextCategory')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card text-primary hover:bg-secondary hover:text-card transition-colors shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Single category heading (when only one category) */}
      {visibleCategories.length === 1 && (
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-l from-secondary/60 to-transparent" />
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-primary tracking-wide text-center whitespace-nowrap">
            {catLabel(visibleCategories[0], t)}
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-secondary/60 to-transparent" />
        </div>
      )}

      {/* Pagination dots */}
      {visibleCategories.length > 1 && (
        <div className="flex justify-center gap-2 flex-wrap mb-6">
          {visibleCategories.map((cat, i) => (
            <button
              key={cat.id}
              title={catLabel(cat, t)}
              onClick={() => goTo(i)}
              aria-label={catLabel(cat, t)}
              className={`h-2.5 rounded-full transition-all duration-300 ${i === current ? 'bg-primary w-6' : 'bg-border hover:bg-secondary w-2.5'}`}
            />
          ))}
        </div>
      )}

      {/* Main embla viewport */}
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {visibleCategories.map((catDef, ci) => {
            const catItems = allItems.filter(item => item.category === catDef.id);
            const isActive = ci === current;
            return (
              <div key={catDef.id} className="flex-[0_0_100%] min-w-0 px-1">
                {catItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground italic text-sm">
                    {t('noItemsInCategory')}
                  </div>
                ) : (
                  <InnerCarousel
                    categoryItems={catItems}
                    language={language}
                    bp={bp}
                    isActive={isActive}
                    orderMode={orderMode}
                    t={t}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function MenuPage() {
  const { t, language, isOrderingEnabled } = useLanguage();
  const bp = useBreakpoint();
  const [searchParams] = useSearchParams();
  const { cartItems } = useCart();
  const orderMode = searchParams.get('order') === '1' && isOrderingEnabled;

  const [pdfSettings, setPdfSettings] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);

  const [dietFilter, setDietFilter] = useState('All');
  const [selectedCats, setSelectedCats] = useState(CATEGORY_DEFS.map(c => c.id));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [marquee, setMarquee] = useState(null);

  /* Fetch marquee settings */
  useEffect(() => {
    let alive = true;
    pb.collection('marquee_settings')
      .getFirstListItem('', { requestKey: 'menu-marquee', $autoCancel: false })
      .then(rec => { if (alive) setMarquee(rec); })
      .catch(() => { });
    const unsub = pb.collection('marquee_settings').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') setMarquee(e.record);
      if (e.action === 'delete') setMarquee(null);
    });
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

  /* Fetch live menu items */
  useEffect(() => {
    if (showStatic) { setMenuLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const res = await pb.collection('menu_items').getList(1, 500, {
          filter: 'availability = true',
          sort: 'category,nameEN',
          $autoCancel: false,
        });
        if (!alive) return;
        setMenuItems(res.items.length > 0
          ? res.items.map(i => ({ ...i, isVegetarian: i.isVegetarian === true }))
          : STATIC_ITEMS
        );
      } catch { if (alive) setMenuItems(STATIC_ITEMS); }
      finally { if (alive) setMenuLoading(false); }
    })();
    return () => { alive = false; };
  }, [showStatic]);

  const filteredItems = menuItems.filter(item => {
    if (dietFilter === 'Veg' && !item.isVegetarian) return false;
    if (dietFilter === 'NonVeg' && item.isVegetarian) return false;
    return true;
  });

  const visibleCategories = CATEGORY_DEFS.filter(c =>
    selectedCats.includes(c.id) && filteredItems.some(i => i.category === c.id)
  );

  const toggleCat = (id) => setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const allSelected = selectedCats.length === CATEGORY_DEFS.length;
  const toggleAll = () => setSelectedCats(allSelected ? [] : CATEGORY_DEFS.map(c => c.id));

  return (
    <>
      <Helmet>
        <title>{t('menuTitle') || 'Our Menu'} - Tripti Genusswelt</title>
        <meta name="description" content="Explore authentic Indian dishes at Tripti Genusswelt — vegetarian and non-vegetarian options." />
      </Helmet>

      <main className="min-h-screen bg-background py-6 sm:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          {/* Page title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary mb-2">
              {t('menuTitle') || 'Our Menu'}
            </h1>
            <div className="w-20 h-1 bg-secondary mx-auto rounded-full" />
          </motion.div>

          {/* ── Ordering Mode Banner ── */}
          {orderMode && (
            <div className="mb-5 rounded-xl border-2 border-secondary bg-secondary/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-primary font-bold">
                <ShoppingCart className="w-5 h-5 text-secondary" />
                <span className="text-sm sm:text-base">{language === 'de' ? 'Bestellmodus — fügen Sie Artikel zum Warenkorb hinzu' : 'Ordering Mode — add items to your cart'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground hidden sm:inline">{language === 'de' ? 'Tippe + zum Hinzufügen, − zum Entfernen' : 'Tap + to add, − to remove'}</span>
                {cartItems.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-bold">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {cartItems.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Marquee ── */}
          {marquee?.enabled && (marquee.textDE || marquee.textEN) && (
            <div className="overflow-hidden rounded-xl border-2 border-secondary bg-primary text-primary-foreground mb-5 relative" style={{ height: '2.6rem' }}>
              <div
                className="absolute top-0 left-0 flex items-center h-full whitespace-nowrap"
                style={{
                  animation: 'marquee-scroll 28s linear infinite',
                  willChange: 'transform',
                }}
              >
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
              ? <div className="flex items-center justify-center py-24 text-muted-foreground">{t('loadingMenu')}</div>
              : <PdfMenuDisplay pdfSettings={pdfSettings} language={language} t={t} />
          ) : (
            <>
              {/* ── Top dietary filter bar ── */}
              <div className="flex justify-center gap-2 sm:gap-3 mb-5 flex-wrap">
                {[
                  { id: 'All', label: t('allItems'), icon: <LayoutGrid className="w-4 h-4" /> },
                  { id: 'Veg', label: t('vegetarian'), icon: <Leaf className="w-4 h-4" /> },
                  { id: 'NonVeg', label: t('nonVeg'), icon: <Beef className="w-4 h-4" /> },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setDietFilter(opt.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all duration-200 min-h-[44px] ${dietFilter === opt.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                        : 'bg-card text-primary border-border hover:border-secondary hover:shadow'
                      }`}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                ))}

                {/* Full Menu PDF button */}
                {hasPdfFiles && (() => {
                  const pdfField = language === 'de'
                    ? (pdfSettings?.pdfMenuDE || pdfSettings?.pdfMenuEN)
                    : (pdfSettings?.pdfMenuEN || pdfSettings?.pdfMenuDE);
                  const pdfUrl = pdfField ? pb.files.getURL(pdfSettings, pdfField) : null;
                  return pdfUrl ? (
                    <button
                      onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all duration-200 min-h-[44px] bg-card text-primary border-border hover:border-secondary hover:shadow"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{t('fullMenu')}</span>
                    </button>
                  ) : null;
                })()}

                {/* Mobile: Categories toggle */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all duration-200 min-h-[44px] bg-card text-primary border-border hover:border-secondary"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>{t('categories')}</span>
                  {selectedCats.length < CATEGORY_DEFS.length && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                      {selectedCats.length}
                    </span>
                  )}
                </button>
              </div>

              {/* ── Main layout: sidebar + carousel ── */}
              <div className="flex gap-4 items-start">

                {/* ── Categories Sidebar (desktop) ── */}
                <aside className="hidden md:block w-52 shrink-0 bg-card border border-border rounded-2xl p-4 shadow-sm sticky top-4">
                  <p className="font-serif font-bold text-primary text-base mb-3">{t('categories')}</p>
                  <label className="flex items-center gap-2.5 cursor-pointer mb-3 group">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-4 h-4 rounded border-border accent-[hsl(var(--primary))] cursor-pointer" />
                    <span className="font-semibold text-sm text-primary group-hover:text-secondary transition-colors">{t('selectAll')}</span>
                  </label>
                  <div className="h-px bg-border mb-3" />
                  <div className="space-y-2">
                    {CATEGORY_DEFS.map(cat => (
                      <label key={cat.id} className="flex items-start gap-2.5 cursor-pointer group">
                        <input type="checkbox" checked={selectedCats.includes(cat.id)} onChange={() => toggleCat(cat.id)}
                          className="mt-0.5 w-4 h-4 rounded border-border accent-[hsl(var(--primary))] cursor-pointer shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-primary transition-colors leading-snug">
                          {catLabel(cat, t)}
                        </span>
                      </label>
                    ))}
                  </div>
                </aside>

                {/* ── Mobile Categories Drawer ── */}
                <AnimatePresence>
                  {sidebarOpen && (
                    <>
                      <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
                      <motion.aside key="drawer"
                        initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-r border-border shadow-2xl z-50 flex flex-col md:hidden"
                      >
                        <div className="flex items-center justify-between p-4 border-b border-border">
                          <p className="font-serif font-bold text-primary text-lg">{t('categories')}</p>
                          <button onClick={() => setSidebarOpen(false)}
                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-primary">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                          <label className="flex items-center gap-3 cursor-pointer mb-4 group min-h-[44px]">
                            <input type="checkbox" checked={allSelected} onChange={toggleAll}
                              className="w-5 h-5 rounded border-border accent-[hsl(var(--primary))] cursor-pointer" />
                            <span className="font-bold text-sm text-primary group-hover:text-secondary transition-colors">{t('selectAll')}</span>
                          </label>
                          <div className="h-px bg-border mb-4" />
                          <div className="space-y-1">
                            {CATEGORY_DEFS.map(cat => (
                              <label key={cat.id} className="flex items-center gap-3 cursor-pointer group min-h-[44px] rounded-lg px-2 hover:bg-muted/50 transition-colors">
                                <input type="checkbox" checked={selectedCats.includes(cat.id)} onChange={() => toggleCat(cat.id)}
                                  className="w-5 h-5 rounded border-border accent-[hsl(var(--primary))] cursor-pointer shrink-0" />
                                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-primary transition-colors">
                                  {catLabel(cat, t)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 border-t border-border">
                          <button onClick={() => setSidebarOpen(false)}
                            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
                            {t('applyFilters')}
                          </button>
                        </div>
                      </motion.aside>
                    </>
                  )}
                </AnimatePresence>

                {/* ── Carousel Panel ── */}
                <div className="flex-1 min-w-0 bg-card border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-sm">
                  {menuLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-[110px] rounded-xl bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : selectedCats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <LayoutGrid className="w-10 h-10 text-muted-foreground/40" />
                      <p className="font-serif font-bold text-primary text-lg">{t('noCategoriesSelected')}</p>
                      <button onClick={() => setSelectedCats(CATEGORY_DEFS.map(c => c.id))}
                        className="px-5 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
                        {t('selectAll')}
                      </button>
                    </div>
                  ) : (
                    <CategoryCarousel
                      visibleCategories={visibleCategories}
                      allItems={filteredItems}
                      language={language}
                      bp={bp}
                      orderMode={orderMode}
                      t={t}
                    />
                  )}
                </div>

              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
