import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ShieldCheck, Database, Clock, Trash2, MessageSquare, Ban, UserCheck, Mail } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const content = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: July 2026',
    intro:
      'At Tripti Genusswelt, we respect your privacy and are committed to protecting your personal data. This Privacy Policy explains what information we collect, how we use it, and how long we keep it when you make a reservation or contact us.',
    sections: [
      {
        icon: Database,
        heading: '1. Data We Collect',
        body:
          'When you make a table reservation or contact us through our website, we collect the following personal information: your name, email address, phone number, and reservation details (such as date, time, number of guests, and any special requests you provide).',
      },
      {
        icon: Clock,
        heading: '2. Data Retention Policy',
        body:
          'We only keep your personal data for a maximum of 2 days from the date of your reservation. After this short period, your data is no longer needed for the purpose it was collected for and is removed from our systems.',
      },
      {
        icon: Trash2,
        heading: '3. Automatic Data Deletion',
        body:
          'Your personal data is automatically and permanently deleted from our records within 2 days of your booking date. We do not retain personal data for longer than necessary, and no manual request is required for this deletion to occur.',
      },
      {
        icon: MessageSquare,
        heading: '4. How We Use Your Data',
        body:
          'The personal data you provide is used exclusively for communication purposes related to your reservation - including confirming your booking, notifying you of any changes, and responding to inquiries you send us. We do not use your data for marketing or any other purpose.',
      },
      {
        icon: Ban,
        heading: '5. No Third-Party Sharing',
        body:
          'We do not sell, rent, or share your personal data with any third parties, advertisers, or external organizations. Your information stays within our restaurant\u2019s reservation system and is used solely by our team.',
      },
      {
        icon: UserCheck,
        heading: '6. Your Rights',
        body:
          'You have the right to request access to the personal data we hold about you, ask questions about how it is used, or request early deletion of your data before the standard 2-day retention period ends. To exercise any of these rights, simply contact us using the details below.',
      },
      {
        icon: Mail,
        heading: '7. Contact Us About Privacy',
        body:
          'If you have any questions or concerns about this Privacy Policy or how your data is handled, please reach out to us directly:',
      },
    ],
  },
  de: {
    title: 'Datenschutzerklärung',
    updated: 'Zuletzt aktualisiert: Juli 2026',
    intro:
      'Bei Tripti Genusswelt respektieren wir Ihre Privatsphäre und verpflichten uns, Ihre personenbezogenen Daten zu schützen. Diese Datenschutzerklärung erläutert, welche Informationen wir sammeln, wie wir sie verwenden und wie lange wir sie speichern, wenn Sie eine Reservierung vornehmen oder uns kontaktieren.',
    sections: [
      {
        icon: Database,
        heading: '1. Erhobene Daten',
        body:
          'Wenn Sie über unsere Website einen Tisch reservieren oder uns kontaktieren, erfassen wir folgende personenbezogene Daten: Ihren Namen, Ihre E-Mail-Adresse, Ihre Telefonnummer und Reservierungsdetails (wie Datum, Uhrzeit, Anzahl der Gäste und etwaige besondere Wünsche).',
      },
      {
        icon: Clock,
        heading: '2. Aufbewahrungsdauer',
        body:
          'Wir speichern Ihre personenbezogenen Daten maximal 2 Tage ab dem Datum Ihrer Reservierung. Nach diesem kurzen Zeitraum werden Ihre Daten aus unseren Systemen entfernt, da sie für den ursprünglichen Zweck nicht mehr benötigt werden.',
      },
      {
        icon: Trash2,
        heading: '3. Automatische Löschung',
        body:
          'Ihre personenbezogenen Daten werden automatisch und dauerhaft innerhalb von 2 Tagen nach Ihrem Buchungsdatum aus unseren Aufzeichnungen gelöscht. Wir speichern keine personenbezogenen Daten länger als nötig, und diese Löschung erfolgt ohne manuelle Anfrage.',
      },
      {
        icon: MessageSquare,
        heading: '4. Verwendung Ihrer Daten',
        body:
          'Die von Ihnen angegebenen personenbezogenen Daten werden ausschließlich zu Kommunikationszwecken im Zusammenhang mit Ihrer Reservierung verwendet - einschließlich der Bestätigung Ihrer Buchung, Benachrichtigung über Änderungen und Beantwortung Ihrer Anfragen. Wir verwenden Ihre Daten nicht für Marketing oder andere Zwecke.',
      },
      {
        icon: Ban,
        heading: '5. Keine Weitergabe an Dritte',
        body:
          'Wir verkaufen, vermieten oder teilen Ihre personenbezogenen Daten nicht mit Dritten, Werbetreibenden oder externen Organisationen. Ihre Informationen bleiben innerhalb des Reservierungssystems unseres Restaurants und werden ausschließlich von unserem Team verwendet.',
      },
      {
        icon: UserCheck,
        heading: '6. Ihre Rechte',
        body:
          'Sie haben das Recht, Zugang zu den über Sie gespeicherten personenbezogenen Daten zu verlangen, Fragen zur Verwendung zu stellen oder eine vorzeitige Löschung Ihrer Daten vor Ablauf der standardmäßigen 2-tägigen Aufbewahrungsfrist zu beantragen. Um eines dieser Rechte auszuüben, kontaktieren Sie uns bitte über die unten angegebenen Kontaktdaten.',
      },
      {
        icon: Mail,
        heading: '7. Kontakt zum Datenschutz',
        body:
          'Wenn Sie Fragen oder Anliegen zu dieser Datenschutzerklärung oder zum Umgang mit Ihren Daten haben, wenden Sie sich bitte direkt an uns:',
      },
    ],
  },
};

export default function PrivacyPolicyPage() {
  const { language } = useLanguage();
  const data = content[language] || content.en;

  return (
    <>
      <Helmet>
        <title>{data.title} - Tripti Genusswelt</title>
      </Helmet>

      <main className="py-12 md:py-24 bg-background min-h-screen relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 indian-decorative-border-burgundy" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center mb-14"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-6 shadow-lg">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-4 drop-shadow-sm">
              {data.title}
            </h1>
            <div className="w-24 h-1.5 bg-secondary mx-auto rounded-full mb-4 shadow-sm" />
            <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">
              {data.updated}
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="text-foreground/90 text-lg leading-relaxed mb-12 bg-card border-2 border-border rounded-2xl p-6 sm:p-8 shadow-md"
          >
            {data.intro}
          </motion.p>

          <div className="space-y-6">
            {data.sections.map((section, idx) => {
              const Icon = section.icon;
              return (
                <motion.section
                  key={section.heading}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 * idx }}
                  className="bg-card border-2 border-border rounded-2xl p-6 sm:p-8 shadow-md hover:shadow-lg transition-shadow duration-300"
                >
                  <div className="flex items-start gap-5">
                    <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-serif font-bold text-primary mb-3">
                        {section.heading}
                      </h2>
                      <p className="text-foreground/90 leading-relaxed">{section.body}</p>
                      {idx === data.sections.length - 1 && (
                        <ul className="mt-4 space-y-2 text-foreground/90 font-medium">
                          <li>
                            Email:{' '}
                            <a
                              href="mailto:info@triptigenusswelt.at"
                              className="text-primary hover:text-secondary transition-colors underline"
                            >
                              info@triptigenusswelt.at
                            </a>
                          </li>
                          <li>
                            Phone:{' '}
                            <a
                              href="tel:+436641219289"
                              className="text-primary hover:text-secondary transition-colors underline"
                            >
                              +43 6641219289
                            </a>
                          </li>
                          <li>Address: Italiener Straße 17, Villach 9500, Austria</li>
                        </ul>
                      )}
                    </div>
                  </div>
                </motion.section>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
