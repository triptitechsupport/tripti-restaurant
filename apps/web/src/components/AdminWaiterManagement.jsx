import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import {
  ConciergeBell, Plus, Pencil, Trash2, X, Loader2, User, KeyRound, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const COLLECTION = 'waiter_users';
const EMAIL_DOMAIN = 'triptiwaiter.local';

// Internal placeholder email derived from the username. Required because
// waiter_users is a PocketBase Auth collection (email is required), but the
// Admin UI never asks for an email — waiters log in with Username + Password.
const emailFor = (username) => `${String(username || '').trim().toLowerCase()}@${EMAIL_DOMAIN}`;

const EMPTY_FORM = { username: '', displayName: '', password: '' };

export default function AdminWaiterManagement() {
  const { t } = useLanguage();
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // waiter record being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null); // waiter record to delete
  const [deleting, setDeleting] = useState(false);

  const loadWaiters = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pb.collection(COLLECTION).getFullList({
        sort: 'username',
        $autoCancel: false,
      });
      setWaiters(records);
    } catch (err) {
      console.error('[AdminWaiterManagement] load failed', err);
      toast.error(t('waiterLoadFailed'));
      setWaiters([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadWaiters();
  }, [loadWaiters]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (waiter) => {
    setEditing(waiter);
    setForm({
      username: waiter.username || '',
      displayName: waiter.displayName || '',
      password: '',
    });
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validate = () => {
    const next = {};
    const username = String(form.username || '').trim();
    if (!username) next.username = t('waiterUsernameRequired');
    if (!editing && !form.password) next.password = t('waiterPasswordRequired');
    if (form.password && form.password.length < 8) next.password = t('waiterPasswordRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;
    setSaving(true);
    const username = String(form.username || '').trim();
    const displayName = String(form.displayName || '').trim();
    try {
      if (editing) {
        // Edit: update username + displayName. Email is always regenerated
        // from the username so it stays in sync. Password is optional —
        // leaving it blank keeps the current password. emailVisibility and
        // verified are handled automatically and never exposed.
        const updateData = {
          username,
          displayName,
          email: emailFor(username),
          emailVisibility: false,
          verified: false,
        };
        if (form.password) {
          updateData.password = form.password;
          updateData.passwordConfirm = form.password;
        }
        await pb.collection(COLLECTION).update(editing.id, updateData, { $autoCancel: false });
        toast.success(t('waiterUpdated'));
      } else {
        // Create: username, displayName, password. Email is auto-generated
        // from the username; emailVisibility + verified set automatically.
        await pb.collection(COLLECTION).create({
          username,
          displayName,
          email: emailFor(username),
          emailVisibility: false,
          verified: false,
          password: form.password,
          passwordConfirm: form.password,
        }, { $autoCancel: false });
        toast.success(t('waiterCreated'));
      }
      closeForm();
      loadWaiters();
    } catch (err) {
      console.error('[AdminWaiterManagement] save failed', err);
      const data = err?.response?.data || {};
      if (data.username) {
        setErrors((p) => ({ ...p, username: t('waiterUsernameTaken') }));
        toast.error(t('waiterUsernameTaken'));
      } else if (data.email) {
        // Email collision maps back to the username field for the Admin.
        setErrors((p) => ({ ...p, username: t('waiterUsernameTaken') }));
        toast.error(t('waiterUsernameTaken'));
      } else {
        toast.error(editing ? t('waiterUpdateFailed') : t('waiterCreateFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await pb.collection(COLLECTION).delete(deleteTarget.id, { $autoCancel: false });
      toast.success(t('waiterDeleted'));
      setDeleteTarget(null);
      loadWaiters();
    } catch (err) {
      console.error('[AdminWaiterManagement] delete failed', err);
      toast.error(t('waiterDeleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const setField = (key) => (e) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  return (
    <>
      <Helmet>
        <title>Waiter Management - Tripti Genusswelt Admin</title>
      </Helmet>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ConciergeBell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">{t('waiterManagement')}</h2>
              <p className="text-sm text-muted-foreground">{t('waiterManagementDesc')}</p>
            </div>
          </div>
          {!showForm && (
            <Button onClick={openCreate} className="w-full sm:w-auto min-h-touch shadow-md">
              <Plus className="h-4 w-4 mr-2" /> {t('waiterAddNew')}
            </Button>
          )}
        </div>

        <Dialog open={showForm} onOpenChange={(o) => { if (!o) closeForm(); }}>
          <DialogContent className="max-w-lg w-[92vw] rounded-2xl border-2 border-primary shadow-xl">
            <DialogHeader className="flex flex-row items-center justify-between border-b-2 border-border p-2">
              <div>
                <DialogTitle className="text-primary text-xl">
                  {editing ? t('waiterEdit') : t('waiterCreate')}
                </DialogTitle>
                <DialogDescription className="font-medium text-foreground">
                  {t('waiterManagementDesc')}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="p-5 px-mobile bg-card rounded-sm">
              <form onSubmit={handleSave} className="space-y-5 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="waiter-username" className="font-bold text-primary">
                    {t('waiterUsername')}
                  </Label>
                  <Input
                    id="waiter-username"
                    type="text"
                    value={form.username}
                    onChange={setField('username')}
                    placeholder={t('waiterUsernamePlaceholder')}
                    className="h-11 border-2 focus-visible:ring-primary font-medium"
                    disabled={saving}
                    autoComplete="off"
                  />
                  {errors.username ? (
                    <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> {errors.username}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="waiter-displayname" className="font-bold text-primary">
                    {t('waiterDisplayName')}
                  </Label>
                  <Input
                    id="waiter-displayname"
                    type="text"
                    value={form.displayName}
                    onChange={setField('displayName')}
                    placeholder={t('waiterDisplayNamePlaceholder')}
                    className="h-11 border-2 focus-visible:ring-primary font-medium"
                    disabled={saving}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="waiter-password" className="font-bold text-primary">
                    {t('waiterPassword')}
                  </Label>
                  <PasswordInput
                    id="waiter-password"
                    value={form.password}
                    onChange={setField('password')}
                    placeholder={editing ? t('waiterPasswordOptional') : t('waiterPasswordPlaceholder')}
                    className="h-11 border-2 focus-visible:ring-primary font-medium"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                  {editing ? (
                    <p className="text-xs text-muted-foreground">{t('waiterPasswordOptional')}</p>
                  ) : null}
                  {errors.password ? (
                    <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> {errors.password}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button type="submit" disabled={saving} className="min-h-touch shadow-md">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {t('waiterSave')}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeForm} disabled={saving} className="min-h-touch">
                    {t('waiterCancel')}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="border-2 border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">{t('waiterManagement')}</CardTitle>
            <CardDescription className="text-sm">
              {loading ? '…' : `${waiters.length} waiter account${waiters.length === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : waiters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <ConciergeBell className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t('waiterNoAccounts')}</p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">{t('waiterUsername')}</th>
                        <th className="px-4 py-3 font-semibold">{t('waiterDisplayName')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('waiterEditBtn')} / {t('waiterDelete')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {waiters.map((w) => (
                        <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate font-mono">{w.username}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {w.displayName || <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(w)} className="h-9">
                                <Pencil className="h-3.5 w-3.5 mr-1" /> {t('waiterEditBtn')}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(w)} className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('waiterDelete')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-border">
                  {waiters.map((w) => (
                    <div key={w.id} className="p-4 space-y-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono font-semibold text-foreground truncate">{w.username}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {w.displayName || <span className="italic">—</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(w)} className="h-9 flex-1">
                          <Pencil className="h-3.5 w-3.5 mr-1" /> {t('waiterEditBtn')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(w)} className="h-9 flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('waiterDelete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive shrink-0" /> {t('waiterDeleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              {deleteTarget
                ? t('waiterDeleteConfirmDesc').replace('{name}', deleteTarget.displayName || deleteTarget.username)
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto mt-0" disabled={deleting}>{t('waiterCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('waiterDeleteConfirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
