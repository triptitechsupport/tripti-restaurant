import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database, Search, Download, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  FileJson, FileSpreadsheet, Eye, Lock, RefreshCw, Inbox, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { recordsToCsv, downloadCsv } from '@/lib/csvUtils.js';

/**
 * Admin Data Explorer — read-only retrieval of every application collection.
 *
 * The admin (admin_users) is authenticated via PocketBase JWT; the collection
 * access rules are the authorization layer. Only collections an admin can
 * list are offered for browsing. No create/update/delete is exposed — this
 * page is strictly read-only retrieval + export.
 */

// Collections the admin can read via list/view rules, with friendly labels.
// `sensitive` flags collections that hold personal/auth data so the UI can
// label them clearly. `restricted` collections have owner-scoped rules that
// will return at most the admin's own record (shown for transparency).
const COLLECTIONS = [
  { name: 'orders', label: 'Customer Orders', sensitive: true },
  { name: 'waiter_orders', label: 'Waiter Orders (Billing)', sensitive: false },
  { name: 'kitchen_orders', label: 'Kitchen Orders (KOTs)', sensitive: false },
  { name: 'table_reservations', label: 'Table Reservations', sensitive: true },
  { name: 'menu_items', label: 'Menu Items', sensitive: false },
  { name: 'categories', label: 'Menu Categories', sensitive: false },
  { name: 'table_configurations', label: 'Table Configurations', sensitive: false },
  { name: 'table_groups', label: 'Table Groups', sensitive: false },
  { name: 'table_group_members', label: 'Table Group Members', sensitive: false },
  { name: 'table_settings', label: 'Table Settings', sensitive: false },
  { name: 'time_slots', label: 'Time Slots', sensitive: false },
  { name: 'booking_settings', label: 'Booking Settings', sensitive: false },
  { name: 'order_settings', label: 'Order Settings', sensitive: false },
  { name: 'order_counters', label: 'Order Counters', sensitive: false },
  // kot_counters is an internal hook-managed counter (parentOrder + nextSeq)
  // with superuser-only access rules — not readable via REST by admins and
  // not useful for browsing (KOT data is available via kitchen_orders).
  // Omitting it avoids a 403 on every dashboard load.
  { name: 'logs', label: 'System Logs', sensitive: false },
  { name: 'feedback', label: 'Guest Feedback', sensitive: true },
  { name: 'staff_messages', label: 'Staff Chat Messages', sensitive: true },
  { name: 'staff_calls', label: 'Staff Calls', sensitive: true },
  { name: 'waiter_users', label: 'Waiter Users', sensitive: true },
  { name: 'waiter_timesheets', label: 'Waiter Timesheets', sensitive: true },
  { name: 'translations', label: 'Translations', sensitive: false },
  { name: 'email_templates', label: 'Email Templates', sensitive: false },
  { name: 'notification_settings', label: 'Notification Settings', sensitive: false },
  { name: 'print_settings', label: 'Print Settings', sensitive: false },
  { name: 'pdf_menu_settings', label: 'PDF Menu Settings', sensitive: false },
  { name: 'marquee_settings', label: 'Marquee Settings', sensitive: false },
  { name: 'reservation_form_settings', label: 'Reservation Form Settings', sensitive: false },
  { name: 'restaurant_hours', label: 'Restaurant Hours', sensitive: false },
  { name: 'closed_dates', label: 'Closed Dates', sensitive: false },
  { name: 'restaurant_section', label: 'Restaurant Section', sensitive: false },
  { name: 'site_branding', label: 'Site Branding', sensitive: false },
  // Auth / owner-scoped collections — listed for transparency but access
  // rules limit what an admin can retrieve via REST.
  { name: 'users', label: 'Users (Guests)', sensitive: true, restricted: true },
  { name: 'guests', label: 'Guests (Auth)', sensitive: true, restricted: true },
  { name: 'kds_users', label: 'KDS Users', sensitive: true, restricted: true },
  { name: 'admin_users', label: 'Admin Users', sensitive: true, restricted: true },
  { name: 'otps', label: 'OTPs', sensitive: true, restricted: true },
];

const PER_PAGE_OPTIONS = [
  { value: '25', label: '25 / page' },
  { value: '50', label: '50 / page' },
  { value: '100', label: '100 / page' },
  { value: '200', label: '200 / page' },
];

const JSON_FIELDS = new Set([
  'items', 'details', 'offer', 'answer', 'assignedTables', 'perWaiterPrintSettings',
]);
const FILE_FIELDS = new Set([
  'image', 'logo', 'media', 'pdfMenuDE', 'pdfMenuEN', 'menuImageDE', 'menuImageEN', 'avatar',
]);
const SENSITIVE_FIELDS = new Set([
  'email', 'customerEmail', 'phone', 'customerPhone', 'password', 'tokenKey',
  'emailVisibility', 'verified', 'otp_code', 'expiration_time',
]);

function formatCell(value, key, record) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic">—</span>;
  if (FILE_FIELDS.has(key)) {
    if (!value) return <span className="text-muted-foreground italic">—</span>;
    try {
      const url = pb.files.getURL(record, value);
      const name = typeof value === 'string' ? value : 'file';
      return (
        <a href={url} target="_blank" rel="noreferrer" className="text-secondary underline hover:opacity-80">
          {String(name).length > 24 ? String(name).slice(0, 22) + '…' : name}
        </a>
      );
    } catch {
      return <span className="text-muted-foreground">{String(value)}</span>;
    }
  }
  if (JSON_FIELDS.has(key) || Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    const preview = json.length > 60 ? json.slice(0, 60) + '…' : json;
    return <span className="font-mono text-xs text-foreground/80 break-all">{preview}</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant="outline" className="text-[10px]">{String(value)}</Badge>;
  }
  const str = String(value);
  if (str.length > 80) return <span title={str}>{str.slice(0, 80)}…</span>;
  return str;
}

export default function AdminDataExplorer() {
  const [collection, setCollection] = useState('orders');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const meta = useMemo(
    () => COLLECTIONS.find((c) => c.name === collection) || { name: collection, label: collection },
    [collection],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await pb.collection(collection).getList(page, perPage, {
        sort: '-created',
        $autoCancel: false,
      });
      setRecords(result.items || []);
      setTotalItems(result.totalItems || 0);
      setTotalPages(result.totalPages || 0);
    } catch (err) {
      const status = err?.status;
      if (status === 403 || status === 404) {
        setError(`Access denied or collection not readable for "${meta.label}". The access rules on this collection restrict admin retrieval via REST.`);
      } else {
        setError(`Failed to load records from "${meta.label}".${err?.message ? ` ${err.message}` : ''}`);
      }
      setRecords([]);
      setTotalItems(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [collection, page, perPage, meta.label]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 when collection or perPage changes.
  useEffect(() => { setPage(1); }, [collection, perPage]);

  // Client-side search within the loaded page.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      Object.values(r).some((v) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'object') return JSON.stringify(v).toLowerCase().includes(q);
        return String(v).toLowerCase().includes(q);
      }),
    );
  }, [records, search]);

  const columns = useMemo(() => {
    if (filteredRecords.length === 0) return [];
    // Union of keys across visible rows, ordered by a priority list then by appearance.
    const keySet = new Set();
    filteredRecords.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
    const priority = ['id', 'orderId', 'orderNumber', 'reservationCode', 'guestName', 'customerName', 'name', 'username', 'displayName', 'tableNumber', 'status', 'orderStatus', 'paymentStatus', 'billingStatus', 'totalPrice', 'totalAmount', 'created', 'updated'];
    const sorted = [...keySet].sort((a, b) => {
      const ia = priority.indexOf(a); const ib = priority.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [filteredRecords]);

  const exportPageCsv = () => {
    if (filteredRecords.length === 0) { toast.error('No records to export'); return; }
    const cols = columns.map((k) => ({ key: k, label: k }));
    const csv = recordsToCsv(filteredRecords, cols);
    downloadCsv(`${collection}_page${page}.csv`, csv);
    toast.success(`Exported ${filteredRecords.length} records to CSV`);
  };

  const exportPageJson = () => {
    if (filteredRecords.length === 0) { toast.error('No records to export'); return; }
    const blob = new Blob([JSON.stringify(filteredRecords, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${collection}_page${page}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Exported ${filteredRecords.length} records to JSON`);
  };

  const confirmExportAll = async () => {
    setExportingAll(true);
    try {
      const all = await pb.collection(collection).getFullList({
        sort: '-created',
        $autoCancel: false,
      });
      if (all.length === 0) { toast.info('No records in this collection'); return; }
      const keySet = new Set();
      all.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
      const cols = [...keySet].sort().map((k) => ({ key: k, label: k }));
      const csv = recordsToCsv(all, cols);
      downloadCsv(`${collection}_all.csv`, csv);
      toast.success(`Exported all ${all.length} records to CSV`);
    } catch (err) {
      toast.error(`Export failed: ${err?.message || 'unknown error'}`);
    } finally {
      setExportingAll(false);
      setExportAllOpen(false);
    }
  };

  const exportAllJson = async () => {
    setExportingAll(true);
    try {
      const all = await pb.collection(collection).getFullList({
        sort: '-created',
        $autoCancel: false,
      });
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${collection}_all.json`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Exported all ${all.length} records to JSON`);
    } catch (err) {
      toast.error(`Export failed: ${err?.message || 'unknown error'}`);
    } finally {
      setExportingAll(false);
    }
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Database className="h-5 w-5 text-secondary" /> Data Explorer
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Read-only retrieval of every application collection. Browse, search, and export records — no data is modified.
            </p>
          </div>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Read-only
          </Badge>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Collection</label>
          <Select value={collection} onValueChange={(v) => { if (v) setCollection(v); }}>
            <SelectTrigger className="mt-1 min-h-touch"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {COLLECTIONS.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  <span className="flex items-center gap-2">
                    {c.label}
                    {c.sensitive && <Lock className="h-3 w-3 text-amber-600" />}
                    {c.restricted && <span className="text-[10px] text-muted-foreground">(restricted)</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search current page</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter loaded records…"
              className="pl-9 min-h-touch"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per page</label>
          <Select value={String(perPage)} onValueChange={(v) => { if (v) setPerPage(Number(v)); }}>
            <SelectTrigger className="mt-1 min-h-touch w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading} className="min-h-touch">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Collection meta + sensitive notice */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="bg-secondary/30">{meta.label}</Badge>
        <span className="text-muted-foreground">{totalItems} total record{totalItems === 1 ? '' : 's'}</span>
        {meta.sensitive && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <Lock className="h-3 w-3 mr-1" /> Contains sensitive / personal data
          </Badge>
        )}
        {meta.restricted && (
          <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Access rules may limit retrieval to your own record only.
          </span>
        )}
      </div>

      {/* Export bar */}
      <div className="flex flex-wrap items-center gap-2 border border-border rounded-xl p-3 bg-muted/20">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Export:</span>
        <Button variant="outline" size="sm" onClick={exportPageCsv} className="min-h-touch">
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Page CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPageJson} className="min-h-touch">
          <FileJson className="h-4 w-4 mr-2" /> Page JSON
        </Button>
        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
        <Button variant="outline" size="sm" onClick={() => setExportAllOpen(true)} className="min-h-touch">
          <Download className="h-4 w-4 mr-2" /> Export ALL (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportAllJson} disabled={exportingAll} className="min-h-touch">
          {exportingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export ALL (JSON)
        </Button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-8 text-destructive bg-destructive/5 rounded-xl border border-destructive/20">
          <AlertCircle className="h-10 w-10 mb-3 opacity-80" />
          <p className="font-medium mb-4 text-center max-w-lg">{error}</p>
          <Button variant="outline" onClick={fetchData} className="min-h-touch">Try Again</Button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
          <Inbox className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-lg font-medium text-foreground">No records found</p>
          <p className="text-sm mt-1">
            {search ? 'No loaded records match your search.' : `This collection is empty or returned no readable records.`}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.map((col) => (
                  <TableHead key={col} className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                    {col}
                    {SENSITIVE_FIELDS.has(col) && <Lock className="inline h-3 w-3 ml-1 text-amber-600" />}
                  </TableHead>
                ))}
                <TableHead className="text-xs font-bold uppercase tracking-wide w-16">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((rec) => (
                <TableRow
                  key={rec.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setDetailRecord(rec)}
                >
                  {columns.map((col) => (
                    <TableCell key={col} className="text-sm align-top max-w-[260px]">
                      {formatCell(rec[col], col, rec)}
                    </TableCell>
                  ))}
                  <TableCell className="align-top">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && records.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Page {page} of {Math.max(totalPages, 1)} · showing {filteredRecords.length} of {totalItems} records
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))} className="min-h-touch">
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setPage((p) => p + 1)} className="min-h-touch">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Record detail dialog */}
      <Dialog open={!!detailRecord} onOpenChange={(open) => { if (!open) setDetailRecord(null); }}>
        <DialogContent className="modal-mobile-safe max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-secondary" /> Record Detail
            </DialogTitle>
            <DialogDescription>
              {meta.label} · <span className="font-mono">{detailRecord?.id}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/90">
              {detailRecord ? JSON.stringify(detailRecord, null, 2) : ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export ALL confirmation */}
      <AlertDialog open={exportAllOpen} onOpenChange={setExportAllOpen}>
        <AlertDialogContent className="modal-mobile-safe">
          <AlertDialogHeader>
            <AlertDialogTitle>Export all {meta.label} records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will fetch every record in the <strong>{collection}</strong> collection ({totalItems} total) and download it as a CSV file.
              For large collections this may take a moment. The export is read-only — no data is changed.
              {meta.sensitive && ' This collection contains sensitive/personal data; handle the exported file responsibly.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-3 sm:gap-0 mt-4">
            <AlertDialogCancel className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmExportAll}
              disabled={exportingAll}
              className="h-12 sm:h-10"
            >
              {exportingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Export All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
