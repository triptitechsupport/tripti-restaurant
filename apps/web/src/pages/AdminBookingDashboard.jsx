import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { ShoppingBag, CalendarDays, UtensilsCrossed, Plus, X, Settings, Loader2, FileText, Globe, ArrowRight, LayoutGrid, MessageSquare, Clock, ChefHat, ConciergeBell, Receipt, Tag, Pencil, Trash2, BellRing, Users, AlertCircle, RefreshCw, Printer, HelpCircle, BarChart3, PackageCheck, CookingPot, Banknote, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Link, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import AdminPickupSection from '@/components/pickup/AdminPickupSection.jsx';
import AdminStaffAccounts, { STAFF_ROLES } from '@/components/AdminStaffAccounts.jsx';
import AdminTableReservations from '@/components/AdminTableReservations.jsx';
import MenuItemsList from '@/components/MenuItemsList.jsx';
import MenuItemForm from '@/components/MenuItemForm.jsx';
import AdminLogsTab from '@/components/AdminLogsTab.jsx';
import TableCapacitySettings from '@/components/TableCapacitySettings.jsx';
import TimeSlotConfiguration from '@/components/TimeSlotConfiguration.jsx';
import AdminTranslationsEditor from '@/components/AdminTranslationsEditor.jsx';
import AdminTableSettings from '@/components/AdminTableSettings.jsx';
import PdfMenuSettings from '@/components/PdfMenuSettings.jsx';
import AdminLogoSettings from '@/components/AdminLogoSettings.jsx';
import AdminMarqueeSettings from '@/components/AdminMarqueeSettings.jsx';
import AdminReservationFormSettings from '@/components/AdminReservationFormSettings.jsx';
import AdminClosureSettings from '@/components/AdminClosureSettings.jsx';
import AdminRestaurantSectionSettings from '@/components/AdminRestaurantSectionSettings.jsx';
import WhatsAppNotificationSettings from '@/components/WhatsAppNotificationSettings.jsx';
import EmailTemplateSettings from '@/components/EmailTemplateSettings.jsx';
import AdminFeedbackManagement from '@/components/AdminFeedbackManagement.jsx';
import AdminPrintSettings from '@/components/AdminPrintSettings.jsx';
import AdminTimesheetView from '@/components/AdminTimesheetView.jsx';
import AdminKotsView from '@/components/AdminKotsView.jsx';
import AdminWaiterManagement from '@/components/AdminWaiterManagement.jsx';
import AdminStockManagement from '@/components/AdminStockManagement.jsx';
import StockAlertsPanel from '@/components/StockAlertsPanel.jsx';
import AdminKotPrintOrder from '@/components/AdminKotPrintOrder.jsx';
import AdminAnalysisView from '@/components/AdminAnalysisView.jsx';
import CategoryFormModal from '@/components/CategoryFormModal.jsx';
import CsvImportExport from '@/components/CsvImportExport.jsx';
import {
  menuItemsExportColumns, menuItemsImportConfig,
  categoriesExportColumns, categoriesImportConfig,
} from '@/lib/csvConfigs.js';
import SettlementBillingView from '@/components/SettlementBillingView.jsx';
import StaffAppDownload from '@/components/StaffAppDownload.jsx';
import AdminRksvDiagnostics from '@/components/AdminRksvDiagnostics.jsx';
import GanttChart from '@/components/GanttChart.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import StaffChat from '@/components/StaffChat.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function AdminBookingDashboard() {
  const { isAdminAuthenticated, initialLoading, currentAdmin } = useAuth();
  const { t, language, isOrderingEnabled, setIsOrderingEnabled } = useLanguage();
  const roleTitle = (r) => STAFF_ROLES[r][language === 'en' ? 'en' : 'de'].title;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('orders');
  const [reservationView, setReservationView] = useState('gantt');

  // When a reservation notification sends the admin here with
  // ?tab=reservations&date=YYYY-MM-DD&focus=<id>, jump straight to the
  // reservation calendar on that date and focus the reservation.
  // Must re-run whenever searchParams change — admin is often already on
  // /admin-dashboard when they click "View Notification", so mount-only
  // handling would silently ignore the deep-link.
  const [searchParams, setSearchParams] = useSearchParams();
  const [ganttInitialDate, setGanttInitialDate] = useState(null);
  const [ganttFocusId, setGanttFocusId] = useState(null);
  // Keep a focus generation counter so GanttChart can remount cleanly when
  // the same focus id is requested again (e.g. second notification).
  const [ganttFocusGen, setGanttFocusGen] = useState(0);
  useEffect(() => {
    const tab = searchParams.get('tab');
    const date = searchParams.get('date');
    const focus = searchParams.get('focus');
    if (!(tab === 'reservations' || date || focus)) return undefined;

    setActiveTab('reservations');
    setReservationView('gantt');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setGanttInitialDate(date);
    }
    if (focus) {
      setGanttFocusId(focus);
      setGanttFocusGen((g) => g + 1);
    }
    // Consume the params so a later in-app tab switch doesn't re-focus,
    // and so this effect doesn't loop after clearing.
    setSearchParams({}, { replace: true });
    return undefined;
  }, [searchParams, setSearchParams]);
  
  const [menuItems, setMenuItems] = useState([]);
  const [isMenuLoading, setIsMenuLoading] = useState(true);
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState(null);

  // Dynamic menu categories (sourced from the `categories` collection).
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  // Pending reservation requests — sticky attention panel at the top of the
  // dashboard. Updates immediately from realtime events (no full-page refresh)
  // with a short polling fallback if the websocket drops through the proxy.
  const [pendingReservations, setPendingReservations] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [reservationsRefreshing, setReservationsRefreshing] = useState(false);
  const [ganttRefreshToken, setGanttRefreshToken] = useState(0);
  const reservationsSectionRef = useRef(null);
  // Monotonic fetch generation so a slow/stale poll never overwrites a
  // newer realtime-applied or later-fetched pending list.
  const pendingFetchGenRef = useRef(0);

  // Genuinely pending = status Pending (or empty) AND no table assigned yet.
  const isGenuinelyPending = useCallback((r) => {
    if (!r) return false;
    const status = (r.status || 'Pending').toString();
    if (status !== 'Pending') return false;
    const multi = Array.isArray(r.assignedTables) ? r.assignedTables.filter(Boolean) : [];
    if (multi.length > 0) return false;
    if (r.assignedTable) return false;
    return true;
  }, []);

  const sortPendingNewestFirst = useCallback((list) => {
    return list.slice().sort((a, b) => {
      const ta = new Date(a.created || 0).getTime();
      const tb = new Date(b.created || 0).getTime();
      return tb - ta;
    });
  }, []);

  // Apply a single realtime create/update/delete to local pending state
  // immediately — no network round-trip, no waiting for a full list refetch.
  const applyPendingRealtimeEvent = useCallback((e) => {
    if (!e || !e.record) return;
    const { action, record } = e;
    // Bump generation so any in-flight list fetch that started before this
    // event cannot clobber the optimistic update with a stale snapshot.
    pendingFetchGenRef.current += 1;
    setPendingReservations((prev) => {
      if (action === 'delete') {
        return prev.filter((r) => r.id !== record.id);
      }
      if (action === 'create' || action === 'update') {
        const shouldShow = isGenuinelyPending(record);
        const without = prev.filter((r) => r.id !== record.id);
        if (!shouldShow) return without;
        return sortPendingNewestFirst([...without, record]);
      }
      return prev;
    });
    setPendingLoading(false);
  }, [isGenuinelyPending, sortPendingNewestFirst]);

  const fetchMenuItems = async () => {
    setIsMenuLoading(true);
    try {
      const records = await pb.collection('menu_items').getFullList({ sort: '-created', $autoCancel: false });
      setMenuItems(records);
    } catch (err) {
      toast.error('Failed to load menu items');
    } finally {
      setIsMenuLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const records = await pb.collection('categories').getFullList({ sort: 'display_order,name', $autoCancel: false });
      setCategories(records);
    } catch (err) {
      toast.error('Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchMenuItems();
      fetchCategories();
    }
  }, [isAdminAuthenticated]);

  const fetchPendingReservations = useCallback(async ({ silent = true } = {}) => {
    const gen = ++pendingFetchGenRef.current;
    try {
      // Pending = awaiting review: still Pending status AND not yet assigned
      // a table. Once Auto Fit / Manual Fit places a table (and typically
      // marks Approved), the request must leave this attention panel.
      const records = await pb.collection('table_reservations').getFullList({
        filter: "status = 'Pending'",
        sort: '-created',
        $autoCancel: false,
        requestKey: null,
      });
      // Drop stale responses — a newer fetch or realtime apply already won.
      if (gen !== pendingFetchGenRef.current) return null;
      const stillAwaiting = records.filter((r) => {
        const multi = Array.isArray(r.assignedTables) ? r.assignedTables.filter(Boolean) : [];
        if (multi.length > 0) return false;
        if (r.assignedTable) return false;
        return true;
      });
      setPendingReservations(stillAwaiting);
      return stillAwaiting;
    } catch (err) {
      // Ignore auto-cancelled / aborted requests (status 0) — another fetch won.
      if (err && (err.status === 0 || err.isAbort || err.name === 'AbortError')) {
        return null;
      }
      if (!silent) {
        toast.error('Failed to refresh pending reservation requests');
      }
      return null;
    } finally {
      if (gen === pendingFetchGenRef.current) {
        setPendingLoading(false);
      }
    }
  }, []);

  const handleReviewRequests = () => {
    setActiveTab('reservations');
    setReservationView('gantt');
    const first = pendingReservations[0];
    if (first) {
      const rawDate = (first.reservationDate || '').toString();
      const dateMatch = rawDate.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) setGanttInitialDate(dateMatch[1]);
      setGanttFocusId(first.id);
      setGanttFocusGen((g) => g + 1);
    }
    // Scroll to the reservations section after the tab switch paints.
    window.setTimeout(() => {
      reservationsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleRefreshReservations = async () => {
    setReservationsRefreshing(true);
    try {
      await fetchPendingReservations({ silent: false });
      setGanttRefreshToken((n) => n + 1);
      toast.success('Reservations refreshed');
    } catch (err) {
      toast.error('Failed to refresh reservations');
    } finally {
      // Gantt fetch is async; keep spinner briefly then clear. onRefreshed also clears.
      window.setTimeout(() => setReservationsRefreshing(false), 800);
    }
  };

  useEffect(() => {
    if (!isAdminAuthenticated) {
      setPendingReservations([]);
      setPendingLoading(false);
      return undefined;
    }

    let cancelled = false;
    let unsubFn = null;
    let pollId = null;
    let reconnectId = null;

    // Immediate first load so the panel is present as soon as the admin lands.
    void fetchPendingReservations({ silent: true });

    const attachRealtime = () => {
      void pb
        .collection('table_reservations')
        .subscribe('*', (e) => {
          if (cancelled) return;
          // Instant UI update from the event payload — no refresh needed.
          applyPendingRealtimeEvent(e);
          // Background reconcile so we never drift if an event was missed.
          void fetchPendingReservations({ silent: true });
        }, { requestKey: 'admin-pending-rt' })
        .then((unsub) => {
          if (cancelled) {
            try { unsub?.(); } catch { /* ignore */ }
            return;
          }
          unsubFn = unsub;
        })
        .catch((error) => {
          console.error('Pending reservations realtime subscription failed', error);
          // Retry subscribe after a short backoff if the socket isn't ready yet.
          if (!cancelled) {
            reconnectId = window.setTimeout(attachRealtime, 3000);
          }
        });
    };

    attachRealtime();

    // Short polling fallback — covers proxy/websocket drops without a full page reload.
    pollId = window.setInterval(() => {
      if (!cancelled) void fetchPendingReservations({ silent: true });
    }, 5000);

    // Also refresh when the tab becomes visible again (admin switched apps).
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void fetchPendingReservations({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (pollId) window.clearInterval(pollId);
      if (reconnectId) window.clearTimeout(reconnectId);
      // Only detach THIS listener — never bare unsubscribe('*'), which would
      // kill GlobalReservationNotifications and GanttChart subscriptions too.
      try {
        if (typeof unsubFn === 'function') unsubFn();
      } catch { /* ignore */ }
    };
  }, [isAdminAuthenticated, fetchPendingReservations, applyPendingRealtimeEvent]);

  if (initialLoading) return <div className="h-full flex items-center justify-center bg-background"><div className="animate-pulse"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></div>;
  
  if (!isAdminAuthenticated) return <Navigate to="/admin-login" replace />;

  const authToken = pb.authStore.token;

  const handleEditMenu = (item) => { setEditingMenuItem(item); setShowMenuForm(true); };
  const handleMenuFormSuccess = () => { setShowMenuForm(false); setEditingMenuItem(null); fetchMenuItems(); };
  const handleMenuFormCancel = () => { setShowMenuForm(false); setEditingMenuItem(null); };

  const handleAddCategory = () => { setEditingCategory(null); setShowCategoryForm(true); };
  const handleEditCategory = (cat) => { setEditingCategory(cat); setShowCategoryForm(true); };
  const handleCategoryFormClose = () => { setShowCategoryForm(false); setEditingCategory(null); };
  const handleCategoryFormSuccess = () => { setShowCategoryForm(false); setEditingCategory(null); fetchCategories(); };
  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;
    setIsDeletingCategory(true);
    try {
      await pb.collection('categories').delete(categoryToDelete.id, { $autoCancel: false });
      setCategories(prev => prev.filter(c => c.id !== categoryToDelete.id));
      toast.success('Category deleted successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to delete category.');
    } finally {
      setIsDeletingCategory(false);
      setCategoryToDelete(null);
    }
  };

  const renderOrdersSection = () => <AdminPickupSection />;
  
  const renderReservationsSection = () => (
    <div ref={reservationsSectionRef} className="space-y-6 scroll-mt-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
        <div>
          <h2 className="text-xl font-serif font-bold tracking-tight text-primary">Reservations Overview</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">Manage today's bookings on the timeline or browse the full list.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="inline-flex rounded-lg border-2 border-border bg-muted/30 p-1 w-full sm:w-auto">
            <button
              onClick={() => setReservationView('gantt')}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-md transition-all ${reservationView === 'gantt' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setReservationView('list')}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-md transition-all ${reservationView === 'list' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground hover:bg-muted'}`}
            >
              List
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleRefreshReservations}
            disabled={reservationsRefreshing}
            className="w-full sm:w-auto shadow-sm gap-2"
            aria-label="Refresh reservations"
          >
            <RefreshCw className={`h-4 w-4 ${reservationsRefreshing ? 'animate-spin' : ''}`} />
            {reservationsRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button asChild className="w-full sm:w-auto shadow-md">
            <Link to="/admin/reservations">
              Approval Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      {reservationView === 'gantt' ? (
        <GanttChart
          key={`gantt-${ganttFocusGen}-${ganttInitialDate || 'today'}`}
          initialDate={ganttInitialDate}
          focusReservationId={ganttFocusId}
          onFocusConsumed={() => setGanttFocusId(null)}
          refreshToken={ganttRefreshToken}
          onRefreshed={() => setReservationsRefreshing(false)}
          onReservationsChanged={() => { void fetchPendingReservations(); }}
        />
      ) : (
        <AdminTableReservations authToken={authToken} />
      )}
    </div>
  );
  
  const renderMenuSection = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-mobile rounded-2xl border-2 border-border shadow-md">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">{t('menuManagement')}</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">Manage your digital menu offerings.</p>
        </div>
        {!showMenuForm && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button onClick={handleAddCategory} variant="outline" className="w-full sm:w-auto min-h-touch shadow-sm">
              <Tag className="h-4 w-4 mr-2" /> Add Category
            </Button>
            <Button onClick={() => setShowMenuForm(true)} className="w-full sm:w-auto min-h-touch shadow-md">
              <Plus className="h-4 w-4 mr-2" /> {t('addNewItem')}
            </Button>
          </div>
        )}
      </div>

      {/* CSV export / import for menu items — bulk management */}
      {!showMenuForm && (
        <div className="bg-card border-2 border-border rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-serif font-bold text-primary">Menu Items — CSV Export / Import</h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Export the menu to CSV, edit offline, then re-import to bulk create or update items. Matched by ID or Name (EN).
              </p>
            </div>
            <div className="sm:ml-auto">
              <CsvImportExport
                collection="menu_items"
                entityLabel="menu items"
                exportFileName="menu_items.csv"
                exportColumns={menuItemsExportColumns}
                importConfig={menuItemsImportConfig}
                onImportComplete={fetchMenuItems}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dynamic categories management */}
      {!showMenuForm && (
        <div className="bg-card border-2 border-border rounded-2xl p-mobile shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-serif font-bold tracking-tight text-primary">Menu Categories</h3>
            <span className="text-xs text-muted-foreground font-medium">({categories.length})</span>
            <div className="ml-auto">
              <CsvImportExport
                collection="categories"
                entityLabel="categories"
                exportFileName="categories.csv"
                exportColumns={categoriesExportColumns}
                importConfig={categoriesImportConfig}
                onImportComplete={fetchCategories}
              />
            </div>
          </div>
          {categoriesLoading ? (
            <p className="text-sm text-muted-foreground italic">Loading categories…</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No categories yet. Click “Add Category” to create one.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg pl-3 pr-1.5 py-1.5">
                  <span className="text-sm font-medium text-foreground">{cat.name}</span>
                  {cat.name_de && <span className="text-xs text-muted-foreground">/ {cat.name_de}</span>}
                  {cat.display_order != null && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5">#{cat.display_order}</span>
                  )}
                  <button onClick={() => handleEditCategory(cat)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded p-1" aria-label={`Edit ${cat.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setCategoryToDelete(cat)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded p-1" aria-label={`Delete ${cat.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showMenuForm ? (
        <Card className="border-2 border-primary shadow-xl animate-in fade-in duration-300 rounded-2xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b-2 border-border bg-primary/5 pb-4">
            <div>
              <CardTitle className="font-serif text-primary text-xl">{editingMenuItem ? t('editItem') : t('addNewItem')}</CardTitle>
              <CardDescription className="font-medium text-foreground">Fill in the details for the dish.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleMenuFormCancel} className="touch-target hover:bg-destructive/10 hover:text-destructive">
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-6 px-mobile bg-card">
            <MenuItemForm initialData={editingMenuItem} onSuccess={handleMenuFormSuccess} onCancel={handleMenuFormCancel} />
          </CardContent>
        </Card>
      ) : (
        <MenuItemsList items={menuItems} onEdit={handleEditMenu} onDelete={fetchMenuItems} />
      )}

      <CategoryFormModal
        isOpen={showCategoryForm}
        onClose={handleCategoryFormClose}
        onSuccess={handleCategoryFormSuccess}
        editingCategory={editingCategory}
      />

      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && !isDeletingCategory && setCategoryToDelete(null)}>
        <AlertDialogContent className="modal-mobile-safe">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{categoryToDelete?.name}</strong> from the category list. Existing menu items keep their current category value — reassign them individually if needed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel disabled={isDeletingCategory} className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteCategoryConfirm(); }}
              disabled={isDeletingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 sm:h-10"
            >
              {isDeletingCategory ? 'Deleting...' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const renderTablesSection = () => <AdminTableSettings />;

  const renderSettingsSection = () => (
    <div className="space-y-8 lg:space-y-12">
      <div className="bg-card border-2 border-border rounded-2xl p-mobile shadow-md">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-3">
            <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm"><Settings className="w-6 h-6" /></div>
            <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">{t('onlineOrderingSettings')}</h2>
          </div>
          <p className="text-muted-foreground font-medium text-sm">Configure when customers can place online food orders.</p>
        </div>

        <div className="max-w-2xl space-y-6 md:space-y-8">
          <div className="flex items-start gap-5 p-mobile border-2 border-border rounded-xl bg-accent/20">
            <Switch 
              checked={isOrderingEnabled} 
              onCheckedChange={(checked) => setIsOrderingEnabled(checked)} 
              className="mt-1 data-[state=checked]:bg-primary" 
            />
            <div>
              <label className="text-lg font-serif font-bold text-primary block mb-1">Enable Online Orders</label>
              <p className="text-sm font-medium text-foreground">Allow customers to place orders through the website.</p>
            </div>
          </div>
        </div>
      </div>

      <AdminLogoSettings />

      <AdminPrintSettings />

      <AdminRestaurantSectionSettings />

      <AdminMarqueeSettings />

      <AdminReservationFormSettings />

      <div className="mt-6">
        <AdminClosureSettings />
      </div>


      <WhatsAppNotificationSettings />

      <EmailTemplateSettings />

      <PdfMenuSettings />

      <TableCapacitySettings />
      <TimeSlotConfiguration />
    </div>
  );

  const renderLogsSection = () => <AdminLogsTab />;
  const renderTranslationsSection = () => <AdminTranslationsEditor />;
  const renderFeedbackSection = () => <AdminFeedbackManagement />;
  const renderTimesheetsSection = () => <AdminTimesheetView />;
  const renderKotsSection = () => <AdminKotsView />;
  const renderBillingSection = () => <SettlementBillingView />;
  const renderWaitersSection = () => <AdminWaiterManagement />;
  const renderStockManagersSection = () => <AdminStockManagement />;
  const renderKitchenManagersSection = () => <AdminStaffAccounts role="kitchen_manager" icon={CookingPot} />;
  const renderCashiersSection = () => <AdminStaffAccounts role="cashier" icon={Banknote} />;
  const renderAuditorsSection = () => <AdminStaffAccounts role="auditor" icon={ShieldCheck} />;
  const renderStaffAppSection = () => <div className="p-2"><StaffAppDownload /></div>;
  const renderKotPrintOrderSection = () => <AdminKotPrintOrder />;
  const renderAnalysisSection = () => <AdminAnalysisView />;

  return (
    <>
      <Helmet><title>{t('adminDashboard')} - Tripti Genusswelt</title></Helmet>
      
      <main className="h-full py-6 md:py-12 bg-muted/30 md:bg-background">
        <div className="mx-auto max-w-7xl px-mobile">
          
          {/* Pending reservation requests — sticky attention panel that
              blinks at the top of the Admin Dashboard and stays visible
              while ANY genuinely pending (status=Pending AND unassigned)
              reservation remains. Once the last one is handled via the
              existing workflow (Auto/Manual Fit, approve, decline, delete),
              the panel is removed from the DOM entirely. Reuses the existing
              pending filter + realtime refresh, so assigned/handled
              reservations never linger here. */}
          {!pendingLoading && pendingReservations.length > 0 && (
            <div className="pending-sticky-panel mb-6 md:mb-8 rounded-2xl border-2 border-secondary bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-3 px-5 py-4 bg-secondary/15 border-b-2 border-secondary/40">
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shadow-sm">
                    <Receipt className="h-6 w-6" />
                  </div>
                  <span className="pending-sticky-badge-blink absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow-sm">
                    {pendingReservations.length}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-serif font-bold text-primary leading-tight flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-secondary" /> Pending Reservation Requests
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium">
                    {pendingReservations.length} request{pendingReservations.length !== 1 ? 's' : ''} awaiting your review. Handle each one to clear this alert.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleReviewRequests}
                  className="shrink-0 shadow-md"
                  size="sm"
                >
                  Review Requests <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
              <div className="divide-y divide-border/60 max-h-[260px] overflow-y-auto">
                {pendingReservations.map((r) => {
                  const partySize = r.partySize || r.numberOfGuests || 0;
                  const rawDate = (r.reservationDate || '').toString();
                  const dateMatch = rawDate.match(/(\d{4}-\d{2}-\d{2})/);
                  const dateStr = dateMatch ? dateMatch[1] : '';
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setActiveTab('reservations');
                        setReservationView('gantt');
                        if (dateStr) setGanttInitialDate(dateStr);
                        setGanttFocusId(r.id);
                        setGanttFocusGen((g) => g + 1);
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-foreground truncate">{r.guestName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="notranslate" translate="no">{dateStr || '—'}</span>
                          <span>·</span>
                          <span className="notranslate" translate="no">{r.reservationTime || '—'}</span>
                          <span>·</span>
                          <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {partySize}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 shrink-0">Pending</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stock alerts — low/out of stock + expiring/expired lots.
              Visible to admins so stock problems surface on the main dashboard
              without opening the Stock Dashboard. Links through to /stock-dashboard. */}
          <StockAlertsPanel
            pb={pb}
            variant="admin"
            onAction={() => navigate('/stock-dashboard')}
            className="mb-6 md:mb-8"
          />

          <div className="mb-8 md:mb-12 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl md:text-5xl font-serif font-bold text-primary tracking-tight mb-2">{t('adminDashboard')}</h1>
              <div className="w-16 h-1 bg-secondary rounded-full mb-4"></div>
              <p className="text-foreground font-medium max-w-2xl text-base md:text-lg">
                {t('adminDashboardDesc')}
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0 border-primary/30 text-primary hover:bg-primary/5 min-h-touch shadow-sm">
              <Link to="/admin-help">
                <HelpCircle className="h-4 w-4 mr-2" /> Help
              </Link>
            </Button>
          </div>

          {/* Admin Quick Access — navigate to the operational dashboards using
              the same authenticated admin session. No separate login, no
              duplicate account; route guards recognize admin_users. */}
          <div className="mb-8 md:mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            <Button asChild variant="secondary" className="h-auto justify-start py-4 px-5 shadow-md">
              <Link to="/waiter-dashboard">
                <ConciergeBell className="h-6 w-6 mr-3 shrink-0" />
                <span className="flex flex-col items-start text-left">
                  <span className="font-bold text-base">Open Waiter Dashboard</span>
                  <span className="text-xs font-medium opacity-80">Place orders & manage tables</span>
                </span>
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-auto justify-start py-4 px-5 shadow-md">
              <Link to="/kds-dashboard">
                <ChefHat className="h-6 w-6 mr-3 shrink-0" />
                <span className="flex flex-col items-start text-left">
                  <span className="font-bold text-base">Open KDS Dashboard</span>
                  <span className="text-xs font-medium opacity-80">Kitchen order display</span>
                </span>
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-auto justify-start py-4 px-5 shadow-md">
              <Link to="/stock-dashboard">
                <PackageCheck className="h-6 w-6 mr-3 shrink-0" />
                <span className="flex flex-col items-start text-left">
                  <span className="font-bold text-base">Open Stock Dashboard</span>
                  <span className="text-xs font-medium opacity-80">Inventory & waste management</span>
                </span>
              </Link>
            </Button>
          </div>

          {isMobile ? (
            <Accordion
              type="single"
              collapsible
              value={activeTab}
              onValueChange={(v) => { if (v) setActiveTab(v); }}
              className="space-y-4 pb-12"
            >
              <AccordionItem value="orders" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ShoppingBag className="w-5 h-5 mr-4 text-primary"/> {t('tab_orders')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderOrdersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="kots" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ChefHat className="w-5 h-5 mr-4 text-primary"/> {t('tab_kots')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderKotsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="billing" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Receipt className="w-5 h-5 mr-4 text-primary"/> Billing</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderBillingSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="rksv-diagnostics" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Settings className="w-5 h-5 mr-4 text-primary"/> RKSV Diagnostics</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50"><AdminRksvDiagnostics/></AccordionContent>
              </AccordionItem>

              <AccordionItem value="reservations" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><CalendarDays className="w-5 h-5 mr-4 text-primary"/> {t('tab_reservations')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderReservationsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="tables" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><LayoutGrid className="w-5 h-5 mr-4 text-primary"/> {t('tab_tables')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTablesSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="menu" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><UtensilsCrossed className="w-5 h-5 mr-4 text-primary"/> {t('menuManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderMenuSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="kot-print-order" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Printer className="w-5 h-5 mr-4 text-primary"/> KOT Print Order</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderKotPrintOrderSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="feedback" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><MessageSquare className="w-5 h-5 mr-4 text-primary"/> {t('feedbackManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderFeedbackSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="translations" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Globe className="w-5 h-5 mr-4 text-primary"/> {t('translationsManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTranslationsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="settings" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Settings className="w-5 h-5 mr-4 text-primary"/> {t('tab_systemSettings')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderSettingsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="logs" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><FileText className="w-5 h-5 mr-4 text-primary"/> {t('tab_activityLogs')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderLogsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="timesheets" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Clock className="w-5 h-5 mr-4 text-primary"/> {t('tab_timesheets')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTimesheetsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="waiters" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ConciergeBell className="w-5 h-5 mr-4 text-primary"/> {t('tab_waiters')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderWaitersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="stock-managers" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><PackageCheck className="w-5 h-5 mr-4 text-primary"/> {t('tab_stockManagers')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderStockManagersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="kitchen-managers" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><CookingPot className="w-5 h-5 mr-4 text-primary"/> {roleTitle('kitchen_manager')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderKitchenManagersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="cashiers" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Banknote className="w-5 h-5 mr-4 text-primary"/> {roleTitle('cashier')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderCashiersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="auditors" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ShieldCheck className="w-5 h-5 mr-4 text-primary"/> {roleTitle('auditor')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderAuditorsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="staff-app" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Smartphone className="w-5 h-5 mr-4 text-primary"/> {language === 'en' ? 'Staff app' : 'Mitarbeiter-App'}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderStaffAppSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="analysis" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><BarChart3 className="w-5 h-5 mr-4 text-primary"/> Analysis</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderAnalysisSection()}</AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-8 p-2 bg-card border-2 border-border rounded-2xl shadow-sm w-fit">
                <button onClick={() => setActiveTab('orders')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'orders' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ShoppingBag className="h-4 w-4 mr-2" /> {t('tab_orders')}
                </button>
                <button onClick={() => setActiveTab('kots')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'kots' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ChefHat className="h-4 w-4 mr-2" /> {t('tab_kots')}
                </button>
                <button onClick={() => setActiveTab('billing')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'billing' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Receipt className="h-4 w-4 mr-2" /> Billing
                </button>
                <button onClick={() => setActiveTab('rksv-diagnostics')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'rksv-diagnostics' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Settings className="h-4 w-4 mr-2" /> RKSV Diagnostics
                </button>
                <button onClick={() => setActiveTab('reservations')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'reservations' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <CalendarDays className="h-4 w-4 mr-2" /> {t('tab_reservations')}
                </button>
                <button onClick={() => setActiveTab('tables')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'tables' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <LayoutGrid className="h-4 w-4 mr-2" /> {t('tab_tables')}
                </button>
                <button onClick={() => setActiveTab('menu')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'menu' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <UtensilsCrossed className="h-4 w-4 mr-2" /> {t('menuManagement')}
                </button>
                <button onClick={() => setActiveTab('kot-print-order')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'kot-print-order' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Printer className="h-4 w-4 mr-2" /> KOT Print Order
                </button>
                <button onClick={() => setActiveTab('feedback')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'feedback' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <MessageSquare className="h-4 w-4 mr-2" /> {t('feedbackManagement')}
                </button>
                <button onClick={() => setActiveTab('translations')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'translations' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Globe className="h-4 w-4 mr-2" /> {t('translationsManagement')}
                </button>
                <button onClick={() => setActiveTab('settings')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'settings' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Settings className="h-4 w-4 mr-2" /> {t('tab_settings')}
                </button>
                <button onClick={() => setActiveTab('logs')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'logs' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <FileText className="h-4 w-4 mr-2" /> {t('tab_logs')}
                </button>
                <button onClick={() => setActiveTab('timesheets')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'timesheets' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Clock className="h-4 w-4 mr-2" /> {t('tab_timesheets')}
                </button>
                <button onClick={() => setActiveTab('waiters')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'waiters' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ConciergeBell className="h-4 w-4 mr-2" /> {t('tab_waiters')}
                </button>
                <button onClick={() => setActiveTab('stock-managers')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'stock-managers' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <PackageCheck className="h-4 w-4 mr-2" /> {t('tab_stockManagers')}
                </button>
                <button onClick={() => setActiveTab('kitchen-managers')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'kitchen-managers' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <CookingPot className="h-4 w-4 mr-2" /> {roleTitle('kitchen_manager')}
                </button>
                <button onClick={() => setActiveTab('cashiers')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'cashiers' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Banknote className="h-4 w-4 mr-2" /> {roleTitle('cashier')}
                </button>
                <button onClick={() => setActiveTab('auditors')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'auditors' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ShieldCheck className="h-4 w-4 mr-2" /> {roleTitle('auditor')}
                </button>
                <button onClick={() => setActiveTab('staff-app')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'staff-app' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Smartphone className="h-4 w-4 mr-2" /> {language === 'en' ? 'Staff app' : 'Mitarbeiter-App'}
                </button>
                <button onClick={() => setActiveTab('analysis')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'analysis' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <BarChart3 className="h-4 w-4 mr-2" /> Analysis
                </button>
              </div>

              <div className="bg-card border-2 border-border rounded-3xl p-2 shadow-xl min-h-[600px] animate-in fade-in duration-300">
                {activeTab === 'orders' && renderOrdersSection()}
                {activeTab === 'kots' && renderKotsSection()}
                {activeTab === 'billing' && renderBillingSection()}
                {activeTab === 'rksv-diagnostics' && <AdminRksvDiagnostics/>}
                {activeTab === 'reservations' && renderReservationsSection()}
                {activeTab === 'tables' && renderTablesSection()}
                {activeTab === 'menu' && renderMenuSection()}
                {activeTab === 'kot-print-order' && renderKotPrintOrderSection()}
                {activeTab === 'feedback' && renderFeedbackSection()}
                {activeTab === 'translations' && renderTranslationsSection()}
                {activeTab === 'settings' && renderSettingsSection()}
                {activeTab === 'logs' && renderLogsSection()}
                {activeTab === 'timesheets' && renderTimesheetsSection()}
                {activeTab === 'waiters' && renderWaitersSection()}
                {activeTab === 'stock-managers' && renderStockManagersSection()}
                {activeTab === 'kitchen-managers' && renderKitchenManagersSection()}
                {activeTab === 'cashiers' && renderCashiersSection()}
                {activeTab === 'auditors' && renderAuditorsSection()}
                {activeTab === 'staff-app' && renderStaffAppSection()}
                {activeTab === 'analysis' && renderAnalysisSection()}
              </div>
            </>
          )}
        </div>
      </main>
      <StaffChat role="admin" userId={currentAdmin?.id} pbClient={pb} displayName={currentAdmin?.name || currentAdmin?.email || t('adminDisplayName')} />
    </>
  );
}
