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
  { id: 'Main Courses', tKey: 'cat_main_courses' },
  { id: 'Sides & Accompaniments', tKey: 'cat_accompaniments' },
  { id: 'Snacks', tKey: 'cat_sides_soups' },
  { id: 'Desserts', tKey: 'cat_desserts' },
  { id: 'Kids Menu', tKey: 'cat_kinder_menu' },
  { id: 'Beverages', tKey: 'cat_beverages' },
  { id: 'Breakfast', tKey: 'cat_breakfast' },
];

// Returns the translated display label for a category definition.
const catLabel = (cat, t) => (cat && cat.tKey ? t(cat.tKey) : cat?.label || cat?.id || '');

/* ─── Static fallback data ────────────────────────────────────────────────── */
const STATIC_ITEMS = [
  { id: 's1', nameEN: 'Samosa', nameDE: 'Samosa', descriptionEN: 'Crispy pastry filled with spiced potatoes and peas, served with mint chutney.', descriptionDE: 'Knuspriges Gebäck mit gewürzten Kartoffeln und Erbsen, serviert mit Minzchutney.', price: 5.90, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 's2', nameEN: 'Onion Bhaji', nameDE: 'Zwiebel-Bhaji', descriptionEN: 'Golden fried onion fritters with herbs and spices.', descriptionDE: 'Goldbraun gebratene Zwiebelküchlein mit Kräutern und Gewürzen.', price: 6.50, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 's3', nameEN: 'Seekh Kebab', nameDE: 'Seekh Kebab', descriptionEN: 'Minced lamb skewers marinated in aromatic spices, grilled to perfection.', descriptionDE: 'Lammhackfleisch-Spieße, in aromatischen Gewürzen mariniert und gegrillt.', price: 9.90, category: 'Appetizers', isVegetarian: false, image: null },
  { id: 's4', nameEN: 'Chicken Tikka', nameDE: 'Hühnchen Tikka', descriptionEN: 'Tender chicken chunks marinated in yogurt and spices, cooked in tandoor.', descriptionDE: 'Zartes Hühnchenfleisch in Joghurt und Gewürzen mariniert, im Tandoor gegart.', price: 10.50, category: 'Appetizers', isVegetarian: false, image: null },
  { id: 's5', nameEN: 'Paneer Tikka', nameDE: 'Paneer Tikka', descriptionEN: 'Indian cottage cheese marinated in spices, grilled with peppers and onions.', descriptionDE: 'Indischer Frischkäse in Gewürzen mariniert, mit Paprika und Zwiebeln gegrillt.', price: 9.50, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 's6', nameEN: 'Vegetable Pakora', nameDE: 'Gemüse Pakora', descriptionEN: 'Assorted vegetable fritters in spiced gram flour batter, served with chutney.', descriptionDE: 'Gemischte Gemüsefritter in gewürztem Kichererbsenmehl, serviert mit Chutney.', price: 7.50, category: 'Appetizers', isVegetarian: true, image: null },
  { id: 's7', nameEN: 'Fish Amritsari', nameDE: 'Fisch Amritsari', descriptionEN: 'Crispy fried fish fillets marinated in Punjabi spices and carom seeds.', descriptionDE: 'Knusprig gebratene Fischfilets in Punjabi-Gewürzen und Ajowan-Samen mariniert.', price: 11.90, category: 'Appetizers', isVegetarian: false, image: null },

  { id: 'm1', nameEN: 'Butter Chicken', nameDE: 'Butter Chicken', descriptionEN: 'Tender chicken in a rich, creamy tomato sauce with aromatic spices and butter.', descriptionDE: 'Zartes Hühnchen in einer reichhaltigen, cremigen Tomatensauce mit aromatischen Gewürzen.', price: 17.90, category: 'Main Courses', isVegetarian: false, image: null },
  { id: 'm2', nameEN: 'Palak Paneer', nameDE: 'Palak Paneer', descriptionEN: 'Fresh cottage cheese in a silky spinach sauce seasoned with ginger and garlic.', descriptionDE: 'Frischer Käse in einer seidigen Spinatsauce mit Ingwer und Knoblauch.', price: 16.50, category: 'Main Courses', isVegetarian: true, image: null },
  { id: 'm3', nameEN: 'Lamb Rogan Josh', nameDE: 'Lamm Rogan Josh', descriptionEN: 'Slow-cooked tender lamb in a Kashmiri spice sauce, full of depth and warmth.', descriptionDE: 'Langsam geschmortes Lammfleisch in einer Kaschmir-Gewürzsauce.', price: 19.90, category: 'Main Courses', isVegetarian: false, image: null },
  { id: 'm4', nameEN: 'Dal Makhani', nameDE: 'Dal Makhani', descriptionEN: 'Black lentils slow-cooked overnight with butter and cream, smoky and velvety.', descriptionDE: 'Schwarze Linsen, über Nacht mit Butter und Rahm geschmort.', price: 15.90, category: 'Main Courses', isVegetarian: true, image: null },
  { id: 'm5', nameEN: 'Chicken Biryani', nameDE: 'Hühnchen Biryani', descriptionEN: 'Fragrant basmati rice layered with spiced chicken and caramelised onions.', descriptionDE: 'Duftender Basmati-Reis mit gewürztem Hühnchen und karamellisierten Zwiebeln.', price: 18.50, category: 'Main Courses', isVegetarian: false, image: null },
  { id: 'm6', nameEN: 'Vegetable Korma', nameDE: 'Gemüse Korma', descriptionEN: 'Mixed vegetables in a mild, creamy sauce with cashews and aromatic spices.', descriptionDE: 'Gemischtes Gemüse in einer milden, cremigen Sauce mit Cashewnüssen.', price: 15.50, category: 'Main Courses', isVegetarian: true, image: null },
  { id: 'm7', nameEN: 'Prawn Masala', nameDE: 'Garnelen Masala', descriptionEN: 'Juicy prawns cooked in a tangy tomato and onion masala with coastal spices.', descriptionDE: 'Saftige Garnelen in einem würzigen Tomaten-Zwiebel-Masala mit Küstengewürzen.', price: 20.90, category: 'Main Courses', isVegetarian: false, image: null },
  { id: 'm8', nameEN: 'Aloo Gobi', nameDE: 'Aloo Gobi', descriptionEN: 'Classic dry-style cauliflower and potato curry with turmeric, cumin and coriander.', descriptionDE: 'Klassisches trockenes Blumenkohl-Kartoffel-Curry mit Kurkuma und Kreuzkümmel.', price: 14.90, category: 'Main Courses', isVegetarian: true, image: null },

  { id: 'sa1', nameEN: 'Garlic Naan', nameDE: 'Knoblauch Naan', descriptionEN: 'Soft leavened bread topped with garlic and coriander, baked in the tandoor.', descriptionDE: 'Weiches Hefebrot mit Knoblauch und Koriander im Tandoor gebacken.', price: 4.50, category: 'Sides & Accompaniments', isVegetarian: true, image: null },
  { id: 'sa2', nameEN: 'Paratha', nameDE: 'Paratha', descriptionEN: 'Whole-wheat flaky flatbread, layered and pan-fried to golden perfection.', descriptionDE: 'Vollkorn-Blätterteigbrot, geschichtet und goldbraun gebraten.', price: 4.00, category: 'Sides & Accompaniments', isVegetarian: true, image: null },
  { id: 'sa3', nameEN: 'Raita', nameDE: 'Raita', descriptionEN: 'Cool yogurt with cucumber, mint, and a touch of cumin — the perfect accompaniment.', descriptionDE: 'Kühler Joghurt mit Gurke, Minze und Kreuzkümmel.', price: 3.50, category: 'Sides & Accompaniments', isVegetarian: true, image: null },
  { id: 'sa4', nameEN: 'Steamed Basmati', nameDE: 'Gedämpfter Basmati', descriptionEN: 'Fluffy long-grain basmati rice steamed with whole spices.', descriptionDE: 'Lockerer Langkorn-Basmati-Reis mit ganzen Gewürzen gedämpft.', price: 3.90, category: 'Sides & Accompaniments', isVegetarian: true, image: null },

  { id: 'sn1', nameEN: 'Dal Soup', nameDE: 'Dal-Suppe', descriptionEN: 'Light yellow lentil soup tempered with mustard seeds, curry leaves and ginger.', descriptionDE: 'Leichte gelbe Linsensuppe mit Senfkörnern, Curryblättern und Ingwer.', price: 5.90, category: 'Snacks', isVegetarian: true, image: null },
  { id: 'sn2', nameEN: 'Mulligatawny Soup', nameDE: 'Mulligatawny-Suppe', descriptionEN: 'Hearty chicken and lentil soup with apples and coconut milk.', descriptionDE: 'Herzhafte Hühnchen-Linsen-Suppe mit Äpfeln und Kokosmilch.', price: 6.90, category: 'Snacks', isVegetarian: false, image: null },
  { id: 'sn3', nameEN: 'Pappadum Basket', nameDE: 'Pappadum-Korb', descriptionEN: 'Crispy lentil wafers served with three house chutneys.', descriptionDE: 'Knusprige Linsenfladen mit drei Hauschautneys.', price: 4.90, category: 'Snacks', isVegetarian: true, image: null },

  { id: 'd1', nameEN: 'Gulab Jamun', nameDE: 'Gulab Jamun', descriptionEN: 'Soft milk-solid dumplings soaked in rose-cardamom sugar syrup.', descriptionDE: 'Weiche Milchklöße in Rosen-Kardamom-Zuckersirup.', price: 5.90, category: 'Desserts', isVegetarian: true, image: null },
  { id: 'd2', nameEN: 'Kulfi', nameDE: 'Kulfi', descriptionEN: 'Traditional Indian ice cream with pistachio and cardamom.', descriptionDE: 'Traditionelles indisches Eis mit Pistazien und Kardamom.', price: 6.50, category: 'Desserts', isVegetarian: true, image: null },
  { id: 'd3', nameEN: 'Rasmalai', nameDE: 'Rasmalai', descriptionEN: 'Delicate cheese dumplings in sweetened saffron-cardamom milk.', descriptionDE: 'Zarte Käseklöße in gesüßter Safran-Kardamom-Milch.', price: 6.90, category: 'Desserts', isVegetarian: true, image: null },

  { id: 'k1', nameEN: 'Chicken Nuggets & Fries', nameDE: 'Chicken Nuggets & Pommes', descriptionEN: 'Crispy baked chicken nuggets with golden fries and ketchup.', descriptionDE: 'Knusprige Hühnchen-Nuggets mit goldenen Pommes und Ketchup.', price: 8.90, category: 'Kids Menu', isVegetarian: false, image: null },
  { id: 'k2', nameEN: 'Mini Paneer Wrap', nameDE: 'Mini Paneer Wrap', descriptionEN: 'Soft wrap with mild paneer, cucumber and sweet chutney.', descriptionDE: 'Weicher Wrap mit mildem Paneer, Gurke und süßem Chutney.', price: 7.90, category: 'Kids Menu', isVegetarian: true, image: null },
  { id: 'k3', nameEN: 'Mini Dal & Rice', nameDE: 'Mini Dal & Reis', descriptionEN: 'Gentle yellow dal with basmati rice and a side of yogurt.', descriptionDE: 'Milder gelber Dal mit Basmati-Reis und Joghurt.', price: 7.50, category: 'Kids Menu', isVegetarian: true, image: null },

  { id: 'b1', nameEN: 'Mango Lassi', nameDE: 'Mango Lassi', descriptionEN: 'Chilled yogurt drink blended with sweet Alphonso mango and a hint of cardamom.', descriptionDE: 'Gekühltes Joghurtgetränk mit süßer Alphonso-Mango und Kardamom.', price: 4.50, category: 'Beverages', isVegetarian: true, image: null },
  { id: 'b2', nameEN: 'Masala Chai', nameDE: 'Masala Chai', descriptionEN: 'Spiced tea brewed with ginger, cardamom, cinnamon and milk.', descriptionDE: 'Gewürztee mit Ingwer, Kardamom, Zimt und Milch.', price: 3.50, category: 'Beverages', isVegetarian: true, image: null },
  { id: 'b3', nameEN: 'Fresh Lime Soda', nameDE: 'Frische Limette Soda', descriptionEN: 'Sparkling water with freshly squeezed lime and a pinch of black salt.', descriptionDE: 'Sprudelwasser mit frisch gepresster Limette und einer Prise schwarzem Salz.', price: 3.50, category: 'Beverages', isVegetarian: true, image: null },
  { id: 'b4', nameEN: 'Rose Sharbat', nameDE: 'Rosen-Sharbat', descriptionEN: 'Chilled rose-petal syrup drink with basil seeds and milk.', descriptionDE: 'Gekühltes Rosenblüten-Sirupgetränk mit Basilikumsamen und Milch.', price: 4.00, category: 'Beverages', isVegetarian: true, image: null },

  { id: 'br1', nameEN: 'Masala Omelette', nameDE: 'Masala-Omelett', descriptionEN: 'Fluffy eggs cooked with onion, tomato, green chili and coriander.', descriptionDE: 'Lockere Eier mit Zwiebeln, Tomaten, grüner Chili und Koriander.', price: 9.90, category: 'Breakfast', isVegetarian: true, image: null },
  { id: 'br2', nameEN: 'Aloo Paratha', nameDE: 'Aloo Paratha', descriptionEN: 'Whole-wheat flatbread stuffed with spiced mashed potatoes, served with butter.', descriptionDE: 'Vollkornfladenbrot mit gewürztem Kartoffelpüree, serviert mit Butter.', price: 10.50, category: 'Breakfast', isVegetarian: true, image: null },
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
