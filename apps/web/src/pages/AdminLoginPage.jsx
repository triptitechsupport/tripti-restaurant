import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLoginPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { adminLogin } = useAuth();
  
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.email || !formData.password) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);

    try {
      await adminLogin(formData.email, formData.password);
      toast.success('Successfully logged in as admin');
      navigate('/admin-dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Invalid email or password. Please try again.');
      toast.error('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('adminLoginTitle') || 'Admin Login'} - Tripti Genusswelt</title>
      </Helmet>
      
      <main className="h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 indian-decorative-border-burgundy"></div>
        
        <div className="w-full max-w-md relative z-10">
          <Card className="shadow-2xl border-2 border-primary rounded-3xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-primary opacity-80" />
            
            <CardHeader className="space-y-4 text-center pb-8 pt-10">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-2 shadow-inner border border-primary-foreground/20">
                <span className="text-3xl font-serif font-bold">T</span>
              </div>
              <CardTitle className="text-3xl font-serif font-bold tracking-tight text-primary">
                {t('adminLoginTitle') || 'Admin Login'}
              </CardTitle>
              <CardDescription className="text-base font-medium text-foreground">
                Enter your credentials to access the Tripti Genusswelt dashboard
              </CardDescription>
            </CardHeader>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="email" className="font-bold text-primary">{t('email') || 'Email Address'}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="admin@triptigenusswelt.at"
                    className="text-foreground h-12 border-2 focus-visible:ring-primary font-medium"
                    disabled={loading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="password" className="font-bold text-primary">{t('password') || 'Password'}</Label>
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
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="w-full text-lg shadow-xl"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      {t('loggingIn') || 'Authenticating...'}
                    </>
                  ) : (
                    t('login') || 'Sign In'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </main>
    </>
  );
}