import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { stockPb } from '@/lib/staffClients.js';
import pbDefault from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  PackageCheck, LogOut, Boxes, Trash2, History as HistoryIcon, Plus, Pencil, Trash, ArrowLeft, HelpCircle, Search, AlertTriangle, Loader2, RefreshCw, TrendingUp, TrendingDown, MinusCircle, MapPin, Printer,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { toast } from 'sonner';
import StockLocations from '@/components/StockLocations.jsx';
import StockLots from '@/components/StockLots.jsx';
import StockGoodsIn from '@/components/StockGoodsIn.jsx';
import StockIssue from '@/components/StockIssue.jsx';
import StockBarcodes from '@/components/StockBarcodes.jsx';
import StockAlertsPanel from '@/components/StockAlertsPanel.jsx';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import { stockItemsExportColumns, stockItemsImportConfig } from '@/lib/csvConfigs.js';
import { Truck, Package, Layers, Barcode } from 'lucide-react';
import {
  validateNumericBarcode,
  generateUniqueNumericBarcode,
  collectTakenBarcodes,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  validatePrepExpiry,
  printLabels,
  renderBarcodeToCanvas,
} from '@/lib/barcodeUtils.js';
import { loginPath, isStaffApp } from '@/lib/staffApp.js';
import AppLangToggle from '@/components/AppLangToggle.jsx';

const WASTE_REASONS = [
  'spoiled', 'expired', 'damaged', 'over-preparation', 'spill', 'burnt', 'customer-return', 'other',
];
const ADJUST_TYPES = ['restock', 'correction', 'waste', 'initial'];

function statusOf(item) {
  const qty = Number(item.quantity) || 0;
  const min = Number(item.minStock) || 0;
  if (qty <= 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

function StatusBadge({ status, t }) {
  if (status === 'out') return <Badge className="bg-destructive/15 text-destructive border-destructive/30">{t('stock_outOfStock')}</Badge>;
  if (status === 'low') return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">{t('stock_lowStock')}</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">{t('stock_inStock')}</Badge>;
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-card border-2 border-border rounded-2xl p-4 shadow-sm flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${tone || 'bg-primary/10 text-primary'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-foreground leading-none notranslate" translate="no">{value}</div>
        <div className="text-xs text-muted-foreground font-medium mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

export default function StockDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Authorization: a real stock user (stock_users on the stock auth store) OR
  // an authenticated admin (admin_users on the default auth store) reusing
  // their own session. Waiters, KDS, and public users are NOT authorized.
  const stockAuthModel = stockPb.authStore.model || stockPb.authStore.record;
  const adminAuthModel = pbDefault.authStore.model || pbDefault.authStore.record;
  const isStock = stockPb.authStore.isValid && stockAuthModel?.collectionName === 'stock_users';
  const isAdmin = pbDefault.authStore.isValid && adminAuthModel?.collectionName === 'admin_users';
  const authed = isStock || isAdmin;
  const pb = isStock ? stockPb : pbDefault;
  const authModel = isStock ? stockAuthModel : adminAuthModel;
  const displayName = authModel?.displayName || authModel?.username || authModel?.name || authModel?.email || 'Stock';
  const userId = authModel?.id || '';
  const userRole = isStock ? 'stock' : 'admin';

  const [activeTab, setActiveTab] = useState('inventory');
  const [items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [waste, setWaste] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingWaste, setLoadingWaste] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Inventory filters
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  // Item form dialog
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: '', category: '', unit: '', quantity: '', minStock: '', notes: '', menuItem: '',
    barcode: '', preparedAt: '', expiry: '', perishable: false,
  });
  const [savingItem, setSavingItem] = useState(false);
  const [lotBarcodesCache, setLotBarcodesCache] = useState([]);
  const itemBarcodePreviewRef = React.useRef(null);

  // Adjust dialog
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ adjustmentType: 'restock', delta: '', newQty: '', reason: '', notes: '' });
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Waste form
  const [wasteForm, setWasteForm] = useState({
    itemName: '', stockItem: '', category: '', quantity: '', unit: '', reason: 'spoiled',
    wasteDate: new Date().toISOString().slice(0, 16), notes: '',
  });
  const [savingWaste, setSavingWaste] = useState(false);
  const [wasteSearch, setWasteSearch] = useState('');
  const [wasteReasonFilter, setWasteReasonFilter] = useState('all');

  const fetchItems = useCallback(async () => {
    try {
      const recs = await pb.collection('stock_items').getFullList({ sort: 'name', $autoCancel: false, requestKey: null });
      setItems(recs);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('Failed to load stock items', err);
    } finally {
      setLoadingItems(false);
    }
  }, [pb]);

  // CSV export/import must use the same authenticated client the dashboard
  // resolved (stockPb for stock managers, pbDefault for admins). The default
  // CsvImportExport client is unauthenticated for stock managers, which
  // produced empty exports.
  const fetchStockForCsv = useCallback(async () => {
    return await pb.collection('stock_items').getFullList({
      sort: 'name',
      $autoCancel: false,
      requestKey: null,
    });
  }, [pb]);

  const fetchMenuItems = useCallback(async () => {
    try {
      const recs = await pb.collection('menu_items').getFullList({ sort: 'nameEN', $autoCancel: false, requestKey: null });
      setMenuItems(recs);
    } catch (_) { /* ignore — optional link */ }
  }, [pb]);

  const fetchWaste = useCallback(async () => {
    try {
      const recs = await pb.collection('waste_records').getFullList({ sort: '-wasteDate', $autoCancel: false, requestKey: null });
      setWaste(recs);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('Failed to load waste records', err);
    } finally {
      setLoadingWaste(false);
    }
  }, [pb]);

  const fetchAdjustments = useCallback(async () => {
    try {
      const recs = await pb.collection('stock_adjustments').getFullList({ sort: '-created', $autoCancel: false, requestKey: null });
      setAdjustments(recs);
    } catch (err) {
      if (err && (err.status === 0 || err.isAbort)) return;
      console.error('Failed to load stock adjustments', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [pb]);

  useEffect(() => {
    if (!authed) {
      navigate(loginPath('/stock-login'), { replace: true });
      return;
    }
    fetchItems();
    fetchMenuItems();
    fetchWaste();
    fetchAdjustments();

    // Realtime: keep all three collections live without a full refresh.
    const subs = [];
    const sub = (col, setter, sortKey) =>
      pb.collection(col).subscribe('*', (e) => {
        setter((prev) => {
          if (e.action === 'delete') return prev.filter((r) => r.id !== e.record.id);
          const without = prev.filter((r) => r.id !== e.record.id);
          const next = [e.record, ...without];
          next.sort((a, b) => {
            const ka = sortKey.startsWith('-') ? b[sortKey.slice(1)] : a[sortKey];
            const kb = sortKey.startsWith('-') ? a[sortKey.slice(1)] : b[sortKey];
            return String(ka || '').localeCompare(String(kb || ''));
          });
          return next;
        });
      }).catch((e) => console.error(`${col} realtime failed`, e));

    subs.push(sub('stock_items', setItems, 'name'));
    subs.push(sub('waste_records', setWaste, '-wasteDate'));
    subs.push(sub('stock_adjustments', setAdjustments, '-created'));

    return () => {
      try { pb.collection('stock_items').unsubscribe('*'); } catch (_) { /* ignore */ }
      try { pb.collection('waste_records').unsubscribe('*'); } catch (_) { /* ignore */ }
      try { pb.collection('stock_adjustments').unsubscribe('*'); } catch (_) { /* ignore */ }
    };
  }, [authed, navigate, pb, fetchItems, fetchMenuItems, fetchWaste, fetchAdjustments]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (lowOnly && statusOf(it) === 'ok') return false;
      if (!q) return true;
      return (
        String(it.name || '').toLowerCase().includes(q) ||
        String(it.category || '').toLowerCase().includes(q)
      );
    });
  }, [items, search, lowOnly]);

  const filteredWaste = useMemo(() => {
    const q = wasteSearch.trim().toLowerCase();
    return waste.filter((w) => {
      if (wasteReasonFilter !== 'all' && w.reason !== wasteReasonFilter) return false;
      if (!q) return true;
      return String(w.itemName || '').toLowerCase().includes(q);
    });
  }, [waste, wasteSearch, wasteReasonFilter]);

  const stats = useMemo(() => {
    const low = items.filter((it) => statusOf(it) === 'low').length;
    const out = items.filter((it) => statusOf(it) === 'out').length;
    return { total: items.length, low, out, waste: waste.length };
  }, [items, waste]);

  const refreshLotBarcodes = useCallback(async () => {
    try {
      const lots = await pb.collection('stock_lots').getFullList({
        fields: 'id,barcode',
        $autoCancel: false,
        requestKey: null,
      });
      setLotBarcodesCache(lots);
    } catch (_) { /* optional for uniqueness */ }
  }, [pb]);

  // ---- CSV import apply: barcode uniqueness + audit logging ----
  // Built lazily on first row of an import apply, then cleared on completion.
  const importCtxRef = React.useRef(null);

  const handleStockImportApply = useCallback(async (row) => {
    if (!importCtxRef.current) {
      const [existingItems, lots] = await Promise.all([
        pb.collection('stock_items').getFullList({ fields: 'id,barcode', $autoCancel: false, requestKey: null }),
        pb.collection('stock_lots').getFullList({ fields: 'id,barcode', $autoCancel: false, requestKey: null }),
      ]);
      const taken = new Set();
      existingItems.forEach((i) => { if (i.barcode) taken.add(String(i.barcode).trim()); });
      lots.forEach((l) => { if (l.barcode) taken.add(String(l.barcode).trim()); });
      importCtxRef.current = { taken };
    }
    const { taken } = importCtxRef.current;
    const bc = String(row.payload.barcode || '').trim();
    if (bc) {
      if (taken.has(bc) && row.action === 'create') {
        throw new Error(`Barcode ${bc} is already assigned to another item or lot`);
      }
      // Prevent duplicate barcodes within the same import batch.
      taken.add(bc);
    }
    let rec;
    let status;
    if (row.action === 'update' && row.matchId) {
      rec = await pb.collection('stock_items').update(row.matchId, row.payload, {
        $autoCancel: false,
        requestKey: `csv-stk-up-${row.matchId}-${row.rowNumber}`,
      });
      status = 'updated';
    } else {
      rec = await pb.collection('stock_items').create(row.payload, {
        $autoCancel: false,
        requestKey: `csv-stk-cr-${row.rowNumber}`,
      });
      status = 'created';
      // Mirror the manual add flow: log an initial-count adjustment.
      try {
        await pb.collection('stock_adjustments').create({
          stockItem: rec.id,
          itemName: rec.name,
          adjustmentType: 'initial',
          delta: Number(rec.quantity) || 0,
          previousQty: 0,
          newQty: Number(rec.quantity) || 0,
          reason: rec.barcode
            ? `CSV import · initial count · barcode ${rec.barcode}`
            : 'CSV import · initial count',
          adjustedBy: displayName,
          adjustedById: userId,
          adjustedByRole: userRole,
          notes: `Prep ${rec.preparedAt || '—'}; Expiry ${rec.expiry || '—'}`,
        }, { $autoCancel: false, requestKey: `csv-stk-adj-${rec.id}` });
      } catch (_) { /* non-fatal — item still created */ }
    }
    return { status, recordId: rec.id };
  }, [pb, displayName, userId, userRole]);

  const handleStockImportComplete = useCallback(() => {
    importCtxRef.current = null;
    fetchItems();
    fetchAdjustments();
    refreshLotBarcodes();
  }, [fetchItems, fetchAdjustments, refreshLotBarcodes]);

  const takenBarcodesForForm = useCallback(() => {
    return collectTakenBarcodes(items, lotBarcodesCache, {
      itemId: editingItem?.id || null,
    });
  }, [items, lotBarcodesCache, editingItem]);

  const generateItemBarcode = useCallback(() => {
    const next = generateUniqueNumericBarcode(takenBarcodesForForm());
    setItemForm((f) => ({ ...f, barcode: next }));
    toast.success(`Barcode generated: ${next}`);
  }, [takenBarcodesForForm]);

  const openAddItem = () => {
    setEditingItem(null);
    const nowLocal = toDatetimeLocalValue(new Date().toISOString());
    const taken = collectTakenBarcodes(items, lotBarcodesCache, {});
    setItemForm({
      name: '', category: '', unit: '', quantity: '', minStock: '', notes: '', menuItem: '',
      barcode: generateUniqueNumericBarcode(taken),
      preparedAt: nowLocal,
      expiry: '',
      perishable: false,
    });
    setItemFormOpen(true);
    refreshLotBarcodes();
  };

  const openEditItem = (it) => {
    setEditingItem(it);
    setItemForm({
      name: it.name || '',
      category: it.category || '',
      unit: it.unit || '',
      quantity: String(it.quantity ?? ''),
      minStock: String(it.minStock ?? ''),
      notes: it.notes || '',
      menuItem: it.menuItem || '',
      barcode: it.barcode || '',
      preparedAt: toDatetimeLocalValue(it.preparedAt),
      expiry: toDatetimeLocalValue(it.expiry),
      perishable: !!it.perishable,
    });
    setItemFormOpen(true);
    refreshLotBarcodes();
  };

  // Live barcode preview in the item form dialog.
  useEffect(() => {
    if (!itemFormOpen) return;
    const canvas = itemBarcodePreviewRef.current;
    if (canvas && itemForm.barcode) {
      renderBarcodeToCanvas(canvas, itemForm.barcode, { height: 48, fontSize: 12, width: 2 });
    }
  }, [itemFormOpen, itemForm.barcode]);

  const handleSaveItem = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (savingItem) return;
    if (!itemForm.name.trim()) {
      toast.error(t('stock_requiredFields'));
      return;
    }
    const bcCheck = validateNumericBarcode(itemForm.barcode);
    if (!bcCheck.ok) {
      toast.error(bcCheck.error);
      return;
    }
    if (!bcCheck.value) {
      toast.error('Barcode is required. Generate or enter a numeric barcode.');
      return;
    }
    const preparedIso = fromDatetimeLocalValue(itemForm.preparedAt);
    const expiryIso = fromDatetimeLocalValue(itemForm.expiry);
    if (!preparedIso) {
      toast.error('Preparation date and time is required.');
      return;
    }
    if (!expiryIso) {
      toast.error('Expiry date and time is required.');
      return;
    }
    const pe = validatePrepExpiry(preparedIso, expiryIso);
    if (!pe.ok) {
      toast.error(pe.error);
      return;
    }
    const taken = takenBarcodesForForm();
    if (taken.has(bcCheck.value)) {
      toast.error('This barcode is already assigned to another item or lot. Generate a new one.');
      return;
    }
    setSavingItem(true);
    const qty = itemForm.quantity === '' ? 0 : Number(itemForm.quantity);
    const minSt = itemForm.minStock === '' ? 0 : Number(itemForm.minStock);
    const payload = {
      name: itemForm.name.trim(),
      category: itemForm.category.trim(),
      unit: itemForm.unit.trim(),
      quantity: Number.isFinite(qty) ? qty : 0,
      minStock: Number.isFinite(minSt) ? minSt : 0,
      notes: itemForm.notes.trim(),
      menuItem: itemForm.menuItem || null,
      barcode: bcCheck.value,
      preparedAt: preparedIso,
      expiry: expiryIso,
      perishable: !!itemForm.perishable,
    };
    try {
      if (editingItem) {
        const prevBarcode = String(editingItem.barcode || '').trim();
        const updated = await pb.collection('stock_items').update(editingItem.id, payload, {
          $autoCancel: false,
          requestKey: `save-item-${editingItem.id}-${Date.now()}`,
        });
        // Audit barcode change without silently rewriting history of other fields.
        if (bcCheck.value && bcCheck.value !== prevBarcode) {
          try {
            await pb.collection('stock_adjustments').create({
              stockItem: editingItem.id,
              itemName: payload.name,
              adjustmentType: 'correction',
              delta: 0,
              previousQty: Number(editingItem.quantity) || 0,
              newQty: Number(payload.quantity) || 0,
              reason: prevBarcode
                ? `Barcode regenerated: ${prevBarcode} → ${bcCheck.value}`
                : `Barcode assigned: ${bcCheck.value}`,
              adjustedBy: displayName,
              adjustedById: userId,
              adjustedByRole: userRole,
              notes: `Prep ${preparedIso}; Expiry ${expiryIso}`,
            }, { $autoCancel: false, requestKey: `bc-adj-${editingItem.id}-${Date.now()}` });
          } catch (_) { /* non-fatal */ }
        }
        // Keep dialog open; reflect saved values for continued editing.
        setEditingItem(updated);
        setItemForm({
          name: updated.name || payload.name,
          category: updated.category || '',
          unit: updated.unit || '',
          quantity: String(updated.quantity ?? payload.quantity ?? ''),
          minStock: String(updated.minStock ?? payload.minStock ?? ''),
          notes: updated.notes || '',
          menuItem: updated.menuItem || '',
          barcode: updated.barcode || payload.barcode,
          preparedAt: toDatetimeLocalValue(updated.preparedAt || preparedIso),
          expiry: toDatetimeLocalValue(updated.expiry || expiryIso),
          perishable: !!updated.perishable,
        });
        toast.success(t('stock_itemSaved'));
      } else {
        const created = await pb.collection('stock_items').create(payload, {
          $autoCancel: false,
          requestKey: `create-item-${Date.now()}`,
        });
        try {
          await pb.collection('stock_adjustments').create({
            stockItem: created.id,
            itemName: created.name,
            adjustmentType: 'initial',
            delta: Number(created.quantity) || 0,
            previousQty: 0,
            newQty: Number(created.quantity) || 0,
            reason: created.barcode
              ? `Initial count · barcode ${created.barcode}`
              : 'Initial count',
            adjustedBy: displayName,
            adjustedById: userId,
            adjustedByRole: userRole,
            notes: `Prep ${preparedIso}; Expiry ${expiryIso}`,
          }, { $autoCancel: false, requestKey: `init-adj-${created.id}` });
        } catch (_) { /* non-fatal */ }
        toast.success(t('stock_itemSaved'));
        // Keep dialog open and reset for the next item entry.
        const nowLocal = toDatetimeLocalValue(new Date().toISOString());
        const nextTaken = collectTakenBarcodes(
          [...items, created],
          lotBarcodesCache,
          {},
        );
        setEditingItem(null);
        setItemForm({
          name: '',
          category: payload.category || '',
          unit: payload.unit || '',
          quantity: '',
          minStock: payload.minStock ? String(payload.minStock) : '',
          notes: '',
          menuItem: '',
          barcode: generateUniqueNumericBarcode(nextTaken),
          preparedAt: nowLocal,
          expiry: '',
          perishable: !!payload.perishable,
        });
      }
      // Intentionally keep itemFormOpen true after save.
      fetchItems();
      fetchAdjustments();
      refreshLotBarcodes();
    } catch (err) {
      console.error('Save stock item failed', err);
      const data = err && err.response && err.response.data;
      let detail = '';
      if (data && typeof data === 'object') {
        const parts = Object.keys(data)
          .map((k) => {
            const msg = data[k] && (data[k].message || data[k].code);
            return msg ? `${k}: ${msg}` : null;
          })
          .filter(Boolean);
        if (parts.length) detail = parts.join(' · ');
      }
      toast.error(detail || (err && err.message) || t('stock_itemSaveError'));
    } finally {
      setSavingItem(false);
    }
  };

  const printItemBarcode = (it) => {
    if (!it?.barcode) {
      toast.error('No barcode assigned to this item yet.');
      return;
    }
    const ok = printLabels([{ barcode: String(it.barcode).trim() }], { title: 'Barcode' });
    if (!ok) toast.error('Barcode print failed. Try again.');
  };

  const openAdjust = (it) => {
    setAdjustTarget(it);
    setAdjustForm({ adjustmentType: 'restock', delta: '', newQty: String(it.quantity ?? ''), reason: '', notes: '' });
  };

  const computedNewQty = useMemo(() => {
    if (!adjustTarget) return 0;
    const prev = Number(adjustTarget.quantity) || 0;
    const delta = Number(adjustForm.delta) || 0;
    const type = adjustForm.adjustmentType;
    if (type === 'restock') return prev + Math.abs(delta);
    if (type === 'waste') return Math.max(0, prev - Math.abs(delta));
    if (type === 'correction') return Number(adjustForm.newQty) || 0;
    if (type === 'initial') return Number(adjustForm.newQty) || 0;
    return prev;
  }, [adjustTarget, adjustForm]);

  const handleSaveAdjust = async (e) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const type = adjustForm.adjustmentType;
    if ((type === 'restock' || type === 'waste') && !(Number(adjustForm.delta) > 0)) {
      toast.error(t('stock_qtyMustBePositive'));
      return;
    }
    if ((type === 'correction' || type === 'initial') && adjustForm.newQty === '') {
      toast.error(t('stock_requiredFields'));
      return;
    }
    setSavingAdjust(true);
    const prev = Number(adjustTarget.quantity) || 0;
    const newQty = Math.max(0, Math.round(computedNewQty));
    const delta = type === 'correction' || type === 'initial' ? newQty - prev : (type === 'waste' ? -Math.abs(Number(adjustForm.delta)) : Math.abs(Number(adjustForm.delta)));
    try {
      await pb.collection('stock_items').update(adjustTarget.id, { quantity: newQty }, { $autoCancel: false, requestKey: `adj-item-${adjustTarget.id}` });
      await pb.collection('stock_adjustments').create({
        stockItem: adjustTarget.id,
        itemName: adjustTarget.name,
        adjustmentType: type,
        delta,
        previousQty: prev,
        newQty,
        reason: adjustForm.reason.trim() || type,
        adjustedBy: displayName,
        adjustedById: userId,
        adjustedByRole: userRole,
        notes: adjustForm.notes.trim(),
      }, { $autoCancel: false, requestKey: `create-adj-${adjustTarget.id}` });
      toast.success(t('stock_adjustSuccess'));
      setAdjustTarget(null);
      fetchItems();
      fetchAdjustments();
    } catch (err) {
      console.error('Adjust stock failed', err);
      toast.error(t('stock_adjustError'));
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;
    const itemId = target.id;
    const itemName = target.name || 'Item';
    try {
      // Block delete while lots still hold remaining quantity — history stays intact.
      let linkedLots = [];
      try {
        linkedLots = await pb.collection('stock_lots').getFullList({
          filter: pb.filter('stockItem = {:id}', { id: itemId }),
          $autoCancel: false,
          requestKey: `del-lots-${itemId}`,
        });
      } catch (_) { /* ignore — proceed with best-effort unlink */ }

      const activeLots = linkedLots.filter((l) => {
        const rem = Number(l.remainingQty != null ? l.remainingQty : l.quantity) || 0;
        return rem > 0 && (l.status === 'active' || l.status === 'overridden' || !l.status);
      });
      if (activeLots.length > 0) {
        toast.error(
          `Cannot delete "${itemName}": ${activeLots.length} lot(s) still have remaining stock. Issue or zero those lots first. Adjustment history is kept.`,
        );
        return;
      }

      // Unlink related rows (do NOT delete audit/history/lots/issues/waste).
      const unlink = async (collection, filter, extra = {}) => {
        try {
          const rows = await pb.collection(collection).getFullList({
            filter,
            fields: 'id',
            $autoCancel: false,
            requestKey: `unlink-list-${collection}-${itemId}`,
          });
          await Promise.all(
            rows.map((r, i) =>
              pb.collection(collection).update(
                r.id,
                { stockItem: null, ...extra },
                { $autoCancel: false, requestKey: `unlink-${collection}-${itemId}-${i}` },
              ),
            ),
          );
        } catch (e) {
          console.warn(`Unlink ${collection} before delete:`, e);
        }
      };

      await unlink('stock_adjustments', pb.filter('stockItem = {:id}', { id: itemId }));
      await unlink('stock_lots', pb.filter('stockItem = {:id}', { id: itemId }));
      await unlink('stock_issues', pb.filter('stockItem = {:id}', { id: itemId }));
      await unlink('waste_records', pb.filter('stockItem = {:id}', { id: itemId }));

      // Final audit note (itemName preserved; stockItem will be null after create if we create after delete — create before delete with link then unlink is redundant; create with name only).
      try {
        await pb.collection('stock_adjustments').create({
          stockItem: null,
          itemName,
          adjustmentType: 'correction',
          delta: 0,
          previousQty: Number(target.quantity) || 0,
          newQty: 0,
          reason: `Item removed from inventory: ${itemName}`,
          adjustedBy: displayName,
          adjustedById: userId,
          adjustedByRole: userRole,
          notes: 'Item record deleted. Prior adjustment/lot/issue/waste history retained without cascade delete.',
        }, { $autoCancel: false, requestKey: `del-audit-${itemId}` });
      } catch (_) { /* non-fatal */ }

      await pb.collection('stock_items').delete(itemId, {
        $autoCancel: false,
        requestKey: `del-item-${itemId}`,
      });
      toast.success(t('stock_itemDeleted'));
      setDeleteTarget(null);
      fetchItems();
      fetchAdjustments();
    } catch (err) {
      console.error('Delete stock item failed', err);
      const status = err && err.status;
      const msg =
        status === 403
          ? 'You do not have permission to delete this item.'
          : status === 404
            ? 'Item was already removed.'
            : (err && err.message) || t('stock_itemDeleteError');
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleRecordWaste = async (e) => {
    e.preventDefault();
    if (!wasteForm.itemName.trim() || !(Number(wasteForm.quantity) > 0) || !wasteForm.wasteDate) {
      toast.error(t('stock_requiredFields'));
      return;
    }
    setSavingWaste(true);
    try {
      const linkedStockId = wasteForm.stockItem || null;
      const linkedMenuId = linkedStockId
        ? (items.find((i) => i.id === linkedStockId)?.menuItem || null)
        : null;
      const wasteRec = await pb.collection('waste_records').create({
        itemName: wasteForm.itemName.trim(),
        category: wasteForm.category.trim(),
        quantity: Number(wasteForm.quantity),
        unit: wasteForm.unit.trim(),
        reason: wasteForm.reason,
        wasteDate: new Date(wasteForm.wasteDate).toISOString(),
        responsibleUser: displayName,
        responsibleUserId: userId,
        responsibleRole: userRole,
        notes: wasteForm.notes.trim(),
        stockItem: linkedStockId,
        menuItem: linkedMenuId,
      }, { $autoCancel: false, requestKey: 'create-waste' });

      // If linked to a stock item, reduce its quantity and log a waste adjustment.
      if (linkedStockId) {
        const stockItem = items.find((i) => i.id === linkedStockId);
        if (stockItem) {
          const prev = Number(stockItem.quantity) || 0;
          const newQty = Math.max(0, prev - Math.abs(Number(wasteForm.quantity)));
          try {
            await pb.collection('stock_items').update(linkedStockId, { quantity: newQty }, { $autoCancel: false, requestKey: `waste-item-${linkedStockId}` });
            await pb.collection('stock_adjustments').create({
              stockItem: linkedStockId,
              itemName: stockItem.name,
              adjustmentType: 'waste',
              delta: -Math.abs(Number(wasteForm.quantity)),
              previousQty: prev,
              newQty,
              reason: `Waste: ${wasteForm.reason}`,
              adjustedBy: displayName,
              adjustedById: userId,
              adjustedByRole: userRole,
              notes: wasteForm.notes.trim(),
            }, { $autoCancel: false, requestKey: `waste-adj-${linkedStockId}` });
          } catch (_) { /* non-fatal — waste record still saved */ }
        }
      }
      toast.success(t('stock_recordWasteSuccess'));
      setWasteForm({
        itemName: '', stockItem: '', category: '', quantity: '', unit: '', reason: 'spoiled',
        wasteDate: new Date().toISOString().slice(0, 16), notes: '',
      });
      fetchWaste();
      fetchItems();
      fetchAdjustments();
    } catch (err) {
      console.error('Record waste failed', err);
      toast.error(t('stock_recordWasteError'));
    } finally {
      setSavingWaste(false);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchItems(), fetchWaste(), fetchAdjustments()]);
    setTimeout(() => setRefreshing(false), 400);
  };

  const logout = () => {
    if (isAdmin) {
      navigate('/admin-dashboard', { replace: true });
      return;
    }
    try { pb.collection('stock_items').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('waste_records').unsubscribe('*'); } catch (_) { /* ignore */ }
    try { pb.collection('stock_adjustments').unsubscribe('*'); } catch (_) { /* ignore */ }
    pb.authStore.clear();
    navigate(loginPath('/stock-login'), { replace: true });
    setTimeout(() => {
      if (window.location.pathname !== loginPath('/stock-login')) window.location.assign(loginPath('/stock-login'));
    }, 120);
  };

  if (!authed) return null;

  const fmtDate = (v) => (v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <>
      <Helmet>
        <title>{t('stock_station')} - Tripti Genusswelt</title>
      </Helmet>
      <div className="min-h-screen bg-background">
        <header className="app-bar sticky top-0 z-40 bg-primary text-primary-foreground px-3 sm:px-4 py-3 flex items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <PackageCheck className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
            {isStaffApp ? (
              <div className="min-w-0 leading-tight">
                <h1 className="text-base font-bold truncate">{t('stock_station')}</h1>
                <p className="text-xs opacity-80 truncate">{displayName}</p>
              </div>
            ) : (<>
            <h1 className="text-base sm:text-xl font-serif font-bold shrink-0 hidden sm:block">{t('stock_station')}</h1>
            <span className="text-sm sm:text-base opacity-90 truncate min-w-0 font-medium" title={displayName}>{displayName}</span>
            </>)}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/admin-dashboard')} className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90" aria-label={t('stock_backToAdmin')} title={t('stock_backToAdmin')}>
                <ArrowLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden lg:inline">{t('stock_backToAdmin')}</span>
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleRefreshAll} disabled={refreshing} className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90" aria-label="Refresh" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <AppLangToggle />
            <Button variant="secondary" size="sm" onClick={() => navigate('/stock-help')} className="h-10 min-h-[44px] px-3 sm:px-4 bg-secondary hover:bg-secondary/90" aria-label={t('stock_help')} title={t('stock_help')}>
              <HelpCircle className="h-4 w-4 sm:mr-1" />
              <span className="hidden lg:inline">{t('stock_help')}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={logout} className="shrink-0 h-10 min-h-[44px] px-3 sm:px-4" aria-label={t('logout')}>
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </Button>
          </div>
        </header>

        <main className="p-4 max-w-7xl mx-auto">
          {/* Stock alerts — low/out of stock + expiring/expired lots */}
          <StockAlertsPanel
            pb={pb}
            variant="stock"
            onAction={(target) => {
              if (target === 'inventory' || target === 'lots') setActiveTab(target);
            }}
            className="mb-6"
          />

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-6 p-2 bg-card border-2 border-border rounded-2xl shadow-sm w-fit">
            <button onClick={() => setActiveTab('inventory')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Boxes className="h-4 w-4 mr-2" /> {t('stock_tabInventory')}
            </button>
            <button onClick={() => setActiveTab('goodsin')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'goodsin' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Truck className="h-4 w-4 mr-2" /> Goods-In
            </button>
            <button onClick={() => setActiveTab('issue')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'issue' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Package className="h-4 w-4 mr-2" /> Issue
            </button>
            <button onClick={() => setActiveTab('lots')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'lots' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Layers className="h-4 w-4 mr-2" /> Lots
            </button>
            <button onClick={() => setActiveTab('locations')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'locations' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <MapPin className="h-4 w-4 mr-2" /> Locations
            </button>
            <button onClick={() => setActiveTab('barcodes')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'barcodes' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Barcode className="h-4 w-4 mr-2" /> Barcodes
            </button>
            <button onClick={() => setActiveTab('waste')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'waste' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <Trash2 className="h-4 w-4 mr-2" /> {t('stock_tabWaste')}
            </button>
            <button onClick={() => setActiveTab('history')} className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}>
              <HistoryIcon className="h-4 w-4 mr-2" /> {t('stock_tabHistory')}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={Boxes} label={t('stock_totalItems')} value={stats.total} />
            <StatCard icon={AlertTriangle} label={t('stock_lowStockCount')} value={stats.low} tone="bg-amber-500/15 text-amber-700" />
            <StatCard icon={AlertTriangle} label={t('stock_outOfStockCount')} value={stats.out} tone="bg-destructive/15 text-destructive" />
            <StatCard icon={Trash2} label={t('stock_totalWaste')} value={stats.waste} tone="bg-secondary/20 text-secondary-foreground" />
          </div>

          {activeTab === 'goodsin' && <StockGoodsIn pb={pb} displayName={displayName} userId={userId} userRole={userRole} />}
          {activeTab === 'issue' && <StockIssue pb={pb} displayName={displayName} userId={userId} userRole={userRole} />}
          {activeTab === 'lots' && <StockLots pb={pb} displayName={displayName} userId={userId} userRole={userRole} />}
          {activeTab === 'locations' && <StockLocations pb={pb} />}
          {activeTab === 'barcodes' && <StockBarcodes pb={pb} />}

          {activeTab === 'inventory' && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
                <div className="flex flex-1 gap-2 items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('stock_searchPlaceholder')} className="pl-9 h-11" />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                    {t('stock_lowStockOnly')}
                  </label>
                </div>
                <Button onClick={openAddItem} className="h-11 shadow-md shrink-0"><Plus className="h-4 w-4 mr-2" /> {t('stock_addItem')}</Button>
              </div>

              {/* CSV export / import for stock items — bulk management */}
              <div className="bg-card border-2 border-border rounded-2xl p-4 md:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-serif font-bold text-primary">Stock Items — CSV Export / Import</h3>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Export stock items to CSV, edit offline, then re-import to bulk create or update. Matched by ID, Name, or Barcode. Barcode must be numeric and unique; expiry must be on/after preparation.
                    </p>
                  </div>
                  <div className="sm:ml-auto">
                    <CsvImportExport
                      collection="stock_items"
                      entityLabel="stock items"
                      exportFileName="stock_items.csv"
                      exportColumns={stockItemsExportColumns}
                      importConfig={stockItemsImportConfig}
                      customApply={handleStockImportApply}
                      onImportComplete={handleStockImportComplete}
                      fetchRecords={fetchStockForCsv}
                    />
                  </div>
                </div>
              </div>

              {loadingItems ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('stock_loadingItems')}</div>
              ) : filteredItems.length === 0 ? (
                <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <Boxes className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">{t('stock_noItems')}</p>
                </div>
              ) : (
                <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_name')}</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">Barcode</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_category')}</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_unit')}</th>
                        <th className="text-right font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_quantity')}</th>
                        <th className="text-right font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_minStock')}</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">Prepared</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">Expiry</th>
                        <th className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{t('stock_status')}</th>
                        <th className="text-right font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredItems.map((it) => {
                        const st = statusOf(it);
                        return (
                          <tr key={it.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-bold text-primary align-top">{it.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-foreground align-top notranslate" translate="no">{it.barcode || '—'}</td>
                            <td className="px-4 py-3 text-foreground align-top">{it.category || '—'}</td>
                            <td className="px-4 py-3 text-foreground align-top">{it.unit || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground align-top notranslate" translate="no">{Number(it.quantity) || 0}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground align-top notranslate" translate="no">{Number(it.minStock) || 0}</td>
                            <td className="px-4 py-3 text-xs text-foreground align-top whitespace-nowrap notranslate" translate="no">{fmtDate(it.preparedAt)}</td>
                            <td className="px-4 py-3 text-xs text-foreground align-top whitespace-nowrap notranslate" translate="no">{fmtDate(it.expiry)}</td>
                            <td className="px-4 py-3 align-top"><StatusBadge status={st} t={t} /></td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="outline" size="sm" className="h-9 px-3" onClick={() => openAdjust(it)}>{t('stock_adjust')}</Button>
                                <button onClick={() => printItemBarcode(it)} className="text-primary hover:bg-primary/10 rounded p-1.5" aria-label="Print barcode" title="Print barcode" disabled={!it.barcode}><Printer className="h-4 w-4" /></button>
                                <button onClick={() => openEditItem(it)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded p-1.5" aria-label={t('stock_editItem')} title={t('stock_editItem')}><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => setDeleteTarget(it)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded p-1.5" aria-label={t('stock_deleteItem')} title={t('stock_deleteItem')}><Trash className="h-4 w-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'waste' && (
            <section className="space-y-4">
              {/* Record waste form */}
              <form onSubmit={handleRecordWaste} className="bg-card border-2 border-border rounded-2xl p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteItem')} *</Label>
                  <select
                    value={wasteForm.stockItem}
                    onChange={(e) => {
                      const id = e.target.value;
                      const it = items.find((i) => i.id === id);
                      setWasteForm((f) => ({ ...f, stockItem: id, itemName: it ? it.name : f.itemName, category: it ? (it.category || '') : f.category, unit: it ? (it.unit || '') : f.unit }));
                    }}
                    className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">{t('stock_none')} — {t('stock_wasteItem')}</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_name')} *</Label>
                  <Input value={wasteForm.itemName} onChange={(e) => setWasteForm((f) => ({ ...f, itemName: e.target.value }))} required className="h-11" placeholder={t('stock_wasteItem')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_category')}</Label>
                  <Input value={wasteForm.category} onChange={(e) => setWasteForm((f) => ({ ...f, category: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteQuantity')} *</Label>
                  <Input type="number" min="0" step="any" value={wasteForm.quantity} onChange={(e) => setWasteForm((f) => ({ ...f, quantity: e.target.value }))} required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_unit')}</Label>
                  <Input value={wasteForm.unit} onChange={(e) => setWasteForm((f) => ({ ...f, unit: e.target.value }))} className="h-11" placeholder="kg, L, pcs…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteReason')} *</Label>
                  <select value={wasteForm.reason} onChange={(e) => setWasteForm((f) => ({ ...f, reason: e.target.value }))} className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteDate')} *</Label>
                  <Input type="datetime-local" value={wasteForm.wasteDate} onChange={(e) => setWasteForm((f) => ({ ...f, wasteDate: e.target.value }))} required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteResponsible')}</Label>
                  <Input value={displayName} readOnly className="h-11 bg-muted/40 font-medium" />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label className="font-bold text-primary text-sm">{t('stock_wasteNotes')}</Label>
                  <Textarea value={wasteForm.notes} onChange={(e) => setWasteForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                  <Button type="submit" disabled={savingWaste} className="h-11 shadow-md">
                    {savingWaste ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    {t('stock_recordWaste')}
                  </Button>
                </div>
              </form>

              {/* Waste history */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-card p-4 rounded-2xl border-2 border-border shadow-sm">
                <h3 className="font-serif font-bold text-primary text-lg">{t('stock_wasteHistory')}</h3>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={wasteSearch} onChange={(e) => setWasteSearch(e.target.value)} placeholder={t('stock_searchPlaceholder')} className="pl-9 h-10 w-48" />
                  </div>
                  <select value={wasteReasonFilter} onChange={(e) => setWasteReasonFilter(e.target.value)} className="h-10 rounded-md border-2 border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="all">{t('stock_filterReason')}</option>
                    {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {loadingWaste ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('stock_loadingWaste')}</div>
              ) : filteredWaste.length === 0 ? (
                <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">{t('stock_noWaste')}</p>
                </div>
              ) : (
                <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        {['Date', 'Item', 'Category', 'Qty', 'Unit', 'Reason', 'Responsible', 'Notes'].map((h) => (
                          <th key={h} className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredWaste.map((w) => (
                        <tr key={w.id} className="hover:bg-muted/20 transition-colors align-top">
                          <td className="px-4 py-3 text-foreground whitespace-nowrap notranslate" translate="no">{fmtDate(w.wasteDate)}</td>
                          <td className="px-4 py-3 font-bold text-primary">{w.itemName}</td>
                          <td className="px-4 py-3 text-foreground">{w.category || '—'}</td>
                          <td className="px-4 py-3 font-mono font-bold text-foreground notranslate" translate="no">{Number(w.quantity) || 0}</td>
                          <td className="px-4 py-3 text-foreground">{w.unit || '—'}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className="font-bold border-destructive/30 text-destructive">{w.reason}</Badge></td>
                          <td className="px-4 py-3 text-foreground">{w.responsibleUser || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[240px] truncate" title={w.notes || ''}>{w.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'history' && (
            <section className="space-y-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('stock_loadingHistory')}</div>
              ) : adjustments.length === 0 ? (
                <div className="bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <HistoryIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">{t('stock_noHistory')}</p>
                </div>
              ) : (
                <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        {['Date', 'Item', 'Type', 'Previous', 'New', 'Change', 'Reason', 'By'].map((h) => (
                          <th key={h} className="text-left font-semibold tracking-wide text-muted-foreground px-4 py-3 border-b border-border whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {adjustments.map((a) => {
                        const delta = Number(a.delta) || 0;
                        const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : MinusCircle;
                        const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-destructive' : 'text-muted-foreground';
                        return (
                          <tr key={a.id} className="hover:bg-muted/20 transition-colors align-top">
                            <td className="px-4 py-3 text-foreground whitespace-nowrap notranslate" translate="no">{fmtDate(a.created)}</td>
                            <td className="px-4 py-3 font-bold text-primary">{a.itemName || '—'}</td>
                            <td className="px-4 py-3"><Badge variant="outline" className="font-bold">{a.adjustmentType}</Badge></td>
                            <td className="px-4 py-3 font-mono text-muted-foreground notranslate" translate="no">{Number(a.previousQty) || 0}</td>
                            <td className="px-4 py-3 font-mono font-bold text-foreground notranslate" translate="no">{Number(a.newQty) || 0}</td>
                            <td className={`px-4 py-3 font-mono font-bold ${deltaColor} notranslate`} translate="no"><span className="inline-flex items-center gap-1"><DeltaIcon className="h-3.5 w-3.5" />{delta > 0 ? '+' : ''}{delta}</span></td>
                            <td className="px-4 py-3 text-foreground max-w-[200px] truncate" title={a.reason || ''}>{a.reason || '—'}</td>
                            <td className="px-4 py-3 text-foreground whitespace-nowrap">{a.adjustedBy || '—'} <span className="text-xs text-muted-foreground">({a.adjustedByRole || '—'})</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Add / Edit item dialog — viewport-safe, scrollable body, sticky Save */}
      <Dialog
        open={itemFormOpen}
        onOpenChange={(open) => {
          if (savingItem) return;
          setItemFormOpen(open);
        }}
      >
        <DialogContent
          className="w-[calc(100vw-1rem)] max-w-lg p-0 gap-0 overflow-hidden !flex !flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(92dvh,920px)] top-3 sm:top-[50%] translate-x-[-50%] translate-y-0 sm:translate-y-[-50%] rounded-2xl border-2 border-border"
          onOpenAutoFocus={(e) => {
            // Prefer focusing the name field; avoid jumping to the close button.
            const nameInput = e.currentTarget.querySelector('input[name="stock-item-name"]');
            if (nameInput) {
              e.preventDefault();
              nameInput.focus();
            }
          }}
          onPointerDownOutside={(e) => {
            if (savingItem) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (savingItem) e.preventDefault();
          }}
        >
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 pr-12 shrink-0 border-b border-border/60 text-left">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Boxes className="h-5 w-5 text-primary shrink-0" />
              {editingItem ? t('stock_editItem') : t('stock_addItem')}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingItem
                ? 'Update this stock item. The window stays open after save.'
                : 'Enter item details. After save the form stays open for the next item.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSaveItem}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 sm:py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="stock-item-name" className="font-bold text-primary text-sm">{t('stock_name')} *</Label>
                  <Input
                    id="stock-item-name"
                    name="stock-item-name"
                    value={itemForm.name}
                    onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    className="h-11"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_category')}</Label>
                  <Input value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_unit')}</Label>
                  <Input value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} className="h-11" placeholder="kg, L, pcs…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_quantity')}</Label>
                  <Input type="number" min="0" step="any" value={itemForm.quantity} onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">{t('stock_minStock')}</Label>
                  <Input type="number" min="0" step="any" value={itemForm.minStock} onChange={(e) => setItemForm((f) => ({ ...f, minStock: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="font-bold text-primary text-sm">Barcode (numeric) *</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={itemForm.barcode}
                      onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value.replace(/[^\d]/g, '') }))}
                      inputMode="numeric"
                      required
                      className="h-11 font-mono flex-1 min-w-[8rem]"
                      placeholder="Digits only"
                    />
                    <Button type="button" variant="outline" className="h-11 shrink-0 min-h-[44px]" onClick={generateItemBarcode} title="Generate unique barcode">
                      <Barcode className="h-4 w-4 mr-1.5" /> {itemForm.barcode ? 'New barcode' : 'Generate'}
                    </Button>
                    {itemForm.barcode ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 shrink-0 min-h-[44px]"
                        onClick={() => {
                          const ok = printLabels([{ barcode: String(itemForm.barcode).trim() }], { title: 'Barcode' });
                          if (!ok) toast.error('Barcode print failed. Try again.');
                        }}
                      >
                        <Printer className="h-4 w-4 mr-1.5" /> Print
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    A unique numeric barcode is suggested on add. Use &quot;New barcode&quot; to regenerate for an existing item (logged in stock history).
                  </p>
                  {itemForm.barcode ? (
                    <div className="bg-white rounded-lg border border-border p-2 flex justify-center mt-1 overflow-x-auto">
                      <canvas ref={itemBarcodePreviewRef} width={260} height={56} className="max-w-full h-auto" />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">Prepared (date &amp; time) *</Label>
                  <Input
                    type="datetime-local"
                    value={itemForm.preparedAt}
                    onChange={(e) => setItemForm((f) => ({ ...f, preparedAt: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-primary text-sm">Expiry (date &amp; time) *</Label>
                  <Input
                    type="datetime-local"
                    value={itemForm.expiry}
                    onChange={(e) => setItemForm((f) => ({ ...f, expiry: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={!!itemForm.perishable}
                      onChange={(e) => setItemForm((f) => ({ ...f, perishable: e.target.checked }))}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Perishable item
                  </label>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="font-bold text-primary text-sm">{t('stock_linkedMenuItem')}</Label>
                  <select
                    value={itemForm.menuItem || 'none'}
                    onChange={(e) => setItemForm((f) => ({ ...f, menuItem: e.target.value === 'none' ? '' : e.target.value }))}
                    className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="none">{t('stock_none')}</option>
                    {menuItems.map((m) => (
                      <option key={m.id} value={m.id}>{m.nameEN || m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="font-bold text-primary text-sm">{t('stock_notes')}</Label>
                  <Textarea value={itemForm.notes} onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-y min-h-[4.5rem]" />
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 flex flex-row gap-2 justify-end items-center px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-card/95 backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setItemFormOpen(false)}
                disabled={savingItem}
                className="h-11 min-h-[44px] flex-1 sm:flex-none"
              >
                {t('stock_cancel')}
              </Button>
              <Button
                type="submit"
                disabled={savingItem}
                className="h-11 min-h-[44px] flex-1 sm:flex-none shadow-md"
              >
                {savingItem ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {savingItem ? 'Saving…' : t('stock_save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> {t('stock_adjust')}</DialogTitle>
            <DialogDescription>{adjustTarget?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAdjust} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">{t('stock_adjustType')}</Label>
              <select value={adjustForm.adjustmentType} onChange={(e) => setAdjustForm((f) => ({ ...f, adjustmentType: e.target.value }))} className="w-full h-11 rounded-md border-2 border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                {ADJUST_TYPES.map((tp) => <option key={tp} value={tp}>{t(`stock_${tp}`)}</option>)}
              </select>
            </div>
            {(adjustForm.adjustmentType === 'restock' || adjustForm.adjustmentType === 'waste') && (
              <div className="space-y-1.5">
                <Label className="font-bold text-primary text-sm">{t('stock_delta')} *</Label>
                <Input type="number" min="0" step="any" value={adjustForm.delta} onChange={(e) => setAdjustForm((f) => ({ ...f, delta: e.target.value }))} required className="h-11" />
              </div>
            )}
            {(adjustForm.adjustmentType === 'correction' || adjustForm.adjustmentType === 'initial') && (
              <div className="space-y-1.5">
                <Label className="font-bold text-primary text-sm">{t('stock_newQty')} *</Label>
                <Input type="number" min="0" step="any" value={adjustForm.newQty} onChange={(e) => setAdjustForm((f) => ({ ...f, newQty: e.target.value }))} required className="h-11" />
              </div>
            )}
            <div className="rounded-lg bg-muted/40 border border-border/60 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground font-medium">{t('stock_previousQty')}: <span className="font-mono font-bold text-foreground notranslate" translate="no">{Number(adjustTarget?.quantity) || 0}</span></span>
              <span className="text-muted-foreground font-medium">→ <span className="font-mono font-bold text-primary notranslate" translate="no">{Math.max(0, Math.round(computedNewQty))}</span></span>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">{t('stock_adjustReason')}</Label>
              <Input value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-primary text-sm">{t('stock_adjustNotes')}</Label>
              <Textarea value={adjustForm.notes} onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter className="flex gap-2 justify-end mt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustTarget(null)} disabled={savingAdjust}>{t('stock_cancel')}</Button>
              <Button type="submit" disabled={savingAdjust}>{savingAdjust ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{t('stock_save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash className="h-5 w-5 text-destructive shrink-0" /> {t('stock_confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('stock_confirmDeleteDesc')}
              {deleteTarget?.name ? (
                <span className="block mt-2 font-semibold text-foreground">“{deleteTarget.name}”</span>
              ) : null}
              <span className="block mt-2 text-xs text-muted-foreground">
                Adjustment, lot, issue, and waste history is kept for audit. Delete is blocked if any lot still has remaining quantity.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel disabled={deleting} className="h-12 sm:h-10 mt-0">{t('stock_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!deleting) handleDeleteItem(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 sm:h-10"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</span>
              ) : t('stock_deleteItem')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
