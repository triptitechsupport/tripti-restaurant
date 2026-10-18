import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import {
  PackageCheck, Plus, Pencil, Trash2, Loader2, User, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const COLLECTION = 'stock_users';
const EMAIL_DOMAIN = 'triptistock.local';

// Internal placeholder email derived from the username. Required because
// stock_users is a PocketBase Auth collection (email is required), but the
// Admin UI never asks for an email — Stock Managers log in with Username +
// Password.
const emailFor = (username) => `${String(username || '').trim().toLowerCase()}@${EMAIL_DOMAIN}`;

const EMPTY_FORM = { username: '', displayName: '', password: '' };

export default function AdminStockManagement() {
  const { t } = useLanguage();
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // stock_users record being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null); // record to delete
  const [deleting, setDeleting] = useState(false);

  const loadManagers = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pb.collection(COLLECTION).getFullList({
        sort: 'username',
        $autoCancel: false,
      });
      setManagers(records);
    } catch (err) {
      console.error('[AdminStockManagement] load failed', err);
      toast.error(t('stockManagerLoadFailed'));
      setManagers([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (manager) => {
    setEditing(manager);
    setForm({
      username: manager.username || '',
      displayName: manager.displayName || '',
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
    if (!username) next.username = t('stockManagerUsernameRequired');
    if (!editing && !form.password) next.password = t('stockManagerPasswordRequired');
    if (form.password && form.password.length < 8) next.password = t('stockManagerPasswordRequired');
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
        toast.success(t('stockManagerUpdated'));
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
        toast.success(t('stockManagerCreated'));
      }
      closeForm();
      loadManagers();
    } catch (err) {
      console.error('[AdminStockManagement] save failed', err);
      const data = err?.response?.data || {};
      if (data.username) {
        setErrors((p) => ({ ...p, username: t('stockManagerUsernameTaken') }));
        toast.error(t('stockManagerUsernameTaken'));
      } else if (data.email) {
        // Email collision maps back to the username field for the Admin.
        setErrors((p) => ({ ...p, username: t('stockManagerUsernameTaken') }));
        toast.error(t('stockManagerUsernameTaken'));
      } else {
        toast.error(editing ? t('stockManagerUpdateFailed') : t('stockManagerCreateFailed'));
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
      toast.success(t('stockManagerDeleted'));
      setDeleteTarget(null);
      loadManagers();
    } catch (err) {
      console.error('[AdminStockManagement] delete failed', err);
      toast.error(t('stockManagerDeleteFailed'));
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
        <title>Stock Manager Management - Tripti Genusswelt Admin</title>
      </Helmet>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <PackageCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">{t('stockManagerManagement')}</h2>
              <p className="text-sm text-muted-foreground">{t('stockManagerManagementDesc')}</p>
            </div>
          </div>
          {!showForm && (
            <Button onClick={openCreate} className="w-full sm:w-auto min-h-touch shadow-md">
              <Plus className="h-4 w-4 mr-2" /> {t('stockManagerAddNew')}
            </Button>
          )}
        </div>

        <Dialog open={showForm} onOpenChange={(o) => { if (!o) closeForm(); }}>
          <DialogContent className="max-w-lg w-[92vw] rounded-2xl border-2 border-primary shadow-xl">
            <DialogHeader className="flex flex-row items-center justify-between border-b-2 border-border p-2">
              <div>
                <DialogTitle className="text-primary text-xl">
                  {editing ? t('stockManagerEdit') : t('stockManagerCreate')}
                </DialogTitle>
                <DialogDescription className="font-medium text-foreground">
                  {t('stockManagerManagementDesc')}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="p-5 px-mobile bg-card rounded-sm">
              <form onSubmit={handleSave} className="space-y-5 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="stock-username" className="font-bold text-primary">
                    {t('stockManagerUsername')}
                  </Label>
                  <Input
                    id="stock-username"
                    type="text"
                    value={form.username}
                    onChange={setField('username')}
                    placeholder={t('stockManagerUsernamePlaceholder')}
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
                  <Label htmlFor="stock-displayname" className="font-bold text-primary">
                    {t('stockManagerDisplayName')}
                  </Label>
                  <Input
                    id="stock-displayname"
                    type="text"
                    value={form.displayName}
                    onChange={setField('displayName')}
                    placeholder={t('stockManagerDisplayNamePlaceholder')}
                    className="h-11 border-2 focus-visible:ring-primary font-medium"
                    disabled={saving}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock-password" className="font-bold text-primary">
                    {t('stockManagerPassword')}
                  </Label>
                  <PasswordInput
                    id="stock-password"
                    value={form.password}
                    onChange={setField('password')}
                    placeholder={editing ? t('stockManagerPasswordOptional') : t('stockManagerPasswordPlaceholder')}
                    className="h-11 border-2 focus-visible:ring-primary font-medium"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                  {editing ? (
                    <p className="text-xs text-muted-foreground">{t('stockManagerPasswordOptional')}</p>
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
                    {t('stockManagerSave')}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeForm} disabled={saving} className="min-h-touch">
                    {t('stockManagerCancel')}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="border-2 border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">{t('stockManagerManagement')}</CardTitle>
            <CardDescription className="text-sm">
              {loading ? '…' : `${managers.length} stock manager account${managers.length === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : managers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <PackageCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t('stockManagerNoAccounts')}</p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">{t('stockManagerUsername')}</th>
                        <th className="px-4 py-3 font-semibold">{t('stockManagerDisplayName')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('stockManagerEditBtn')} / {t('stockManagerDelete')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {managers.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate font-mono">{m.username}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {m.displayName || <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="h-9">
                                <Pencil className="h-3.5 w-3.5 mr-1" /> {t('stockManagerEditBtn')}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(m)} className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('stockManagerDelete')}
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
                  {managers.map((m) => (
                    <div key={m.id} className="p-4 space-y-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono font-semibold text-foreground truncate">{m.username}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {m.displayName || <span className="italic">—</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="h-9 flex-1">
                          <Pencil className="h-3.5 w-3.5 mr-1" /> {t('stockManagerEditBtn')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(m)} className="h-9 flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('stockManagerDelete')}
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
              <Trash2 className="h-5 w-5 text-destructive shrink-0" /> {t('stockManagerDeleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              {deleteTarget
                ? t('stockManagerDeleteConfirmDesc').replace('{name}', deleteTarget.displayName || deleteTarget.username)
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto mt-0" disabled={deleting}>{t('stockManagerCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('stockManagerDeleteConfirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
