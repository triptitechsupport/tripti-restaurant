import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const TEXT = {
  de: {
    title: 'Seite nicht gefunden',
    body: 'Diese Seite gibt es leider nicht. Vielleicht finden Sie auf unserer Speisekarte, was Sie suchen.',
    home: 'Zur Startseite',
    menu: 'Zur Speisekarte',
  },
  en: {
    title: 'Page not found',
    body: 'Sorry, this page does not exist. Maybe our menu has what you are looking for.',
    home: 'Go to home page',
    menu: 'See the menu',
  },
};

export default function NotFoundPage() {
  const { language } = useLanguage();
  const text = TEXT[language] || TEXT.de;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-24">
      <Helmet>
        <title>{text.title} - Tripti Genusswelt</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-md text-center space-y-6">
        <p className="text-6xl font-serif font-bold text-secondary">404</p>
        <h1 className="text-3xl font-serif font-bold text-primary">{text.title}</h1>
        <p className="text-muted-foreground">{text.body}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="rounded-full">
            <Link to="/">{text.home}</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/menu">{text.menu}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
