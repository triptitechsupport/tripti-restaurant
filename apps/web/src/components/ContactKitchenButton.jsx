import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const RECIPIENTS = [
  { value: 'both', labelKey: 'alert_recipientBoth' },
  { value: 'kds', labelKey: 'alert_recipientKds' },
  { value: 'admin', labelKey: 'alert_recipientAdmin' },
];

/**
 * Quick-alert button for the waiter dashboard.
 *
 * Opens a lightweight modal where the waiter types a short urgent message
 * (e.g. "Need help at table 5") and sends it through the existing
 * `staff_messages` chat backend, flagged with `isAlert: true`. The message
 * shows up in the full StaffChat panel with an alert indicator and is
 * delivered to kitchen / admin users. The chat UI is NOT opened — the
 * waiter stays on the dashboard the whole time.
 *
 * @param {object} pbClient    - PocketBase client for the waiter session
 * @param {string} displayName - waiter display name used as senderName
 */
export default function ContactKitchenButton({ pbClient, displayName }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('both');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState(false);

  const reset = () => {
    setRecipient('both');
    setMessage('');
    setError('');
    setJustSent(false);
  };

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      // reset shortly after close so the closing animation isn't disrupted
      setTimeout(reset, 200);
    }
  };

  const targets = () => {
    if (recipient === 'both') return ['kds', 'admin'];
    return [recipient];
  };

  const send = async () => {
    const content = message.trim();
    if (!content) {
      setError(t('alert_emptyMessage'));
      return;
    }
    if (sending) return;

    setSending(true);
    setError('');
    try {
      const roles = targets();
      // Send one staff_messages record per recipient role so each target
      // receives the alert in their own StaffChat conversation. Distinct
      // requestKeys prevent SDK auto-cancellation between parallel creates.
      await Promise.all(
        roles.map((recipientRole, i) =>
          pbClient.collection('staff_messages').create(
            {
              senderRole: 'waiter',
              recipientRole,
              senderName: displayName || 'Waiter',
              content,
              read: false,
              isAlert: true,
            },
            { $autoCancel: false, requestKey: `alert-${recipientRole}-${i}-${Date.now()}` }
          )
        )
      );
      setJustSent(true);
      setMessage('');
      // Auto-close shortly after showing confirmation
      setTimeout(() => {
        setOpen(false);
        setTimeout(reset, 200);
      }, 1100);
    } catch (err) {
      console.error('[ContactKitchenButton] send failed', err);
      setError(t('alert_sendFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-10 min-h-[44px] px-3 sm:px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
        aria-label={t('alert_aria')}
        title={t('alert_titleAttr')}
      >
        <AlertTriangle className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">{t('alert_title')}</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[94vw] max-w-md p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('alert_title')}
            </DialogTitle>
            <DialogDescription>
              {t('alert_desc')}
            </DialogDescription>
          </DialogHeader>

          {justSent ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="font-semibold text-foreground">{t('alert_sent')}</p>
              <p className="text-sm text-muted-foreground">
                {recipient === 'both'
                  ? t('alert_notifiedBoth')
                  : recipient === 'kds'
                    ? t('alert_notifiedKds')
                    : t('alert_notifiedAdmin')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="alert-recipient">{t('alert_sendTo')}</Label>
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger id="alert-recipient" className="w-full">
                    <SelectValue placeholder={t('alert_selectRecipient')} />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENTS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {t(r.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="alert-message">{t('alert_message')}</Label>
                <Textarea
                  id="alert-message"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={t('alert_messagePlaceholder')}
                  rows={3}
                  maxLength={500}
                  className="resize-none"
                  autoFocus
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{message.length}/500</span>
                  <span className="hidden sm:inline">{t('alert_sendHint')}</span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}
            </div>
          )}

          {!justSent && (
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={sending}
                className="h-10 min-h-[44px]"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={send}
                disabled={sending || !message.trim()}
                className="h-10 min-h-[44px] bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    {t('alert_sending')}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    {t('alert_sendAlert')}
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
