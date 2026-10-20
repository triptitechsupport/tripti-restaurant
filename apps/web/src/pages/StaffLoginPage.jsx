import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import PocketBase, { BaseAuthStore } from 'pocketbase';
import { AlertCircle, Loader2, LogIn, ShieldCheck, ConciergeBell, ChefHat, CookingPot, PackageCheck, Banknote, LayoutDashboard } from 'lucide-react';
import pb from '@/lib/pocketbaseClient.js';
import { kdsPb, waiterPb, stockPb, auditorPb } from '@/lib/staffClients.js';
import { clockIn } from '@/utils/timesheetService.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// One sign-in for every staff member. The username and password are checked
// against each staff login list; the person then lands on their own screen.
// If the same login exists in more than one list, they pick which work to open.
const AREAS = [
  { collection: 'admin_users', client: pb, to: '/admin-dashboard' },
  { collection: 'waiter_users', client: waiterPb, to: '/waiter-dashboard', clockIn: true },
  { collection: 'kds_users', client: kdsPb, to: '/kds-dashboard' },
  { collection: 'stock_users', client: stockPb, to: '/stock-dashboard' },
  { collection: 'auditor_users', client: auditorPb, to: '/auditor-dashboard' },
];

const T = {
  de: {
    title: 'Mitarbeiter-Anmeldung', desc: 'Mit Benutzername und Passwort anmelden. Die App öffnet Ihren Arbeitsbereich.',
    user: 'Benutzername oder E-Mail', userPh: 'z. B. kellner1', pw: 'Passwort', signIn: 'Anmelden', busy: 'Wird geprüft …',
    required: 'Bitte Benutzername und Passwort eingeben.', wrong: 'Benutzername oder Passwort ist falsch.',
    offline: 'Keine Verbindung zum Server. Bitte Internet prüfen.', pick: 'Welchen Bereich öffnen?',
    continueAs: 'Angemeldet bleiben als', other: 'Andere Person anmelden',
    roles: { admin: 'Admin', waiter: 'Service', cashier: 'Kasse', kitchen: 'Küche', kitchen_manager: 'Küchenleitung', stock: 'Lager', auditor: 'Prüfer' },
  },
  en: {
    title: 'Staff sign-in', desc: 'Sign in with your username and password. The app opens your work area.',
    user: 'Username or email', userPh: 'e.g. waiter1', pw: 'Password', signIn: 'Sign in', busy: 'Checking …',
    required: 'Enter your username and password.', wrong: 'Wrong username or password.',
    offline: 'Cannot reach the server. Check the internet connection.', pick: 'Which work area do you want to open?',
    continueAs: 'Continue as', other: 'Sign in as someone else',
    roles: { admin: 'Admin', waiter: 'Waiter', cashier: 'Cashier', kitchen: 'Kitchen', kitchen_manager: 'Kitchen manager', stock: 'Stock manager', auditor: 'Auditor' },
  },
};

const ICONS = { admin: LayoutDashboard, waiter: ConciergeBell, cashier: Banknote, kitchen: ChefHat, kitchen_manager: CookingPot, stock: PackageCheck, auditor: ShieldCheck };

function roleOf(area, record) {
  switch (area.collection) {
    case 'admin_users': return 'admin';
    case 'waiter_users': return record?.role === 'cashier' ? 'cashier' : 'waiter';
    case 'kds_users': return record?.role === 'kitchen_manager' ? 'kitchen_manager' : 'kitchen';
    case 'stock_users': return 'stock';
    default: return 'auditor';
  }
}

const recordOf = (client) => (client.authStore.isValid ? (client.authStore.model || client.authStore.record) : null);

// Logins already saved on this device (for "Continue as").
function savedLogins() {
  return AREAS.map((area) => {
    const record = recordOf(area.client);
    return record && record.collectionName === area.collection ? { area, record, role: roleOf(area, record) } : null;
  }).filter(Boolean);
}

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tx = T[language === 'en' ? 'en' : 'de'];
  // The last username is remembered on this device (never the password).
  const [form, setForm] = useState(() => {
    let id = '';
    try { id = localStorage.getItem('tripti_staff_last_id') || ''; } catch { /* ignore */ }
    return { id, pw: '' };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState(null);
  const [saved, setSaved] = useState(() => savedLogins());

  // Exactly one saved login: open that work area straight away.
  useEffect(() => {
    if (saved.length === 1) navigate(saved[0].area.to, { replace: true });
  }, [saved, navigate]);

  // Keep only the chosen login on this device, so the next person who signs
  // in never inherits someone else's session.
  const open = async (match) => {
    for (const area of AREAS) {
      if (area.client !== match.area.client) {
        try { area.client.authStore.clear(); } catch { /* ignore */ }
      }
    }
    if (match.token) match.area.client.authStore.save(match.token, match.record);
    if (match.area.clockIn && match.token) {
      try { await clockIn(match.record.id, match.area.client); } catch (err) { console.error('[StaffLogin] clock-in failed', err); }
    }
    navigate(match.area.to, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setChoices(null);
    const id = form.id.trim();
    if (!id || !form.pw) { setError(tx.required); return; }
    setBusy(true);
    try {
      // Each check uses a throwaway client so nothing is saved until the
      // person's work area is known.
      const results = await Promise.allSettled(AREAS.map(async (area) => {
        const probe = new PocketBase(area.client.baseURL, new BaseAuthStore());
        const auth = await probe.collection(area.collection).authWithPassword(id, form.pw, { $autoCancel: false });
        const record = { ...auth.record, collectionName: auth.record.collectionName || area.collection };
        return { area, record, token: auth.token, role: roleOf(area, record) };
      }));
      const matches = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (matches.length) { try { localStorage.setItem('tripti_staff_last_id', id); } catch { /* ignore */ } }
      if (matches.length === 1) { await open(matches[0]); return; }
      if (matches.length > 1) { setChoices(matches); return; }
      const offline = results.every((r) => r.status === 'rejected' && !r.reason?.status);
      setError(offline ? tx.offline : tx.wrong);
    } finally {
      setBusy(false);
    }
  };

  const roleButtons = (list, onPick) => (
    <div className="grid gap-3">
      {list.map((m) => {
        const Icon = ICONS[m.role] || LogIn;
        return (
          <Button key={m.area.collection} type="button" variant="outline" size="lg" className="h-14 justify-start text-base border-2" onClick={() => onPick(m)}>
            <Icon className="h-5 w-5 mr-3 text-primary" />
            <span className="font-bold">{tx.roles[m.role]}</span>
            <span className="ml-2 text-muted-foreground truncate">{m.record.displayName || m.record.username || m.record.email}</span>
          </Button>
        );
      })}
    </div>
  );

  return (
    <>
      <Helmet><title>{tx.title} - Tripti Genusswelt</title></Helmet>
      <main className="flex-1 flex items-center justify-center py-10 px-4 bg-background">
        <div className="w-full max-w-md">
          <Card className="shadow-2xl border-2 border-primary rounded-3xl overflow-hidden">
            <CardHeader className="space-y-3 text-center pt-8">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center">
                <LogIn className="h-8 w-8" />
              </div>
              <CardTitle className="text-3xl font-serif font-bold text-primary">{tx.title}</CardTitle>
              <CardDescription className="text-base text-foreground">{tx.desc}</CardDescription>
            </CardHeader>

            {saved.length > 1 && !choices && (
              <CardContent className="space-y-3">
                <p className="font-bold text-primary">{tx.continueAs}</p>
                {roleButtons(saved, open)}
                <Button type="button" variant="ghost" className="w-full" onClick={() => { AREAS.forEach((a) => a.client.authStore.clear()); setSaved([]); }}>{tx.other}</Button>
              </CardContent>
            )}

            {choices && (
              <CardContent className="space-y-3">
                <p className="font-bold text-primary">{tx.pick}</p>
                {roleButtons(choices, open)}
              </CardContent>
            )}

            {saved.length <= 1 && !choices && (
              <form onSubmit={submit} noValidate>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="staff-id" className="font-bold text-primary">{tx.user}</Label>
                    <Input id="staff-id" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
                      placeholder={tx.userPh} autoCapitalize="none" autoCorrect="off" autoComplete="username"
                      className="h-12 border-2" disabled={busy} autoFocus={!form.id} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff-pw" className="font-bold text-primary">{tx.pw}</Label>
                    <PasswordInput id="staff-pw" value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value })}
                      placeholder="••••••••" autoComplete="current-password" className="h-12 border-2" disabled={busy} autoFocus={Boolean(form.id)} />
                  </div>
                  {error && (
                    <div role="alert" className="flex items-center gap-3 p-4 text-sm text-destructive font-bold bg-destructive/10 rounded-xl border border-destructive/20">
                      <AlertCircle className="h-5 w-5 shrink-0" /><p>{error}</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pb-8">
                  <Button type="submit" size="lg" className="w-full text-lg" disabled={busy}>
                    {busy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{tx.busy}</> : tx.signIn}
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
