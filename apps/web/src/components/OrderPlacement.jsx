import React, { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import defaultPb from '@/lib/pocketbaseClient.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Plus, Minus, Trash2, Send, Loader2, Search, UtensilsCrossed, Printer,
  CheckCircle2, Flame, ListOrdered, RefreshCw, DoorOpen, ShoppingCart, ArrowLeft,
  CircleStop, Layers, XCircle, Ban, CreditCard, Check, Banknote, AlertTriangle, Bell,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { printKOT, openKOT, SPICE_LEVELS, resolveOrderId, resolveBaseOrderId } from '@/lib/kotPrint.js';
import { buildGroupMap, tableDisplayForParent, isSharedParent } from '@/lib/tableGroups.js';
import { isKotDelayed, DELAYED_CARD_CLS } from '@/lib/kotDelayed.js';
import KotDelayedBadge from '@/components/KotDelayedBadge.jsx';
import { usePrintSettings, canPrint, shouldAutoPrint } from '@/hooks/usePrintSettings.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const SPICE_CLS = {
  Mild: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  Medium: 'bg-amber-100 text-amber-700 border-amber-300',
  Hot: 'bg-orange-100 text-orange-700 border-orange-300',
  'Very Hot': 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_META = {
  pending: { label: 'Pending', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  preparing: { label: 'Preparing', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  ready: { label: 'Ready to Pickup', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 animate-pulse' },
  completed: { label: 'Served', cls: 'bg-muted text-muted-foreground border-border' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-700 border-red-500/40 line-through' },
};

// Reason shown when a KOT cannot be cancelled, keyed by its current status.
const CANCEL_BLOCKED_MSG = {
  preparing: 'Cannot cancel — ticket is already being prepared',
  ready: 'Cannot cancel — ticket is ready for service',
  completed: 'Cannot cancel — ticket has been served',
  cancelled: 'Cannot cancel — ticket was already cancelled',
};

// ---- Ready-for-Pickup notification sound (Web Audio API) ----
// Generates a bright ascending chime entirely in the browser — no audio
// asset required — so the waiter hears a noticeable alert the moment a KOT
// reaches Ready to Pickup. This is INDEPENDENT of vibration: it plays
// whenever the Web Audio API is available, even if navigator.vibrate is
// unsupported or blocked by browser/device permissions. The AudioContext is
// created lazily and reused; a suspended context (autoplay policy) is
// resumed defensively so the chime still plays after the waiter has
// interacted with the page (login / order entry).
let _readyAudioCtx = null;
function playReadyChime() {
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    if (!_readyAudioCtx) _readyAudioCtx = new AC();
    const ctx = _readyAudioCtx;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    const start = ctx.currentTime;
    // A5 → D6 → G6: bright, ascending, hard to miss in a busy room.
    const notes = [880, 1174.66, 1567.98];
    notes.forEach((freq, i) => {
      const t0 = start + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    });
  } catch (_) { /* Web Audio unavailable — visual banner + vibration still fire */ }
}

const OrderPlacementComponent = forwardRef(function OrderPlacement({ placedBy, placedByRole, onPlaced, pbClient, showActiveTab = true, initialTab = 'place' }, ref) {
  const pb = pbClient || defaultPb;
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [maxTableNumber, setMaxTableNumber] = useState(9);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const tableSelectRef = useRef(null);

  // Live clock for delayed-state calculation in the Active tab. Ticks every
  // second so the shared isKotDelayed() check (pending 5+ minutes) updates
  // consistently with KDS and Admin — no separate per-screen timer, just the
  // same calculation against the KOT's creation timestamp.
  const [now, setNow] = useState(() => Date.now());

  // ---- Ready-for-Pickup real-time notification ----
  // When the Kitchen moves a KOT to `ready` (Ready to Pickup), the Waiter is
  // notified immediately via the existing kitchen_orders realtime stream:
  //   • device/browser vibration (enhancement where supported / permitted)
  //   • a clear popup/toast naming the Order/KOT and table
  // Vibration is feature-detected and silently skipped when unsupported or
  // blocked; the popup toast always shows. No separate Waiter status field
  // is introduced — this only reacts to the existing kitchen_orders.status.
  const { t } = useLanguage();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  // Mirror of the latest fetched orders (with expanded parentOrder) so the
  // realtime handler can resolve the human-readable Order ID for display.
  const ordersRef = useRef([]);
  // Previous status per KOT id, so we only notify on an actual transition
  // INTO `ready` (not on every realtime tick or re-fetch).
  const prevStatusRef = useRef(new Map());
  useEffect(() => {
    ordersRef.current = orders;
    const m = new Map();
    orders.forEach((o) => m.set(o.id, o.status));
    prevStatusRef.current = m;
  }, [orders]);

  // KOTs the waiter has acknowledged (dismissed the banner or opened the
  // Active tab) so the persistent Ready-for-Pickup banner does not reappear
  // for them. The banner is derived from live `orders` (status === 'ready')
  // MINUS this set, so it persists until acknowledged OR until the KOT leaves
  // ready (served/cancelled). Reset only when the KOT transitions out of
  // ready (see handleKitchenEvent) so a future ready transition can alert again.
  const [acknowledgedReadyIds, setAcknowledgedReadyIds] = useState(() => new Set());
  // Ref mirror of the current unacknowledged ready KOT ids so stable
  // callbacks (toast action, banner buttons) acknowledge without stale closures.
  const readyIdsRef = useRef([]);

  const acknowledgeAllReady = useCallback(() => {
    const ids = readyIdsRef.current;
    if (!ids || ids.length === 0) return;
    setAcknowledgedReadyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const dismissReadyPickup = useCallback((id) => {
    if (!id) return;
    setAcknowledgedReadyIds((prev) => new Set(prev).add(id));
  }, []);

  const notifyReadyForPickup = useCallback((kot) => {
    // Sound — INDEPENDENT of vibration. Plays a noticeable chime via the
    // Web Audio API whenever available, even if vibration is unsupported or
    // blocked by browser/device permissions.
    playReadyChime();

    // Vibration — enhancement only. Wrapped so unsupported/blocked APIs
    // never throw and never block the sound or the persistent banner.
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([300, 120, 300, 120, 500]);
      }
    } catch (_) { /* vibration unsupported or blocked — sound + banner still fire */ }

    // Transient toast (secondary, auto-dismisses). The persistent banner is
    // the primary visual indication that remains until acknowledged.
    const tt = tRef.current;
    const kotId = resolveOrderId(kot) || kot.id;
    const table = (kot.expand && kot.expand.parentOrder && kot.expand.parentOrder.tableNumber) || kot.tableNumber || '';
    const body = tt('waiter_readyPickupBody')
      .replace('{kotId}', kotId)
      .replace('{table}', table || '—');
    toast(tt('waiter_readyPickupTitle'), {
      description: body,
      icon: '🔔',
      duration: 12000,
      action: {
        label: tt('waiter_readyPickupView'),
        onClick: () => { acknowledgeAllReady(); setTab('active'); },
      },
    });
  }, [acknowledgeAllReady]);

  // Detect a KOT transitioning INTO `ready` from the realtime event and
  // fire the Ready-for-Pickup notification. Uses the expanded record from
  // the last fetch for display (the raw event record has no expand).
  const handleKitchenEvent = useCallback((e) => {
    if (!e || !e.record) return;
    const rec = e.record;
    const prevStatus = prevStatusRef.current.get(rec.id);
    // Transition INTO ready → fire sound + vibration + toast. The persistent
    // banner appears automatically because it is derived from `orders`.
    if (rec.status === 'ready' && prevStatus !== 'ready') {
      const existing = ordersRef.current.find((o) => o.id === rec.id) || rec;
      notifyReadyForPickup(existing);
    }
    // Transition OUT of ready → drop from acknowledged so a future ready
    // transition can alert again, and the banner clears naturally (the KOT
    // is no longer ready so it drops out of the derived list).
    if (rec.status !== 'ready' && prevStatus === 'ready') {
      setAcknowledgedReadyIds((prev) => {
        if (!prev.has(rec.id)) return prev;
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });
    }
  }, [notifyReadyForPickup]);

  // Sticky tab bar offset — the site header + marquee bar are fixed/sticky
  // at the top of the viewport (z-50 / z-40). The tab bar must stick BELOW
  // them or it gets hidden behind that chrome when scrolling. We measure
  // their combined height and use it as the tab bar's sticky `top`.
  const [stickyTop, setStickyTop] = useState(0);
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const tabBarRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('.sticky-header');
      const marquee = document.querySelector('.marquee-bar-sticky');
      const h = header ? header.offsetHeight : 0;
      const m = marquee ? marquee.offsetHeight : 0;
      setStickyTop(h + m);
      if (tabBarRef.current) setTabBarHeight(tabBarRef.current.offsetHeight);
    };
    measure();
    // Marquee text loads asynchronously; re-measure shortly after mount.
    const t1 = setTimeout(measure, 400);
    const t2 = setTimeout(measure, 1200);
    window.addEventListener('resize', measure);
    let ro = null;
    if (tabBarRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(tabBarRef.current);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  // Unacknowledged KOTs currently in Ready-to-Pickup state. Drives the
  // persistent on-screen banner. Derived from live `orders` (realtime)
  // MINUS the acknowledged set, so it survives re-renders/refreshes and
  // only clears when the waiter acknowledges (View/Dismiss) or the KOT
  // leaves ready (served/cancelled). On a fresh load no transition fires
  // (prevStatusRef is seeded from current statuses) so no sound replays,
  // but still-ready unacknowledged KOTs still show the banner.
  const readyPickups = useMemo(() => {
    return orders
      .filter((o) => o.status === 'ready' && !acknowledgedReadyIds.has(o.id))
      .map((o) => ({
        id: o.id,
        kotId: resolveOrderId(o) || o.id,
        table: (o.expand && o.expand.parentOrder && o.expand.parentOrder.tableNumber) || o.tableNumber || '',
        orderId: (o.expand && o.expand.parentOrder && o.expand.parentOrder.orderId) || '',
      }));
  }, [orders, acknowledgedReadyIds]);

  // Height of the persistent Ready-for-Pickup banner (0 when hidden). Used to
  // push the sticky tab bar (and the Order tab's sticky header) down so the
  // banner never covers navigation while it is visible.
  const [readyBannerHeight, setReadyBannerHeight] = useState(0);
  const readyBannerRef = useRef(null);
  useEffect(() => {
    const el = readyBannerRef.current;
    if (!el) {
      setReadyBannerHeight(0);
      return undefined;
    }
    const measure = () => setReadyBannerHeight(el.offsetHeight || 0);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [readyPickups.length]);

  // Keep a ref of current unacknowledged ready ids for stable callbacks.
  useEffect(() => {
    readyIdsRef.current = readyPickups.map((r) => r.id);
  }, [readyPickups]);

  // Opening the Active tab acknowledges all currently-ready pickups — the
  // waiter is now looking at them, so the banner is no longer needed.
  useEffect(() => {
    if (tab === 'active') acknowledgeAllReady();
  }, [tab, acknowledgeAllReady]);

  // Expose setTabToPlace method via ref for Waiter Mode. Always resets
  // scroll to top — even when already on the 'place' tab (where the tab
  // value wouldn't change and the [tab] effect wouldn't fire).
  useImperativeHandle(ref, () => ({
    setTabToPlace: () => {
      setTab('place');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (typeof document !== 'undefined') {
        document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    },
  }), []);

  // Reset scroll to the top whenever the active tab changes. This covers
  // switching between New Order / Order / Active tabs AND navigation
  // actions that return to another screen (Back, Cancel, View Order pill,
  // Waiter Mode) — all of them call setTab(...). The page itself scrolls
  // with the window (the waiter header is sticky in normal document flow),
  // so we scroll the window back to the top so the destination screen opens
  // at its first content. Inner scroll containers (e.g. the order items
  // list) are remounted fresh by Radix Tabs on tab switch, so they reset
  // naturally. Cart/order state, selected table, filters and all business
  // logic are untouched — only the scroll position is reset.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [tab]);

  // Order ticket state
  const [tableNumber, setTableNumber] = useState('');
  const [room, setRoom] = useState('');
  const [notes, setNotes] = useState('');
  const [order, setOrder] = useState({}); // id -> {item, qty, spiceLevel}
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  // Walk-in is the default for every new order; the waiter can switch to
  // Pre-order before sending when needed.
  const [orderType, setOrderType] = useState('walkin');
  // When KOT creation fails after the parent waiter_orders record was
  // created, we keep the parent here so a retry reuses the same orderId
  // instead of generating a new one.
  const [pendingParent, setPendingParent] = useState(null);
  // ---- Combine Tables (Linked Orders) — Phase 2 ----
  // When combineMode is true, the waiter multi-selects 2+ available tables
  // and the same order items are sent to each table as its OWN independent
  // parent Order + KOT, all linked via one table_groups row. When false,
  // the existing single-table flow is completely unchanged.
  const [combineMode, setCombineMode] = useState(false);
  // Which Combine Tables mode is active: 'linked' (each table its own
  // Order/KOT/bill) or 'shared' (one parent Order, one Order ID, one KOT
  // stream, one combined bill across all selected tables). Defaults to
  // 'linked' so the existing Linked Orders flow is selected first when the
  // waiter enables Combine Tables.
  const [combineModeType, setCombineModeType] = useState('linked');
  // Array of selected table_configurations `name` values (combine mode).
  const [selectedTables, setSelectedTables] = useState([]);
  // Retry state for a partially-failed combined submission:
  //   { groupId, succeeded: [tableName], pendingTables: [tableName] }
  // Preserves the created table_groups row + successfully sent tables so a
  // retry only re-sends the failed tables without duplicate Orders/KOTs.
  const [pendingCombined, setPendingCombined] = useState(null);
  // Retry state for a partially-failed Shared Order submission:
  //   { groupId, parent, allTables, pendingTables, kotCreated }
  // Preserves the created table_groups row, the single parent Order, and
  // which member tables still need to be added / whether the combined KOT
  // was already created, so a retry only completes the missing pieces
  // without duplicate Orders / KOTs / members.
  const [pendingShared, setPendingShared] = useState(null);
  // ---- Linked Orders active-table phase ----
  // After the waiter selects 2+ tables and starts the linked group, the
  // group + members are created and the waiter enters an "active table"
  // phase: they pick ONE table at a time and add items ONLY to that table's
  // independent waiter_orders Order. Items are NEVER duplicated across the
  // linked tables (that would make it behave like a Shared Order). Each
  // linked table keeps its own cart so switching tables does not lose or
  // transfer items.
  // linkedGroupId: the created table_groups (mode=linked) id.
  // linkedGroupCreated: true once the group + members exist (active phase).
  // activeLinkedTable: the table currently receiving item entries.
  // linkedCarts: { [tableName]: { order, notes, spiceSelections } } — a
  //   separate cart per linked table, swapped in/out on table switch.
  const [linkedGroupId, setLinkedGroupId] = useState(null);
  const [linkedGroupCreated, setLinkedGroupCreated] = useState(false);
  const [activeLinkedTable, setActiveLinkedTable] = useState('');
  const [linkedCarts, setLinkedCarts] = useState({});
  // Active table_group_members rows (isActive = true) — used to mark tables
  // already in a combination as unavailable for selection.
  const [tableGroupMembers, setTableGroupMembers] = useState([]);
  // table_groups records — used for the Active-tab Combine Tables headings.
  const [tableGroups, setTableGroups] = useState([]);
  // Parent order targeted by the End Order confirmation dialog.
  // Shape: { parent, kots } | null
  const [endOrderTarget, setEndOrderTarget] = useState(null);
  // ---- Linked Orders group-level actions ----
  // A linked group (table_groups) targeted by a group-level End All or Free
  // All confirmation. Shape: { tableGroupId, entries: [{ parent, kots }] }.
  // The group-level action iterates every member and runs the EXISTING
  // per-Order validation for each — it never force-closes or force-frees an
  // Order that does not satisfy its own prerequisites.
  const [groupEndTarget, setGroupEndTarget] = useState(null);
  const [groupFreeTarget, setGroupFreeTarget] = useState(null);
  // KOT record targeted by the Cancel Ticket confirmation dialog.
  const [cancelTarget, setCancelTarget] = useState(null);
  // KOT record targeted by the duplicate-print confirmation dialog. Set when
  // a waiter taps Print KOT on a ticket that was already sent (printedAt set
  // AND printCount > 0). The waiter can cancel or choose to send again.
  const [reprintTarget, setReprintTarget] = useState(null);
  // Payment settlement modal state.
  // paymentTarget: { parent, kots } | null — the parent order being settled.
  const [paymentTarget, setPaymentTarget] = useState(null);
  // paymentSelections: { [kotId]: { [itemIndex]: true } } — which unpaid line
  // entries the waiter has ticked for settlement in the payment modal.
  const [paymentSelections, setPaymentSelections] = useState({});
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  // Open parent orders with outstanding balances, listed in the Pay picker.
  const [payableOrders, setPayableOrders] = useState([]);
  const [payPickerOpen, setPayPickerOpen] = useState(false);
  // Parent waiter_orders records (for open/closed status + endedAt).
  const [waiterOrders, setWaiterOrders] = useState([]);
  // Per-item spice level selections on the New Order cards (used before an
  // item is added to the order; once in the order the order's spiceLevel wins).
  const [spiceSelections, setSpiceSelections] = useState({});

  // Accordion open state (controlled, multiple)
  const [openCats, setOpenCats] = useState([]);

  // ---- Active tab filter controls (AND-combined) ----
  // The old Order Status dropdown was removed: Active Orders vs Order History
  // is now controlled by the `activeSubTab` sub-tab below. Kitchen Status and
  // Table filters remain and apply within whichever sub-tab is shown.
  // 'active' = open orders (orderStatus !== 'closed'), 'history' = closed.
  const [activeSubTab, setActiveSubTab] = useState('active');
  // Kitchen Status filters on kitchen_orders.status — a parent order matches
  // when AT LEAST ONE child KOT has the selected status (not all children).
  const [filterKitchenStatus, setFilterKitchenStatus] = useState('all');
  // Table filter matches the order's table number (all / 1..maxTableNumber).
  const [filterTable, setFilterTable] = useState('all');
  // Refresh loading state + last-refreshed timestamp for the Active tab.
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ---- Print permission settings (admin-controlled) ----
  // The autoPrint toggle was moved entirely to admin settings; this hook
  // loads the print_settings record and keeps it in sync via realtime.
  const { settings: printSettings } = usePrintSettings(pb);
  // Role + waiter id for permission checks. admin_users always pass.
  const printRole = placedByRole || 'waiter';
  const authRecord = pb.authStore.record || pb.authStore.model;
  const waiterId = authRecord && authRecord.id ? authRecord.id : '';
  const printAllowed = canPrint(printSettings, printRole, waiterId);
  const autoPrintEnabled = shouldAutoPrint(printSettings, printRole, waiterId);

  // ---- Screen persistence (lock / sleep / app-switch) ----
  // The waiter's in-progress draft is mirrored to localStorage so it
  // survives background eviction, device sleep/lock, and app switches
  // better than sessionStorage would. It is restored on mount and whenever
  // the page regains visibility or focus. The draft is cleared ONLY on an
  // explicit Cancel or a successful End Order — never on sleep, background,
  // app-switch, logout, or visibility events. The parent order's
  // orderStatus (open/closed) remains the only governor of order lifetime.
  const DRAFT_KEY = `waiter_draft_${waiterId || placedBy || 'default'}`;

  // Read the draft from localStorage and apply it to state. Used on mount
  // (unconditional) and on visibility/focus regain (guarded by hasWorkRef).
  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      if (draft.tab === 'place' || draft.tab === 'order' || draft.tab === 'active') setTab(draft.tab);
      if (draft.order && typeof draft.order === 'object') setOrder(draft.order);
      if (typeof draft.tableNumber === 'string') setTableNumber(draft.tableNumber);
      if (typeof draft.orderType === 'string') setOrderType(draft.orderType || 'walkin');
      if (draft.pendingParent !== undefined) setPendingParent(draft.pendingParent);
      if (typeof draft.room === 'string') setRoom(draft.room);
      if (typeof draft.notes === 'string') setNotes(draft.notes);
      if (draft.spiceSelections && typeof draft.spiceSelections === 'object') setSpiceSelections(draft.spiceSelections);
      if (typeof draft.combineMode === 'boolean') setCombineMode(draft.combineMode);
      if (typeof draft.combineModeType === 'string') setCombineModeType(draft.combineModeType === 'shared' ? 'shared' : 'linked');
      if (Array.isArray(draft.selectedTables)) setSelectedTables(draft.selectedTables);
      if (draft.pendingCombined !== undefined) setPendingCombined(draft.pendingCombined);
      if (draft.pendingShared !== undefined) setPendingShared(draft.pendingShared);
      if (typeof draft.linkedGroupCreated === 'boolean') setLinkedGroupCreated(draft.linkedGroupCreated);
      if (draft.linkedGroupId !== undefined) setLinkedGroupId(draft.linkedGroupId);
      if (typeof draft.activeLinkedTable === 'string') setActiveLinkedTable(draft.activeLinkedTable);
      if (draft.linkedCarts && typeof draft.linkedCarts === 'object') setLinkedCarts(draft.linkedCarts);
    } catch (_) { /* ignore malformed draft */ }
  }, [DRAFT_KEY]);

  // Remove the persisted draft. Called on Cancel and on successful End Order.
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* ignore */ }
  }, [DRAFT_KEY]);

  // Restore the draft once on mount so a page reload after background
  // eviction picks up exactly where the waiter left off.
  useEffect(() => {
    restoreDraft();
  }, [restoreDraft]);

  // Whether the waiter currently has any in-memory working state. Updated
  // every render (not in an effect) so the visibility/focus listeners can
  // read the freshest value via a ref without re-binding.
  const hasWorkRef = useRef(false);
  hasWorkRef.current =
    Object.keys(order).length > 0 ||
    !!tableNumber ||
    !!orderType ||
    !!pendingParent ||
    combineMode ||
    selectedTables.length > 0 ||
    !!pendingCombined ||
    !!pendingShared ||
    linkedGroupCreated ||
    !!activeLinkedTable;

  // Mirror working state to localStorage on every change. Skip the first
  // run (mount) so the draft is not overwritten before the restore effect
  // above has applied it. When there is nothing meaningful to persist, the
  // key is removed so Cancel (which empties every field) naturally clears
  // the draft without needing an explicit clearDraft call.
  const skipSaveRef = useRef(true);
  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const hasData =
      Object.keys(order).length > 0 ||
      !!tableNumber ||
      !!orderType ||
      !!pendingParent ||
      combineMode ||
      selectedTables.length > 0 ||
      !!pendingCombined ||
      !!pendingShared ||
      linkedGroupCreated ||
      !!activeLinkedTable ||
      tab !== 'place';
    if (!hasData) {
      clearDraft();
      return;
    }
    // Merge the active table's live working cart into the persisted
    // linkedCarts so a reload mid-edit keeps the active table's items
    // (linkedCarts is otherwise only updated on table switch / send).
    const draftLinkedCarts = { ...(linkedCarts || {}) };
    if (linkedGroupCreated && activeLinkedTable) {
      draftLinkedCarts[activeLinkedTable] = { order, notes, spiceSelections };
    }
    const draft = {
      v: 1,
      tab,
      order,
      tableNumber,
      orderType,
      pendingParent,
      room,
      notes,
      spiceSelections,
      combineMode,
      combineModeType,
      selectedTables,
      pendingCombined,
      pendingShared,
      linkedGroupId,
      linkedGroupCreated,
      activeLinkedTable,
      linkedCarts: draftLinkedCarts,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_) { /* ignore quota errors */ }
  }, [DRAFT_KEY, tab, order, tableNumber, orderType, pendingParent, room, notes, spiceSelections, combineMode, selectedTables, pendingCombined, linkedGroupId, linkedGroupCreated, activeLinkedTable, linkedCarts, clearDraft]);

  // Re-restore on visibility regain / focus after sleep, lock, or app
  // switch. Guarded by hasWorkRef so an actively-edited draft is never
  // clobbered by a stale localStorage snapshot — restoration only happens
  // when there is no in-memory work (e.g. after background eviction).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && !hasWorkRef.current) restoreDraft();
    };
    const onFocus = () => {
      if (!hasWorkRef.current) restoreDraft();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [restoreDraft]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [menu, tbl, settings] = await Promise.all([
        pb.collection('menu_items').getFullList({ sort: 'category,name', $autoCancel: false }),
        pb.collection('table_configurations').getFullList().catch(() => []),
        pb.collection('table_settings').getFullList().catch(() => []),
      ]);
      setMenuItems(menu);
      setTables(tbl);
      if (settings && settings.length > 0 && settings[0].maxTableNumber) {
        setMaxTableNumber(Number(settings[0].maxTableNumber) || 9);
      }
    } catch (err) {
      console.error('Failed to load order data:', err);
      toast.error('Failed to load menu / tables');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await pb.collection('kitchen_orders').getList(1, 100, {
        sort: '-created',
        expand: 'parentOrder',
        $autoCancel: false,
      });
      setOrders(res.items);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    try {
      const res = await pb.collection('table_configurations').getFullList({ sort: 'name', $autoCancel: false });
      setTables(res);
    } catch (_) { /* ignore */ }
  }, []);

  const fetchTableSettings = useCallback(async () => {
    try {
      const res = await pb.collection('table_settings').getFullList({ $autoCancel: false });
      if (res && res.length > 0 && res[0].maxTableNumber) {
        setMaxTableNumber(Number(res[0].maxTableNumber) || 9);
      }
    } catch (_) { /* ignore — fall back to default */ }
  }, []);

  const fetchWaiterOrders = useCallback(async () => {
    try {
      const res = await pb.collection('waiter_orders').getList(1, 100, {
        sort: '-created',
        $autoCancel: false,
      });
      setWaiterOrders(res.items);
    } catch (_) { /* ignore */ }
  }, []);

  // All table_group_members rows (active AND inactive) — the source of truth
  // for which tables belong to which combination. Used for Shared Order
  // display ("Tables 4 + 5 + 6") in the Active tab, KDS, and printing.
  // Subscribed via realtime so the New Order multi-select list and the
  // Active-tab headings update the moment a combination is created or
  // closed by any waiter.
  const fetchTableGroupMembers = useCallback(async () => {
    try {
      const res = await pb.collection('table_group_members').getFullList({
        $autoCancel: false,
      });
      setTableGroupMembers(res || []);
    } catch (_) { /* ignore — collection may be empty */ }
  }, []);

  // table_groups records — used for the Active-tab Combine Tables headings
  // (label + status). Subscribed via realtime so headings stay current.
  const fetchTableGroups = useCallback(async () => {
    try {
      const res = await pb.collection('table_groups').getFullList({
        sort: '-created',
        $autoCancel: false,
      });
      setTableGroups(res || []);
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    loadData();
    fetchOrders();
    fetchTables();
    fetchTableSettings();
    fetchWaiterOrders();
    fetchTableGroupMembers();
    fetchTableGroups();
    pb.collection('kitchen_orders').subscribe('*', (e) => {
      handleKitchenEvent(e);
      fetchOrders();
    });
    // Real-time: refresh tables & settings when admin changes them.
    pb.collection('table_configurations').subscribe('*', () => fetchTables());
    pb.collection('table_settings').subscribe('*', () => fetchTableSettings());
    // Parent order status changes (open → closed via End Order) refresh both
    // the parent list and the KOT list (so expand parentOrder stays fresh).
    pb.collection('waiter_orders').subscribe('*', () => {
      fetchWaiterOrders();
      fetchOrders();
    });
    // Combine Tables: keep active memberships + groups fresh across waiters.
    pb.collection('table_group_members').subscribe('*', () => fetchTableGroupMembers());
    pb.collection('table_groups').subscribe('*', () => fetchTableGroups());
    const poll = setInterval(fetchOrders, 12000);
    // Tick the live clock for delayed-state highlighting in the Active tab.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      pb.collection('kitchen_orders').unsubscribe('*');
      pb.collection('table_configurations').unsubscribe('*');
      pb.collection('table_settings').unsubscribe('*');
      pb.collection('waiter_orders').unsubscribe('*');
      pb.collection('table_group_members').unsubscribe('*');
      pb.collection('table_groups').unsubscribe('*');
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchOrders, fetchTables, fetchTableSettings, fetchWaiterOrders, fetchTableGroupMembers, fetchTableGroups, handleKitchenEvent]);

  // Extract a numeric table number from a table record's name (e.g. "5",
  // "Table 7"). Returns NaN when no number is found.
  const parseTableNum = useCallback((value) => {
    if (value === null || value === undefined) return NaN;
    const m = String(value).match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  }, []);

  // Tables offered in the waiter selector: only active tables whose numeric
  // table number falls within the configured [1, maxTableNumber] range.
  const activeTables = useMemo(() => {
    return tables
      .filter((t) => t.isActive !== false)
      .filter((t) => {
        const num = parseTableNum(t.name) || NaN;
        if (Number.isNaN(num)) return false;
        return num >= 1 && num <= maxTableNumber;
      })
      .sort((a, b) => {
        const na = parseTableNum(a.name) || 0;
        const nb = parseTableNum(b.name) || 0;
        return na - nb;
      });
  }, [tables, maxTableNumber, parseTableNum]);

  // Table occupancy — the SINGLE source of truth. A table is occupied when
  // its MOST RECENT waiter_orders record has NOT been freed (freed != true).
  // This deliberately includes CLOSED-but-not-freed orders, so ending an
  // order (End Order) does NOT release the table — only the explicit Free
  // Table action (which sets freed = true) does. table_configurations.isReserved
  // is NOT used. Derived live from the realtime-subscribed waiterOrders list so
  // the dropdown updates the moment an order is opened, ended, or freed.
  const occupiedTableNumbers = useMemo(() => {
    const latestByTable = new Map();
    waiterOrders.forEach((w) => {
      if (!w.tableNumber) return;
      const prev = latestByTable.get(w.tableNumber);
      if (!prev || new Date(w.created) > new Date(prev.created)) {
        latestByTable.set(w.tableNumber, w);
      }
    });
    const s = new Set();
    latestByTable.forEach((w) => {
      if (w.freed !== true) s.add(w.tableNumber);
    });
    return s;
  }, [waiterOrders]);

  // Tables that currently have an OPEN, NOT-yet-ended order. These remain
  // selectable in the single-table dropdown so the waiter can add another
  // KOT to the existing order. End Order sets `endedAt` WITHOUT closing the
  // order, so an ended-but-not-freed table is occupied but NOT open for new
  // KOTs — it is blocked until Free Table is explicitly clicked (which sets
  // orderStatus = "closed" + freed = true).
  const openOrderTableNumbers = useMemo(() => {
    const s = new Set();
    waiterOrders.forEach((w) => {
      if (w.orderStatus === 'open' && !w.endedAt && w.tableNumber) s.add(w.tableNumber);
    });
    return s;
  }, [waiterOrders]);

  // Tables currently in an ACTIVE table_group_members combination. A table in
  // this set is unavailable for both a standalone order and a new combination.
  // Derived live from the realtime-subscribed tableGroupMembers list.
  const activeCombinationTableNumbers = useMemo(() => {
    const s = new Set();
    // Only EXPLICITLY active members (isActive === true) mark a table as
    // part of a combination. This matches the server-side occupancy hooks
    // and the SDK filters (both use `isActive = true`). The previous
    // `isActive !== false` check treated null/undefined as active, which
    // falsely labelled a table "Combined" when a stale or never-set member
    // row lingered (e.g. after the cleanup migration deactivated members
    // but left orphaned rows, or when a bool field serialized as null).
    tableGroupMembers.forEach((m) => {
      if (m.isActive === true && m.tableNumber) s.add(m.tableNumber);
    });
    return s;
  }, [tableGroupMembers]);

  // Map of every table_groups combination -> { mode, status, label, tables }.
  // The source of truth for Shared Order table membership display. Built from
  // the realtime-subscribed tableGroups + tableGroupMembers lists.
  const groupMap = useMemo(() => buildGroupMap(tableGroups, tableGroupMembers), [tableGroups, tableGroupMembers]);

  // Toggle a table in/out of the combine-mode multi-select. Only available
  // tables (active, not occupied, not in an active combination) are togglable.
  const toggleTableSelection = (name, checked) => {
    setSelectedTables((prev) => (checked ? [...prev, name] : prev.filter((n) => n !== name)));
  };

  // Tables shown in the Active tab Table filter dropdown. Uses the actual
  // Admin-configured table_configurations list (name/number) — never
  // generated sequentially. The filter value is the table's `name`, which
  // is what gets stored as the order's `tableNumber` when a waiter selects
  // a table, so filtering matches correctly. Reflects admin changes via the
  // realtime subscription on table_configurations (fetchTables on change).
  const filterTableOptions = useMemo(() => {
    return tables
      .filter((t) => t.isActive !== false)
      .sort((a, b) => {
        const na = parseTableNum(a.name) || 0;
        const nb = parseTableNum(b.name) || 0;
        if (na === nb) {
          return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
        }
        return na - nb;
      });
  }, [tables, parseTableNum]);

  const categories = useMemo(() => [...new Set(menuItems.map((m) => m.category))], [menuItems]);

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.nameEN || '').toLowerCase().includes(q) ||
        (m.nameDE || '').toLowerCase().includes(q)
    );
  }, [menuItems, search]);

  // When searching, auto-expand every category that has matching items.
  // Otherwise default to first category open.
  useEffect(() => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const catsWithMatches = categories.filter((cat) =>
        menuItems.some(
          (m) =>
            m.category === cat &&
            ((m.name || '').toLowerCase().includes(q) ||
              (m.nameEN || '').toLowerCase().includes(q) ||
              (m.nameDE || '').toLowerCase().includes(q))
        )
      );
      setOpenCats(catsWithMatches);
    } else if (categories.length > 0) {
      setOpenCats([categories[0]]);
    }
  }, [search, categories, menuItems]);

  // Spice level shown on a New Order card: the order's value once the item is
  // in the order, otherwise the standalone per-card selection (default Medium).
  const getCardSpice = (itemId) => {
    if (order[itemId]) return order[itemId].spiceLevel || 'Medium';
    return spiceSelections[itemId] || 'Medium';
  };

  const handleCardSpiceChange = (item, spiceLevel) => {
    setSpiceSelections((prev) => ({ ...prev, [item.id]: spiceLevel }));
    if (order[item.id]) {
      setSpice(item.id, spiceLevel);
    }
  };

  const addItem = (item) => {
    const selectedSpice = getCardSpice(item.id);
    setOrder((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: { item, qty: (existing?.qty || 0) + 1, spiceLevel: existing?.spiceLevel || selectedSpice },
      };
    });
  };

  const changeQty = (id, delta) => {
    setOrder((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const qty = existing.qty + delta;
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...existing, qty } };
    });
  };

  const setSpice = (id, spiceLevel) => {
    setOrder((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], spiceLevel } } : prev));
  };

  const removeItem = (id) => {
    setOrder((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const orderEntries = Object.values(order);
  const orderCount = orderEntries.reduce((s, e) => s + e.qty, 0);
  const total = orderEntries.reduce((sum, e) => sum + (e.item.price || 0) * e.qty, 0);

  // Count of order items per category (for accordion badges)
  const countByCategory = useMemo(() => {
    const map = {};
    orderEntries.forEach((e) => {
      const cat = e.item.category;
      map[cat] = (map[cat] || 0) + e.qty;
    });
    return map;
  }, [orderEntries]);

  const markServed = async (order) => {
    try {
      await pb.collection('kitchen_orders').update(order.id, { status: 'completed' }, { $autoCancel: false });
      toast.success(`Ticket ${resolveOrderId(order)} served`);
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update');
    }
  };

  // Free Table — releases the table for a new Order. Governed by TWO
  // business rules, both enforced against live DB state (not only the
  // disabled button):
  //   1. The parent Order must already be ended (endedAt set by End Order).
  //      End Order does NOT close the order — orderStatus stays "open" —
  //      so if the order is not yet ended, the waiter must End Order first.
  //   2. All payment obligations for that order must be fully settled
  //      (outstandingAmount = 0), recomputed from the parent's KOTs so the
  //      check reflects live cleared flags.
  // This is the ONLY action that closes the order AND releases the table:
  // it sets orderStatus = "closed" and freed = true on the parent order,
  // which drops the table from occupiedTableNumbers. End Order only sets
  // endedAt (the order stays "open" and freed = false), so the table stays
  // occupied until this explicit action. It does NOT touch
  // table_configurations.isReserved (admin-only, no longer the occupancy
  // mechanism) and does NOT modify any historical Orders or KOTs. Legacy
  // unparented KOTs (no parent order) skip both checks and simply confirm
  // availability.
  // Release a freed table from its table combination so it immediately
  // becomes selectable again as a normal table. Without this, a freed
  // member stays in `activeCombinationTableNumbers` (its
  // table_group_members.isActive stays true) and the Select-a-Table
  // dropdown keeps marking it "Combined" / blocking standalone selection.
  //
  // Shared Order: one parent spans every member table, so freeing it
  // releases ALL members at once — every active member row is flipped to
  // isActive=false directly, then the table_groups record is closed.
  //
  // Linked Orders: each table has its own parent order, so ONLY this
  // table's table_group_members row is flipped to isActive=false (dropping
  // it from idx_tgm_active_table). The group stays active for any still-
  // occupied members; when the last active member is released the group
  // record is closed for cleanliness. Other members are never touched.
  //
  // Member rows are deactivated directly via the SDK (not only via the
  // table-groups-sync hook) so the dropdown updates immediately even if
  // the hook bundle is stale or a hook errors out.
  const releaseTableFromCombination = useCallback(async (parent) => {
    if (!parent || !parent.tableGroup) return;
    const gid = parent.tableGroup;
    const tn = parent.tableNumber || '';
    try {
      const grp = await pb.collection('table_groups').getOne(gid, { $autoCancel: false });
      if (!grp || grp.status !== 'active') return;

      // Determine which member rows to deactivate. Shared Order: one parent
      // spans every member table, so freeing it releases ALL members at once.
      // Linked Orders: each table has its own parent, so ONLY this table's
      // membership row is released (the group stays active for any still-
      // occupied members).
      //
      // We deactivate the member rows DIRECTLY via the SDK rather than
      // relying solely on the table-groups-sync hook to propagate the
      // parent group's status change. The hook is a belt-and-suspenders
      // mirror; doing it here too guarantees the tables drop out of
      // activeCombinationTableNumbers (and the dropdown's "Combined" label)
      // immediately, even if the hook bundle is stale or a hook errors out.
      let membersToDeactivate = [];
      if (grp.mode === 'shared') {
        try {
          membersToDeactivate = await pb.collection('table_group_members').getFullList({
            filter: pb.filter('tableGroup = {:gid} && isActive = true', { gid }),
            $autoCancel: false,
            requestKey: `free-shared-members-${gid}`,
          });
        } catch (_) { membersToDeactivate = []; }
      } else if (tn) {
        try {
          const member = await pb.collection('table_group_members').getFirstListItem(
            pb.filter('tableGroup = {:gid} && tableNumber = {:tn}', { gid, tn }),
            { $autoCancel: false, requestKey: `free-linked-get-${gid}-${tn}` },
          );
          membersToDeactivate = [member];
        } catch (_) { /* member row already gone — non-fatal */ }
      }

      // Deactivate each targeted member row. Unique requestKey per row so
      // parallel updates don't auto-cancel each other.
      await Promise.all(
        membersToDeactivate.map((m) =>
          pb.collection('table_group_members').update(
            m.id,
            { isActive: false },
            { $autoCancel: false, requestKey: `free-member-${m.id}` },
          ).catch(() => {}),
        ),
      );

      // Close the group when no active members remain. For Shared Order this
      // is always (we just deactivated every member); for Linked Orders only
      // when the last active member was released.
      try {
        const remaining = await pb.collection('table_group_members').getFullList({
          filter: pb.filter('tableGroup = {:gid} && isActive = true', { gid }),
          $autoCancel: false,
          requestKey: `free-remaining-${gid}`,
        });
        if (!remaining || remaining.length === 0) {
          await pb.collection('table_groups').update(
            gid,
            { status: 'closed' },
            { $autoCancel: false, requestKey: `close-group-${gid}` },
          );
        }
      } catch (_) { /* non-fatal */ }

      fetchTableGroupMembers();
      fetchTableGroups();
    } catch (_) { /* group already gone/closed — non-fatal */ }
  }, [fetchTableGroupMembers, fetchTableGroups]);

  const markAvailable = async (order) => {
    const tn = order.tableNumber;
    if (!tn) {
      toast.error('Table not found');
      return;
    }
    try {
      // Most recent parent order for this table (open or closed).
      const res = await pb.collection('waiter_orders').getList(1, 1, {
        filter: pb.filter('tableNumber = {:tn}', { tn }),
        sort: '-created',
        $autoCancel: false,
      });
      const parent = res.items && res.items[0];

      // Rule 1: parent Order must be ended (endedAt set) before the table
      // can be freed. End Order sets endedAt but leaves orderStatus "open";
      // orderStatus only becomes "closed" here, when the table is freed.
      if (parent && !parent.endedAt) {
        toast.error('End the order before freeing the table.');
        return;
      }

      // Rule 2: all payment obligations must be fully settled.
      if (parent) {
        const kots = await pb.collection('kitchen_orders').getFullList({
          filter: pb.filter('parentOrder = {:pid}', { pid: parent.id }),
          $autoCancel: false,
        });
        const fig = computePayment(kots);
        if (fig.outstandingAmount > 0) {
          toast.error(
            `Cannot free table — €${fig.outstandingAmount.toFixed(2)} outstanding. Settle payment first.`,
          );
          return;
        }
      }

      // Both conditions satisfied (or no parent order — legacy KOT).
      // Free Table is the ONLY action that closes the order AND releases
      // the table: it sets orderStatus = "closed" and freed = true. End
      // Order only sets endedAt (the order stays "open" and the table stays
      // occupied) until this explicit Free Table action.
      if (parent) {
        await pb.collection('waiter_orders').update(
          parent.id,
          { orderStatus: 'closed', freed: true },
          { $autoCancel: false, requestKey: `free-wo-${parent.id}` },
        );
      }
      // Release the table from its combination so it is immediately
      // selectable again as a normal table. Handles both Shared Order
      // (closes the whole group, freeing every member) and Linked Orders
      // (releases only this table's membership, keeping the group active
      // for any still-occupied members). See releaseTableFromCombination.
      if (parent && parent.tableGroup) {
        await releaseTableFromCombination(parent);
      }
      const freeLabel = parent && isSharedParent(parent, groupMap)
        ? tableDisplayForParent(parent, groupMap)
        : `Table ${tn}`;
      toast.success(`${freeLabel} is available for a new order`);
      fetchWaiterOrders();
      fetchOrders();
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error(err);
      toast.error('Failed to free table');
    }
  };

  const focusTableField = () => {
    try {
      if (tableSelectRef.current) {
        tableSelectRef.current.focus();
      }
    } catch (_) { /* ignore */ }
  };

  // Shared validation for both the disabled state and submission. Returning
  // the existing validation message keeps the button state aligned with the
  // checks that already protect the order-creation flow.
  const getOrderValidationError = () => {
    // ---- Combine Tables mode ----
    if (combineMode) {
      if (combineModeType === 'linked') {
        // Linked Orders: setup phase (pick tables) then active-table phase
        // (add items to ONE table at a time). Items are never duplicated.
        if (linkedGroupCreated) {
          if (!activeLinkedTable) {
            return { message: 'Select a table to add items to' };
          }
          if (orderEntries.length === 0) {
            return { message: 'Add at least one dish' };
          }
          if (!orderType) {
            return { message: 'Please select an Order Type (Walk-in or Pre-order)' };
          }
          return null;
        }
        // Setup phase — the Start Linked Order button is gated separately;
        // Send to Kitchen stays disabled until the group is started.
        if (selectedTables.length < 2) {
          return { message: 'Select at least two available tables, then start the linked order' };
        }
        return { message: 'Tap Start Linked Order to begin adding items' };
      }
      // Shared Order (unchanged)
      if (selectedTables.length < 2) {
        return { message: 'Select at least two available tables to combine' };
      }
      if (orderEntries.length === 0) {
        return { message: 'Add at least one dish' };
      }
      if (!orderType) {
        return { message: 'Please select an Order Type (Walk-in or Pre-order)' };
      }
      return null;
    }
    // ---- Existing single-table flow (unchanged) ----
    if (!tableNumber) {
      return { message: 'Table Number is required before sending to the kitchen', focusTable: true };
    }
    const selectedNum = parseTableNum(tableNumber);
    if (Number.isNaN(selectedNum) || selectedNum < 1) {
      return {
        message: `Invalid table number. Please pick a table between 1 and ${maxTableNumber}.`,
        focusTable: true,
      };
    }
    if (selectedNum > maxTableNumber) {
      return {
        message: `Table ${selectedNum} is not available. Maximum table number is ${maxTableNumber}.`,
        focusTable: true,
      };
    }
    const matchedTable = tables.find(
      (t) => t.name === tableNumber || parseTableNum(t.name) === selectedNum,
    );
    if (matchedTable && matchedTable.isActive === false) {
      return {
        message: `Table ${selectedNum} is currently inactive. Please choose an active table.`,
        focusTable: true,
      };
    }
    // A table whose latest order is ended (endedAt set) but NOT freed is
    // still occupied. The waiter must Free Table (which settles payment +
    // sets orderStatus "closed" + freed) before a new standalone order can
    // be opened on it. A table with an OPEN, not-yet-ended order is allowed
    // through here so another KOT can be added to that order.
    if (occupiedTableNumbers.has(tableNumber) && !openOrderTableNumbers.has(tableNumber)) {
      return {
        message: `Table ${selectedNum} has an ended order. Free the table before starting a new order.`,
        focusTable: true,
      };
    }
    // A table that is a member of an ACTIVE combination but has NO open
    // order (a non-primary table of a Shared/Linked order) cannot start a
    // standalone order — the server-side occupancy hook rejects it. The
    // primary table of a shared order is occupied (it has the open shared
    // parent), so it is allowed here to add items as another KOT.
    if (activeCombinationTableNumbers.has(tableNumber) && !occupiedTableNumbers.has(tableNumber)) {
      return {
        message: `Table ${tableNumber} is part of an active table combination. Close the combination before opening a standalone order.`,
        focusTable: true,
      };
    }
    if (orderEntries.length === 0) {
      return { message: 'Add at least one dish' };
    }
    if (!orderType) {
      return { message: 'Please select an Order Type (Walk-in or Pre-order)' };
    }
    return null;
  };
  const orderValidationError = getOrderValidationError();
  const canSubmitOrder = !orderValidationError;

  // ---- Payment tracking helpers ----
  const lineTotal = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 0);

  // Whether a KOT item line is settled. Defaults to false when the flag is
  // absent (legacy items created before payment tracking).
  const isCleared = (it) => it && it.cleared === true;

  // Compute aggregate payment figures for a parent order from its KOTs.
  // Cancelled KOTs are excluded — they are voided and never payable.
  const computePayment = (kots) => {
    const valid = (kots || []).filter((k) => k.status !== 'cancelled');
    let totalAmount = 0;
    let paidAmount = 0;
    valid.forEach((k) => {
      (k.items || []).forEach((it) => {
        const lt = lineTotal(it);
        totalAmount += lt;
        if (isCleared(it)) paidAmount += lt;
      });
    });
    const outstandingAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
    let paymentStatus = 'unpaid';
    if (paidAmount >= totalAmount && totalAmount > 0) paymentStatus = 'paid';
    else if (paidAmount > 0) paymentStatus = 'partial';
    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      outstandingAmount,
      paymentStatus,
    };
  };

  // Recalculate a parent order's payment fields from its current KOTs and
  // persist them to waiter_orders. Called after KOT creation, cancellation,
  // and payment settlement so the parent always reflects its KOTs.
  const recalcAndUpdateParent = useCallback(async (parentId) => {
    if (!parentId) return null;
    try {
      const res = await pb.collection('kitchen_orders').getFullList({
        filter: pb.filter('parentOrder = {:pid}', { pid: parentId }),
        $autoCancel: false,
      });
      const figures = computePayment(res);
      const updated = await pb.collection('waiter_orders').update(
        parentId,
        {
          totalAmount: figures.totalAmount,
          paidAmount: figures.paidAmount,
          outstandingAmount: figures.outstandingAmount,
          paymentStatus: figures.paymentStatus,
        },
        { $autoCancel: false },
      );
      return updated;
    } catch (err) {
      console.error('Failed to recalc parent payment:', err);
      return null;
    }
  }, [pb]);

  // Fetch open parent orders that have an outstanding balance, for the Pay
  // picker. Each entry carries its live KOTs so the modal can render items.
  const fetchPayableOrders = useCallback(async () => {
    try {
      const res = await pb.collection('waiter_orders').getList(1, 50, {
        filter: 'orderStatus = "open"',
        sort: '-created',
        $autoCancel: false,
      });
      const withKots = await Promise.all(
        res.items.map(async (w) => {
          try {
            const kots = await pb.collection('kitchen_orders').getFullList({
              filter: pb.filter('parentOrder = {:pid}', { pid: w.id }),
              $autoCancel: false,
            });
            return { parent: w, kots };
          } catch (_) {
            return { parent: w, kots: [] };
          }
        }),
      );
      // Only keep orders that have at least one payable (non-cancelled) KOT.
      const list = withKots.filter((g) => g.kots.some((k) => k.status !== 'cancelled'));
      setPayableOrders(list);
      return list;
    } catch (err) {
      console.error('Failed to load payable orders:', err);
      return [];
    }
  }, [pb]);

  // Cancel a child KOT ticket. Only allowed while status = pending; once the
  // kitchen has started preparing it (preparing/ready/completed) or it was
  // already cancelled, the action is blocked. Cancelling sets status =
  // cancelled — the record is NOT deleted and stays visible in the Active
  // tab. The parent waiter_orders record is never touched here; it stays
  // open until the waiter explicitly clicks End Order.
  const handleCancelKOT = async () => {
    if (!cancelTarget) return;
    const order = cancelTarget;
    if (order.status !== 'pending') {
      toast.error(CANCEL_BLOCKED_MSG[order.status] || 'Cannot cancel this ticket');
      setCancelTarget(null);
      return;
    }
    try {
      await pb.collection('kitchen_orders').update(
        order.id,
        { status: 'cancelled' },
        { $autoCancel: false }
      );
      toast.success(`Ticket ${resolveOrderId(order)} cancelled`);
      fetchOrders();
      // Recalc parent payment — a cancelled KOT no longer counts toward
      // totalAmount, so outstandingAmount may drop.
      const pid = order.parentOrder || (order.expand && order.expand.parentOrder && order.expand.parentOrder.id);
      if (pid) recalcAndUpdateParent(pid);
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to cancel ticket:', err);
      toast.error('Failed to cancel ticket');
    } finally {
      setCancelTarget(null);
    }
  };

  // Item-level quantity removal for a pending KOT. Decreases the targeted
  // item's quantity by 1; when it reaches 0 the line is dropped from the
  // items array. If the final remaining item would be removed (leaving an
  // empty KOT), the ticket is cancelled via the same persistence path as
  // handleCancelKOT instead of persisting an empty items array. Only
  // available while status = pending; once preparation has started the
  // existing cancellation restrictions apply and no − control is shown.
  // The existing kitchen_orders record is reused (no new KOT, no Order ID /
  // KOT suffix change) and the parent order's payment fields are recomputed
  // via the existing recalcAndUpdateParent logic.
  const handleDecreaseItem = async (order, idx) => {
    if (!order || order.status !== 'pending') return;
    const items = Array.isArray(order.items) ? [...order.items] : [];
    const target = items[idx];
    if (!target) return;
    const newQty = (Number(target.quantity) || 0) - 1;
    const parentId = order.parentOrder
      || (order.expand && order.expand.parentOrder && order.expand.parentOrder.id)
      || null;

    // Dropping the last remaining item would empty the KOT — cancel the
    // ticket via the existing cancellation flow (never persist an empty KOT).
    if (newQty <= 0 && items.length <= 1) {
      // Optimistically mark cancelled locally (keep items so there is no
      // visual flicker before the refetch). The server update only flips
      // the status — it must NOT send `items: []`, because the `items`
      // JSON field is required and PocketBase rejects an empty array as
      // blank (which would fail the PATCH, leave the record pending, and
      // never broadcast a realtime update to the KDS).
      setOrders((prev) => prev.map((o) => (o.id === order.id
        ? { ...o, status: 'cancelled' }
        : o)));
      try {
        await pb.collection('kitchen_orders').update(
          order.id,
          { status: 'cancelled' },
          { $autoCancel: false, requestKey: `dec-cancel-${order.id}-${Date.now()}` },
        );
        toast.success(`Ticket ${resolveOrderId(order)} cancelled — no items left`);
        fetchOrders();
        if (parentId) recalcAndUpdateParent(parentId);
        if (onPlaced) onPlaced();
      } catch (err) {
        console.error('Failed to cancel empty ticket:', err);
        toast.error('Failed to update ticket');
        fetchOrders();
      }
      return;
    }

    // Otherwise decrease the line (or drop just this line when it hits 0
    // while other items remain) and persist the updated items + total.
    let newItems;
    if (newQty <= 0) {
      newItems = items.filter((_, i) => i !== idx);
    } else {
      newItems = items.map((it, i) => (i === idx ? { ...it, quantity: newQty } : it));
    }
    const newTotal = Math.round(newItems.reduce((s, it) => s + lineTotal(it), 0) * 100) / 100;
    // Optimistic local update so rapid repeated clicks compute from the
    // latest item state instead of a stale snapshot.
    setOrders((prev) => prev.map((o) => (o.id === order.id
      ? { ...o, items: newItems, totalPrice: newTotal }
      : o)));
    try {
      await pb.collection('kitchen_orders').update(
        order.id,
        { items: newItems, totalPrice: newTotal },
        { $autoCancel: false, requestKey: `dec-item-${order.id}-${Date.now()}` },
      );
      fetchOrders();
      if (parentId) recalcAndUpdateParent(parentId);
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to update item quantity:', err);
      toast.error('Failed to update item');
      fetchOrders();
    }
  };

  // ---- Linked Orders: per-table independent Orders ----
  // Linked Orders groups tables ONLY for convenience. Each linked table is a
  // completely independent Order: its own waiter_orders parent, Order ID,
  // menu items, KOTs, KOT suffix sequence, payment, status, End Order and
  // Free Table state. Items are NEVER duplicated across linked tables (that
  // would make it behave like a Shared Order).
  //
  // Flow:
  //   1. Setup — waiter enables Combine Tables → Linked Orders, multi-
  //      selects 2+ available tables, and taps "Start Linked Order". This
  //      creates ONE table_groups (mode=linked, status=active) row + one
  //      table_group_members row per table. No parent Orders are created
  //      yet (a table with no items does not get an empty Order).
  //   2. Active table phase — the waiter picks ONE table at a time from the
  //      linked group and adds items ONLY to that table. Each table has its
  //      own cart (linkedCarts) so switching tables never loses or transfers
  //      items. "Send to Kitchen" creates/updates the KOT only for the
  //      active table's Order (parent created lazily with tableGroup set on
  //      first send, reused on subsequent sends — same additional-KOT reuse
  //      as the single-table flow).
  //
  // Server-side occupancy (idx_waiter_orders_open_table,
  // idx_tgm_active_table, and the table-groups-occupancy hook) is unchanged
  // and still enforces one open order per table and one active combination
  // per table. The existing pendingParent retry mechanism (reuse same
  // orderId when KOT creation fails after the parent was created) covers
  // retry for the single active table.

  // Reset all linked-mode state back to the single-table defaults. Used when
  // the waiter turns off Combine Tables, exits the active phase, or clears
  // the whole draft. Does NOT touch any persisted Orders/KOTs — linked
  // Orders stay open in the DB until ended/freed via the Active tab.
  const resetLinkedState = useCallback(() => {
    setLinkedGroupId(null);
    setLinkedGroupCreated(false);
    setActiveLinkedTable('');
    setLinkedCarts({});
    setSelectedTables([]);
    setPendingCombined(null);
    setCombineModeType('linked');
    setPendingParent(null);
  }, []);

  // Start the linked group: create table_groups + table_group_members for
  // the selected tables, then enter the active-table phase with the first
  // selected table active and an empty cart per table.
  const startLinkedGroup = async () => {
    if (selectedTables.length < 2) {
      toast.error('Select at least two available tables to combine.');
      return;
    }
    setSubmitting(true);
    try {
      const label = `Tables ${selectedTables.join(' + ')}`;
      const group = await pb.collection('table_groups').create(
        { mode: 'linked', status: 'active', label },
        { $autoCancel: false, requestKey: `tg-${Date.now()}` },
      );
      const gid = group.id;

      // Create one member row per selected table. Sequential awaits with
      // unique requestKeys so parallel auto-cancellation never drops a row.
      for (const tname of selectedTables) {
        const tcfg = activeTables.find((x) => x.name === tname);
        await pb.collection('table_group_members').create(
          {
            tableGroup: gid,
            tableNumber: tname,
            tableId: (tcfg && tcfg.id) || '',
            isActive: true,
          },
          { $autoCancel: false, requestKey: `tgm-${gid}-${tname}` },
        );
      }

      // Empty cart per linked table.
      const carts = {};
      selectedTables.forEach((tn) => {
        carts[tn] = { order: {}, notes: '', spiceSelections: {} };
      });
      setLinkedCarts(carts);
      setLinkedGroupId(gid);
      setLinkedGroupCreated(true);
      setActiveLinkedTable(selectedTables[0]);
      setOrder({});
      setNotes('');
      setSpiceSelections({});
      setPendingParent(null);
      fetchTableGroupMembers();
      fetchTableGroups();
      toast.success(
        `Linked order started for Tables ${selectedTables.join(', ')}. Select a table, then add items to it.`,
      );
    } catch (err) {
      console.error('Failed to start linked order:', err);
      const serverMsg = (err && err.response && err.response.message) || (err && err.message) || '';
      toast.error(serverMsg ? `Failed to start linked order: ${serverMsg}` : 'Failed to start linked order');
    } finally {
      setSubmitting(false);
    }
  };

  // Switch the active linked table. Saves the current cart into
  // linkedCarts[oldTable] and loads linkedCarts[newTable] into the working
  // order/notes/spiceSelections state. Switching never loses or transfers
  // items — each table's cart is preserved independently.
  const switchLinkedTable = useCallback((tableName) => {
    if (!tableName || tableName === activeLinkedTable) return;
    // Stash the current working cart under the outgoing table.
    setLinkedCarts((prev) => ({
      ...(prev || {}),
      [activeLinkedTable]: { order, notes, spiceSelections },
    }));
    // Load the incoming table's cart into the working state. Each table's
    // cart is preserved independently — switching never loses or transfers
    // items between linked tables.
    const incoming = (linkedCarts && linkedCarts[tableName]) || { order: {}, notes: '', spiceSelections: {} };
    setOrder(incoming.order || {});
    setNotes(incoming.notes || '');
    setSpiceSelections(incoming.spiceSelections || {});
    setActiveLinkedTable(tableName);
  }, [activeLinkedTable, order, notes, spiceSelections, linkedCarts]);

  // Send the active table's cart to the kitchen as a KOT on that table's
  // OWN parent waiter_orders Order. The parent is created lazily (with
  // tableGroup = linkedGroupId) on first send, and reused (additional-KOT
  // path) on subsequent sends — exactly the single-table flow, scoped to
  // the active table. No other linked table is touched.
  const handleSubmitLinked = async () => {
    const tn = activeLinkedTable;
    if (!tn) {
      toast.error('Select a table to add items to.');
      return;
    }
    setSubmitting(true);
    try {
      const items = orderEntries.map((e) => ({
        id: e.item.id,
        name: e.item.nameEN || e.item.name,
        quantity: e.qty,
        price: e.item.price || 0,
        spiceLevel: e.spiceLevel || 'None',
        cleared: false,
      }));

      // Resolve or create the parent order for THIS table only.
      let parent = pendingParent;
      if (!parent) {
        try {
          const open = await pb.collection('waiter_orders').getList(1, 1, {
            filter: pb.filter('tableNumber = {:tn} && orderStatus = "open"', { tn }),
            sort: '-created',
            $autoCancel: false,
            requestKey: `wo-linked-open-${tn}`,
          });
          if (open.items && open.items.length > 0) parent = open.items[0];
        } catch (_) { /* ignore — fall through to create */ }
      }
      if (!parent) {
        try {
          parent = await pb.collection('waiter_orders').create(
            {
              orderType,
              tableNumber: tn,
              orderStatus: 'open',
              placedBy: placedBy || 'Staff',
              placedByRole: placedByRole || 'waiter',
              tableGroup: linkedGroupId,
            },
            { $autoCancel: false, requestKey: `wo-linked-${tn}` },
          );
        } catch (createErr) {
          const conflictMsg = `${(createErr && createErr.response && createErr.response.message) || ''} ${(createErr && createErr.message) || ''} ${JSON.stringify((createErr && createErr.response && createErr.response.data) || {})}`;
          if (/UNIQUE constraint|constraint failed|idx_waiter_orders_open_table/i.test(conflictMsg)) {
            const open = await pb.collection('waiter_orders').getList(1, 1, {
              filter: pb.filter('tableNumber = {:tn} && orderStatus = "open"', { tn }),
              sort: '-created',
              $autoCancel: false,
              requestKey: `wo-linked-open2-${tn}`,
            });
            if (open.items && open.items.length > 0) parent = open.items[0];
            else throw createErr;
          } else {
            throw createErr;
          }
        }
      }

      // Create the KOT only for the active table's parent.
      const tcfg = activeTables.find((x) => x.name === tn);
      const troom = tcfg ? tcfg.room || '' : '';
      let created;
      try {
        created = await pb.collection('kitchen_orders').create(
          {
            tableNumber: tn,
            room: troom,
            items,
            status: 'pending',
            totalPrice: total,
            placedBy: placedBy || 'Staff',
            placedByRole: placedByRole || 'waiter',
            notes,
            parentOrder: parent.id,
          },
          { $autoCancel: false, requestKey: `ko-linked-${parent.id}` },
        );
      } catch (kotErr) {
        setPendingParent(parent);
        console.error('KOT creation failed:', kotErr);
        const serverMsg =
          (kotErr && kotErr.response && kotErr.response.message) ||
          (kotErr && kotErr.message) || '';
        toast.error(
          serverMsg
            ? `${serverMsg} — tap Send to Kitchen again to retry.`
            : `KOT creation failed. Order ${parent.orderId} saved — tap Send to Kitchen again to retry with the same Order ID.`
        );
        setSubmitting(false);
        return;
      }

      setPendingParent(null);
      created.orderId = parent.orderId;
      created.expand = { ...(created.expand || {}), parentOrder: parent };

      if (autoPrintEnabled) {
        printKOT(created);
        try {
          const nextCount = (Number(created.printCount) || 0) + 1;
          await pb.collection('kitchen_orders').update(
            created.id,
            { printedAt: new Date().toISOString(), printCount: nextCount },
            { $autoCancel: false, requestKey: `autoprint-kot-${created.id}` },
          );
        } catch (trackErr) {
          console.error('Auto-print tracking update failed:', trackErr);
        }
      }

      toast.success(`Ticket ${resolveOrderId(created)} sent to kitchen for Table ${tn}`);
      // Clear ONLY this table's cart. The linked group stays active so the
      // waiter can select another table and add items to it independently.
      setOrder({});
      setNotes('');
      setSpiceSelections({});
      setLinkedCarts((prev) => ({
        ...(prev || {}),
        [tn]: { order: {}, notes: '', spiceSelections: {} },
      }));
      fetchOrders();
      fetchTables();
      fetchWaiterOrders();
      recalcAndUpdateParent(parent.id);
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to place linked order:', err);
      const serverMsg = (err && err.response && err.response.message) || (err && err.message) || '';
      toast.error(serverMsg ? `Failed to place order: ${serverMsg}` : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Combine Tables (Shared Order) submission ----
  // Creates ONE parent waiter_orders Order for all selected tables, linked
  // to one table_groups (mode=shared, status=active) row + one
  // table_group_members row per table. A single combined kitchen_orders KOT
  // is created under that one parent, so the Shared Order receives ONE Order
  // ID (e.g. WI00030) and all KOTs use the existing per-parent suffix
  // sequence (WI00030_001, _002, ...). The combined financial total lives on
  // the one parent Order; payment / End Order / Free Table operate on that
  // single parent. `waiter_orders.tableNumber` is set to the first selected
  // table as a backward-compatible primary value, but the complete table
  // membership is read from table_group_members (the source of truth).
  //
  // Retry safety: pendingShared preserves the created group, the single
  // parent Order, the full table set, which member tables still need to be
  // added, and whether the combined KOT was already created. A retry only
  // completes the missing pieces — no duplicate group / members / Order /
  // KOT. Server-side occupancy (idx_waiter_orders_open_table,
  // idx_tgm_active_table, and the table-groups-occupancy hook's shared
  // one-open-parent-per-group rule) rejects unavailable tables and routes
  // them to retry.
  const handleSubmitShared = async () => {
    const allTables = pendingShared && pendingShared.allTables
      ? pendingShared.allTables
      : selectedTables;
    // Members to ensure exist for this group on this attempt.
    const tablesToProcess = pendingShared && pendingShared.pendingTables
      ? pendingShared.pendingTables
      : allTables;
    // Primary table — the backward-compatible single tableNumber stored on
    // the parent waiter_orders record and on every KOT. Also stamped onto
    // each item line as `tableNumber` so the payment UI can attribute every
    // line to its table within the Shared Order without changing the
    // existing payment behavior for single-table or Linked Orders (whose
    // items carry no tableNumber).
    const primaryTable = allTables[0];

    const items = orderEntries.map((e) => ({
      id: e.item.id,
      name: e.item.nameEN || e.item.name,
      quantity: e.qty,
      price: e.item.price || 0,
      spiceLevel: e.spiceLevel || 'None',
      cleared: false,
      tableNumber: primaryTable,
    }));

    if (!allTables || allTables.length < 2) {
      toast.error('Select at least two tables for a shared order.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Resolve or create the table_groups row (reuse on retry).
      let groupId = pendingShared ? pendingShared.groupId : null;
      if (groupId) {
        try {
          await pb.collection('table_groups').getOne(groupId, { $autoCancel: false });
        } catch (_) {
          groupId = null; // group vanished — start fresh
        }
      }
      if (!groupId) {
        const label = `Tables ${allTables.join(' + ')}`;
        const group = await pb.collection('table_groups').create(
          { mode: 'shared', status: 'active', label },
          { $autoCancel: false, requestKey: `tg-shared-${Date.now()}` },
        );
        groupId = group.id;
      }

      // 2. Ensure a table_group_members row exists for every selected table.
      const failedMembers = [];
      for (const tname of tablesToProcess) {
        try {
          let member = null;
          try {
            member = await pb.collection('table_group_members').getFirstListItem(
              pb.filter('tableGroup = {:gid} && tableNumber = {:tn}', { gid: groupId, tn: tname }),
              { $autoCancel: false, requestKey: `tgm-shared-get-${tname}` },
            );
          } catch (_) { /* not found — create below */ }
          if (!member) {
            const tcfg = activeTables.find((x) => x.name === tname);
            member = await pb.collection('table_group_members').create(
              {
                tableGroup: groupId,
                tableNumber: tname,
                tableId: (tcfg && tcfg.id) || '',
                isActive: true,
              },
              { $autoCancel: false, requestKey: `tgm-shared-${groupId}-${tname}` },
            );
          }
        } catch (memberErr) {
          console.error('Shared member failed for table', tname, memberErr);
          failedMembers.push(tname);
        }
      }

      if (failedMembers.length > 0) {
        setPendingShared({
          groupId,
          parent: (pendingShared && pendingShared.parent) || null,
          allTables,
          pendingTables: failedMembers,
          kotCreated: (pendingShared && pendingShared.kotCreated) || false,
        });
        toast.error(
          `Could not add table(s): ${failedMembers.join(', ')}. Tap Send to Kitchen again to retry.`
        );
        fetchTableGroupMembers();
        return;
      }

      // 3. Resolve or create the SINGLE parent waiter_orders Order for this
      //    shared group. Reuse an existing open order for this group first
      //    (a retry, or a concurrent create that won the race), then create
      //    one with tableNumber = first selected table (primary value only).
      let parent = pendingShared && pendingShared.parent ? pendingShared.parent : null;
      if (parent) {
        try {
          const live = await pb.collection('waiter_orders').getOne(parent.id, { $autoCancel: false });
          if (live.orderStatus !== 'open' || live.tableGroup !== groupId) parent = null;
          else parent = live;
        } catch (_) { parent = null; }
      }
      if (!parent) {
        try {
          const open = await pb.collection('waiter_orders').getList(1, 1, {
            filter: pb.filter('tableGroup = {:gid} && orderStatus = "open"', { gid: groupId }),
            $autoCancel: false,
            requestKey: `wo-shared-open-${groupId}`,
          });
          if (open.items && open.items.length > 0) parent = open.items[0];
        } catch (_) { /* ignore */ }
      }
      if (!parent) {
        try {
          parent = await pb.collection('waiter_orders').create(
            {
              orderType,
              tableNumber: primaryTable,
              orderStatus: 'open',
              placedBy: placedBy || 'Staff',
              placedByRole: placedByRole || 'waiter',
              tableGroup: groupId,
            },
            { $autoCancel: false, requestKey: `wo-shared-${groupId}` },
          );
        } catch (createErr) {
          const conflictMsg = `${(createErr && createErr.response && createErr.response.message) || ''} ${(createErr && createErr.message) || ''} ${JSON.stringify((createErr && createErr.response && createErr.response.data) || {})}`;
          if (/UNIQUE constraint|constraint failed|idx_waiter_orders_open_table|shared order already/i.test(conflictMsg)) {
            const open = await pb.collection('waiter_orders').getList(1, 1, {
              filter: pb.filter('tableGroup = {:gid} && orderStatus = "open"', { gid: groupId }),
              $autoCancel: false,
              requestKey: `wo-shared-open2-${groupId}`,
            });
            if (open.items && open.items.length > 0) parent = open.items[0];
            else throw createErr;
          } else {
            throw createErr;
          }
        }
      }

      // 4. Create the single combined KOT under this parent (only if it has
      //    not already been created on a previous attempt).
      const kotAlreadyCreated = !!(pendingShared && pendingShared.kotCreated);
      let created = null;
      if (!kotAlreadyCreated) {
        try {
          const tcfg = activeTables.find((x) => x.name === primaryTable);
          const troom = tcfg ? tcfg.room || '' : '';
          created = await pb.collection('kitchen_orders').create(
            {
              tableNumber: primaryTable,
              room: troom,
              items,
              status: 'pending',
              totalPrice: total,
              placedBy: placedBy || 'Staff',
              placedByRole: placedByRole || 'waiter',
              notes,
              parentOrder: parent.id,
            },
            { $autoCancel: false, requestKey: `ko-shared-${parent.id}` },
          );
          created.orderId = parent.orderId;
          created.tableDisplay = `Tables ${allTables.join(' + ')}`;
          created.expand = { ...(created.expand || {}), parentOrder: parent };
        } catch (kotErr) {
          const serverMsg =
            (kotErr && kotErr.response && kotErr.response.message) ||
            (kotErr && kotErr.message) || '';
          setPendingShared({
            groupId,
            parent,
            allTables,
            pendingTables: [],
            kotCreated: false,
          });
          toast.error(
            serverMsg
              ? `${serverMsg} — tap Send to Kitchen again to retry.`
              : `KOT creation failed. Order ${parent.orderId} saved — tap Send to Kitchen again to retry with the same Order ID.`
          );
          setSubmitting(false);
          return;
        }
      }

      // 5. Success — recalc parent payment, auto-print, clear the draft.
      recalcAndUpdateParent(parent.id);
      if (autoPrintEnabled && created) {
        printKOT(created);
        try {
          const nextCount = (Number(created.printCount) || 0) + 1;
          await pb.collection('kitchen_orders').update(
            created.id,
            { printedAt: new Date().toISOString(), printCount: nextCount },
            { $autoCancel: false, requestKey: `autoprint-shared-${created.id}` },
          );
        } catch (trackErr) {
          console.error('Auto-print tracking update failed:', trackErr);
        }
      }

      setPendingShared(null);
      const kotLabel = created ? resolveOrderId(created) : parent.orderId;
      toast.success(`Ticket ${kotLabel} sent to kitchen for Tables ${allTables.join(', ')}`);
      setOrder({});
      setNotes('');
      setOrderType('walkin');
      setSelectedTables([]);
      setCombineMode(false);
      setCombineModeType('linked');
      setTableNumber('');
      setRoom('');
      setTab('place');
      fetchOrders();
      fetchTables();
      fetchWaiterOrders();
      fetchTableGroupMembers();
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to place shared order:', err);
      const serverMsg = (err && err.response && err.response.message) || (err && err.message) || '';
      toast.error(serverMsg ? `Failed to place shared order: ${serverMsg}` : 'Failed to place shared order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // Keep the click-time guard in place as the final protection, while the
    // same validation also controls the disabled state of the button.
    const validationError = getOrderValidationError();
    if (validationError) {
      toast.error(validationError.message);
      if (validationError.focusTable) focusTableField();
      return;
    }
    // Combine Tables (Linked Orders) — branch to the combined submission.
    // The single-table flow below is completely unchanged when combineMode
    // is off.
    if (combineMode) {
      return combineModeType === 'shared' ? handleSubmitShared() : handleSubmitLinked();
    }
    setSubmitting(true);
    try {
      const items = orderEntries.map((e) => ({
        id: e.item.id,
        name: e.item.nameEN || e.item.name,
        quantity: e.qty,
        price: e.item.price || 0,
        spiceLevel: e.spiceLevel || 'None',
        // Payment tracking: every new line starts unpaid. cleared = true is
        // set only by the payment settlement flow (a payment event, not a
        // UI toggle). Optional paidAt/paymentMode metadata can be added
        // later without changing this shape.
        cleared: false,
      }));

      // Step 1: determine the parent waiter_orders record to attach this
      // KOT to. Priority:
      //   1. pendingParent — retry of a failed KOT (reuse same orderId)
      //   2. an existing OPEN order for this table — add another KOT to it
      //      (keeps the order open across multiple tickets)
      //   3. otherwise — create a new parent (orderId generated atomically
      //      server-side by the waiter-orders-id hook)
      let parent = pendingParent;
      if (!parent) {
        try {
          const open = await pb.collection('waiter_orders').getList(1, 1, {
            filter: pb.filter('tableNumber = {:tn} && orderStatus = "open"', { tn: tableNumber }),
            sort: '-created',
            $autoCancel: false,
          });
          if (open.items && open.items.length > 0) parent = open.items[0];
        } catch (_) { /* ignore — fall through to create */ }
      }
      if (!parent) {
        try {
          parent = await pb.collection('waiter_orders').create(
            {
              orderType,
              tableNumber,
              orderStatus: 'open',
              placedBy: placedBy || 'Staff',
              placedByRole: placedByRole || 'waiter',
            },
            { $autoCancel: false }
          );
        } catch (createErr) {
          // Concurrent-create race: another waiter opened an order for this
          // table at the same moment and the partial unique index
          // (idx_waiter_orders_open_table — one open order per table)
          // rejected this create. Re-query for the now-existing open order
          // and attach this KOT to it (the existing additional-KOT reuse
          // path) instead of failing, so the single-open-order-per-table
          // invariant holds without losing the waiter's submitted items.
          const conflictMsg = `${(createErr && createErr.response && createErr.response.message) || ''} ${(createErr && createErr.message) || ''} ${JSON.stringify((createErr && createErr.response && createErr.response.data) || {})}`;
          if (/UNIQUE constraint|constraint failed|idx_waiter_orders_open_table/i.test(conflictMsg)) {
            const open = await pb.collection('waiter_orders').getList(1, 1, {
              filter: pb.filter('tableNumber = {:tn} && orderStatus = "open"', { tn: tableNumber }),
              sort: '-created',
              $autoCancel: false,
            });
            if (open.items && open.items.length > 0) {
              parent = open.items[0];
            } else {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }
      }

      // Step 2: create the linked kitchen_orders KOT with parentOrder ref.
      // When the resolved parent is part of a Shared Order (tableGroup set),
      // stamp every item with its table so the payment UI can attribute
      // lines to tables within the shared order — matching the initial
      // shared submission. Single-table and Linked Orders carry no
      // per-item tableNumber, preserving their existing payment behavior.
      const kotItems = parent && parent.tableGroup
        ? items.map((it) => ({ ...it, tableNumber }))
        : items;
      let created;
      try {
        created = await pb.collection('kitchen_orders').create(
          {
            tableNumber,
            room,
            items: kotItems,
            status: 'pending',
            totalPrice: total,
            placedBy: placedBy || 'Staff',
            placedByRole: placedByRole || 'waiter',
            notes,
            parentOrder: parent.id,
          },
          { $autoCancel: false }
        );
      } catch (kotErr) {
        // KOT creation failed after the parent order was created. Keep the
        // parent so a retry reuses the same orderId (do NOT generate a new
        // one). The order is left intact for an immediate retry.
        setPendingParent(parent);
        console.error('KOT creation failed:', kotErr);
        // Surface the server-side validation message (e.g. missing table
        // number on the parent Order) when the backend rejects the create.
        const serverMsg =
          (kotErr && kotErr.response && kotErr.response.message) ||
          (kotErr && kotErr.message) ||
          '';
        toast.error(
          serverMsg
            ? `${serverMsg} — tap Send to Kitchen again to retry.`
            : `KOT creation failed. Order ${parent.orderId} saved — tap Send to Kitchen again to retry with the same Order ID.`
        );
        setSubmitting(false);
        return;
      }

      // Success — clear any pending parent and attach the orderId to the
      // KOT record in memory so display/print helpers can read it. The
      // kotSuffix is set server-side by the kot-suffix hook and is present
      // on the created record.
      setPendingParent(null);
      created.orderId = parent.orderId;
      created.expand = { ...(created.expand || {}), parentOrder: parent };

      // Occupancy is now derived from the open waiter_orders record created
      // above (orderStatus = "open") — the single source of truth. No
      // table_configurations.isReserved write is needed; that field is
      // admin-only (waiter writes were producing 404s) and is no longer the
      // occupancy mechanism. The table automatically shows as Occupied in
      // the New Order dropdown for other waiters via the realtime
      // waiter_orders subscription.
      const kotLabel = resolveOrderId(created);
      toast.success(`Ticket ${kotLabel} sent to kitchen for Table ${tableNumber}`);
      setLastOrder(created);
      // Auto-print: when the admin Auto-print KOT toggle is on (and the
      // caller has print permission — checked via shouldAutoPrint above),
      // trigger the existing browser/iframe print flow for every newly
      // created KOT (initial order AND each subsequent child ticket, since
      // handleSubmit runs for each one). Then record the print event on the
      // kitchen_orders record so printedAt/printCount stay consistent with
      // the manual print flow (openKOT / KDS reprint) and the
      // duplicate-protection guard works the same way. The browser may still
      // show its native print dialog — this is not guaranteed silent
      // printing. Reuses the existing kotPrint.js mechanism; no new printer
      // integration, no new record, no new Order ID or KOT suffix.
      if (autoPrintEnabled) {
        printKOT(created);
        try {
          const nextCount = (Number(created.printCount) || 0) + 1;
          const tracked = await pb.collection('kitchen_orders').update(
            created.id,
            { printedAt: new Date().toISOString(), printCount: nextCount },
            { $autoCancel: false, requestKey: `autoprint-kot-${created.id}` },
          );
          setLastOrder((prev) => (prev && prev.id === created.id ? { ...prev, ...tracked } : prev));
        } catch (trackErr) {
          // Non-fatal: the KOT was created and sent; only the tracking
          // metadata failed to persist. Log so it's visible without
          // blocking the waiter's workflow.
          console.error('Auto-print tracking update failed:', trackErr);
        }
      }

      // Clear the completed draft and start the next New Order with no
      // table preselected. The waiter must choose a table explicitly again.
      setOrder({});
      setNotes('');
      setOrderType('walkin');
      setTableNumber('');
      setRoom('');
      setTab('place');
      fetchOrders();
      fetchTables();
      fetchWaiterOrders();
      // Recalc the parent's payment fields — the new KOT added item lines
      // that raise totalAmount / outstandingAmount.
      recalcAndUpdateParent(parent.id);
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to place order:', err);
      toast.error('Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  // Print KOT with a duplicate-warning guard. If the ticket was already
  // sent (printedAt set AND printCount > 0), show a confirmation modal
  // before proceeding; otherwise go straight to the existing print flow.
  // This is a UI confirmation only — it never hard-blocks reprinting.
  const handlePrintKOT = (order) => {
    if (!order) return;
    // UI-level gate: respects the admin print permission precedence
    // (restaurant-wide overrides per-waiter; admins always allowed).
    if (!printAllowed) {
      toast.error('Printing is currently disabled by the administrator.');
      return;
    }
    const alreadyPrinted = !!order.printedAt && (Number(order.printCount) || 0) > 0;
    if (alreadyPrinted) {
      setReprintTarget(order);
      return;
    }
    openKOT(order);
  };

  // ---- Active tab grouping: group KOTs by their parentOrder relation ----
  // (declared before the loading early-return so hook order is stable)
  const parentMap = useMemo(() => {
    const m = new Map();
    waiterOrders.forEach((w) => m.set(w.id, w));
    return m;
  }, [waiterOrders]);

  const groupedOrders = useMemo(() => {
    const groups = new Map(); // parentId -> { parent, kots: [] }
    const unparented = [];
    orders.forEach((o) => {
      const pid = o.parentOrder || (o.expand && o.expand.parentOrder && o.expand.parentOrder.id);
      if (pid) {
        if (!groups.has(pid)) {
          const parent = parentMap.get(pid) || (o.expand && o.expand.parentOrder) || { id: pid };
          groups.set(pid, { parent, kots: [] });
        }
        groups.get(pid).kots.push(o);
      } else {
        unparented.push(o);
      }
    });
    // Sort each group's KOTs ascending by created (original _001 first).
    groups.forEach((g) => g.kots.sort((a, b) => new Date(a.created) - new Date(b.created)));
    // Sort groups by most recent KOT desc.
    const groupArr = [...groups.values()].sort((a, b) => {
      const aLast = a.kots[a.kots.length - 1];
      const bLast = b.kots[b.kots.length - 1];
      return new Date((bLast && bLast.created) || 0) - new Date((aLast && aLast.created) || 0);
    });
    return { groupArr, unparented };
  }, [orders, parentMap]);

  const activeGroupCount = useMemo(() => {
    let n = groupedOrders.groupArr.filter((g) => (g.parent && g.parent.orderStatus) !== 'closed').length;
    n += groupedOrders.unparented.filter((o) => o.status !== 'completed').length;
    return n;
  }, [groupedOrders]);

  // Apply the Active-tab filters (Kitchen Status + Table) to the grouped
  // orders with AND logic. Order Status is NO LONGER a filter here — the
  // Active Orders / Order History sub-tabs split the dataset by
  // parent.orderStatus instead. Kitchen Status matches if ANY child KOT has
  // the selected status; Table matches the order's table number. Unparented
  // (legacy) KOTs have no parent, so they are filtered by Kitchen Status and
  // Table only.
  const filteredGroupedOrders = useMemo(() => {
    const matchKitchenStatus = (kots) => {
      if (filterKitchenStatus === 'all') return true;
      return kots.some((k) => k.status === filterKitchenStatus);
    };
    const matchTable = (parent, kots) => {
      if (filterTable === 'all') return true;
      const firstKot = kots[0];
      const tn = (firstKot && firstKot.tableNumber) || (parent && parent.tableNumber) || '';
      return String(tn) === String(filterTable);
    };
    const groupArr = groupedOrders.groupArr.filter(({ parent, kots }) =>
      matchKitchenStatus(kots) && matchTable(parent, kots)
    );
    const unparented = groupedOrders.unparented.filter((o) => {
      if (filterKitchenStatus !== 'all' && o.status !== filterKitchenStatus) return false;
      if (filterTable !== 'all' && String(o.tableNumber || '') !== String(filterTable)) return false;
      return true;
    });
    return { groupArr, unparented };
  }, [groupedOrders, filterKitchenStatus, filterTable]);

  // ---- Active Orders vs Order History split ----
  // An order is OPEN until Free Table sets orderStatus='closed'. End Order
  // and payment do NOT close the order, so ended/paid-but-not-freed orders
  // stay in Active Orders. Legacy unparented KOTs have no parent
  // orderStatus; they are treated as active (never closed).
  // Active Orders: open orders, latest → oldest (most recent KOT first —
  //   reuses groupedOrders' existing ordering).
  // Order History: closed orders, latest closed → oldest (by parent.updated,
  //   which Free Table bumps when it sets orderStatus='closed').
  const activeGroupedOrders = useMemo(() => {
    const groupArr = filteredGroupedOrders.groupArr.filter(
      ({ parent }) => (parent && parent.orderStatus) !== 'closed',
    );
    // unparented legacy KOTs are never closed → always active.
    return { groupArr, unparented: filteredGroupedOrders.unparented };
  }, [filteredGroupedOrders]);

  const historyGroupedOrders = useMemo(() => {
    const groupArr = filteredGroupedOrders.groupArr
      .filter(({ parent }) => (parent && parent.orderStatus) === 'closed')
      .slice()
      .sort((a, b) => {
        const aU = new Date((a.parent && a.parent.updated) || (a.parent && a.parent.created) || 0).getTime();
        const bU = new Date((b.parent && b.parent.updated) || (b.parent && b.parent.created) || 0).getTime();
        return bU - aU;
      });
    return { groupArr, unparented: [] };
  }, [filteredGroupedOrders]);

  // ---- Linked Orders grouping for the Active tab ----
  // Partition a filtered parent-order list by its `tableGroup` relation.
  // Entries sharing a non-null tableGroup are rendered under one
  // "Combine Tables" heading; entries with no tableGroup keep the existing
  // standalone card rendering. Each table's individual Order ID, KOTs,
  // status, payment, and controls are fully preserved — only a visual
  // heading wrapper is added for linked groups. Financial totals are NOT
  // merged; per-Order payment behaviour is unchanged.
  // Extracted as a pure helper so both Active Orders and Order History can
  // reuse the exact same partitioning + sorting logic.
  const buildLinkedGroups = useCallback((grouped) => {
    const linkedMap = new Map(); // tableGroupId -> { tableGroupId, group, entries: [] }
    const sharedMap = new Map(); // tableGroupId -> { tableGroupId, group, entry }
    const standalone = [];
    grouped.groupArr.forEach((entry) => {
      const tg = entry.parent && entry.parent.tableGroup;
      if (tg) {
        const g = groupMap.get(tg);
        if (g && g.mode === 'shared') {
          // Shared Order: ONE parent order spans all member tables. Render
          // it as a single card under a "Shared Order" heading showing the
          // full table combination. Financial state lives on this one
          // parent — it is the real merged total, not informational.
          sharedMap.set(tg, { tableGroupId: tg, group: g, entry });
        } else {
          if (!linkedMap.has(tg)) linkedMap.set(tg, { tableGroupId: tg, group: g, entries: [] });
          linkedMap.get(tg).entries.push(entry);
        }
      } else {
        standalone.push(entry);
      }
    });
    const linkedArr = [...linkedMap.values()].map((g) => ({
      ...g,
      entries: g.entries.slice().sort(
        (a, b) => (parseTableNum(a.parent && a.parent.tableNumber) || 0) - (parseTableNum(b.parent && b.parent.tableNumber) || 0),
      ),
    }));
    linkedArr.sort((a, b) => {
      const aLast = a.entries[0] && a.entries[0].kots[a.entries[0].kots.length - 1];
      const bLast = b.entries[0] && b.entries[0].kots[b.entries[0].kots.length - 1];
      return new Date((bLast && bLast.created) || 0) - new Date((aLast && aLast.created) || 0);
    });
    const sharedArr = [...sharedMap.values()];
    sharedArr.sort((a, b) => {
      const aLast = a.entry.kots[a.entry.kots.length - 1];
      const bLast = b.entry.kots[b.entry.kots.length - 1];
      return new Date((bLast && bLast.created) || 0) - new Date((aLast && aLast.created) || 0);
    });
    return { linkedArr, sharedArr, standalone };
  }, [groupMap, parseTableNum]);

  const activeLinkedGroups = useMemo(
    () => buildLinkedGroups(activeGroupedOrders),
    [buildLinkedGroups, activeGroupedOrders],
  );
  const historyLinkedGroups = useMemo(
    () => buildLinkedGroups(historyGroupedOrders),
    [buildLinkedGroups, historyGroupedOrders],
  );

  // Count of currently-active filters (for the Reset control + indicator).
  const activeFilterCount =
    (filterKitchenStatus !== 'all' ? 1 : 0) +
    (filterTable !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setFilterKitchenStatus('all');
    setFilterTable('all');
  };

  // The currently-visible linked/standalone groups + legacy unparented KOTs,
  // selected by the Active Orders / Order History sub-tab. Both sub-tabs
  // reuse the same Kitchen Status + Table filters above.
  const currentLinkedGroups = activeSubTab === 'history' ? historyLinkedGroups : activeLinkedGroups;
  const currentUnparented = activeSubTab === 'history' ? [] : activeGroupedOrders.unparented;
  const currentHasOrders =
    (currentLinkedGroups.sharedArr.length +
      currentLinkedGroups.linkedArr.length +
      currentLinkedGroups.standalone.length +
      currentUnparented.length) > 0;

  // If the admin removes or renames the table currently selected as the
  // Table filter, fall back to "All Tables" so the dropdown never shows a
  // stale/missing selection. Reflects dynamic admin config changes.
  useEffect(() => {
    if (filterTable === 'all') return;
    const exists = filterTableOptions.some((t) => String(t.name) === String(filterTable));
    if (!exists) setFilterTable('all');
  }, [filterTableOptions, filterTable]);

  // Refresh re-fetches BOTH waiter_orders (parents) and kitchen_orders
  // (children), clears + reloads all data, preserves the active filters, and
  // shows a loading state while in flight.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchOrders(), fetchWaiterOrders()]);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Active tab refresh failed:', err);
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading menu...
      </div>
    );
  }

  // End Order eligibility: every child KOT must be completed (served) or
  // cancelled. A cancelled ticket is a resolved outcome and does not block
  // closure. Payment is NOT a condition for End Order — it is a condition
  // for Free Table instead (see canFreeTable).
  const allKotsResolved = (kots) =>
    (kots || []).every((k) => k.status === 'completed' || k.status === 'cancelled');

  // Free Table eligibility: the parent Order must be ended (endedAt set —
  // End Order marks this without closing the order) AND all payment
  // obligations fully settled (outstandingAmount = 0). Both conditions are
  // enforced here AND re-checked inside markAvailable against live DB state,
  // so the rule is backed by the existing business/data state — not only by
  // visually disabling the button. Free Table then sets orderStatus =
  // "closed" + freed = true.
  const canFreeTable = (parent, kots) => {
    const isEnded = !!(parent && parent.endedAt);
    const figures = computePayment(kots);
    return isEnded && figures.outstandingAmount <= 0;
  };

  // End Order: marks the parent waiter_orders record as ended (endedAt only)
  // once every child KOT is completed (served). It does NOT set orderStatus —
  // the order stays "open" and the table stays occupied. orderStatus only
  // becomes "closed" later, by the explicit Free Table action.
  const handleEndOrder = async () => {
    if (!endOrderTarget) return;
    const { parent, kots } = endOrderTarget;
    const parentId = parent && parent.id;
    if (!parentId) {
      toast.error('Cannot end order: missing parent record');
      setEndOrderTarget(null);
      return;
    }
    // Validation: every child KOT must be completed (served) or cancelled.
    // A cancelled ticket is a resolved outcome and does not block closure.
    // Payment is settled separately and gates Free Table, not End Order, so
    // it is intentionally NOT checked here.
    const blocking = kots.filter((k) => k.status !== 'completed' && k.status !== 'cancelled');
    if (blocking.length > 0) {
      const labels = blocking.map((k) => resolveOrderId(k)).join(', ');
      toast.error(`Cannot end order — ${blocking.length} ticket(s) not served: ${labels}`);
      setEndOrderTarget(null);
      return;
    }
    try {
      await pb.collection('waiter_orders').update(
        parentId,
        { endedAt: new Date().toISOString() },
        { $autoCancel: false }
      );
      toast.success(`Order ${resolveBaseOrderId(kots[0] || { expand: { parentOrder: parent } })} ended. Free the table when ready.`);
      fetchWaiterOrders();
      fetchOrders();
      // Clear the persisted draft — the parent order is now closed.
      clearDraft();
      if (onPlaced) onPlaced();
    } catch (err) {
      console.error('Failed to end order:', err);
      toast.error('Failed to end order');
    } finally {
      setEndOrderTarget(null);
    }
  };

  // Generate Bill — Phase 1: gated ONLY on the successful completion of the
  // existing End Order workflow (parent.endedAt set). It does NOT call
  // Fiskaly, does NOT generate a fiscal receipt, does NOT change payment
  // processing, and does NOT free the table. The handler is a placeholder
  // that confirms the gating; fiscal receipt generation is a later phase.
  // Existing Pay / Free Table / pre-End-Order behavior is untouched.
  const handleGenerateBill = (parent, kots) => {
    // Defensive re-check: bill generation is allowed only after End Order.
    if (!parent || !parent.endedAt) {
      toast.error('Generate Bill is available only after End Order is completed.');
      return;
    }
    const baseOrderId = resolveBaseOrderId({ expand: { parentOrder: parent } });
    toast.info(`Bill generation for order ${baseOrderId} will be available in a later phase.`);
  };

  // ---- Linked Orders group-level actions ----
  // These iterate every member Order of a linked group and run the EXISTING
  // per-Order validation for each. They NEVER force-close or force-free an
  // Order that does not satisfy its own prerequisites — ineligible members
  // are skipped and reported, eligible members are actioned. Financial state
  // stays per parent Order; only a combined informational total is shown in
  // the group heading (see the Active-tab linked-group rendering).

  // Group End All: closes every member Order whose KOTs are all completed or
  // cancelled (the same allKotsResolved rule as the single-Order End Order).
  // Already-closed members are skipped. Members with unresolved KOTs are
  // reported as blocked and left open. Payment is NOT a condition for End
  // Order (it gates Free Table), so it is not checked here.
  const handleEndOrderGroup = async () => {
    if (!groupEndTarget) return;
    const entries = groupEndTarget.entries || [];
    const ended = [];
    const blocked = [];
    for (const { parent, kots } of entries) {
      if (!parent || !parent.id) continue;
      if (parent.endedAt) continue; // already ended
      if (!allKotsResolved(kots)) {
        blocked.push(parent.tableNumber || parent.orderId);
        continue;
      }
      try {
        await pb.collection('waiter_orders').update(
          parent.id,
          { endedAt: new Date().toISOString() },
          { $autoCancel: false, requestKey: `end-grp-${parent.id}` },
        );
        ended.push(parent.tableNumber || parent.orderId);
      } catch (err) {
        console.error('Group End: failed for', parent.id, err);
        blocked.push(parent.tableNumber || parent.orderId);
      }
    }
    fetchWaiterOrders();
    fetchOrders();
    if (ended.length > 0 && blocked.length === 0) {
      toast.success(`Ended ${ended.length} order(s): ${ended.join(', ')}`);
    } else if (ended.length > 0 && blocked.length > 0) {
      toast.message(`Ended ${ended.length}: ${ended.join(', ')}. Blocked ${blocked.length}: ${blocked.join(', ')}`);
    } else if (blocked.length > 0) {
      toast.error(`No orders ended — ${blocked.length} blocked: ${blocked.join(', ')}`);
    } else {
      toast.info('No open orders to end in this group.');
    }
    setGroupEndTarget(null);
  };

  // Group Free All: frees every member Order that is ended (endedAt set)
  // AND fully settled (outstandingAmount = 0) — the same
  // canFreeTable rule as the single-Order Free Table. Each member is
  // re-validated against live DB state before freeing (matching
  // markAvailable's live re-check), so an Order that became unpaid or was
  // re-opened mid-flow is never force-freed. This is the ONLY action that
  // releases a member's table: it sets freed = true on the member's parent
  // order (dropping it from occupiedTableNumbers) and releases its
  // combination membership.
  const handleFreeTableGroup = async () => {
    if (!groupFreeTarget) return;
    const entries = groupFreeTarget.entries || [];
    const freed = [];
    const blocked = [];
    for (const { parent } of entries) {
      if (!parent || !parent.id) continue;
      const tn = parent.tableNumber || '';
      try {
        // Live re-check: fetch the parent's current state.
        const res = await pb.collection('waiter_orders').getList(1, 1, {
          filter: pb.filter('id = {:id}', { id: parent.id }),
          $autoCancel: false,
          requestKey: `free-grp-get-${parent.id}`,
        });
        const live = res.items && res.items[0];
        if (!live) { blocked.push(tn || parent.orderId); continue; }
        if (!live.endedAt) { blocked.push(tn); continue; }
        // Live re-check: recompute outstanding from current KOTs.
        const liveKots = await pb.collection('kitchen_orders').getFullList({
          filter: pb.filter('parentOrder = {:pid}', { pid: live.id }),
          $autoCancel: false,
          requestKey: `free-grp-kots-${live.id}`,
        });
        const fig = computePayment(liveKots);
        if (fig.outstandingAmount > 0) { blocked.push(tn); continue; }
        // Mark the member's parent order as freed — the ONLY action that
        // releases its table. End Order only closed the order; the table
        // stayed occupied until this explicit Free Table action.
        await pb.collection('waiter_orders').update(
          live.id,
          { orderStatus: 'closed', freed: true },
          { $autoCancel: false, requestKey: `free-grp-wo-${live.id}` },
        );
        // Release this table from its combination so it is immediately
        // selectable again as a normal table (Linked: drops only this
        // member's isActive; closes the group when the last member is
        // freed). See releaseTableFromCombination.
        await releaseTableFromCombination(live);
        freed.push(tn);
      } catch (err) {
        console.error('Group Free: failed for', parent.id, err);
        blocked.push(tn || parent.orderId);
      }
    }
    fetchWaiterOrders();
    fetchOrders();
    if (freed.length > 0 && blocked.length === 0) {
      toast.success(`Freed ${freed.length} table(s): ${freed.join(', ')}`);
    } else if (freed.length > 0 && blocked.length > 0) {
      toast.message(`Freed ${freed.length}: ${freed.join(', ')}. Blocked ${blocked.length}: ${blocked.join(', ')}`);
    } else if (blocked.length > 0) {
      toast.error(`No tables freed — ${blocked.length} blocked: ${blocked.join(', ')}`);
    } else {
      toast.info('No tables to free in this group.');
    }
    setGroupFreeTarget(null);
  };

  // ---- Payment settlement ----
  // Open the Pay picker: lists open orders with payable KOTs. If a table is
  // already selected in the Order, auto-open that table's order directly.
  const openPayFlow = async () => {
    // Use the freshly returned list (state updates are async, so reading
    // payableOrders here would be stale on the first open).
    const list = await fetchPayableOrders();
    if (!list || list.length === 0) {
      toast.error('No open orders to settle');
      return;
    }
    // If a table is selected, jump straight into that table's open order.
    if (tableNumber) {
      const match = list.find((g) => (g.parent.tableNumber || '') === tableNumber);
      if (match) {
        startPaymentSettlement(match);
        return;
      }
    }
    setPayPickerOpen(true);
  };

  // Begin settling a specific parent order. Loads its KOTs fresh and seeds
  // the selection map empty (nothing pre-selected — settlement is an
  // explicit payment event, not a toggle).
  const startPaymentSettlement = async (group) => {
    setPaymentTarget(group);
    setPaymentSelections({});
    setPayPickerOpen(false);
  };

  // Toggle a single unpaid line entry in the payment selection. Already-
  // cleared (paid) items cannot be selected — they are settled and are not
  // re-toggled back to unpaid by tapping.
  const togglePaymentItem = (kotId, itemIndex) => {
    setPaymentSelections((prev) => {
      const next = { ...prev };
      const kotSel = { ...(next[kotId] || {}) };
      if (kotSel[itemIndex]) {
        delete kotSel[itemIndex];
      } else {
        kotSel[itemIndex] = true;
      }
      next[kotId] = kotSel;
      return next;
    });
  };

  // Select / deselect every unpaid line across all KOTs in the target order.
  const toggleSelectAllUnpaid = (selectAll) => {
    if (!paymentTarget) return;
    const next = {};
    if (selectAll) {
      paymentTarget.kots.forEach((k) => {
        if (k.status === 'cancelled') return;
        const sel = {};
        (k.items || []).forEach((it, idx) => {
          if (!isCleared(it)) sel[idx] = true;
        });
        if (Object.keys(sel).length > 0) next[k.id] = sel;
      });
    }
    setPaymentSelections(next);
  };

  // Sum of the currently-selected unpaid line totals (the amount about to
  // be settled when the waiter confirms).
  // Plain computation (not useMemo): this runs after the `loading` early
  // return, so a hook here would break React's hook-order rule.
  const selectedSettleAmount = (() => {
    if (!paymentTarget) return 0;
    let sum = 0;
    paymentTarget.kots.forEach((k) => {
      if (k.status === 'cancelled') return;
      const sel = paymentSelections[k.id] || {};
      (k.items || []).forEach((it, idx) => {
        if (sel[idx] && !isCleared(it)) sum += lineTotal(it);
      });
    });
    return Math.round(sum * 100) / 100;
  })();

  // Confirm payment: mark each selected unpaid line cleared = true on its
  // KOT record, then recalc the parent's payment fields. Cleared items are
  // a payment event — once true they are never silently flipped back.
  const handleConfirmPayment = async () => {
    if (!paymentTarget) return;
    const { parent, kots } = paymentTarget;
    const hasSelection = Object.values(paymentSelections).some(
      (s) => Object.keys(s || {}).length > 0,
    );
    if (!hasSelection) {
      toast.error('Select at least one unpaid item to settle');
      return;
    }
    setPaymentSubmitting(true);
    try {
      // Update each KOT that has selected lines. Use a distinct requestKey
      // per KOT so parallel updates don't auto-cancel each other.
      await Promise.all(
        kots.map(async (k, i) => {
          if (k.status === 'cancelled') return;
          const sel = paymentSelections[k.id] || {};
          if (Object.keys(sel).length === 0) return;
          const items = (k.items || []).map((it, idx) => {
            if (sel[idx] && !isCleared(it)) {
              // Mark cleared. paidAt/paymentMode metadata can be attached
              // here later when a payments collection is added.
              return { ...it, cleared: true };
            }
            return it;
          });
          await pb.collection('kitchen_orders').update(
            k.id,
            { items },
            { $autoCancel: false, requestKey: `pay-kot-${k.id}-${i}` },
          );
        }),
      );
      // Recalc & persist the parent's aggregate payment fields.
      await recalcAndUpdateParent(parent.id);
      toast.success(
        `Payment settled: €${selectedSettleAmount.toFixed(2)} cleared`,
      );
      // Refresh everything so the Active tab reflects cleared items.
      fetchOrders();
      fetchWaiterOrders();
      if (onPlaced) onPlaced();
      // Close the modal.
      setPaymentTarget(null);
      setPaymentSelections({});
    } catch (err) {
      console.error('Payment settlement failed:', err);
      toast.error('Payment settlement failed');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Renders one parent-order card for the Active tab. Extracted so Linked
  // Orders can be wrapped under a shared "Combine Tables" heading without
  // duplicating the card. Each table's individual Order ID, KOTs, status,
  // payment info, and controls are fully preserved — only the call site
  // differs (standalone vs. inside a linked-group wrapper).
  const renderGroupedCard = (parent, kots) => {
              const isOpen = (parent && parent.orderStatus) !== 'closed';
              const isEnded = !!(parent && parent.endedAt);
              const orderTotal = kots.reduce((s, k) => s + (k.totalPrice || 0), 0);
              const firstKot = kots[0];
              const tableNumber = tableDisplayForParent(parent, groupMap) || (firstKot && firstKot.tableNumber) || (parent && parent.tableNumber) || '';
              const baseOrderId = resolveBaseOrderId({ expand: { parentOrder: parent } });
              return (
                <Card key={parent.id} className="border-2 border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    {/* Parent header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Table</p>
                        <p className="text-2xl font-bold">{tableNumber}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={`font-bold ${isOpen ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                          {isOpen ? 'Open' : 'Closed'}
                        </Badge>
                        <p className="text-[11px] font-mono font-bold text-primary mt-1">{baseOrderId}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                          <Layers className="h-3 w-3" /> {kots.length} KOT{kots.length > 1 ? 's' : ''}
                        </p>
                        {isEnded ? (
                          <p className="text-[10px] text-muted-foreground notranslate" translate="no">
                            Ended {new Date(parent.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* KOTs list — original first, additional KOTs below */}
                    <div className="space-y-3">
                      {kots.map((order) => {
                        const meta = STATUS_META[order.status] || STATUS_META.pending;
                        const delayed = isKotDelayed(order, now);
                        return (
                          <div key={order.id} className={`rounded-lg border border-border/60 bg-card/60 p-3 space-y-2 ${delayed ? DELAYED_CARD_CLS + ' border-destructive' : ''}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-mono font-bold text-primary">{resolveOrderId(order)}</p>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <Badge variant="outline" className={`font-bold text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                                {delayed ? <KotDelayedBadge /> : null}
                                <span className="text-[10px] text-muted-foreground notranslate" translate="no">
                                  {new Date(order.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <ul className="space-y-1 text-sm">
                              {(order.items || []).map((it, idx) => (
                                <li
                                  key={idx}
                                  className={`flex flex-wrap items-center gap-2 rounded px-1.5 py-1 border ${
                                    isCleared(it)
                                      ? 'bg-emerald-50 border-emerald-300'
                                      : 'bg-red-50 border-red-300'
                                  }`}
                                >
                                  <span className="font-bold text-primary">{it.quantity}×</span>
                                  <span className="min-w-0 break-words">{it.name}</span>
                                  {it.spiceLevel && it.spiceLevel !== 'None' ? (
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SPICE_CLS[it.spiceLevel] || 'bg-muted text-muted-foreground border-border'}`}>
                                      <Flame className="h-3 w-3" /> {it.spiceLevel}
                                    </span>
                                  ) : null}
                                  {it.tableNumber ? (
                                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-secondary/20 text-primary border-secondary/50 shrink-0 notranslate" translate="no">
                                      <DoorOpen className="h-3 w-3 inline mr-0.5 -mt-0.5" />{it.tableNumber}
                                    </span>
                                  ) : null}
                                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                                    {order.status === 'pending' && (order.items || []).length >= 2 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDecreaseItem(order, idx)}
                                        className="group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        title="Decrease quantity by 1"
                                        aria-label={`Decrease ${it.name} quantity by 1`}
                                      >
                                        <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-destructive/40 transition-colors group-hover:bg-destructive/10 group-active:scale-95">
                                          <Minus className="h-3.5 w-3.5" />
                                        </span>
                                      </button>
                                    )}
                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                      isCleared(it)
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                                        : 'bg-red-100 text-red-800 border-red-400'
                                    }`}>
                                      {isCleared(it) ? <Check className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                                      {isCleared(it) ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {order.notes ? (
                              <p className="text-xs italic text-muted-foreground">“{order.notes}”</p>
                            ) : null}
                            <div className="flex items-center justify-between pt-1 border-t border-border/40">
                              <span className="font-semibold text-primary text-sm">€{(order.totalPrice || 0).toFixed(2)}</span>
                              <div className="flex items-center gap-1.5">
                                {order.status === 'ready' && (
                                  <Button size="sm" className="h-7" onClick={() => markServed(order)}>{t('waiter_markServed')}</Button>
                                )}
                                {printAllowed ? (
                                  <Button size="sm" variant="outline" className="h-7" onClick={() => handlePrintKOT(order)}>
                                    <Printer className="h-3.5 w-3.5 mr-1" /> KOT
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-destructive font-medium">Printing disabled</span>
                                )}
                              </div>
                            </div>
                            {order.status === 'pending' ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 w-full"
                                onClick={() => setCancelTarget(order)}
                              >
                                <Ban className="h-3.5 w-3.5 mr-1" /> Cancel Ticket
                              </Button>
                            ) : CANCEL_BLOCKED_MSG[order.status] ? (
                              <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 pt-1">
                                <XCircle className="h-3.5 w-3.5 shrink-0" />
                                {CANCEL_BLOCKED_MSG[order.status]}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {/* Parent footer: order total + End Order / Free Table */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="font-bold text-primary">Order Total €{orderTotal.toFixed(2)}</span>
                    </div>
                    {(() => {
                      const allResolved = allKotsResolved(kots);
                      const fig = computePayment(kots);
                      const freeable = canFreeTable(parent, kots);
                      const isFreed = !!(parent && parent.freed === true);
                      const pendingCount = kots.filter((k) => k.status !== 'completed' && k.status !== 'cancelled').length;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {!isEnded ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1"
                                disabled={!allResolved}
                                onClick={() => setEndOrderTarget({ parent, kots })}
                              >
                                <CircleStop className="h-4 w-4 mr-1" /> End Order
                              </Button>
                            ) : (
                              <span className="flex-1 text-xs text-muted-foreground italic text-center">Order ended</span>
                            )}
                            {isFreed ? (
                              <span className="flex-1 text-xs text-emerald-700 italic text-center flex items-center justify-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Table Freed
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-1 text-primary"
                                disabled={!freeable}
                                onClick={() => markAvailable(firstKot)}
                              >
                                <DoorOpen className="h-4 w-4 mr-1" /> Free Table
                              </Button>
                            )}
                          </div>
                          {/* Generate Bill — Phase 1: DISABLED until the existing
                              End Order workflow has successfully completed
                              (parent.orderStatus === 'closed'). Before End Order
                              the button is visibly disabled; after End Order it
                              becomes enabled. It does NOT call Fiskaly, does NOT
                              generate a fiscal receipt, and does NOT free the
                              table in this phase. */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={!isEnded}
                            onClick={() => handleGenerateBill(parent, kots)}
                            title={!isEnded ? 'Generate Bill is available only after End Order is completed.' : 'Generate Bill'}
                          >
                            <Receipt className="h-4 w-4 mr-1" /> Generate Bill
                          </Button>
                          {!isEnded && (
                            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <Receipt className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>Generate Bill locked — complete End Order first.</span>
                            </p>
                          )}
                          {!isEnded && !allResolved && (
                            <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
                              <CircleStop className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>End Order locked — {pendingCount} ticket{pendingCount > 1 ? 's' : ''} still pending or being prepared.</span>
                            </p>
                          )}
                          {!freeable && !isFreed && (
                            <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
                              <DoorOpen className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                {!isEnded
                                  ? 'Free Table locked — end the order first.'
                                  : fig.outstandingAmount > 0
                                    ? 'Free Table locked — settle payment first.'
                                    : ''}
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {/* Payment summary + Pay action for this parent order */}
                    {(() => {
                      const fig = computePayment(kots);
                      return (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">
                              Paid <strong className="text-emerald-700">€{fig.paidAmount.toFixed(2)}</strong>
                            </span>
                            <span className="text-muted-foreground">
                              Outstanding{' '}
                              <strong className={fig.outstandingAmount > 0 ? 'text-red-700' : 'text-emerald-700'}>
                                €{fig.outstandingAmount.toFixed(2)}
                              </strong>
                            </span>
                            <Badge
                              variant="outline"
                              className={`font-bold text-[10px] uppercase ${
                                fig.paymentStatus === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                                  : fig.paymentStatus === 'partial'
                                  ? 'bg-amber-100 text-amber-800 border-amber-400'
                                  : 'bg-red-100 text-red-800 border-red-400'
                              }`}
                            >
                              {fig.paymentStatus}
                            </Badge>
                          </div>
                          {fig.outstandingAmount > 0 ? (
                            <Button
                              size="sm"
                              className="w-full touch-target"
                              onClick={() => startPaymentSettlement({ parent, kots })}
                            >
                              <CreditCard className="h-4 w-4 mr-1" /> Pay — €{fig.outstandingAmount.toFixed(2)} due
                            </Button>
                          ) : (
                            <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Fully settled
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
  };

  return (
    <>
      {readyPickups.length > 0 && (
        <div
          ref={readyBannerRef}
          className="fixed left-0 right-0 z-[90] w-full max-w-[100vw] box-border px-2 sm:px-3 animate-in slide-in-from-top-full duration-300"
          style={{ top: stickyTop }}
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto w-full max-w-2xl rounded-xl border-2 border-emerald-300 bg-emerald-600 text-white shadow-2xl ring-2 sm:ring-4 ring-emerald-400/40 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 p-3 sm:p-4 min-w-0">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="shrink-0 rounded-full bg-white/20 p-1.5 sm:p-2 mt-0.5">
                  <Bell className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm sm:text-base md:text-lg leading-snug break-words">
                    {t('waiter_readyPickupTitle')}
                  </p>
                  <p className="text-xs sm:text-sm text-white/90 mt-0.5 leading-snug break-words whitespace-normal">
                    {readyPickups.length === 1
                      ? t('waiter_readyPickupBody')
                          .replace('{kotId}', readyPickups[0].kotId)
                          .replace('{table}', readyPickups[0].table || '—')
                      : t('waiter_readyPickupMulti').replace('{count}', String(readyPickups.length))}
                  </p>
                </div>
              </div>
              <div className="flex flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto sm:shrink-0 sm:ml-auto pl-0 sm:pl-0">
                <Button
                  size="sm"
                  variant="secondary"
                  className="touch-target flex-1 sm:flex-none min-w-0 h-auto min-h-[44px] whitespace-normal text-center px-3 py-2 text-xs sm:text-sm"
                  onClick={() => { acknowledgeAllReady(); setTab('active'); }}
                >
                  {t('waiter_readyPickupView')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 hover:text-white touch-target flex-1 sm:flex-none min-w-0 h-auto min-h-[44px] whitespace-normal text-center px-3 py-2 text-xs sm:text-sm"
                  onClick={() => (readyPickups.length === 1 ? dismissReadyPickup(readyPickups[0].id) : acknowledgeAllReady())}
                >
                  {t('waiter_readyPickupDismiss')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      {/* Sticky tab bar — positioned below header + marquee */}
      <div ref={tabBarRef} className="sticky z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-2 border-b border-border" style={{ top: stickyTop + readyBannerHeight }}>
        <TabsList className={`w-full grid ${showActiveTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="place">
            <Plus className="h-4 w-4 mr-1" /> New Order
          </TabsTrigger>
          <TabsTrigger value="order" className="relative">
            <ShoppingCart className="h-4 w-4 mr-1" /> Order
            {orderCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold">
                {orderCount}
              </span>
            )}
          </TabsTrigger>
          {showActiveTab && (
            <TabsTrigger value="active">
              <ListOrdered className="h-4 w-4 mr-1" /> Active ({activeGroupCount})
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      {/* ===== New Order tab ===== */}
      <TabsContent value="place" className="mt-4 space-y-4 pb-24">
        {lastOrder && (
          <Card className="border-2 border-emerald-400 bg-emerald-50/60">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold text-sm">
                  Order {resolveOrderId(lastOrder)} placed for{' '}
                  Table {lastOrder.tableNumber}
                </span>
                <span className="text-[11px] text-emerald-700/80 notranslate" translate="no">
                  {new Date(lastOrder.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              {printAllowed ? (
                <Button variant="outline" size="sm" onClick={() => handlePrintKOT(lastOrder)}>
                  <Printer className="h-4 w-4 mr-1" /> Print KOT
                </Button>
              ) : (
                <span className="text-xs text-destructive font-medium flex items-center gap-1.5">
                  <Printer className="h-4 w-4" /> Printing is currently disabled
                </span>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 1 — Table selection (required before menu browsing).
            The Combine Tables toggle switches between the existing
            single-table Select (unchanged when off) and a multi-select list
            of available tables for Linked Orders (when on). */}
        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base text-primary flex-wrap">
              <span className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5" /> Select a Table
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold normal-case text-primary cursor-pointer select-none">
                <Switch
                  checked={combineMode}
                  onCheckedChange={(v) => {
                    setCombineMode(v);
                    if (v) { setTableNumber(''); setRoom(''); setPendingParent(null); }
                    else {
                      setSelectedTables([]);
                      setPendingCombined(null);
                      setPendingShared(null);
                      setCombineModeType('linked');
                      resetLinkedState();
                      setOrder({}); setNotes(''); setSpiceSelections({});
                    }
                  }}
                />
                Combine Tables
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {combineMode ? (
              combineModeType === 'linked' && linkedGroupCreated ? (
                <>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Linked tables — select one to add items <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTables.map((tn) => {
                      const tcfg = activeTables.find((x) => x.name === tn);
                      const isActiveTn = tn === activeLinkedTable;
                      const cart = isActiveTn ? { order } : (linkedCarts[tn] || { order: {} });
                      const cartCount = Object.values(cart.order || {}).reduce((s, e) => s + (e.qty || 0), 0);
                      return (
                        <button
                          key={tn}
                          type="button"
                          onClick={() => switchLinkedTable(tn)}
                          className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 font-semibold text-sm transition-all touch-target min-w-0 ${
                            isActiveTn
                              ? 'border-primary bg-primary text-primary-foreground shadow-md'
                              : 'border-border bg-background text-foreground hover:border-primary/50'
                          }`}
                          title={isActiveTn ? 'Adding items to this table' : 'Switch to this table'}
                        >
                          <DoorOpen className="h-4 w-4 shrink-0" />
                          <span className="break-words">{tn}</span>
                          {tcfg && tcfg.room ? <span className={`text-[10px] font-medium normal-case ${isActiveTn ? 'opacity-80' : 'text-muted-foreground'}`}>{tcfg.room}</span> : null}
                          {cartCount > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold shrink-0 ${isActiveTn ? 'bg-secondary text-secondary-foreground' : 'bg-secondary/20 text-primary border border-secondary/50'}`}>
                              {cartCount}
                            </span>
                          )}
                          {isActiveTn && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-primary font-medium break-words">
                    Adding items to <strong>Table {activeLinkedTable}</strong> only. Each linked table keeps its own order, ticket, and bill.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full touch-target"
                    onClick={() => {
                      setCombineMode(false);
                      resetLinkedState();
                      setOrder({}); setNotes(''); setSpiceSelections({});
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Done — Exit Combine Tables
                  </Button>
                </>
              ) : (
              <>
                <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Select 2 or more available tables <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCombineModeType('linked')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-2 font-semibold text-xs transition-all touch-target text-center ${
                      combineModeType === 'linked'
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                    title="Each table gets its own order, ticket, and bill"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Linked Orders</span>
                    <span className={`text-[9px] font-medium normal-case ${combineModeType === 'linked' ? 'opacity-80' : 'text-muted-foreground'}`}>separate bills</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCombineModeType('shared')}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-2 font-semibold text-xs transition-all touch-target text-center ${
                      combineModeType === 'shared'
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                    title="One order, one ticket stream, one combined bill for all tables"
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                    <span>Shared Order</span>
                    <span className={`text-[9px] font-medium normal-case ${combineModeType === 'shared' ? 'opacity-80' : 'text-muted-foreground'}`}>one combined bill</span>
                  </button>
                </div>
                {activeTables.length > 0 ? (
                  <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border bg-card/60 divide-y divide-border">
                    {activeTables.map((t) => {
                      const occupied = occupiedTableNumbers.has(t.name);
                      const combined = activeCombinationTableNumbers.has(t.name);
                      const unavailable = occupied || combined;
                      const checked = selectedTables.includes(t.name);
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-3 px-3 py-2.5 min-h-touch ${unavailable ? 'opacity-50' : 'cursor-pointer hover:bg-accent/40'}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={unavailable}
                            onCheckedChange={(v) => toggleTableSelection(t.name, !!v)}
                          />
                          <span className="flex-1 min-w-0 font-medium text-sm">
                            {t.name} {t.room ? <span className="text-muted-foreground">({t.room})</span> : null}
                          </span>
                          {occupied && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-destructive shrink-0">Occupied</span>
                          )}
                          {combined && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 shrink-0">Combined</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No active tables configured.</p>
                )}
                {selectedTables.length < 2 && (
                  <p className="text-xs text-muted-foreground">
                    Select at least two available tables to create a {combineModeType === 'shared' ? 'shared' : 'linked'} order.
                  </p>
                )}
                {selectedTables.length >= 2 && combineModeType === 'linked' && (
                  <p className="text-xs text-primary font-medium break-words">
                    Linked order: {selectedTables.join(', ')} — each table gets its own order &amp; ticket.
                  </p>
                )}
                {selectedTables.length >= 2 && combineModeType === 'shared' && (
                  <p className="text-xs text-primary font-medium break-words">
                    Shared order: {selectedTables.join(' + ')} — one order, one ticket, one combined bill for all tables.
                  </p>
                )}
                {pendingCombined && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 break-words">
                    Retrying failed table(s): {pendingCombined.pendingTables.join(', ')} — tap Send to Kitchen again.
                  </p>
                )}
                {pendingShared && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 break-words">
                    Retrying shared order for table(s): {(pendingShared.pendingTables && pendingShared.pendingTables.length > 0 ? pendingShared.pendingTables : pendingShared.allTables).join(', ')} — tap Send to Kitchen again.
                  </p>
                )}
                {combineModeType === 'linked' && selectedTables.length >= 2 && (
                  <Button
                    type="button"
                    className="w-full touch-target"
                    size="sm"
                    onClick={startLinkedGroup}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Layers className="h-4 w-4 mr-2" />}
                    Start Linked Order
                  </Button>
                )}
              </>
              )
            ) : (
              <>
                <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Table Number <span className="text-destructive">*</span>
                </Label>
                {activeTables.length > 0 ? (
                  <Select
                    value={tableNumber}
                    onValueChange={(v) => {
                      setTableNumber(v);
                      const t = activeTables.find((x) => x.name === v);
                      if (t) setRoom(t.room || '');
                    }}
                  >
                    <SelectTrigger ref={tableSelectRef} className="bg-background">
                      <SelectValue placeholder="Select Table" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTables.map((t) => {
                        const hasOpenOrder = openOrderTableNumbers.has(t.name);
                        const occupied = occupiedTableNumbers.has(t.name);
                        const combined = activeCombinationTableNumbers.has(t.name);
                        // A table is blocked from starting a NEW standalone
                        // order when it has no open order to attach to AND
                        // either (a) it is in an ACTIVE combination (a
                        // non-primary Shared/Linked member — the server-side
                        // hook rejects it), or (b) its latest order is
                        // closed but NOT freed (End Order ≠ Free Table — the
                        // waiter must Free Table first). The PRIMARY table of
                        // a shared order has an open order, so it stays
                        // selectable to add items as another KOT.
                        const blocked = !hasOpenOrder && (occupied || combined);
                        return (
                          <SelectItem key={t.id} value={t.name} disabled={blocked}>
                            <span className="flex items-center justify-between w-full gap-2">
                              <span className="truncate">
                                {t.name} {t.room ? `(${t.room})` : ''}
                              </span>
                              {occupied && !hasOpenOrder && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-destructive shrink-0">
                                  Ended
                                </span>
                              )}
                              {hasOpenOrder && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-destructive shrink-0">
                                  Occupied
                                </span>
                              )}
                              {blocked && combined && !occupied && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 shrink-0">
                                  Combined
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    ref={tableSelectRef}
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder={`Table # (1–${maxTableNumber})`}
                    className="bg-background"
                    type="number"
                    min="1"
                    max={maxTableNumber}
                  />
                )}
                {!tableNumber && (
                  <p className="text-xs text-muted-foreground">
                    Choose a table to begin building the order.
                  </p>
                )}
                {tableNumber && openOrderTableNumbers.has(tableNumber) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
                    <DoorOpen className="h-3.5 w-3.5 shrink-0" />
                    <span>This table has an open order — new items will be added to it as another KOT, not a new order.</span>
                  </p>
                )}
                {tableNumber && occupiedTableNumbers.has(tableNumber) && !openOrderTableNumbers.has(tableNumber) && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1 flex items-center gap-1.5">
                    <DoorOpen className="h-3.5 w-3.5 shrink-0" />
                    <span>This table has an ended order — free the table before starting a new order.</span>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {(tableNumber || (combineMode && combineModeType === 'shared' && selectedTables.length >= 2) || (combineMode && combineModeType === 'linked' && linkedGroupCreated)) && (
        <>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dishes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>

        {categories.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No menu items available.</p>
        ) : (
          <Accordion type="multiple" value={openCats} onValueChange={setOpenCats} className="w-full">
            {categories.map((cat) => {
              const items = filteredMenu.filter((m) => m.category === cat);
              if (items.length === 0) return null;
              const catCount = countByCategory[cat] || 0;
              return (
                <AccordionItem key={cat} value={cat} className="border-border">
                  <AccordionTrigger className="text-base font-bold uppercase tracking-wide text-primary hover:no-underline">
                    <span className="flex items-center gap-2">
                      {cat}
                      {catCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-secondary text-secondary-foreground text-[11px] font-bold">
                          {catCount}
                        </span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
                      {items.map((item) => {
                        const entry = order[item.id];
                        const inOrder = !!entry;
                        return (
                          <div
                            key={item.id}
                            className="relative rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                          >
                            <button
                              type="button"
                              onClick={() => addItem(item)}
                              className="flex-1 flex flex-col items-start justify-start text-left p-3 min-h-touch hover:bg-accent/40 transition-colors"
                            >
                              <span className="font-medium text-sm text-foreground leading-snug line-clamp-2">
                                {item.nameEN || item.name}
                              </span>
                              <span className="text-sm font-semibold text-primary mt-1">
                                €{(item.price || 0).toFixed(2)}
                              </span>
                            </button>
                            {/* Spice level selector — always visible on the card */}
                            <div className="px-2 pb-2">
                              <Select
                                value={getCardSpice(item.id)}
                                onValueChange={(v) => handleCardSpiceChange(item, v)}
                              >
                                <SelectTrigger className="h-7 text-xs bg-background w-full gap-1">
                                  <Flame className="h-3 w-3 text-orange-500 shrink-0" />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SPICE_LEVELS.map((lvl) => (
                                    <SelectItem key={lvl} value={lvl} className="text-xs">{lvl}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {inOrder && (
                              <div className="flex items-center justify-between border-t border-border/60 bg-secondary/10 px-2 py-1.5">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => changeQty(item.id, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-bold text-primary">{entry.qty}</span>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => addItem(item)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            {inOrder && (
                              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold shadow">
                                {entry.qty}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
        </>)}

        {/* Floating View Order pill */}
        {orderCount > 0 && (
          <button
            type="button"
            onClick={() => setTab('order')}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3 shadow-lg hover:scale-[1.02] active:scale-95 transition-transform"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="font-bold text-sm">View Order</span>
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-bold">
              {orderCount}
            </span>
            <span className="font-semibold text-sm">€{total.toFixed(2)}</span>
          </button>
        )}
      </TabsContent>

      {/* ===== Order tab ===== */}
      <TabsContent value="order" className="mt-4 pb-8">
        {orderEntries.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Your order is empty.</p>
              <Button onClick={() => setTab('place')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to New Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Header row: Back + Cancel — positioned below tab bar */}
            <div className="flex items-center justify-between gap-2 sticky z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-2 border-b border-border" style={{ top: stickyTop + readyBannerHeight + tabBarHeight }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTab('place')}
                className="touch-target"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (orderEntries.length === 0 && !notes && !orderType) {
                    setTab('place');
                    return;
                  }
                  if (window.confirm('Clear the order and notes? This cannot be undone.')) {
                    if (combineMode && combineModeType === 'linked' && linkedGroupCreated) {
                      // Linked active phase: clear ONLY the active table's
                      // cart. The linked group stays intact so the waiter
                      // can keep adding items to other tables.
                      const tn = activeLinkedTable;
                      setOrder({});
                      setNotes('');
                      setSpiceSelections({});
                      setPendingParent(null);
                      if (tn) {
                        setLinkedCarts((prev) => ({
                          ...(prev || {}),
                          [tn]: { order: {}, notes: '', spiceSelections: {} },
                        }));
                      }
                      setTab('place');
                      toast.info(`Cleared items for Table ${tn || ''}`);
                      return;
                    }
                    setOrder({});
                    setNotes('');
                    setOrderType('walkin');
                    setTableNumber('');
                    setRoom('');
                    setPendingParent(null);
                    setSelectedTables([]);
                    setCombineMode(false);
                    setCombineModeType('linked');
                    setPendingCombined(null);
                    setPendingShared(null);
                    resetLinkedState();
                    setTab('place');
                    // Explicitly clear the persisted draft on Cancel.
                    clearDraft();
                    toast.info('Order cleared');
                  }
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 touch-target"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>

            <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-primary">
                <UtensilsCrossed className="h-5 w-5" /> Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Type — required, prominent toggle group */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Order Type <span className="text-destructive">*</span>
                  {!orderType && (
                    <span className="ml-2 text-[10px] text-destructive normal-case font-medium">
                      Please select before sending
                    </span>
                  )}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('walkin')}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 font-semibold text-sm transition-all touch-target ${
                      orderType === 'walkin'
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    <DoorOpen className="h-4 w-4" /> Walk-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('preorder')}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 font-semibold text-sm transition-all touch-target ${
                      orderType === 'preorder'
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    <ListOrdered className="h-4 w-4" /> Pre-order
                  </button>
                </div>
                {pendingParent ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Retrying order <strong>{pendingParent.orderId}</strong> — same Order ID will be reused.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Table</Label>
                  <div className="flex items-center gap-2 rounded-lg border-2 border-border bg-muted/40 px-3 py-2.5 min-w-0">
                    <DoorOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-bold text-primary break-words">{combineMode ? (combineModeType === 'shared' ? ((selectedTables.join(' + ')) || '—') : (linkedGroupCreated ? (activeLinkedTable || '—') : ((selectedTables.join(', ')) || '—'))) : (tableNumber || '—')}</span>
                    {!combineMode && room && <span className="text-xs text-muted-foreground">({room})</span>}
                    {combineMode && combineModeType === 'shared' && selectedTables.length >= 2 && <span className="text-[10px] font-bold uppercase tracking-wide text-secondary shrink-0">Shared</span>}
                    {combineMode && combineModeType === 'linked' && linkedGroupCreated && <span className="text-[10px] font-bold uppercase tracking-wide text-secondary shrink-0">Linked</span>}
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground font-semibold tracking-wide shrink-0">Locked</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {combineMode ? (combineModeType === 'linked' && linkedGroupCreated ? 'Active table is chosen in the New Order tab. Go back to switch tables.' : 'Tables are chosen in the New Order tab. Go back to change them.') : 'Table is chosen in the New Order tab. Go back to change it.'}
                  </p>
                </div>
              </div>

              {/* Pay button — opens the payment settlement flow for the
                  selected table's open order (or a picker of all open
                  orders if no table is selected). */}
              <Button
                type="button"
                variant="outline"
                className="w-full border-2 border-secondary text-secondary-foreground bg-secondary/15 hover:bg-secondary/25 touch-target"
                onClick={openPayFlow}
              >
                <CreditCard className="h-4 w-4 mr-2" /> Pay / Settle Order
              </Button>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {orderEntries.map((e) => (
                  <div key={e.item.id} className="border-b border-border/50 pb-2 space-y-1.5 border-l-2 border-l-destructive/60 pl-2 rounded-l-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.item.nameEN || e.item.name}</p>
                        <p className="text-xs text-muted-foreground">€{(e.item.price || 0).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(e.item.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-bold">{e.qty}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(e.item.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(e.item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pl-1">
                      <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      <Select value={e.spiceLevel} onValueChange={(v) => setSpice(e.item.id, v)}>
                        <SelectTrigger className="h-7 text-xs bg-background w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SPICE_LEVELS.map((lvl) => (
                            <SelectItem key={lvl} value={lvl} className="text-xs">{lvl}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  className="bg-background resize-none"
                  rows={2}
                />
              </div>

              {!printAllowed && (
                <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 px-3 py-2">
                  <Printer className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium">
                    Printing is currently disabled by the administrator. Orders can still be sent to the kitchen.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between font-bold text-primary">
                <span>Total</span>
                <span>€{total.toFixed(2)}</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={submitting || !canSubmitOrder}
                aria-disabled={submitting || !canSubmitOrder}
                title={!canSubmitOrder ? orderValidationError.message : undefined}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" /> Send to Kitchen
                  </>
                )}
              </Button>
              {!canSubmitOrder && (
                <p className="text-xs text-muted-foreground text-center" role="status">
                  Complete the table, order type, and at least one dish to enable Send to Kitchen.
                </p>
              )}
            </CardContent>
          </Card>
          </div>
        )}
      </TabsContent>

      {/* ===== Active tab ===== */}
      {showActiveTab && (
      <TabsContent value="active" className="mt-4 pb-8">
        {/* Active Orders / Order History sub-tabs — replaces the old Order
            Status dropdown. Active Orders = orderStatus !== 'closed' (open,
            incl. ended/paid-but-not-freed); Order History = closed orders
            (Free Table completed). Both sub-tabs share the Kitchen Status +
            Table filters below. */}
        <div className="mb-3">
          <div role="tablist" aria-label="Order view" className="grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'active'}
              onClick={() => setActiveSubTab('active')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-colors ${
                activeSubTab === 'active'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:bg-background'
              }`}
            >
              <ListOrdered className="h-3.5 w-3.5 shrink-0" /> Active Orders
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'history'}
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-colors ${
                activeSubTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:bg-background'
              }`}
            >
              <Receipt className="h-3.5 w-3.5 shrink-0" /> Order History
            </button>
          </div>
        </div>

        {/* Filter controls (Kitchen Status + Table) + refresh */}
        <div className="space-y-2 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kitchen Status</Label>
              <Select value={filterKitchenStatus} onValueChange={setFilterKitchenStatus}>
                <SelectTrigger className="bg-card h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready to Pickup</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Table</Label>
              <Select value={filterTable} onValueChange={setFilterTable}>
                <SelectTrigger className="bg-card h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tables</SelectItem>
                  {filterTableOptions.map((t) => (
                    <SelectItem key={t.id} value={String(t.name)}>
                      {t.name}{t.room ? ` (${t.room})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 sm:items-end">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="touch-target">
                {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="touch-target text-destructive hover:text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4 mr-1" /> Reset
                </Button>
              )}
            </div>
          </div>
          {(lastRefreshed || activeFilterCount > 0) && (
            <p className="text-[10px] text-muted-foreground notranslate flex flex-wrap items-center gap-2" translate="no">
              {lastRefreshed && (
                <span>Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              )}
              {activeFilterCount > 0 && (
                <span className="font-semibold text-primary">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>
              )}
            </p>
          )}
        </div>
        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No orders yet.</p>
        ) : !currentHasOrders ? (
          <p className="text-center text-muted-foreground py-16">
            {activeSubTab === 'history' ? 'No order history' : 'No active orders'}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Shared Order groups — one parent Order spanning all member
                tables, with one combined bill. The full table combination
                is shown in the heading and on the card (read from
                table_group_members, the source of truth). Financial state,
                End Order, Free Table, and payment operate on the single
                parent — this is the real merged total, not informational. */}
            {currentLinkedGroups.sharedArr.map((sg) => {
              const { group, entry } = sg;
              const tablesLabel = (group && group.tables && group.tables.length > 1)
                ? `Tables ${group.tables.join(' + ')}`
                : (entry.parent && entry.parent.tableNumber) || '';
              return (
                <div key={sg.tableGroupId} className="space-y-3 rounded-xl border-2 border-secondary/50 bg-secondary/5 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2 text-primary mb-1">
                    <UtensilsCrossed className="h-4 w-4 text-secondary shrink-0" />
                    <span className="font-bold text-sm uppercase tracking-wide">Shared Order</span>
                    <span className="text-xs text-muted-foreground font-medium normal-case break-words">{tablesLabel}</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-secondary shrink-0">One bill</span>
                  </div>
                  {renderGroupedCard(entry.parent, entry.kots)}
                </div>
              );
            })}
            {/* Linked order groups — Combine Tables heading wrapping each
                member table's independent Order card. Financial totals are
                NOT merged; per-Order payment behaviour is unchanged. */}
            {currentLinkedGroups.linkedArr.map((lg) => {
              // ---- Linked group summary (informational only) ----
              // Financial state stays per parent Order. These aggregates are
              // displayed for visibility only and are NEVER persisted as a
              // single merged payment record.
              const members = lg.entries || [];
              let combinedTotal = 0;
              let combinedPaid = 0;
              let unresolvedCount = 0; // not ended OR has unresolved KOTs
              let unpaidCount = 0;     // outstanding > 0
              let unclearedCount = 0;  // has any unpaid item line
              let endableCount = 0;    // not ended AND all KOTs resolved
              let freeableCount = 0;   // ended, not freed AND outstanding 0
              let notFreedCount = 0;   // ended + paid but not freed (table still occupied)
              members.forEach(({ parent, kots }) => {
                const fig = computePayment(kots);
                combinedTotal += fig.totalAmount;
                combinedPaid += fig.paidAmount;
                const isEnded = !!(parent && parent.endedAt);
                const isFreed = !!(parent && parent.freed === true);
                const resolved = allKotsResolved(kots);
                if (!isEnded || !resolved) unresolvedCount += 1;
                if (fig.outstandingAmount > 0) unpaidCount += 1;
                if ((kots || []).some((k) => k.status !== 'cancelled' && (k.items || []).some((it) => !isCleared(it)))) unclearedCount += 1;
                if (!isEnded && resolved) endableCount += 1;
                if (isEnded && !isFreed && fig.outstandingAmount <= 0) freeableCount += 1;
                // Ended + fully settled but not yet freed: the table is still
                // occupied, so Free All remains pending. Mirrors the
                // single-table lifecycle where Free Table is a separate step
                // after End Order + payment.
                if (isEnded && !isFreed && fig.outstandingAmount <= 0) notFreedCount += 1;
              });
              combinedTotal = Math.round(combinedTotal * 100) / 100;
              combinedPaid = Math.round(combinedPaid * 100) / 100;
              const combinedOutstanding = Math.round((combinedTotal - combinedPaid) * 100) / 100;
              // "All settled" requires every member to be ended, paid, AND
              // freed — matching the single-table lifecycle where the table
              // is only available after Free Table. Orders that are ended +
              // paid but not yet freed still occupy their tables, so they
              // count as pending until Free All runs.
              const allDone = unresolvedCount === 0 && unpaidCount === 0 && notFreedCount === 0;
              const pendingCount = unresolvedCount + unpaidCount + notFreedCount;
              return (
              <div key={lg.tableGroupId} className="space-y-3 rounded-xl border-2 border-secondary/50 bg-secondary/5 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-primary mb-1">
                  <Layers className="h-4 w-4 text-secondary shrink-0" />
                  <span className="font-bold text-sm uppercase tracking-wide">Combine Tables</span>
                  <span className="text-xs text-muted-foreground font-medium normal-case break-words">
                    {members.map((e) => e.parent.tableNumber).join(' + ')}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] font-bold uppercase shrink-0 ${allDone ? 'bg-emerald-100 text-emerald-800 border-emerald-400' : 'bg-amber-100 text-amber-800 border-amber-400'}`}
                  >
                    {allDone ? 'All settled' : `${pendingCount} pending`}
                  </Badge>
                </div>

                {/* Combined informational total + per-member visibility.
                    Clearly labelled INFORMATIONAL — payments are NOT merged. */}
                <div className="rounded-lg border border-secondary/40 bg-background/70 p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground font-semibold uppercase tracking-wide">Group total (info)</span>
                    <span className="font-bold text-primary">€{combinedTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">
                      Paid <strong className="text-emerald-700">€{combinedPaid.toFixed(2)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Outstanding{' '}
                      <strong className={combinedOutstanding > 0 ? 'text-red-700' : 'text-emerald-700'}>
                        €{combinedOutstanding.toFixed(2)}
                      </strong>
                    </span>
                  </div>
                  {/* Per-member visibility: which linked Orders remain
                      unresolved, unpaid, or uncleared. */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                    {unresolvedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">
                        <CircleStop className="h-3 w-3" /> {unresolvedCount} unresolved
                      </span>
                    )}
                    {unpaidCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-red-50 text-red-800 border-red-300">
                        <Banknote className="h-3 w-3" /> {unpaidCount} unpaid
                      </span>
                    )}
                    {unclearedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-red-50 text-red-800 border-red-300">
                        <AlertTriangle className="h-3 w-3" /> {unclearedCount} uncleared
                      </span>
                    )}
                    {notFreedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">
                        <DoorOpen className="h-3 w-3" /> {notFreedCount} to free
                      </span>
                    )}
                    {allDone && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> All orders resolved, paid &amp; freed
                      </span>
                    )}
                  </div>
                  {/* Group-level End All / Free All — run per-Order validation
                      for every member; ineligible members are skipped, never
                      force-closed/freed. Disabled only when NO member is
                      eligible, to avoid a guaranteed no-op. */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 min-w-[8rem] touch-target"
                      disabled={endableCount === 0}
                      onClick={() => setGroupEndTarget(lg)}
                      title={endableCount === 0 ? 'No orders are ready to end' : `End ${endableCount} eligible order(s)`}
                    >
                      <CircleStop className="h-4 w-4 mr-1" /> End All ({endableCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 min-w-[8rem] touch-target text-primary"
                      disabled={freeableCount === 0}
                      onClick={() => setGroupFreeTarget(lg)}
                      title={freeableCount === 0 ? 'No tables are ready to free' : `Free ${freeableCount} eligible table(s)`}
                    >
                      <DoorOpen className="h-4 w-4 mr-1" /> Free All ({freeableCount})
                    </Button>
                  </div>
                </div>

                {members.map(({ parent, kots }) => renderGroupedCard(parent, kots))}
              </div>
              );
            })}
            {/* Standalone orders (no combination) */}
            {currentLinkedGroups.standalone.map(({ parent, kots }) => renderGroupedCard(parent, kots))}

            {/* Legacy unparented KOTs (created before grouping) */}
            {currentUnparented.map((order) => {
              const meta = STATUS_META[order.status] || STATUS_META.pending;
              const delayed = isKotDelayed(order, now);
              return (
                <Card key={order.id} className={`border-border ${delayed ? DELAYED_CARD_CLS + ' border-destructive' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Table</p>
                        <p className="text-2xl font-bold">{order.tableNumber}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <Badge variant="outline" className={`font-bold ${meta.cls}`}>{meta.label}</Badge>
                          {delayed ? <KotDelayedBadge /> : null}
                        </div>
                        <p className="text-[11px] font-mono font-bold text-primary mt-1">{resolveOrderId(order)}</p>
                        <p className="text-[10px] text-muted-foreground notranslate" translate="no">
                          {new Date(order.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {(order.items || []).map((it, idx) => (
                        <li
                          key={idx}
                          className={`flex flex-wrap items-center gap-2 rounded px-1.5 py-1 border ${
                            isCleared(it) ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'
                          }`}
                        >
                          <span className="font-bold text-primary">{it.quantity}×</span>
                          <span className="min-w-0 break-words">{it.name}</span>
                          {it.spiceLevel && it.spiceLevel !== 'None' ? (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SPICE_CLS[it.spiceLevel] || 'bg-muted text-muted-foreground border-border'}`}>
                              <Flame className="h-3 w-3" /> {it.spiceLevel}
                            </span>
                          ) : null}
                          {order.status === 'pending' && (order.items || []).length >= 2 && (
                            <button
                              type="button"
                              onClick={() => handleDecreaseItem(order, idx)}
                              className="group relative ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              title="Decrease quantity by 1"
                              aria-label={`Decrease ${it.name} quantity by 1`}
                            >
                              <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-destructive/40 transition-colors group-hover:bg-destructive/10 group-active:scale-95">
                                <Minus className="h-3.5 w-3.5" />
                              </span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {order.notes ? <p className="text-xs italic text-muted-foreground">“{order.notes}”</p> : null}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="font-semibold text-primary">€{(order.totalPrice || 0).toFixed(2)}</span>
                      {order.status === 'ready' && (
                        <Button size="sm" onClick={() => markServed(order)}>{t('waiter_markServed')}</Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {printAllowed ? (
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handlePrintKOT(order)}>
                          <Printer className="h-4 w-4 mr-1" /> Print KOT
                        </Button>
                      ) : (
                        <span className="flex-1 text-xs text-destructive font-medium text-center">Printing is currently disabled</span>
                      )}
                      <Button size="sm" variant="ghost" className="flex-1 text-primary" onClick={() => markAvailable(order)}>
                        <DoorOpen className="h-4 w-4 mr-1" /> Free Table
                      </Button>
                    </div>
                    {order.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full"
                        onClick={() => setCancelTarget(order)}
                      >
                        <Ban className="h-4 w-4 mr-1" /> Cancel Ticket
                      </Button>
                    ) : CANCEL_BLOCKED_MSG[order.status] ? (
                      <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        {CANCEL_BLOCKED_MSG[order.status]}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>
      )}

      {/* End Order confirmation dialog */}
      <AlertDialog open={!!endOrderTarget} onOpenChange={(o) => { if (!o) setEndOrderTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {endOrderTarget
                ? `This closes order ${resolveBaseOrderId({ expand: { parentOrder: endOrderTarget.parent } })} (${endOrderTarget.kots.length} ticket${endOrderTarget.kots.length > 1 ? 's' : ''}). Every ticket must already be served or cancelled. The table will NOT be freed automatically — after ending, settle any outstanding payment, then use Free Table to release the table.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndOrder}>End Order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Linked Orders group-level End All confirmation. Lists every member
          and whether it is eligible (will be ended) or blocked (skipped), so
          the waiter sees exactly what the action will do before confirming.
          Per-Order validation is re-run inside the handler, so a member that
          becomes ineligible between opening the dialog and confirming is
          still never force-closed. */}
      <AlertDialog open={!!groupEndTarget} onOpenChange={(o) => { if (!o) setGroupEndTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-secondary shrink-0" /> End all orders in this group?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Ends every member order whose tickets are all served or cancelled. Orders with unresolved tickets are skipped — they are never force-closed. Each order keeps its own Order ID, KOTs, and payment; payments are not merged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {groupEndTarget ? (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {(groupEndTarget.entries || []).map(({ parent, kots }) => {
                const isEnded = !!(parent && parent.endedAt);
                const resolved = allKotsResolved(kots);
                const eligible = !isEnded && resolved;
                return (
                  <div key={parent.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 break-words">
                      <span className="font-bold text-primary">{parent.tableNumber}</span>
                      <span className="text-muted-foreground ml-1 notranslate" translate="no">{parent.orderId}</span>
                    </span>
                    <span className={`shrink-0 font-bold uppercase tracking-wide ${eligible ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {isEnded ? 'Already ended' : (resolved ? 'Will end' : 'Blocked')}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="w-full sm:w-auto" onClick={handleEndOrderGroup}>End Eligible Orders</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Linked Orders group-level Free All confirmation. Lists every member
          and whether it is eligible (closed + fully settled → will be freed)
          or blocked (skipped). Per-Order validation is re-run against live DB
          state inside the handler, so a member that becomes unpaid or is
          re-opened mid-flow is never force-freed. */}
      <AlertDialog open={!!groupFreeTarget} onOpenChange={(o) => { if (!o) setGroupFreeTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary shrink-0" /> Free all tables in this group?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Frees every member table whose order is ended and fully settled. Tables with open orders or outstanding balances are skipped — they are never force-freed. Each order keeps its own payment state; payments are not merged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {groupFreeTarget ? (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {(groupFreeTarget.entries || []).map(({ parent, kots }) => {
                const isEnded = !!(parent && parent.endedAt);
                const isFreed = !!(parent && parent.freed === true);
                const fig = computePayment(kots);
                const eligible = isEnded && !isFreed && fig.outstandingAmount <= 0;
                const reason = !isEnded ? 'Order open' : isFreed ? 'Already freed' : (fig.outstandingAmount > 0 ? `€${fig.outstandingAmount.toFixed(2)} due` : 'Will free');
                return (
                  <div key={parent.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 break-words">
                      <span className="font-bold text-primary">{parent.tableNumber}</span>
                      <span className="text-muted-foreground ml-1 notranslate" translate="no">{parent.orderId}</span>
                    </span>
                    <span className={`shrink-0 font-bold uppercase tracking-wide ${eligible ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {reason}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="w-full sm:w-auto" onClick={handleFreeTableGroup}>Free Eligible Tables</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay picker — choose which open order to settle */}
      <Dialog open={payPickerOpen} onOpenChange={setPayPickerOpen}>
        <DialogContent className="max-w-lg w-[95vw] modal-mobile-safe">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Select an order to settle
            </DialogTitle>
            <DialogDescription>
              Open orders with items awaiting payment.
            </DialogDescription>
          </DialogHeader>
          {payableOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No open orders to settle.
            </p>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {payableOrders.map((g) => {
                const fig = computePayment(g.kots);
                return (
                  <button
                    key={g.parent.id}
                    type="button"
                    onClick={() => startPaymentSettlement(g)}
                    className="w-full text-left rounded-lg border-2 border-border hover:border-primary/60 bg-card p-3 transition-colors touch-target"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{tableDisplayForParent(g.parent, groupMap) || `Table ${g.parent.tableNumber}`}</p>
                        <p className="text-[11px] font-mono text-primary">{g.parent.orderId}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${fig.outstandingAmount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          €{fig.outstandingAmount.toFixed(2)} due
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">{fig.paymentStatus}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayPickerOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment settlement view — select unpaid items or settle in full */}
      <Dialog
        open={!!paymentTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPaymentTarget(null);
            setPaymentSelections({});
          }
        }}
      >
        <DialogContent
          className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-hidden gap-3"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Payment settlement
            </DialogTitle>
            <DialogDescription>
              {paymentTarget
                ? `Order ${paymentTarget.parent.orderId || ''} · ${tableDisplayForParent(paymentTarget.parent, groupMap) || `Table ${paymentTarget.parent.tableNumber || ''}`}. Select unpaid items to settle, or settle the full order.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {paymentTarget ? (() => {
            const fig = computePayment(paymentTarget.kots);
            const payableKots = paymentTarget.kots.filter((k) => k.status !== 'cancelled');
            const anyUnpaid = payableKots.some((k) => (k.items || []).some((it) => !isCleared(it)));
            return (
              <div className="flex flex-col flex-1 min-h-0 gap-3">
                {/* Figures strip */}
                <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                  <div className="rounded-lg border border-border bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                    <p className="font-bold text-sm">€{fig.totalAmount.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2">
                    <p className="text-[10px] uppercase text-emerald-700">Paid</p>
                    <p className="font-bold text-sm text-emerald-800">€{fig.paidAmount.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-lg border p-2 ${fig.outstandingAmount > 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
                    <p className="text-[10px] uppercase text-muted-foreground">Due</p>
                    <p className={`font-bold text-sm ${fig.outstandingAmount > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                      €{fig.outstandingAmount.toFixed(2)}
                    </p>
                  </div>
                </div>

                {!anyUnpaid ? (
                  <p className="text-sm text-emerald-700 font-semibold flex items-center gap-2 py-6 justify-center flex-1">
                    <CheckCircle2 className="h-5 w-5" /> This order is fully settled.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="flex-1 min-w-[9rem]" onClick={() => toggleSelectAllUnpaid(true)}>
                        <Layers className="h-4 w-4 mr-1" /> Settle full order
                      </Button>
                      <Button size="sm" variant="ghost" className="flex-1 min-w-[9rem]" onClick={() => toggleSelectAllUnpaid(false)}>
                        <XCircle className="h-4 w-4 mr-1" /> Clear selection
                      </Button>
                    </div>

                    <div className="flex-1 min-h-[8rem] overflow-y-auto overscroll-contain pr-1 -mr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                      <div className="space-y-3 pb-2">
                        {payableKots.map((k) => {
                          const sel = paymentSelections[k.id] || {};
                          return (
                            <div key={k.id} className="rounded-lg border border-border bg-card/60 p-2.5 space-y-2">
                              <p className="text-[11px] font-mono font-bold text-primary">{resolveOrderId(k)}</p>
                              <ul className="space-y-1.5">
                                {(k.items || []).map((it, idx) => {
                                  const cleared = isCleared(it);
                                  const picked = !!sel[idx];
                                  return (
                                    <li key={idx}>
                                      <button
                                        type="button"
                                        disabled={cleared}
                                        onClick={() => togglePaymentItem(k.id, idx)}
                                        className={`w-full flex flex-wrap items-center gap-2 text-left rounded-md border-2 px-2 py-2 transition-colors touch-target ${
                                          cleared
                                            ? 'bg-emerald-50 border-emerald-300 cursor-not-allowed opacity-80'
                                            : picked
                                            ? 'bg-primary/10 border-primary'
                                            : 'bg-red-50 border-red-300 hover:border-red-400'
                                        }`}
                                      >
                                        <span className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                                          cleared
                                            ? 'bg-emerald-500 border-emerald-500'
                                            : picked
                                            ? 'bg-primary border-primary'
                                            : 'border-red-400 bg-white'
                                        }`}>
                                          {(cleared || picked) && <Check className="h-3 w-3 text-white" />}
                                        </span>
                                        <span className="font-bold text-primary text-sm">{it.quantity}×</span>
                                        <span className="text-sm min-w-0 break-words flex-1">{it.name}</span>
                                        {it.tableNumber ? (
                                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-secondary/20 text-primary border-secondary/50 shrink-0 notranslate" translate="no">
                                            <DoorOpen className="h-3 w-3 inline mr-0.5 -mt-0.5" />{it.tableNumber}
                                          </span>
                                        ) : null}
                                        <span className="text-sm font-semibold">€{lineTotal(it).toFixed(2)}</span>
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                          cleared
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                                            : 'bg-red-100 text-red-800 border-red-400'
                                        }`}>
                                          {cleared ? 'Paid' : 'Unpaid'}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between font-bold text-primary border-t border-border pt-2 shrink-0">
                      <span className="text-sm">Selected to settle</span>
                      <span>€{selectedSettleAmount.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Confirming records a payment. Settled items cannot be marked unpaid again.
                    </p>
                  </>
                )}
              </div>
            );
          })() : null}

          <DialogFooter className="flex-col sm:flex-row gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={() => { setPaymentTarget(null); setPaymentSelections({}); }}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              onClick={handleConfirmPayment}
              disabled={paymentSubmitting || selectedSettleAmount <= 0}
              className="w-full sm:w-auto"
            >
              {paymentSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Settling...</>
              ) : (
                <><Banknote className="h-4 w-4 mr-2" /> Confirm €{selectedSettleAmount.toFixed(2)}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate KOT print confirmation dialog — shown when a waiter
          reprints a ticket that was already sent (printedAt set AND
          printCount > 0). Informational only; the waiter may send again. */}
      <AlertDialog open={!!reprintTarget} onOpenChange={(o) => { if (!o) setReprintTarget(null); }}>
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary shrink-0" /> This KOT was already sent. Send again?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              {reprintTarget
                ? `Ticket ${resolveOrderId(reprintTarget)} for Table ${reprintTarget.tableNumber || ''} has already been printed${(Number(reprintTarget.printCount) || 0) > 1 ? ` (${reprintTarget.printCount} times)` : ''}. Sending again will reprint it to the kitchen printer.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
            {printAllowed && (
              <AlertDialogAction
                className="w-full sm:w-auto"
                onClick={() => {
                  const target = reprintTarget;
                  setReprintTarget(null);
                  openKOT(target);
                }}
              >
                Send Again
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Ticket confirmation dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `This cancels ticket ${resolveOrderId(cancelTarget)} for Table ${cancelTarget.tableNumber}. The ticket will be marked as cancelled but stays visible in the order. The parent order remains open — use End Order to close it.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Ticket</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelKOT}>Cancel Ticket</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
    </>
  );
});

export default OrderPlacementComponent;
