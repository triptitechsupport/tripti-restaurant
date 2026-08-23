import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import defaultPb from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function StaffLogin({ collection, title, description, redirectTo, icon: Icon, pbClient, belowCard, onLoginSuccess }) {
  const pb = pbClient || defaultPb;
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ loginId: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.loginId || !formData.password) {
      setError(t('staff_loginRequiredFields'));
      return;
    }
    setLoading(true);
    try {
      await pb.collection(collection).authWithPassword(formData.loginId, formData.password, { $autoCancel: false });
      toast.success(t('staff_loginSuccess'));
      // Optional post-login hook (e.g. waiter clock-in). Failures here must not
      // block the login itself.
      if (typeof onLoginSuccess === 'function') {
        try {
          await onLoginSuccess(pb);
        } catch (hookErr) {
          console.error('[StaffLogin] onLoginSuccess hook failed', hookErr);
        }
      }
      navigate(redirectTo);
    } catch (err) {
      console.error('Login error:', err);
      setError(t('staff_invalidCredentials'));
      toast.error(t('staff_authFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{title} - Tripti Genusswelt</title>
      </Helmet>
      <main className="h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 indian-decorative-border-burgundy"></div>
        <div className="w-full max-w-md relative z-10">
          <Card className="shadow-2xl border-2 border-primary rounded-3xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-primary opacity-80" />
            <CardHeader className="space-y-4 text-center pb-8 pt-10">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-2 shadow-inner border border-primary-foreground/20">
                {Icon ? <Icon className="h-8 w-8" /> : <span className="text-3xl font-serif font-bold">T</span>}
              </div>
              <CardTitle className="text-3xl font-serif font-bold tracking-tight text-primary">{title}</CardTitle>
              <CardDescription className="text-base font-medium text-foreground">{description}</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="loginId" className="font-bold text-primary">{t('staff_loginId')}</Label>
                  <Input
                    id="loginId"
                    type="text"
                    value={formData.loginId}
                    onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                    required
                    placeholder={t('staff_loginIdPlaceholder')}
                    className="text-foreground h-12 border-2 focus-visible:ring-primary font-medium"
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="password" className="font-bold text-primary">{t('password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="••••••••"
                    className="text-foreground h-12 border-2 focus-visible:ring-primary font-medium"
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-3 p-4 text-sm text-destructive font-bold bg-destructive/10 rounded-xl border border-destructive/20">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pb-10 pt-4">
                <Button type="submit" disabled={loading} size="lg" className="w-full text-lg shadow-xl">
                  {loading ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" /> {t('staff_authenticating')}
                    </>
                  ) : (
                    t('staff_signIn')
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
          {belowCard && <div className="mt-5">{belowCard}</div>}
        </div>
      </main>
    </>
  );
}
