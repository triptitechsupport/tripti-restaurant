import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail, Instagram, Facebook } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';

// closedWeekday is stored as a JS getDay() integer: 0=Sunday ... 6=Saturday
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function Footer() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [closedWeekday, setClosedWeekday] = useState(3); // default Wednesday

  useEffect(() => {
    const loadHours = async () => {
      try {
        const res = await pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false });
        if (res.items.length > 0) setClosedWeekday(res.items[0].closedWeekday ?? 3);
      } catch (_) {}
    };
    loadHours();
    void pb.collection('restaurant_hours').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') setClosedWeekday(e.record.closedWeekday ?? 3);
    }).catch(() => {});
    return () => {
      void pb.collection('restaurant_hours').unsubscribe('*').catch(() => {});
    };
  }, []);


  const closedDayLabel = t(WEEKDAY_KEYS[closedWeekday] || 'wednesday');

  return (
    <footer className="bg-primary text-primary-foreground pt-16 pb-8 mt-auto relative">
      <div className="absolute top-0 left-0 w-full h-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI2IiB2aWV3Qm94PSIwIDAgMjAgNiI+PHBhdGggZD0iTTEwIDZMMCAwaDIwem0wLTIuNUw1IDBoMTB6IiBmaWxsPSIjRkZDNzAwIiBmaWxsLW9wYWNpdHk9IjAuNiIvPjwvc3ZnPg==')] bg-repeat-x opacity-80" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div className="space-y-4">
            <div className="flex flex-col">
              <h3 className="text-3xl font-serif font-bold text-secondary">Tripti Genusswelt</h3>
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground/90 mt-1">
                The Indian Restaurant
              </span>
            </div>
            <p className="text-primary-foreground/80 leading-relaxed text-sm">
              {t('heroSubtitle') || 'Discover a symphony of spices and traditional recipes crafted with passion.'}
            </p>
            <div className="flex space-x-4 pt-2">
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center text-primary-foreground hover:bg-secondary hover:text-secondary-foreground transition-all" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center text-primary-foreground hover:bg-secondary hover:text-secondary-foreground transition-all" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-secondary mb-4 uppercase tracking-widest text-sm border-b border-secondary/30 pb-2 inline-block">{t('quickLinks')}</h4>
            <ul className="space-y-3">
              <li><Link to="/" className="text-primary-foreground/80 hover:text-secondary transition-colors font-medium">{t('home')}</Link></li>
              <li><Link to="/menu" className="text-primary-foreground/80 hover:text-secondary transition-colors font-medium">{t('menu')}</Link></li>
              <li><Link to="/table-reservation" className="text-primary-foreground/80 hover:text-secondary transition-colors font-medium">{t('bookTable')}</Link></li>
              <li><Link to="/contact" className="text-primary-foreground/80 hover:text-secondary transition-colors font-medium">{t('contact')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-secondary mb-4 uppercase tracking-widest text-sm border-b border-secondary/30 pb-2 inline-block">{t('openingHours')}</h4>
            <ul className="space-y-3 text-primary-foreground/80 text-sm font-medium">
              <li className="flex justify-between items-center gap-2 border-b border-primary-foreground/10 pb-2">
                <span>{t('daily')}</span> 
                <span className="text-right">11:00 - 13:00 / 17:00 - 21:00</span>
              </li>
              <li className="flex justify-between items-center gap-2">
                <span className="text-secondary">{t('except')} {closedDayLabel}</span> 
                <span className="text-secondary uppercase text-xs font-bold tracking-wider">{t('closedLabel')}</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-secondary mb-4 uppercase tracking-widest text-sm border-b border-secondary/30 pb-2 inline-block">{t('contactUs')}</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-primary-foreground/80">
                <MapPin className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">Italiener Straße 17,<br/>Villach 9500</span>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/80">
                <Phone className="h-5 w-5 text-secondary shrink-0" />
                <a href="tel:+436641219289" className="hover:text-secondary transition-colors font-medium">+43 6641219289</a>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/80">
                <Mail className="h-5 w-5 text-secondary shrink-0" />
                <a href="mailto:info@triptigenusswelt.at" className="hover:text-secondary transition-colors font-medium">info@triptigenusswelt.at</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-primary-foreground/20 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm text-primary-foreground/60 font-medium">
            © {currentYear} Tripti Genusswelt. {t('allRightsReserved') || 'All rights reserved.'}
          </span>
          <div className="flex gap-6 text-sm font-medium">
            <Link to="/privacy-policy" className="text-primary-foreground/60 hover:text-secondary transition-colors">{t('privacyPolicy') || 'Privacy Policy'}</Link>
            <Link to="/terms-of-service" className="text-primary-foreground/60 hover:text-secondary transition-colors">{t('termsOfService') || 'Terms of Service'}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}