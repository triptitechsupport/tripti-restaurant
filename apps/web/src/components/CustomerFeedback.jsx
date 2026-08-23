import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Loader2, CheckCircle2, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';

export default function CustomerFeedback() {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [approved, setApproved] = useState([]);
  const [loadingApproved, setLoadingApproved] = useState(true);

  const fetchApproved = useCallback(async () => {
    try {
      const records = await pb.collection('feedback').getList(1, 4, {
        filter: "status = 'Approved'",
        sort: '-created',
        $autoCancel: false,
      });
      setApproved(records.items);
    } catch (err) {
      console.error('[CustomerFeedback] failed to load approved:', err);
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  useEffect(() => {
    fetchApproved();

    void pb
      .collection('feedback')
      .subscribe('*', (e) => {
        // Only react to approved records
        const isApproved = e.record?.status === 'Approved';
        setApproved((prev) => {
          if (e.action === 'delete') {
            return prev.filter((f) => f.id !== e.record.id);
          }
          if (!isApproved) {
            // If a previously-approved record was changed away from Approved, drop it
            return prev.filter((f) => f.id !== e.record.id);
          }
          // create or update of an approved record: refetch to keep order + max 4
          return prev;
        });
        // Refetch to maintain correct ordering and max-4 limit
        if (e.action === 'create' || e.action === 'update') {
          fetchApproved();
        }
      })
      .catch((error) =>
        console.error('[CustomerFeedback] subscribe failed', error),
      );

    return () => {
      void pb.collection('feedback').unsubscribe('*').catch(() => {});
    };
  }, [fetchApproved]);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = t('feedbackNameRequired');
    if (!message.trim()) errs.message = t('feedbackMessageRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSuccess(false);
    try {
      await pb.collection('feedback').create({
        name: name.trim(),
        message: message.trim(),
        status: 'Pending',
      });
      setSuccess(true);
      setName('');
      setMessage('');
      setErrors({});
      toast.success(t('feedbackSuccess'));
      setTimeout(() => setSuccess(false), 6000);
    } catch (err) {
      console.error('[CustomerFeedback] submit failed:', err);
      toast.error(t('feedbackError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-10 md:py-16 bg-card border-t-2 border-border shadow-inner relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-secondary to-transparent opacity-50" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 md:mb-12"
        >
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className="h-px bg-gradient-to-l from-primary to-transparent flex-1 max-w-[100px]" />
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary">
              {t('customerFeedback')}
            </h2>
            <div className="h-px bg-gradient-to-r from-primary to-transparent flex-1 max-w-[100px]" />
          </div>
          <div className="w-20 h-1 bg-secondary mx-auto rounded-full mt-2 animate-pulse-glow" />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          {/* Left: Feedback Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="hours-card animate-hours-fade-in relative overflow-hidden h-full flex flex-col"
          >
            <div className="flex items-start gap-4 mb-5 relative z-10">
              <div className="p-3 bg-secondary rounded-2xl text-primary shadow-inner shrink-0">
                <MessageSquare className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-2xl font-serif font-bold text-primary-foreground">
                  {t('feedbackFormTitle')}
                </h3>
                <p className="text-primary-foreground/80 font-medium text-sm mt-1">
                  {t('feedbackFormSubtitle')}
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 relative z-10 flex-1 min-h-0"
              noValidate
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="feedback-name"
                  className="text-primary-foreground font-semibold text-sm"
                >
                  {t('feedbackName')}
                </label>
                <input
                  id="feedback-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('feedbackNamePlaceholder')}
                  maxLength={200}
                  className="w-full rounded-xl bg-primary-foreground/95 text-foreground border-2 border-primary-foreground/20 px-4 py-3 text-base outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/40 transition-all"
                />
                {errors.name && (
                  <p className="text-secondary text-sm font-semibold">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <label
                  htmlFor="feedback-message"
                  className="text-primary-foreground font-semibold text-sm"
                >
                  {t('feedbackMessage')}
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('feedbackMessagePlaceholder')}
                  maxLength={2000}
                  className="w-full flex-1 rounded-xl bg-primary-foreground/95 text-foreground border-2 border-primary-foreground/20 px-4 py-3 text-base outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/40 transition-all resize-none"
                />
                {errors.message && (
                  <p className="text-secondary text-sm font-semibold">
                    {errors.message}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 text-base font-bold rounded-xl bg-secondary text-primary hover:bg-secondary/90 hover:text-white shadow-lg transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {t('feedbackSubmitting')}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      {t('feedbackSubmit')}
                    </>
                  )}
                </Button>

                {success && (
                  <div className="mt-3 flex items-start gap-2 bg-primary-foreground/95 text-foreground rounded-xl p-3 border-2 border-secondary/50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-medium leading-relaxed">
                      {t('feedbackSuccess')}
                    </p>
                  </div>
                )}
              </div>
            </form>
          </motion.div>

          {/* Right: Approved Feedback Display */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
            className="bg-background p-6 md:p-8 rounded-3xl border-2 border-border shadow-xl h-full flex flex-col hover:shadow-2xl transition-shadow duration-500"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary border border-primary/20">
                <Quote className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-primary">
                {t('feedbackApprovedTitle')}
              </h3>
            </div>

            <div className="flex-1 flex flex-col gap-3">
              {loadingApproved ? (
                [...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl bg-muted animate-pulse"
                  />
                ))
              ) : approved.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
                  <p className="text-muted-foreground font-medium max-w-xs">
                    {t('feedbackNoApproved')}
                  </p>
                </div>
              ) : (
                approved.map((fb, idx) => (
                  <motion.div
                    key={fb.id}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: idx * 0.08 }}
                    className="rounded-2xl border-2 border-border bg-card p-4 md:p-5 shadow-sm hover:border-secondary/60 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-secondary/20 rounded-xl text-primary shrink-0 group-hover:bg-secondary group-hover:text-primary-foreground transition-colors">
                        <Quote className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground/90 leading-relaxed text-sm md:text-base whitespace-pre-line line-clamp-2 mb-2 break-all">
                          {fb.message}
                        </p>
                        <p className="text-primary font-serif font-bold text-sm md:text-base">
                          — {fb.name}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
