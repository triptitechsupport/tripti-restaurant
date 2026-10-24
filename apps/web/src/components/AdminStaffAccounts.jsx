import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, User, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

// Admin: logins for one staff role (Kitchen Managers or Cashiers).
// Staff sign in with username and password; the email PocketBase needs is
// made up from the username and never shown.
export const STAFF_ROLES = {
  kitchen_manager: {
    collection: 'kds_users',
    domain: 'triptikitchen.local',
    login: '/kds-login',
    de: {
      title: 'Küchenleitung', one: 'Küchenleiter/in', add: 'Küchenleitung anlegen',
      desc: 'Melden sich am Küchenbildschirm an. Zusätzlich: Gerichte als ausverkauft markieren und Abholungen bestätigen oder stornieren.',
    },
    en: {
      title: 'Kitchen Managers', one: 'kitchen manager', add: 'Add kitchen manager',
      desc: 'Sign in on the kitchen screen. They can also mark dishes as sold out and confirm or cancel pickup orders.',
    },
  },
  cashier: {
    collection: 'waiter_users',
    domain: 'triptiwaiter.local',
    login: '/cashier-login',
    de: {
      title: 'Kassierer', one: 'Kassierer/in', add: 'Kassierer/in anlegen',
      desc: 'Melden sich unter /cashier-login an. Sie sehen den Service-Bildschirm (Tische, Zahlungen, Abholungen) und erstellen signierte Belege.',
    },
    en: {
      title: 'Cashiers', one: 'cashier', add: 'Add cashier',
      desc: 'Sign in at /cashier-login. They get the service screen (tables, payments, pickups) and issue signed receipts.',
    },
  },
  auditor: {
    collection: 'auditor_users',
    domain: 'triptiaudit.local',
    login: '/staff-login',
    de: {
      title: 'Prüfer', one: 'Prüfer/in', add: 'Prüfer/in anlegen',
      desc: 'Nur Ansicht: Zahlungen, signierte Belege und DEP7-Export. Sie können nichts ändern.',
    },
    en: {
      title: 'Auditors', one: 'auditor', add: 'Add auditor',
      desc: 'View only: payments, signed receipts and the DEP7 export. They cannot change anything.',
    },
  },
};

const T = {
  de: {
    username: 'Benutzername', name: 'Anzeigename', password: 'Passwort', usernamePh: 'z. B. kueche1',
    namePh: 'z. B. Anita', passwordPh: 'Mindestens 8 Zeichen', keep: 'Leer lassen, um das Passwort zu behalten',
    save: 'Speichern', cancel: 'Abbrechen', edit: 'Bearbeiten', del: 'Löschen', none: 'Noch keine Zugänge.',
    accounts: (n) => `${n} Zugang${n === 1 ? '' : 'e'}`, needUser: 'Bitte einen Benutzernamen eingeben (nur Buchstaben, Zahlen, . _ -).',
    needPw: 'Das Passwort braucht mindestens 8 Zeichen.', taken: 'Dieser Benutzername ist schon vergeben.',
    created: 'Zugang angelegt', updated: 'Zugang gespeichert', deleted: 'Zugang gelöscht', failed: 'Speichern fehlgeschlagen',
    loadFailed: 'Zugänge konnten nicht geladen werden', delTitle: 'Zugang löschen?',
    delDesc: (n) => `${n} kann sich danach nicht mehr anmelden.`, loginAt: 'Anmeldung unter',
  },
  en: {
    username: 'Username', name: 'Display name', password: 'Password', usernamePh: 'e.g. kitchen1',
    namePh: 'e.g. Anita', passwordPh: 'At least 8 characters', keep: 'Leave empty to keep the current password',
    save: 'Save', cancel: 'Cancel', edit: 'Edit', del: 'Delete', none: 'No logins yet.',
    accounts: (n) => `${n} login${n === 1 ? '' : 's'}`, needUser: 'Enter a username (letters, numbers, . _ - only).',
    needPw: 'The password needs at least 8 characters.', taken: 'This username is already taken.',
    created: 'Login created', updated: 'Login saved', deleted: 'Login deleted', failed: 'Could not save',
    loadFailed: 'Could not load the logins', delTitle: 'Delete this login?',
    delDesc: (n) => `${n} will no longer be able to sign in.`, loginAt: 'Sign-in page',
  },
};

const EMPTY = { username: '', displayName: '', password: '' };

export default function AdminStaffAccounts({ role, icon: Icon = User }) {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'de';
  const tx = T[lang];
  const cfg = STAFF_ROLES[role];
  const rx = cfg[lang];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await pb.collection(cfg.collection).getFullList({
        filter: pb.filter('role = {:role}', { role }), sort: 'username', $autoCancel: false,
      }));
    } catch {
      toast.error(tx.loadFailed);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cfg.collection, role, tx.loadFailed]);

  useEffect(() => { load(); }, [load]);

  const openForm = (rec) => {
    setEditing(rec || null);
    setForm(rec ? { username: rec.username || '', displayName: rec.displayName || '', password: '' } : EMPTY);
    setErrors({});
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const username = form.username.trim().toLowerCase();
    const next = {};
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) next.username = tx.needUser;
    if ((!editing || form.password) && form.password.length < 8) next.password = tx.needPw;
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const data = {
      username, displayName: form.displayName.trim(), role,
      email: `${username}@${cfg.domain}`, emailVisibility: false,
    };
    if (form.password) { data.password = form.password; data.passwordConfirm = form.password; }
    try {
      if (editing) await pb.collection(cfg.collection).update(editing.id, data, { $autoCancel: false });
      else await pb.collection(cfg.collection).create({ ...data, verified: false }, { $autoCancel: false });
      toast.success(editing ? tx.updated : tx.created);
      setOpen(false);
      load();
    } catch (err) {
      const d = err?.response?.data || {};
      if (d.username || d.email) { setErrors({ username: tx.taken }); toast.error(tx.taken); }
      else toast.error(`${tx.failed}${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await pb.collection(cfg.collection).delete(toDelete.id, { $autoCancel: false });
      toast.success(tx.deleted);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(`${tx.failed}${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setDeleting(false);
    }
  };

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const err = (k) => errors[k] && (
    <p className="text-xs font-bold text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{errors[k]}</p>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">{rx.title}</h2>
            <p className="text-sm text-muted-foreground">{rx.desc}</p>
            <p className="text-xs text-muted-foreground mt-1">{tx.loginAt}: <a className="underline font-mono" href={cfg.login} target="_blank" rel="noreferrer">{cfg.login}</a></p>
          </div>
        </div>
        <Button onClick={() => openForm(null)} className="w-full sm:w-auto min-h-touch shadow-md shrink-0">
          <Plus className="h-4 w-4 mr-2" />{rx.add}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg w-[92vw] rounded-2xl border-2 border-primary shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-primary text-xl">{editing ? `${tx.edit}: ${editing.displayName || editing.username}` : rx.add}</DialogTitle>
            <DialogDescription>{rx.desc}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor={`sa-${role}-user`} className="font-bold text-primary">{tx.username}</Label>
              <Input id={`sa-${role}-user`} value={form.username} onChange={set('username')} placeholder={tx.usernamePh}
                autoComplete="off" autoCapitalize="none" className="h-11 border-2" disabled={saving} />
              {err('username')}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sa-${role}-name`} className="font-bold text-primary">{tx.name}</Label>
              <Input id={`sa-${role}-name`} value={form.displayName} onChange={set('displayName')} placeholder={tx.namePh}
                autoComplete="off" className="h-11 border-2" disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sa-${role}-pw`} className="font-bold text-primary">{tx.password}</Label>
              <PasswordInput id={`sa-${role}-pw`} value={form.password} onChange={set('password')}
                placeholder={editing ? tx.keep : tx.passwordPh} autoComplete="new-password" className="h-11 border-2" disabled={saving} />
              {editing && <p className="text-xs text-muted-foreground">{tx.keep}</p>}
              {err('password')}
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={saving} className="min-h-touch">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{tx.save}</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving} className="min-h-touch">{tx.cancel}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-2 border-border rounded-2xl overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{rx.title}</CardTitle>
          <CardDescription>{loading ? '…' : tx.accounts(rows.length)}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center px-4">
              <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{tx.none}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-mono font-semibold truncate">{r.username}</span>
                    {r.displayName && <span className="text-muted-foreground truncate">· {r.displayName}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={() => openForm(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />{tx.edit}
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-none text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />{tx.del}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle>{tx.delTitle}</AlertDialogTitle>
            <AlertDialogDescription>{toDelete ? tx.delDesc(toDelete.displayName || toDelete.username) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting}>{tx.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={remove}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{tx.del}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
