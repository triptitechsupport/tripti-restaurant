import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Link } from 'react-router-dom';
import PageCover from '@/components/menu/PageCover.jsx';
import pb from '@/lib/pocketbaseClient.js';

// closedWeekday is stored as a JS getDay() integer: 0=Sunday ... 6=Saturday
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function ContactPage() {
  const { t, language } = useLanguage();
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
    <>
      <Helmet>
        <title>{t('contactUs')} - Tripti Genusswelt</title>
      </Helmet>
      
      <main className="bg-background min-h-screen relative overflow-hidden">
        <div className="tg-home">
          <PageCover
            eyebrow={language === 'de' ? 'Kontakt · Contact' : 'Contact · Kontakt'}
            title={t('contactUs')}
            lead={t('contactSubtitle') || 'We would love to hear from you. Get in touch with us for any inquiries.'}
          >
            <a className="btn btn-gold" href="tel:+436641219289">{language === 'de' ? 'Anrufen' : 'Call us'}</a>
            <Link className="btn btn-line" to="/table-reservation">{t('bookTable') || (language === 'de' ? 'Tisch reservieren' : 'Book a table')}</Link>
          </PageCover>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 relative z-10 py-12 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
              className="tg-paper p-8 sm:p-10 space-y-10 relative overflow-hidden"
            >
              
              <div className="flex items-start gap-6 pt-4 group">
                <div className="p-4 bg-primary rounded-2xl text-primary-foreground shadow-md shrink-0 group-hover:scale-110 group-hover:bg-secondary group-hover:text-primary transition-all duration-300">
                  <MapPin className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif font-bold text-primary mb-3">{t('location')}</h3>
                  <p className="text-foreground font-medium leading-relaxed text-lg group-hover:text-primary transition-colors duration-300">
                    Italiener Straße 17<br />
                    Villach 9500<br />
                    Austria
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="p-4 bg-primary rounded-2xl text-primary-foreground shadow-md shrink-0 group-hover:scale-110 group-hover:bg-secondary group-hover:text-primary transition-all duration-300">
                  <Phone className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif font-bold text-primary mb-3">{t('callUs')}</h3>
                  <a href="tel:+436641219289" className="text-foreground font-medium text-lg hover:text-secondary transition-colors block">
                    +43 6641219289
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="p-4 bg-primary rounded-2xl text-primary-foreground shadow-md shrink-0 group-hover:scale-110 group-hover:bg-secondary group-hover:text-primary transition-all duration-300">
                  <Mail className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif font-bold text-primary mb-3">Email</h3>
                  <a href="mailto:info@triptigenusswelt.at" className="text-foreground font-medium text-lg hover:text-secondary transition-colors block">
                    info@triptigenusswelt.at
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-6 pt-8 border-t-2 border-border/50 group">
                <div className="p-4 bg-secondary rounded-2xl text-secondary-foreground shadow-md shrink-0 group-hover:scale-110 transition-all duration-300">
                  <Clock className="h-7 w-7" />
                </div>
                <div className="w-full">
                  <h3 className="text-2xl font-serif font-bold text-primary mb-5">{t('ourHours')}</h3>
                  <div className="space-y-4 text-base font-medium text-foreground">
                    <div className="flex justify-between items-center gap-2 border-b border-border/50 pb-2 hover:text-primary transition-colors">
                      <span>{t('daily')}</span>
                      <span className="font-bold text-right">11:00 - 13:00 / 17:00 - 21:00</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-primary font-bold">{t('except')} {closedDayLabel}</span>
                      <span className="text-primary font-bold uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded">{t('closedLabel')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
              className="tg-paper h-full min-h-[450px] overflow-hidden relative"
            >
              <iframe 
                src="https://www.google.com/maps?q=Italiener+Stra%C3%9Fe+17,+9500+Villach,+Austria&output=embed" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen="" 
                loading="lazy" 
                title="Tripti Genusswelt, Italiener Straße 17, 9500 Villach"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full absolute inset-0 filter hover:contrast-110 transition-all duration-500"
              ></iframe>
            </motion.div>
          </div>
        </div>
      </main>
    </>
  );
}