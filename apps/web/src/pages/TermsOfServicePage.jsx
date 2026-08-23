import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { FileText, CalendarCheck, ShieldAlert, Globe, Mail } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const content = {
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: July 2026',
    intro:
      'These Terms of Service ("Terms") govern your use of the Tripti Genusswelt website, including browsing our menu, making table reservations, and contacting our restaurant. By using our website, you agree to these Terms.',
    sections: [
      {
        icon: FileText,
        heading: '1. General Terms and Conditions',
        body:
          'By accessing or using this website, you confirm that you are able to enter into a legally binding agreement and agree to comply with these Terms. We may update these Terms from time to time, and continued use of the website constitutes acceptance of any changes. All content on this website - including text, images, and the menu - is the property of Tripti Genusswelt unless otherwise stated.',
      },
      {
        icon: CalendarCheck,
        heading: '2. Reservation Policies',
        body:
          'Reservations can be made through our website by selecting your preferred date, time, and providing your contact details. A confirmation will be sent to the email or phone number provided. Reservations must be made at least 15 minutes before the requested time slot on the same day. If you need to cancel or change your reservation, please contact us as soon as possible by phone or email so we can accommodate other guests. We reserve the right to cancel or reschedule a reservation in exceptional circumstances (e.g. closures, staffing issues) and will notify you promptly if this occurs.',
      },
      {
        icon: ShieldAlert,
        heading: '3. Liability Disclaimers',
        body:
          'While we make every effort to keep the information on this website - including menu items, prices, and opening hours - accurate and up to date, we do not guarantee that all content is free of errors or omissions. Tripti Genusswelt shall not be held liable for any indirect, incidental, or consequential damages arising from your use of this website or reliance on the information provided. Please inform our staff of any food allergies or dietary requirements when dining with us, as we cannot guarantee the complete absence of allergens in our dishes.',
      },
      {
        icon: Globe,
        heading: '4. Website Usage Terms',
        body:
          'You agree to use this website only for lawful purposes and in a manner that does not infringe the rights of, or restrict or inhibit the use of, this website by any third party. You must not attempt to gain unauthorized access to any part of the website, its servers, or any database connected to it. We reserve the right to restrict or terminate access to the website for any user who violates these Terms.',
      },
      {
        icon: Mail,
        heading: '5. Contact Information',
        body:
          'If you have any questions about these Terms of Service, please contact us:',
      },
    ],
  },
  de: {
    title: 'Allgemeine Geschäftsbedingungen',
    updated: 'Zuletzt aktualisiert: Juli 2026',
    intro:
      'Diese Allgemeinen Geschäftsbedingungen ("AGB") regeln die Nutzung der Website von Tripti Genusswelt, einschließlich des Durchsuchens unserer Speisekarte, der Tischreservierung und der Kontaktaufnahme mit unserem Restaurant. Durch die Nutzung unserer Website stimmen Sie diesen AGB zu.',
    sections: [
      {
        icon: FileText,
        heading: '1. Allgemeine Geschäftsbedingungen',
        body:
          'Mit dem Zugriff auf oder der Nutzung dieser Website bestätigen Sie, dass Sie befugt sind, eine rechtsverbindliche Vereinbarung einzugehen, und stimmen zu, diese AGB einzuhalten. Wir können diese AGB von Zeit zu Zeit aktualisieren, und die fortgesetzte Nutzung der Website stellt die Annahme etwaiger Änderungen dar. Alle Inhalte dieser Website - einschließlich Texte, Bilder und Speisekarte - sind Eigentum von Tripti Genusswelt, sofern nicht anders angegeben.',
      },
      {
        icon: CalendarCheck,
        heading: '2. Reservierungsrichtlinien',
        body:
          'Reservierungen können über unsere Website vorgenommen werden, indem Sie Ihr bevorzugtes Datum und Ihre Uhrzeit auswählen und Ihre Kontaktdaten angeben. Eine Bestätigung wird an die angegebene E-Mail-Adresse oder Telefonnummer gesendet. Reservierungen müssen mindestens 15 Minuten vor dem gewünschten Zeitfenster am selben Tag erfolgen. Wenn Sie Ihre Reservierung stornieren oder ändern müssen, kontaktieren Sie uns bitte so schnell wie möglich telefonisch oder per E-Mail, damit wir anderen Gästen entgegenkommen können. Wir behalten uns das Recht vor, eine Reservierung in außergewöhnlichen Umständen (z. B. Schließungen, Personalengpässe) zu stornieren oder zu verschieben und werden Sie umgehend benachrichtigen, falls dies eintritt.',
      },
      {
        icon: ShieldAlert,
        heading: '3. Haftungsausschluss',
        body:
          'Obwohl wir uns bemühen, die Informationen auf dieser Website - einschließlich Speisekarte, Preise und Öffnungszeiten - korrekt und aktuell zu halten, übernehmen wir keine Garantie dafür, dass alle Inhalte frei von Fehlern oder Auslassungen sind. Tripti Genusswelt haftet nicht für indirekte, zufällige oder Folgeschäden, die aus der Nutzung dieser Website oder dem Vertrauen auf die bereitgestellten Informationen entstehen. Bitte informieren Sie unser Personal über etwaige Lebensmittelallergien oder Ernährungsanforderungen, da wir das vollständige Fehlen von Allergenen in unseren Gerichten nicht garantieren können.',
      },
      {
        icon: Globe,
        heading: '4. Nutzungsbedingungen der Website',
        body:
          'Sie stimmen zu, diese Website nur für rechtmäßige Zwecke und in einer Weise zu nutzen, die die Rechte Dritter nicht verletzt oder deren Nutzung dieser Website nicht einschränkt oder beeinträchtigt. Sie dürfen nicht versuchen, unbefugten Zugriff auf einen Teil der Website, ihrer Server oder einer damit verbundenen Datenbank zu erlangen. Wir behalten uns das Recht vor, den Zugang zur Website für Nutzer, die gegen diese AGB verstoßen, einzuschränken oder zu beenden.',
      },
      {
        icon: Mail,
        heading: '5. Kontaktinformationen',
        body: 'Wenn Sie Fragen zu diesen Allgemeinen Geschäftsbedingungen haben, kontaktieren Sie uns bitte:',
      },
    ],
  },
};

export default function TermsOfServicePage() {
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
              <FileText className="h-8 w-8" />
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
