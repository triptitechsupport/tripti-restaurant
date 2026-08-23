import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, AlertTriangle, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

/**
 * Compact inline communication composer for the Kitchen Display.
 *
 * Reuses the EXISTING staff_messages backend (same collection, same schema,
 * same realtime subscriptions used by StaffChat). It does NOT create a
 * second messaging system — it only writes records that the existing
 * StaffChat widget (mounted on Waiter / Admin / KDS dashboards) already
 * subscribes to and renders.
 *
 * Kitchen can quickly pick a recipient (Waiter or Administrator), type a
 * short message, optionally flag it as an urgent alert, and send — without
 * leaving the KDS or disrupting the active KOT workflow. Replies arrive in
 * the floating StaffChat panel as usual.
 *
 * @param {object} pbClient - PocketBase client for this KDS session
 * @param {string} displayName - name shown to recipients
 */
const RECIPIENTS = [
  { role: 'waiter', labelKey: 'kdsqm_recipientWaiter' },
  { role: 'admin', labelKey: 'kdsqm_recipientAdmin' },
];

export default function KdsQuickMessage({ pbClient, displayName }) {
  const { t } = useLanguage();
  const [recipient, setRecipient] = useState('waiter');
  const [text, setText] = useState('');
  const [isAlert, setIsAlert] = useState(false);
  const [sending, setSending] = useState(false);

  const recipientLabel = (role) => {
    const meta = RECIPIENTS.find((r) => r.role === role);
    return meta ? t(meta.labelKey) : role;
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await pbClient.collection('staff_messages').create(
        {
          senderRole: 'kds',
          recipientRole: recipient,
          senderName: displayName || 'Kitchen',
          content,
          read: false,
          isAlert: !!isAlert,
        },
        { $autoCancel: false },
      );
      setText('');
      setIsAlert(false);
      toast.success(`${t('kdsqm_sentToastPrefix')} ${recipientLabel(recipient)}${isAlert ? ` ${t('kdsqm_urgentSuffix')}` : ''}`);
    } catch (err) {
      console.error('[KdsQuickMessage] send failed', err);
      toast.error(t('kdsqm_sendFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-2.5 sm:p-3 mb-4">
      <div className="flex flex-col gap-2.5">
        {/* Header row — label + recipient selection */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{t('kdsqm_title')}</span>
          </div>
          <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5" role="group" aria-label="Select recipient">
            {RECIPIENTS.map((r) => (
              <button
                key={r.role}
                type="button"
                onClick={() => setRecipient(r.role)}
                aria-pressed={recipient === r.role}
                className={cn(
                  'px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold transition-colors touch-target min-h-[32px]',
                  recipient === r.role
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Input row — alert toggle + message + send */}
        <div className="flex items-center gap-2 flex-col sm:flex-row">
          <button
            type="button"
            onClick={() => setIsAlert((v) => !v)}
            aria-pressed={isAlert}
            title={t('kdsqm_urgent')}
            className={cn(
              'shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide border transition-colors touch-target min-h-[40px] w-full sm:w-auto',
              isAlert
                ? 'bg-destructive/10 text-destructive border-destructive/50'
                : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-destructive/40',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t('kdsqm_urgent')}</span>
          </button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`${t('kdsqm_placeholderPrefix')} ${recipientLabel(recipient)}…`}
            maxLength={500}
            className="flex-1 bg-background min-h-[40px]"
          />
          <Button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="shrink-0 w-full sm:w-auto min-h-[40px]"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sm:hidden">{t('kdsqm_send')}</span>
            <span className="hidden sm:inline">{t('kdsqm_send')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
