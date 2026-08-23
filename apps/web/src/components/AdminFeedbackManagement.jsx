import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Check, X, Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800/60',
  Approved: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800/60',
  Declined: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800/60',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return dateStr;
  }
}

export default function AdminFeedbackManagement() {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pb
        .collection('feedback')
        .getFullList({ sort: '-created', $autoCancel: false });
      setFeedback(records);
    } catch (err) {
      console.error('[AdminFeedback] Failed to load feedback:', err);
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();

    let unsub;
    void pb
      .collection('feedback')
      .subscribe('*', (e) => {
        setFeedback((prev) => {
          if (e.action === 'create') return [e.record, ...prev];
          if (e.action === 'update')
            return prev.map((f) => (f.id === e.record.id ? e.record : f));
          if (e.action === 'delete')
            return prev.filter((f) => f.id !== e.record.id);
          return prev;
        });
      })
      .catch((error) => console.error('[AdminFeedback] subscribe failed', error));

    return () => {
      if (unsub) unsub();
      void pb.collection('feedback').unsubscribe('*').catch(() => {});
    };
  }, [fetchFeedback]);

  const updateStatus = async (id, status) => {
    setActionId(id);
    try {
      const updated = await pb.collection('feedback').update(id, { status });
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast.success(
        status === 'Approved'
          ? t('feedbackStatusApproved')
          : t('feedbackStatusDeclined'),
      );
    } catch (err) {
      console.error('[AdminFeedback] update failed:', err);
      toast.error('Failed to update feedback status');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold tracking-tight text-primary">
              {t('feedbackManagement')}
            </h2>
            <p className="text-muted-foreground font-medium text-sm mt-1">
              {feedback.length} {feedback.length === 1 ? 'entry' : 'entries'} •
              Approve to display on the homepage.
            </p>
          </div>
        </div>
      </div>

      {feedback.length === 0 ? (
        <Card className="border-2 border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">
              {t('feedbackNoItems')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => {
            const status = item.status || 'Pending';
            return (
              <Card
                key={item.id}
                className="border-2 border-border bg-card shadow-sm hover:shadow-md transition-shadow rounded-2xl overflow-hidden"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-serif font-bold text-primary">
                          {item.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`font-semibold border ${STATUS_STYLES[status] || STATUS_STYLES.Pending}`}
                        >
                          {status === 'Pending'
                            ? t('feedbackStatusPending')
                            : status === 'Approved'
                              ? t('feedbackStatusApproved')
                              : t('feedbackStatusDeclined')}
                        </Badge>
                      </div>
                      <p className="text-foreground/80 leading-relaxed text-sm md:text-base whitespace-pre-line max-w-none mb-3 break-words">
                        {item.message}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {t('feedbackSubmittedOn')} {formatDate(item.created)}
                      </p>
                    </div>

                    <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                      {status !== 'Approved' && (
                        <Button
                          size="sm"
                          onClick={() => updateStatus(item.id, 'Approved')}
                          disabled={actionId === item.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        >
                          {actionId === item.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          {t('feedbackApprove')}
                        </Button>
                      )}
                      {status !== 'Declined' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(item.id, 'Declined')}
                          disabled={actionId === item.id}
                          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/20"
                        >
                          {actionId === item.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <X className="h-4 w-4 mr-1" />
                          )}
                          {t('feedbackDecline')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
