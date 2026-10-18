import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

/**
 * Shared layout for the Waiter and Admin Help pages.
 *
 * Renders a sticky header with a Back button, a page title + intro, and a
 * list of help sections. Each section is an accordion item containing an
 * optional paragraph and one or more control tables.
 *
 * Props:
 *  - title:        page <title> and H1 text
 *  - subtitle:     short description shown under the H1
 *  - backTo:       route to return to (e.g. "/waiter-dashboard")
 *  - backLabel:    label for the back button
 *  - sections:     array of { id, icon, title, intro?, tables: [{ caption?, headers: [..], rows: [[..]] }] }
 *  - footerNote:   optional closing note rendered after the sections
 */
export default function HelpLayout({
  title,
  subtitle,
  backTo,
  backLabel,
  sections = [],
  footerNote,
}) {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>{title} - Tripti Genusswelt</title>
        <meta name="description" content={`${subtitle}`} />
      </Helmet>

      <div className="min-h-screen bg-muted/20">
        <main className="p-4 sm:p-6 max-w-5xl mx-auto pb-16">
          {/* Back navigation bar (non-sticky — sits below the layout header) */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(backTo, { replace: true })}
              className="h-10 min-h-[44px] px-3 sm:px-4 border-primary/30 text-primary hover:bg-primary/5 shrink-0"
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Button>
            <div className="flex items-center gap-2 text-primary min-w-0">
              <HelpCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-bold uppercase tracking-wide truncate">Help &amp; Guide</span>
            </div>
          </div>
          {/* Intro card */}
          <div className="bg-card border-2 border-border rounded-2xl p-5 sm:p-6 shadow-md mb-6">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary tracking-tight">{title}</h2>
                <p className="text-sm sm:text-base text-muted-foreground font-medium mt-1 leading-relaxed">{subtitle}</p>
              </div>
            </div>
          </div>

          {/* Help sections as accordions */}
          <Accordion type="single" collapsible className="space-y-3">
            {sections.map((section, idx) => {
              const Icon = section.icon;
              return (
                <AccordionItem
                  key={section.id || idx}
                  value={section.id || `section-${idx}`}
                  className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm"
                >
                  <AccordionTrigger className="px-4 sm:px-5 py-4 hover:no-underline [&[data-state=open]]:bg-primary/5">
                    <div className="flex items-center gap-3 text-left min-w-0">
                      {Icon ? (
                        <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5" />
                        </span>
                      ) : null}
                      <span className="font-serif font-bold text-base sm:text-lg text-primary break-words">
                        {section.title}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 sm:px-5 pb-5 pt-3 bg-background border-t-2 border-border/50">
                    {section.intro ? (
                      <p className="text-sm text-muted-foreground font-medium mb-4 leading-relaxed">
                        {section.intro}
                      </p>
                    ) : null}

                    {section.tables.map((tbl, tIdx) => (
                      <div key={tIdx} className={tIdx > 0 ? 'mt-6' : ''}>
                        {tbl.caption ? (
                          <h4 className="text-sm font-serif font-bold text-primary mb-2 tracking-tight">
                            {tbl.caption}
                          </h4>
                        ) : null}
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-muted/50">
                                {tbl.headers.map((h, hIdx) => (
                                  <th
                                    key={hIdx}
                                    className="text-left font-semibold tracking-wide text-muted-foreground px-3 py-2.5 border-b border-border whitespace-nowrap"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {tbl.rows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-muted/20 transition-colors align-top">
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className={`px-3 py-2.5 text-foreground ${
                                        cIdx === 0 ? 'font-bold text-primary whitespace-nowrap' : ''
                                      }`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {section.notes && section.notes.length > 0 ? (
                      <ul className="mt-4 space-y-1.5">
                        {section.notes.map((note, nIdx) => (
                          <li key={nIdx} className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                            <span className="text-secondary mt-0.5 shrink-0">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {footerNote ? (
            <div className="mt-6 bg-secondary/10 border-2 border-secondary/40 rounded-2xl p-4 sm:p-5">
              <p className="text-sm text-foreground font-medium leading-relaxed">{footerNote}</p>
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}
