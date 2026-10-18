import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Plus, Pencil, Trash2, Loader2, Building2, Refrigerator, Box, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { printLabels } from '@/lib/barcodeUtils.js';

const TYPE_ICONS = { room: Building2, fridge: Refrigerator, rack: Archive, box: Box };
const TYPES = ['room', 'fridge', 'rack', 'box'];

function buildPath(loc, byId) {
  if (!loc) return '';
  if (!loc.parent) return loc.name;
  const parent = byId[loc.parent];
  if (!parent) return loc.name;
  return `${buildPath(parent, byId)} → ${loc.name}`;
}

export default function StockLocations({ pb }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'room', parent: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLocations = useCallback(async () => {
    try {
      const recs = await pb.collection('stock_locations').getFullList({ sort: 'name', $autoCancel: false, requestKey: null });
      setLocations(recs);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('load locations failed', err);
      toast.error('Failed to load locations');
    } finally { setLoading(false); }
  }, [pb]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const byId = useMemo(() => {
    const m = {};
    locations.forEach((l) => { m[l.id] = l; });
    return m;
  }, [locations]);

  const withPath = useMemo(() => locations.map((l) => ({ ...l, path: buildPath(l, byId) })).sort((a, b) => a.path.localeCompare(b.path)), [locations, byId]);

  // Tree grouped by root (room) → children.
  const tree = useMemo(() => {
    const roots = withPath.filter((l) => !l.parent);
    const childrenOf = (id) => withPath.filter((l) => l.parent === id);
    return { roots, childrenOf };
  }, [withPath]);

  const openAdd = () => { setEditing(null); setForm({ name: '', type: 'room', parent: '', description: '' }); setFormOpen(true); };
  const openEdit = (l) => { setEditing(l); setForm({ name: l.name || '', type: l.type || 'room', parent: l.parent || '', description: l.description || '' }); setFormOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), type: form.type, parent: form.parent || null, description: form.description.trim() };
      if (editing) {
        await pb.collection('stock_locations').update(editing.id, payload, { $autoCancel: false, requestKey: `loc-save-${editing.id}` });
      } else {
        await pb.collection('stock_locations').create(payload, { $autoCancel: false, requestKey: 'loc-create' });
      }
      toast.success('Location saved');
      setFormOpen(false);
      fetchLocations();
    } catch (err) {
      console.error('save location failed', err);
      toast.error('Failed to save location');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await pb.collection('stock_locations').delete(deleteTarget.id, { $autoCancel: false, requestKey: `loc-del-${deleteTarget.id}` });
      toast.success('Location deleted');
      setDeleteTarget(null);
      fetchLocations();
    } catch (err) {
      console.error('delete location failed', err);
      toast.error('Failed to delete location (it may be in use by lots).');
    } finally { setDeleting(false); }
  };

  const handlePrint = (l) => {
    const code = String(l.barcode || l.name || '').replace(/\s+/g, '');
    if (!code) { toast.error('Nothing to print for this location'); return; }
    const ok = printLabels([{ barcode: code }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };

  const renderNode = (l, depth = 0) => {
    const Icon = TYPE_ICONS[l.type] || MapPin;
    const children = tree.childrenOf(l.id);
    return (
      <div key={l.id}>
        <div className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/30 transition" style={{ paddingLeft: depth * 18 + 8 }}>
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <span className="font-bold text-foreground text-sm">{l.name}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{l.type}</Badge>
          {l.description && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{l.description}</span>}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handlePrint(l)} title="Print label"><MapPin className="h-3.5 w-3.5" /></Button>
            <button onClick={() => openEdit(l)} className="text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded p-1" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => setDeleteTarget(l)} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded p-1" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
        <div>
          <h3 className="font-serif font-bold text-primary text-lg flex items-center gap-2"><MapPin className="h-5 w-5" /> Location Tree</h3>
          <p className="text-xs text-muted-foreground">Organize stock as Room → Fridge/store → Rack → Box. Print a label for each location.</p>
        </div>
        <Button onClick={openAdd} className="h-11 shadow-md shrink-0"><Plus className="h-4 w-4 mr-2" /> Add Location</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading locations…</div>
      ) : withPath.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No locations yet. Add a Room to start building your storage tree.</p>
        </div>
      ) : (
        <div className="bg-card border-2 border-border rounded-2xl shadow-sm p-2">
          {tree.roots.map((r) => renderNode(r))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> {editing ? 'Edit Location' : 'Add Location'}</DialogTitle>
            <DialogDescription>Room → Fridge/store → Rack → Box hierarchy.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="h-11" placeholder="e.g. Cold Room 1" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">Type *</Label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">Parent (optional)</Label>
              <select value={form.parent} onChange={(e) => setForm((f) => ({ ...f, parent: e.target.value }))} className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— None (top level) —</option>
                {withPath.filter((l) => l.id !== editing?.id).map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-11" />
            </div>
            <DialogFooter className="flex gap-2 justify-end mt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Delete location?</AlertDialogTitle>
            <AlertDialogDescription>Remove <strong>{deleteTarget?.name}</strong>. Lots referencing it must be reassigned first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel disabled={deleting} className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 sm:h-10">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
