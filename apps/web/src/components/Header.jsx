import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, ShoppingCart, Phone, LogOut, LayoutDashboard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import pb from '@/lib/pocketbaseClient.js';

export default function Header({ setIsCartOpen }) {
  const [isOpen, setIsOpen] = useState(false);
  const { t, language, setLanguage, isOrderingEnabled } = useLanguage();
  const { cartItems } = useCart();
  const { isAdminAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const list = await pb.collection('site_branding').getList(1, 1, { $autoCancel: false });
        if (list.items.length > 0 && list.items[0].logo) {
          setLogoUrl(pb.files.getURL(list.items[0], list.items[0].logo));
        } else {
          setLogoUrl(null);
        }
      } catch (err) {
        console.error('[Header] Failed to load site branding logo:', err);
      }
    };
    fetchLogo();
  }, []);
  
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { path: '/', label: t('home') },
    { path: '/menu', label: t('menu') },
    { path: '/table-reservation', label: t('bookTable') },
    { path: '/contact', label: t('contact') }
  ];

  return (
    <motion.header 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="sticky-header indian-decorative-border"
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[var(--nav-height-mobile)] md:h-[var(--nav-height-desktop)] items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 md:gap-4 group">
            {logoUrl ? (
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="flex items-center"
              >
                <img
                  src={logoUrl}
                  alt="Tripti Genusswelt logo"
                  className="h-10 md:h-14 w-auto object-contain drop-shadow-sm"
                />
              </motion.div>
            ) : (
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="flex flex-col"
              >
                <span className="text-xl md:text-3xl font-serif font-bold text-primary-foreground tracking-tight drop-shadow-sm group-hover:text-secondary transition-colors duration-300">
                  Tripti Genusswelt
                </span>
                <span className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/90">
                  The Indian Restaurant
                </span>
              </motion.div>
            )}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link, idx) => (
              <motion.div
                key={link.path}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 + 0.2 }}
              >
                <Link
                  to={link.path}
                  className={`text-sm font-bold transition-colors duration-300 uppercase tracking-wider min-h-[44px] flex items-center relative overflow-hidden group ${
                    link.path === '/table-reservation' 
                      ? 'reserve-table-button' 
                      : isActive(link.path) ? 'text-secondary' : 'text-primary-foreground/80 hover:text-secondary'
                  }`}
                >
                  {link.label}
                  {link.path !== '/table-reservation' && (
                    <span className={`absolute bottom-2 left-0 h-0.5 bg-secondary transition-all duration-300 ${isActive(link.path) ? 'w-full' : 'w-0 group-hover:w-full'}`}></span>
                  )}
                </Link>
              </motion.div>
            ))}
            
            <div className="h-6 w-px bg-secondary/30 mx-1"></div>

            <motion.a 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              href="tel:+436641219289" 
              className="flex items-center gap-2 text-sm font-bold text-primary-foreground hover:text-secondary transition-colors duration-300 min-h-[44px]"
            >
              <Phone className="h-4 w-4" />
              +43 6641219289
            </motion.a>

            {isAdminAuthenticated ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex items-center gap-3">
                <Link to="/admin-dashboard">
                  <Button variant="secondary" size="sm" className="font-semibold shadow-sm min-h-[40px]">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    {t('adminDashboard')}
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={logout} className="border-secondary text-secondary hover:bg-secondary hover:text-primary min-h-[40px]">
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('logout')}
                </Button>
              </motion.div>
            ) : isOrderingEnabled ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
                <Link to="/menu?order=1">
                  <Button variant="cta" className="shadow-md transition-all active:scale-95 min-h-[40px] px-6">
                    {t('orderNow')}
                  </Button>
                </Link>
              </motion.div>
            ) : null}
            
            {!isAdminAuthenticated && isOrderingEnabled && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}
                onClick={() => setIsCartOpen(true)} 
                className="relative touch-target group"
                aria-label="Open Shopping Cart"
              >
                <div className="flex items-center justify-center h-11 w-11 rounded-md text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                  <ShoppingCart className="h-5 w-5 transition-transform group-hover:scale-110" />
                  {cartCount > 0 && (
                    <span className="absolute top-0 right-0 h-5 w-5 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold shadow-sm translate-x-1/4 -translate-y-1/4 ring-2 ring-primary">
                      {cartCount}
                    </span>
                  )}
                </div>
              </motion.button>
            )}

            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
              className="flex items-center bg-primary-foreground/10 rounded-lg p-1 border border-primary-foreground/20"
            >
              <button 
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'en' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('de')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'de' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
              >
                DE
              </button>
            </motion.div>
          </div>

          {/* Mobile Right Section */}
          <div className="flex items-center gap-2 lg:hidden">
            {!isAdminAuthenticated && isOrderingEnabled && (
              <button 
                onClick={() => setIsCartOpen(true)} 
                className="relative p-2 touch-target text-primary-foreground hover:text-secondary transition-colors"
                aria-label="Open Shopping Cart"
              >
                <ShoppingCart className="h-6 w-6" />
                {cartCount > 0 && (
                  <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-secondary text-secondary-foreground text-[11px] flex items-center justify-center font-bold ring-2 ring-primary">
                    {cartCount}
                  </span>
                )}
              </button>
            )}

            {/* Language switch visible on mobile/tablet beside hamburger */}
            <div className="flex items-center bg-primary-foreground/10 rounded-lg p-1 border border-primary-foreground/20">
              <button 
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'en' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('de')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'de' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
              >
                DE
              </button>
            </div>
            
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button
                  className="text-primary-foreground p-2 touch-target flex items-center justify-center rounded-md hover:bg-primary-foreground/10 transition-colors active:scale-95"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85%] sm:w-[380px] p-0 flex flex-col border-l-4 border-secondary shadow-2xl bg-card">
                <SheetHeader className="sr-only">
                  <SheetTitle>Mobile Navigation Menu</SheetTitle>
                </SheetHeader>
                
                <div className="flex flex-col h-full overflow-y-auto p-6">
                  <div className="flex flex-col pb-6 border-b-2 border-border/60">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Tripti Genusswelt logo"
                        className="h-12 w-auto object-contain"
                      />
                    ) : (
                      <>
                        <span className="text-2xl font-serif font-bold tracking-tight text-primary">
                          Tripti Genusswelt
                        </span>
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1">
                          The Indian Restaurant
                        </span>
                      </>
                    )}
                  </div>

                  <div className="py-6 space-y-2">
                    {navLinks.map((link) => (
                      <Link 
                        key={link.path} 
                        to={link.path} 
                        onClick={() => setIsOpen(false)}
                        className={`block text-lg font-bold px-4 py-4 rounded-xl transition-all duration-300 ${
                          isActive(link.path) ? 'bg-primary text-secondary shadow-md' : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>

                  <div className="mt-auto pt-6 border-t-2 border-border/60 space-y-4">
                    <a href="tel:+436641219289" className="flex items-center justify-center gap-3 min-h-[48px] text-base font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors rounded-xl px-4 border border-primary/20">
                      <Phone className="h-5 w-5" />
                      +43 664 1219289
                    </a>

                    {isOrderingEnabled && !isAdminAuthenticated && (
                      <Link to="/menu?order=1" onClick={() => setIsOpen(false)} className="block w-full">
                        <Button variant="cta" className="w-full min-h-[52px] text-base rounded-xl">
                          {t('orderNow')}
                        </Button>
                      </Link>
                    )}

                    <div className="flex items-center justify-center bg-muted rounded-xl p-1.5 border border-border mt-2">
                      <button 
                        onClick={() => setLanguage('en')}
                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-colors ${language === 'en' ? 'bg-primary text-secondary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        English
                      </button>
                      <button 
                        onClick={() => setLanguage('de')}
                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-colors ${language === 'de' ? 'bg-primary text-secondary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Deutsch
                      </button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </motion.header>
  );
}