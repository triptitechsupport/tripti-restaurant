import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { stockPb as pb } from '@/lib/staffClients.js';
import pbDefault from '@/lib/pocketbaseClient.js';

// Minimal header for stock-authenticated pages only — mirrors the
// WaiterHeader / KdsHeader pattern: logo (left) + EN/DE language switcher
// (right). Public-site nav is intentionally omitted.
export default function StockHeader() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
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
        console.error('[StockHeader] Failed to load site branding logo:', err);
      }
    };
    fetchLogo();
  }, []);

  const handleLogoClick = () => {
    const sModel = pb.authStore.model || pb.authStore.record;
    const aModel = pbDefault.authStore.model || pbDefault.authStore.record;
    const isStock = pb.authStore.isValid && sModel?.collectionName === 'stock_users';
    const isAdmin = pbDefault.authStore.isValid && aModel?.collectionName === 'admin_users';
    if (isStock || isAdmin) {
      navigate('/stock-dashboard');
    } else {
      navigate('/stock-login');
    }
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="sticky-header indian-decorative-border"
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[var(--nav-height-mobile)] md:h-[var(--nav-height-desktop)] items-center justify-between gap-4">

          <button
            type="button"
            onClick={handleLogoClick}
            className="flex items-center gap-3 md:gap-4 group min-w-0"
            aria-label="Tripti Genusswelt — go to Stock Dashboard"
          >
            {logoUrl ? (
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="flex items-center min-w-0"
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
                transition={{ type: 'spring', stiffness: 300 }}
                className="flex flex-col min-w-0"
              >
                <span className="text-xl md:text-3xl font-serif font-bold text-primary-foreground tracking-tight drop-shadow-sm group-hover:text-secondary transition-colors duration-300 truncate">
                  Tripti Genusswelt
                </span>
                <span className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/90">
                  Stock & Waste
                </span>
              </motion.div>
            )}
          </button>

          <div className="flex items-center bg-primary-foreground/10 rounded-lg p-1 border border-primary-foreground/20 shrink-0">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'en' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('de')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all duration-300 ${language === 'de' ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-primary-foreground/70 hover:text-secondary'}`}
            >
              DE
            </button>
          </div>
        </div>
      </nav>
    </motion.header>
  );
}
