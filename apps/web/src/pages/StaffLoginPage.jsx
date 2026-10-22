import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import PocketBase, { BaseAuthStore } from 'pocketbase';
import { AlertCircle, ArrowLeft, Loader2, LogIn, ShieldCheck, ConciergeBell, ChefHat, CookingPot, PackageCheck, Banknote, LayoutDashboard } from 'lucide-react';
import pb from '@/lib/pocketbaseClient.js';
import { kdsPb, waiterPb, stockPb, auditorPb } from '@/lib/staffClients.js';
import { clockIn } from '@/utils/timesheetService.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { isStaffApp } from '@/lib/staffApp.js';
import StaffAppDownload from '@/components/StaffAppDownload.jsx';
import AppLangToggle from '@/components/AppLangToggle.jsx';

// One sign-in for every staff member. The username and password are checked
// against each staff login list; the person then lands on their own screen.
const AREAS = [
  { collection: 'admin_users', client: pb, to: '/admin-dashboard' },
  { collection: 'waiter_users', client: waiterPb, to: '/waiter-dashboard', clockIn: true },
  { collection: 'kds_users', client: kdsPb, to: '/kds-dashboard' },
  { collection: 'stock_users', client: stockPb, to: '/stock-dashboard' },
  { collection: 'auditor_users', client: auditorPb, to: '/auditor-dashboard' },
];

const T = {
  de: {
    title: 'Mitarbeiter-Anmeldung', desc: 'Wählen Sie Ihre Rolle und melden Sie sich mit Benutzername und Passwort an.',
    chooseRole: 'Ihre Rolle', changeRole: 'Andere Rolle', email: 'E-Mail', emailPh: 'admin@beispiel.at',
    user: 'Benutzername oder E-Mail', userPh: 'z. B. kellner1', pw: 'Passwort', signIn: 'Anmelden', busy: 'Wird geprüft …',
    required: 'Bitte Benutzername und Passwort eingeben.', wrong: 'Benutzername oder Passwort ist falsch.',
    otherRole: (a, b) => `Das ist ein Zugang für ${a}, nicht für ${b}. „${a}“ wählen oder den Benutzernamen für ${b} verwenden.`,
    offline: 'Keine Verbindung zum Server. Bitte Internet prüfen.', tooMany: 'Zu viele Anmeldeversuche. Bitte einige Minuten warten.',
    continueAs: 'Angemeldet bleiben als', other: 'Andere Person anmelden',
    roles: { admin: 'Admin', waiter: 'Kellner', cashier: 'Kassierer', kitchen: 'Küche', kitchen_manager: 'Küchenleitung', stock: 'Lager', auditor: 'Prüfer' },
  },
  en: {
    title: 'Staff sign-in', desc: 'Choose your role, then sign in with your username and password.',
    chooseRole: 'Your role', changeRole: 'Other role', email: 'Email', emailPh: 'admin@example.com',
    user: 'Username or email', userPh: 'e.g. waiter1', pw: 'Password', signIn: 'Sign in', busy: 'Checking …',
    required: 'Enter your username and password.', wrong: 'Wrong username or password.',
    otherRole: (a, b) => `This is a ${a} login, not ${b}. Choose "${a}" or use the ${b} username.`,
    offline: 'Cannot reach the server. Check the internet connection.', tooMany: 'Too many sign-in attempts. Please wait a few minutes.',
    continueAs: 'Continue as', other: 'Sign in as someone else',
    roles: { admin: 'Admin', waiter: 'Waiter', cashier: 'Cashier', kitchen: 'Kitchen', kitchen_manager: 'Kitchen manager', stock: 'Stock manager', auditor: 'Auditor' },
  },
};

// The seven work areas shown on the first screen, and the login list each one uses.
const ROLE_LIST = [
  ['admin', 'admin_users'], ['waiter', 'waiter_users'], ['cashier', 'waiter_users'], ['kitchen', 'kds_users'],
  ['kitchen_manager', 'kds_users'], ['stock', 'stock_users'], ['auditor', 'auditor_users'],
];
const ROLE_COLLECTION = Object.fromEntries(ROLE_LIST);

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
  const [saved, setSaved] = useState([]);
  const [role, setRole] = useState(null);
  const [checking, setChecking] = useState(() => savedLogins().length > 0);

  // Logins saved on this device are checked with the server first (the test
  // server starts with a fresh database after each deploy). Exactly one
  // valid login: open that work area straight away.
  useEffect(() => {
    let alive = true;
    const list = savedLogins();
    if (!list.length) return undefined;
    Promise.all(list.map(async (m) => {
      try {
        await m.area.client.collection(m.area.collection).authRefresh({ $autoCancel: false });
        return true;
      } catch (err) {
        if ([401, 403, 404].includes(err?.status)) { m.area.client.authStore.clear(); return false; }
        return true; // offline: keep the login
      }
    })).then(() => {
      if (!alive) return;
      const valid = savedLogins();
      if (valid.length === 1) { navigate(valid[0].area.to, { replace: true }); return; }
      setSaved(valid);
      setChecking(false);
    });
    return () => { alive = false; };
  }, [navigate]);

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
    const id = form.id.trim();
    if (!id || !form.pw) { setError(tx.required); return; }
    setBusy(true);
    try {
      // The server allows only a few sign-in attempts per few minutes, so the
      // login lists are tried one after another and we stop at the first
      // match. The list that worked for this username last time goes first;
      // admins sign in with their email, so the admin list is only tried
      // for an email address.
      let last = '';
      try { last = JSON.parse(localStorage.getItem('tripti_staff_last_area') || '{}')[id.toLowerCase()] || ''; } catch { /* ignore */ }
      const first = ROLE_COLLECTION[role] || last;
      const order = AREAS
        .filter((a) => a.collection !== 'admin_users' || id.includes('@') || role === 'admin')
        .sort((a, b) => (b.collection === first) - (a.collection === first) || (id.includes('@') && (b.collection === 'admin_users') - (a.collection === 'admin_users')));
      let offline = true;
      let limited = false;
      for (const area of order) {
        // A throwaway client, so nothing is saved until the work area is known.
        const probe = new PocketBase(area.client.baseURL, new BaseAuthStore());
        try {
          const auth = await probe.collection(area.collection).authWithPassword(id, form.pw, { $autoCancel: false });
          const record = { ...auth.record, collectionName: auth.record.collectionName || area.collection };
          // Kitchen and Kitchen manager (and Waiter and Cashier) share a login
          // list but are different accounts: refuse the wrong tile.
          const actual = roleOf(area, record);
          if (role && actual !== role && ROLE_COLLECTION[role] === area.collection) {
            setError(tx.otherRole(tx.roles[actual], tx.roles[role]));
            return;
          }
          try {
            localStorage.setItem('tripti_staff_last_id', id);
            const map = JSON.parse(localStorage.getItem('tripti_staff_last_area') || '{}');
            map[id.toLowerCase()] = area.collection;
            localStorage.setItem('tripti_staff_last_area', JSON.stringify(map));
          } catch { /* ignore */ }
          await open({ area, record, token: auth.token, role: roleOf(area, record) });
          return;
        } catch (err) {
          if (err?.status) offline = false;
          if (err?.status === 429) { limited = true; break; }
        }
      }
      setError(offline ? tx.offline : limited ? tx.tooMany : tx.wrong);
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

  const body = (
    <>
            {checking && (
              <CardContent className="flex justify-center py-10" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            )}

            {!checking && saved.length > 1 && (
              <CardContent className="space-y-3">
                <p className="font-bold text-primary">{tx.continueAs}</p>
                {roleButtons(saved, open)}
                <Button type="button" variant="ghost" className="w-full" onClick={() => { AREAS.forEach((a) => a.client.authStore.clear()); setSaved([]); }}>{tx.other}</Button>
              </CardContent>
            )}


            {!checking && saved.length <= 1 && !role && (
              <CardContent className="space-y-3 pb-8">
                <p className="font-bold text-primary">{tx.chooseRole}</p>
                <div className="grid grid-cols-2 gap-3">
                  {ROLE_LIST.map(([key]) => {
                    const Icon = ICONS[key];
                    return (
                      <button key={key} type="button" onClick={() => { setRole(key); setError(''); }}
                        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card p-4 min-h-[96px] font-bold text-primary hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${key === 'auditor' ? 'col-span-2' : ''}`}>
                        <Icon className="h-7 w-7" />
                        <span className="text-sm text-center leading-tight">{tx.roles[key]}</span>
                        {T[language === 'en' ? 'de' : 'en'].roles[key] !== tx.roles[key] && (
                          <span className="-mt-1.5 text-[11px] font-medium text-muted-foreground text-center leading-tight">{T[language === 'en' ? 'de' : 'en'].roles[key]}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            )}

            {!checking && saved.length <= 1 && role && (
              <form onSubmit={submit} noValidate>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3">
                    <span className="flex items-center gap-2 font-bold text-primary">
                      {React.createElement(ICONS[role], { className: 'h-5 w-5' })}{tx.roles[role]}
                    </span>
                    <button type="button" onClick={() => { setRole(null); setError(''); }} className="flex items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4">
                      <ArrowLeft className="h-4 w-4" />{tx.changeRole}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff-id" className="font-bold text-primary">{role === 'admin' ? tx.email : tx.user}</Label>
                    <Input id="staff-id" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
                      placeholder={role === 'admin' ? tx.emailPh : tx.userPh} type={role === 'admin' ? 'email' : 'text'} autoCapitalize="none" autoCorrect="off" autoComplete="username"
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
    </>
  );

  if (isStaffApp) {
    return (
      <>
        <Helmet><title>Tripti Staff</title></Helmet>
        <main className="app-login flex-1 flex flex-col bg-primary">
          <div className="relative px-6 pt-8 pb-10 text-primary-foreground text-center">
            <div className="absolute right-4 top-4"><AppLangToggle /></div>
            <img src="/app-icon.png" alt="" className="mx-auto h-20 w-20 rounded-3xl shadow-xl ring-4 ring-white/15" />
            <h1 className="mt-4 text-3xl font-serif font-bold tracking-tight">Tripti Staff</h1>
            <p className="mt-1 text-sm opacity-80">{tx.title}</p>
          </div>
          <div className="app-sheet flex-1 bg-background rounded-t-[28px] pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
            <div className="mx-auto w-full max-w-md">{body}</div>
          </div>
        </main>
      </>
    );
  }

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
            {body}
          </Card>
          {!isStaffApp && <div className="mt-6"><StaffAppDownload compact /></div>}
        </div>
      </main>
    </>
  );
}
