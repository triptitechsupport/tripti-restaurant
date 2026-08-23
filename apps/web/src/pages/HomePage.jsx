import React, { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Info, Loader2, Film } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { useOrderSettings } from '@/hooks/useOrderSettings.js';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import FlowerPetal from '@/components/FlowerPetal.jsx';
import TempleFloating from '@/components/TempleFloating.jsx';
import DecorativeElements from '@/components/DecorativeElements.jsx';
import CustomerFeedback from '@/components/CustomerFeedback.jsx';

import pb from '@/lib/pocketbaseClient.js';

function MenuGallery({ images, loading }) {
  const trackRef = useRef(null);
  const animFrameRef = useRef(null);
  const pausedRef = useRef(false);
  const posRef = useRef(0);
  const speedRef = useRef(1); // px per frame

  // Duplicate images for seamless infinite loop
  const items = images.length > 0 ? [...images, ...images, ...images] : [];

  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    // Wait for layout so offsetWidth is ready
    const rafId = requestAnimationFrame(() => {
      const singleSetWidth = track.scrollWidth / 3;

      const animate = () => {
        if (!pausedRef.current) {
          posRef.current += speedRef.current;
          if (posRef.current >= singleSetWidth) {
            posRef.current -= singleSetWidth;
          }
          track.style.transform = `translateX(-${posRef.current}px)`;
        }
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [items.length]);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-hidden py-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="shrink-0 w-48 h-36 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div
      className="w-full overflow-hidden py-4 cursor-pointer"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div
        ref={trackRef}
        className="flex gap-4 will-change-transform"
        style={{ width: 'max-content' }}
      >
        {items.map((img, idx) => (
          <div
            key={`${img.id}-${idx}`}
            className="shrink-0 w-[160px] sm:w-[200px] md:w-[240px] h-[120px] sm:h-[150px] md:h-[180px] rounded-2xl overflow-hidden shadow-md group relative"
            style={{ boxShadow: '0 4px 16px hsl(350 62% 32% / 0.15)' }}
          >
            <img
              src={img.url}
              alt={img.name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              style={{ borderRadius: 'inherit' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl flex items-end p-3">
              <span className="text-primary-foreground text-xs font-semibold leading-tight line-clamp-2 font-sans">{img.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t, language } = useLanguage();
  const { isAdminAuthenticated } = useAuth();
  const { isOrderingEnabled, loading: settingsLoading, error: settingsError } = useOrderSettings();
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [restaurantSection, setRestaurantSection] = useState(null);

  // Only allow ordering if isOrderingEnabled is explicitly true
  const isOrderActive = isOrderingEnabled && !settingsError;

  useEffect(() => {
    let isMounted = true;

    const fetchGalleryImages = async () => {
      try {
        setGalleryLoading(true);
        const results = await pb.collection('menu_items').getFullList();
        if (isMounted) {
          const imgs = results
            .filter(item => item.image)
            .map(item => ({
              id: item.id,
              url: pb.files.getURL(item, item.image, { thumb: '400x300' }),
              name: item.nameEN || item.nameDE || item.name,
            }));
          setGalleryImages(imgs);
        }
      } catch (error) {
        console.error('[HomePage] Failed to fetch gallery images:', error);
      } finally {
        if (isMounted) setGalleryLoading(false);
      }
    };

    fetchGalleryImages();

    const fetchRestaurantSection = async () => {
      try {
        const list = await pb.collection('restaurant_section').getList(1, 1, { $autoCancel: false });
        if (isMounted && list.items.length > 0) {
          setRestaurantSection(list.items[0]);
        }
      } catch (e) {
        // section not configured yet
      }
    };

    fetchRestaurantSection();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <Helmet>
        <title>{t('heroTitle') || 'Tripti Genusswelt - The Indian Restaurant'}</title>
        <meta name="description" content={t('heroSubtitle')} />
      </Helmet>

      <main>
        {/* Updated Hero Section */}
        <section className="relative min-h-[30dvh] md:min-h-[50dvh] flex flex-col items-center justify-center overflow-hidden hero-gradient-bg px-4 py-10 md:py-14">

          {/* Depth and Textures */}
          <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-10 z-[1]">
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
              <filter id="noise">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
              </filter>
              <rect width="100%" height="100%" filter="url(#noise)" />
            </svg>
          </div>

          <TempleFloating />
          <FlowerPetal count={30} />
          <DecorativeElements />

          <div className="relative z-30 mx-auto max-w-4xl w-full text-center flex flex-col items-center justify-center">
            {/* Top text - Mobile & Tablet */}
            <p className="lg:hidden text-base md:text-xl text-primary/90 font-medium mb-2 animate-stagger-fade-up animation-delay-500">
              {t("heroSubtitleTop")}
            </p>

            <div className="flex items-center justify-center w-full mb-2 md:mb-6">
              <div className="w-full max-w-xs sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-2xl overflow-hidden shadow-2xl ring-1 ring-[hsl(var(--secondary)_/_0.4)] animate-logo-reveal mx-auto">
                <img
                  src="https://horizons-cdn.hostinger.com/450079b8-5822-46b7-a2c8-af6dc49bcbc7/8bdded65f72ad525fd1340e56a415c6c.jpg"
                  alt="Tripti Genusswelt - Das authentische indische Restaurant"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>

            {/* Bottom text - Mobile & Tablet */}
            <p className="lg:hidden text-base md:text-xl text-primary/90 font-medium animate-stagger-fade-up animation-delay-500">
              {t("heroSubtitleBottom")}
            </p>

            {/* Desktop text */}
            <p className="hidden lg:block text-xl text-primary/90 leading-relaxed max-w-2xl font-medium animate-stagger-fade-up animation-delay-500">
              {t("heroSubtitle") ||
                "Entdecken Sie eine Symphonie aus Gewürzen und traditionellen Rezepten, zubereitet mit Leidenschaft."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 animate-stagger-fade-up animation-delay-700">
              {settingsLoading ? (
                <Skeleton className="h-11 w-40 rounded-full bg-white/20" />
              ) : isAdminAuthenticated ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button size="lg" disabled className="bg-muted text-muted-foreground text-base h-11 px-6 rounded-full shadow-md opacity-70 cursor-not-allowed border-none">
                          {t('adminMode')}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        <p>Admin accounts cannot place orders.</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : isOrderActive ? (
                <Link to="/menu?order=1">
                  <Button size="lg" className="bg-primary text-primary-foreground border-none hover:bg-primary/90 text-base h-11 px-8 rounded-full group shadow-lg transition-all duration-300">
                    {t('orderNow')}
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              ) : null}

            </div>
          </div>



        </section>

        <section className="py-4 md:py-8 bg-background relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />
          <div className="relative z-10">
            {/* Heading — constrained */}
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="h-px bg-gradient-to-l from-primary to-transparent flex-1 max-w-[100px]"></div>
                  <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary">
                    {t('menuTitle')}
                  </h2>
                  <div className="h-px bg-gradient-to-r from-primary to-transparent flex-1 max-w-[100px]"></div>
                </div>
                <div className="w-20 h-1 bg-secondary mx-auto rounded-full mt-2 animate-pulse-glow" />
              </motion.div>
            </div>

            {/* Full-width infinite gallery */}
            <div className="mt-6 px-4">
              <MenuGallery images={galleryImages} loading={galleryLoading} />
            </div>

            {/* Button — constrained */}
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="text-center mt-6"
              >
                <Link to="/menu">
                  <Button size="lg" variant="outline" className="rounded-full px-8 h-11 shadow-lg text-base">
                    {t('exploreMenu')}
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Our Restaurant Section */}
        {restaurantSection && restaurantSection.enabled && (
          <section className="py-10 md:py-16 bg-card border-t-2 border-border relative overflow-hidden">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7 }}
                className="text-center mb-8 md:mb-12"
              >
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="h-px bg-gradient-to-l from-primary to-transparent flex-1 max-w-[100px]" />
                  <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary">
                    {t('restaurantTitle')}
                  </h2>
                  <div className="h-px bg-gradient-to-r from-primary to-transparent flex-1 max-w-[100px]" />
                </div>
                <div className="w-20 h-1 bg-secondary mx-auto rounded-full mt-2" />
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                {/* Left: Media */}
                {restaurantSection.media && (
                  
                <motion.div
                  initial={{ opacity: 0, x: -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.7 }}
                  className="rounded-3xl overflow-hidden shadow-2xl border-2 border-border bg-muted"
                >
                  {restaurantSection.media && (
                    <img
                      src={pb.files.getURL(restaurantSection, restaurantSection.media)}
                      alt="Our Restaurant"
                      className="w-full h-full object-cover max-h-[420px]"
                    />
                  )}
                </motion.div>
                )}

                {/* Right: Text */}
                <motion.div
                  initial={{ opacity: 0, x: 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.7, delay: 0.15 }}
                  className="flex flex-col justify-center gap-5"
                >
                  <p className="text-foreground/80 leading-relaxed text-base md:text-lg whitespace-pre-line max-w-none">
                    {language === 'de'
                      ? (restaurantSection.description_de || restaurantSection.description_en || restaurantSection.description || '')
                      : (restaurantSection.description_en || restaurantSection.description || '')}
                  </p>
                  <div className="flex gap-3 mt-2">
                    <Link to="/table-reservation">
                      <Button size="lg" className="rounded-full px-8 h-11 shadow-lg text-base">
                        {t('bookTable')}
                      </Button>
                    </Link>
                    <Link to="/menu">
                      <Button size="lg" variant="outline" className="rounded-full px-8 h-11 text-base">
                        {t('viewMenuBtn')}
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>
        )}

        <CustomerFeedback />
      </main>
    </>
  );
}