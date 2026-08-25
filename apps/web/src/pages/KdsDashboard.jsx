import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import { kdsPb } from "@/lib/staffClients.js";
import pbDefault from "@/lib/pocketbaseClient.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ChefHat,
  LogOut,
  Clock,
  CheckCircle2,
  Flame,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  Bell,
  Calendar,
  User,
  Layers,
  Printer,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import StaffChat from "@/components/StaffChat.jsx";
import KdsQuickMessage from "@/components/KdsQuickMessage.jsx";
import {
  resolveOrderId,
  resolveBaseOrderId,
  printKOT,
} from "@/lib/kotPrint.js";
import {
  buildGroupMap,
  tableDisplayForParent,
  tableDisplayForKot,
} from "@/lib/tableGroups.js";
import {
  isKotDelayed,
  countDelayedKots,
  DELAYED_CARD_CLS,
  DELAYED_BORDER_CLS,
} from "@/lib/kotDelayed.js";
import KotDelayedBadge from "@/components/KotDelayedBadge.jsx";
import { usePrintSettings, canPrint } from "@/hooks/usePrintSettings.js";
import { useLanguage } from "@/contexts/LanguageContext.jsx";

const ACTIVE_STATUSES = ["pending", "preparing", "ready"];
const SETTINGS_KEY = "kds_settings_v1";

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { soundEnabled: true, ...JSON.parse(raw) };
  } catch (_) {
    /* ignore */
  }
  return { soundEnabled: true };
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {
    /* ignore */
  }
}

/* ---- Sound: 2 second attention chime ---- */
let sharedAudioCtx = null;
function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const beeps = [0, 0.7, 1.4];
    beeps.forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime + offset);
      osc.frequency.setValueAtTime(1174, ctx.currentTime + offset + 0.2);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.35,
        ctx.currentTime + offset + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + offset + 0.5,
      );
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.55);
    });
  } catch (_) {
    /* ignore */
  }
}

function elapsedLabel(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SPICE_CLS = {
  Mild: "bg-emerald-100 text-emerald-700 border-emerald-300",
  Medium: "bg-amber-100 text-amber-700 border-amber-300",
  Hot: "bg-orange-100 text-orange-700 border-orange-300",
  "Very Hot": "bg-red-100 text-red-700 border-red-300",
};

/* ---- KOT grouping by parent Order ---- */
// Group kitchen_orders (KOTs) by their parent Order id, using the expanded
// parentOrder relation. KOTs without a parent each form their own group.
// Within a group, KOTs are sorted by kotSuffix ascending so the original
// KOT (_001) always appears first, followed by additional KOTs (_002, _003).
function groupKotsByParent(kots) {
  const map = new Map();
  for (const k of kots) {
    const parent = k.expand && k.expand.parentOrder;
    const key = parent ? parent.id : `solo-${k.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(k);
  }
  const groups = [];
  for (const [key, list] of map) {
    list.sort((a, b) => {
      const sa = parseInt(String(a.kotSuffix || "0"), 10) || 0;
      const sb = parseInt(String(b.kotSuffix || "0"), 10) || 0;
      if (sa !== sb) return sa - sb;
      return new Date(a.created) - new Date(b.created);
    });
    // Sort groups by the earliest KOT created time (oldest order first).
    const earliest = list.reduce((min, k) => {
      const t = new Date(k.created).getTime();
      return t < min ? t : min;
    }, Infinity);
    groups.push({ list, earliest, key });
  }
  groups.sort((a, b) => a.earliest - b.earliest);
  return groups;
}

function OrderCard({
  order,
  now,
  onAdvance,
  onReprint,
  printAllowed,
  groupMap,
}) {
  const { t } = useLanguage();
  const created = new Date(order.created).getTime();
  const elapsedMs = now - created;
  const minutes = elapsedMs / 60000;
  const delayed = isKotDelayed(order, now);

  let urgency = "border-emerald-500";
  let timerColor = "text-emerald-600";
  if (delayed) {
    urgency = DELAYED_BORDER_CLS;
    timerColor = "text-destructive";
  } else if (minutes >= 15) {
    urgency = "border-destructive";
    timerColor = "text-destructive";
  } else if (minutes >= 8) {
    urgency = "border-amber-500";
    timerColor = "text-amber-600";
  }

  const statusMeta = {
    pending: {
      label: t("kds_statusNew"),
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    preparing: {
      label: t("kds_statusPreparing"),
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    },
    ready: {
      label: t("kds_statusReady"),
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    },
  }[order.status] || { label: t("kds_statusNew"), cls: "" };

  // Resolve parent Order through the parentOrder relation (expanded in the
  // fetch). All identity info is read from the parent Order, falling back to
  // the KOT's own copied fields only if the relation is unavailable.
  const parent = (order.expand && order.expand.parentOrder) || null;
  const tableNumber =
    tableDisplayForParent(parent, groupMap) ||
    (parent && parent.tableNumber) ||
    order.tableNumber ||
    "";
  const room = (parent && parent.room) || order.room || "";
  const waiterName = (parent && parent.placedBy) || order.placedBy || "";
  const orderCreated = (parent && parent.created) || order.created;
  const kotId = resolveOrderId(order);
  const orderDate = orderCreated
    ? new Date(orderCreated).toLocaleDateString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
  const orderTime = orderCreated
    ? new Date(orderCreated).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      className={`bg-card rounded-2xl border-l-8 ${urgency} border border-border shadow-lg p-4 flex flex-col ${delayed ? DELAYED_CARD_CLS : ""}`}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("kds_table")}
          </p>
          <p className="text-5xl font-bold text-foreground leading-none break-words">
            {tableNumber}
          </p>
          {room ? (
            <p className="text-xs text-muted-foreground mt-0.5">{room}</p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <div
            className={`flex items-center gap-1 font-mono text-2xl font-bold ${timerColor}`}
          >
            <Clock className="h-5 w-5" />
            <span className="notranslate" translate="no">
              {elapsedLabel(elapsedMs)}
            </span>
          </div>
          <p
            className="text-[10px] text-muted-foreground notranslate"
            translate="no"
          >
            {new Date(order.created).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* KOT identity — Order ID with suffix, date, time, waiter */}
      <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5 mb-3 space-y-1.5">
        {kotId ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              {t("kds_kot")}
            </span>
            <span
              className="text-sm font-mono font-bold text-primary break-all notranslate"
              translate="no"
            >
              {kotId}
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {orderDate ? (
            <span
              className="inline-flex items-center gap-1 notranslate"
              translate="no"
            >
              <Calendar className="h-3 w-3 shrink-0" />
              {orderDate}
            </span>
          ) : null}
          {orderTime ? (
            <span
              className="inline-flex items-center gap-1 notranslate"
              translate="no"
            >
              <Clock className="h-3 w-3 shrink-0" />
              {orderTime}
            </span>
          ) : null}
          {waiterName ? (
            <span className="inline-flex items-center gap-1 min-w-0">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{waiterName}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="outline" className={`font-bold ${statusMeta.cls}`}>
          {statusMeta.label}
        </Badge>
        {delayed ? <KotDelayedBadge /> : null}
      </div>

      <ul className="space-y-2 flex-1 mb-4">
        {(order.items || []).map((it, idx) => (
          <li key={idx} className="flex items-center gap-2 text-foreground">
            <span className="text-xl font-bold text-primary w-8 shrink-0">
              {it.quantity}×
            </span>
            <span className="text-base font-medium leading-tight flex-1 min-w-0 break-words">
              {it.name}
              {it.spiceLevel && it.spiceLevel !== "None" ? (
                <span
                  className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border align-middle ${SPICE_CLS[it.spiceLevel] || "bg-muted text-muted-foreground border-border"}`}
                >
                  <Flame className="h-3 w-3" /> {it.spiceLevel}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="text-sm bg-accent/40 rounded-lg p-2 mb-3 italic text-foreground">
          “{order.notes}”
        </p>
      ) : null}

      <div className="flex gap-2 mt-auto">
        {order.status === "pending" && (
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => onAdvance(order, "preparing")}
          >
            <Flame className="h-4 w-4 mr-1" /> {t("kds_start")}
          </Button>
        )}
        {order.status === "preparing" && (
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onAdvance(order, "ready")}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> {t("kds_ready")}
          </Button>
        )}
        {order.status === "ready" && (
          <div className="flex-1 rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 px-3 py-2 text-xs font-bold uppercase tracking-wide flex items-center gap-2 justify-center text-center animate-pulse">
            <Bell className="h-4 w-4 shrink-0" /> {t("kds_awaitingPickup")}
          </div>
        )}
        {printAllowed ? (
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 touch-target"
            onClick={() => onReprint(order)}
            title={t("kds_reprintTitle")}
            aria-label={t("kds_reprintKot")}
          >
            <Printer className="h-4 w-4" />
          </Button>
        ) : (
          <span
            className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-destructive/40 text-destructive/70 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 min-h-[40px]"
            title={t("kds_printDisabledAttr")}
          >
            <Printer className="h-3.5 w-3.5" /> {t("kds_noPrint")}
          </span>
        )}
      </div>
      {(Number(order.printCount) || 0) > 0 ? (
        <p
          className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1 notranslate"
          translate="no"
        >
          <Printer className="h-3 w-3 shrink-0" />
          {t("kds_printed")} {order.printCount}×
          {order.printedAt
            ? ` · ${new Date(order.printedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function KotGroup({ kots, now, onAdvance, onReprint, printAllowed, groupMap }) {
  const { t } = useLanguage();
  const first = kots[0];
  const parent = (first && first.expand && first.expand.parentOrder) || null;
  const baseOrderId = resolveBaseOrderId(first);
  const tableNumber =
    tableDisplayForParent(parent, groupMap) ||
    (parent && parent.tableNumber) ||
    first.tableNumber ||
    "";
  const waiterName = (parent && parent.placedBy) || first.placedBy || "";
  const multi = kots.length > 1;

  return (
    <section className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3 shadow-sm flex flex-col">
      {/* Group header — shared Order identity */}
      <div className="rounded-xl bg-primary text-primary-foreground px-3 py-2 mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Layers className="h-4 w-4 shrink-0 opacity-90" />
          <span className="text-[10px] uppercase tracking-widest opacity-80 shrink-0">
            {t("kds_order")}
          </span>
          <span
            className="text-base font-mono font-bold break-all notranslate"
            translate="no"
          >
            {baseOrderId}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {tableNumber ? (
            <span
              className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-bold notranslate"
              translate="no"
            >
              {t("kds_table")} {tableNumber}
            </span>
          ) : null}
          {multi ? (
            <span className="inline-flex items-center gap-1 bg-secondary/80 text-secondary-foreground px-2 py-0.5 rounded-md font-bold">
              {kots.length} {t("kds_kotsCount")}
            </span>
          ) : null}
          {waiterName ? (
            <span className="inline-flex items-center gap-1 opacity-90 min-w-0">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{waiterName}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* KOT cards — original (_001) first, additional KOTs below (vertical) or side-by-side (desktop multi-KOT) */}
      <div
        className={
          multi
            ? "flex flex-col gap-3 lg:flex-row lg:gap-3 lg:overflow-x-auto lg:pb-2 [scrollbar-width:thin] lg:snap-x lg:snap-mandatory"
            : "flex flex-col gap-3"
        }
      >
        {kots.map((k) => (
          <div
            key={k.id}
            className={
              multi
                ? "relative lg:shrink-0 lg:snap-start lg:w-[320px] lg:max-w-[80vw]"
                : "relative"
            }
          >
            {multi ? (
              <div className="absolute -left-1 top-2 bottom-2 w-1 rounded-full bg-primary/40 hidden sm:block lg:hidden" />
            ) : null}
            <OrderCard
              order={k}
              now={now}
              onAdvance={onAdvance}
              onReprint={onReprint}
              printAllowed={printAllowed}
              groupMap={groupMap}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---- Order Queue (left rail) ----
 * Displays parent Order IDs only (WI00025, PO00026 ...), each with the
 * number of KOTs under that Order and the waiting-time timer. Sorted FCFS
 * (oldest active order first) — the groups passed in are already sorted
 * oldest-first by groupKotsByParent. Clicking an entry selects that order
 * so its existing KotGroup detail renders in the main/right area.
 */
function OrderQueue({ groups, now, selectedKey, onSelect, groupMap }) {
  const { t } = useLanguage();
  if (!groups.length) return null;

  return (
    <div
      className="
        flex gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden
        lg:flex-col lg:gap-2 pb-2 lg:pb-0
        [scrollbar-width:thin]
      "
      role="list"
      aria-label={t("kds_orderQueue")}
    >
      {groups.map((group) => {
        const first = group.list[0];
        const parent =
          (first && first.expand && first.expand.parentOrder) || null;
        const baseOrderId = resolveBaseOrderId(first);
        const kotCount = group.list.length;
        const tableNumber =
          tableDisplayForParent(parent, groupMap) ||
          (parent && parent.tableNumber) ||
          first.tableNumber ||
          "";
        const elapsedMs = now - group.earliest;
        const minutes = elapsedMs / 60000;
        const groupDelayed = group.list.some((k) => isKotDelayed(k, now));
        const isSelected = selectedKey === group.key;

        let timerColor = "text-emerald-600";
        let accent = "border-emerald-500";
        if (groupDelayed) {
          timerColor = "text-destructive";
          accent = "border-destructive";
        } else if (minutes >= 15) {
          timerColor = "text-destructive";
          accent = "border-destructive";
        } else if (minutes >= 8) {
          timerColor = "text-amber-600";
          accent = "border-amber-500";
        }

        return (
          <button
            key={group.key}
            type="button"
            role="listitem"
            onClick={() => onSelect(group.key)}
            className={`
              text-left shrink-0 lg:w-full w-44 sm:w-52
              rounded-xl border-l-8 ${accent}
              border border-border shadow-sm p-3
              flex flex-col gap-1.5 transition-all
              ${isSelected ? "ring-2 ring-primary bg-primary/10" : "bg-card hover:bg-muted/40"}
              ${groupDelayed ? DELAYED_CARD_CLS : ""}
            `}
            aria-pressed={isSelected}
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span
                className="text-base font-mono font-bold text-primary break-all notranslate"
                translate="no"
              >
                {baseOrderId}
              </span>
              <span
                className={`flex items-center gap-1 font-mono text-sm font-bold shrink-0 ${timerColor}`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="notranslate" translate="no">
                  {elapsedLabel(elapsedMs)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="inline-flex items-center gap-1 bg-secondary/80 text-secondary-foreground px-1.5 py-0.5 rounded-md font-bold">
                <Layers className="h-3 w-3" />
                {kotCount}{" "}
                {kotCount === 1 ? t("kds_kotSingular") : t("kds_kotsCount")}
              </span>
              {tableNumber ? (
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground font-semibold notranslate"
                  translate="no"
                >
                  {tableNumber}
                </span>
              ) : null}
              {groupDelayed ? <KotDelayedBadge /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function KdsDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [selectedKey, setSelectedKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reprintTarget, setReprintTarget] = useState(null);
  const [reprintBusy, setReprintBusy] = useState(false);
  // table_groups + table_group_members — the source of truth for Shared
  // Order table membership, so KDS can show "Tables 4 + 5 + 6" for a shared
  // order instead of just the parent's primary tableNumber.
  const [tableGroups, setTableGroups] = useState([]);
  const [tableGroupMembers, setTableGroupMembers] = useState([]);
  // Authorization: a real KDS user (kds_users on the kds auth store) OR an
  // authenticated admin (admin_users on the default auth store). Admins reuse
  // their own admin session/client — no duplicate KDS account or separate KDS
  // session is created. The effective `pb` client is the kds client for KDS
  // users and the default (admin) client for admins, so all data operations
  // carry the correct authenticated token. Normal waiters are NOT authorized.
  const kdsAuthModel = kdsPb.authStore.model || kdsPb.authStore.record;
  const adminAuthModel =
    pbDefault.authStore.model || pbDefault.authStore.record;
  const isKds =
    kdsPb.authStore.isValid && kdsAuthModel?.collectionName === "kds_users";
  const isAdmin =
    pbDefault.authStore.isValid &&
    adminAuthModel?.collectionName === "admin_users";
  const authed = isKds || isAdmin;
  const pb = isKds ? kdsPb : pbDefault;
  const authModel = isKds ? kdsAuthModel : adminAuthModel;
  const chatName =
    authModel?.displayName ||
    authModel?.username ||
    authModel?.name ||
    authModel?.email ||
    "Kitchen";
  // Restaurant-wide printing master switch — same single print_settings
  // record the Admin Panel and Waiter (OrderPlacement) read. KDS print /
  // reprint / "Send Again" controls are hidden when this is OFF. Admins
  // always retain full print access (handled in canPrint).
  const { settings: printSettings } = usePrintSettings(pb);
  const printAllowed = canPrint(printSettings, "kds");
  const prevIdsRef = useRef(new Set());
  const settingsRef = useRef(settings);
  const initializedRef = useRef(false);
  // Mirror of the latest orders so the delayed-escalation interval can read
  // current state without re-subscribing on every change.
  const ordersRef = useRef([]);

  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const fetchOrders = useCallback(async () => {
    try {
      const filter = ACTIVE_STATUSES.map((s) => `status = "${s}"`).join(" || ");
      const res = await pb.collection("kitchen_orders").getFullList({
        filter,
        sort: "created",
        expand: "parentOrder",
        $autoCancel: false,
      });
      const newPending = res.filter(
        (o) => !prevIdsRef.current.has(o.id) && o.status === "pending",
      );
      if (initializedRef.current && newPending.length > 0) {
        if (settingsRef.current.soundEnabled) playAlertChime();
        toast(`${newPending.length} ${t("kds_newOrdersReceived")}`, {
          icon: "🔔",
        });
      }
      prevIdsRef.current = new Set(res.map((o) => o.id));
      initializedRef.current = true;
      setOrders(res);
    } catch (err) {
      console.error("Failed to load kitchen orders:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  // Fetch every table_groups + table_group_members row so the KDS can
  // resolve the full table combination for a Shared Order from the
  // normalized membership (the source of truth), not the parent's single
  // tableNumber.
  const fetchGroupData = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        pb.collection("table_groups").getFullList({ $autoCancel: false }),
        pb
          .collection("table_group_members")
          .getFullList({ $autoCancel: false }),
      ]);
      setTableGroups(g || []);
      setTableGroupMembers(m || []);
    } catch (_) {
      /* ignore — collections may be empty */
    }
  }, [pb]);

  useEffect(() => {
    if (!authed) {
      navigate("/kds-login", { replace: true });
      return;
    }
    fetchOrders();
    fetchGroupData();

    // Realtime: any kitchen_orders change (Waiter item − / removal, status
    // advance, print tracking, cancellation) is pushed by PocketBase. The
    // callback merges the changed record directly into local state for an
    // immediate re-render — realtime event records do not include expanded
    // relations, so the existing expand (parentOrder) from the prior fetch
    // is preserved. Records that leave the active set (completed/cancelled)
    // are dropped; brand-new records are added by the refetch below. The
    // KDS is read-only for item quantities — only the Waiter UI owns the
    // − / remove control.
    void pb
      .collection("kitchen_orders")
      .subscribe("*", (e) => {
        setOrders((prev) => {
          if (!prev || prev.length === 0) return prev;
          if (e.action === "delete") {
            return prev.filter((o) => o.id !== e.record.id);
          }
          const idx = prev.findIndex((o) => o.id === e.record.id);
          if (idx === -1) return prev; // new record — refetch below adds it
          if (!ACTIVE_STATUSES.includes(e.record.status)) {
            return prev.filter((o) => o.id !== e.record.id);
          }
          const existing = prev[idx];
          const next = [...prev];
          next[idx] = { ...existing, ...e.record, expand: existing.expand };
          return next;
        });
        // Follow up with a full refetch to refresh expanded parentOrder
        // and pick up any brand-new KOTs.
        fetchOrders();
      })
      .catch((error) =>
        console.error("KDS realtime subscription failed", error),
      );
    // Keep table combination membership fresh for Shared Order display.
    pb.collection("table_groups").subscribe("*", () => fetchGroupData());
    pb.collection("table_group_members").subscribe("*", () => fetchGroupData());
    const poll = setInterval(fetchOrders, 10000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      void pb
        .collection("kitchen_orders")
        .unsubscribe("*")
        .catch(() => {});
      try {
        pb.collection("table_groups").unsubscribe("*");
      } catch (_) {
        /* ignore */
      }
      try {
        pb.collection("table_group_members").unsubscribe("*");
      } catch (_) {
        /* ignore */
      }
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [authed, fetchOrders, fetchGroupData, navigate]);

  // Five-minute escalation: while any KOT remains delayed (pending for 5+
  // minutes since its creation timestamp), replay the three-beep alert chime
  // at a higher frequency until the kitchen attends to it (moves it out of
  // pending). This is independent of the one-time three-beep notification
  // played when a new KOT first arrives — that behavior is preserved above.
  // The interval checks the live orders mirror, so it stops automatically
  // once every delayed KOT has been attended.
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => {
      const t = Date.now();
      const hasDelayed = ordersRef.current.some((o) => isKotDelayed(o, t));
      if (hasDelayed && settingsRef.current.soundEnabled) {
        playAlertChime();
      }
    }, 30000); // higher-frequency repeating alert every 30s while delayed
    return () => clearInterval(id);
  }, [authed]);

  const delayedCount = countDelayedKots(orders, now);

  // Group KOTs by parent Order (FCFS — oldest active order first). Used by
  // both the left Order Queue and the right selected-order detail area so
  // they always stay in sync.
  const groups = groupKotsByParent(orders);

  // Map of every table_groups combination -> { mode, status, label, tables }.
  // Source of truth for Shared Order table membership display on the KDS.
  const groupMap = useMemo(
    () => buildGroupMap(tableGroups, tableGroupMembers),
    [tableGroups, tableGroupMembers],
  );

  // Auto-select: keep a valid selected order. On first load pick the oldest
  // (top of the queue); if the selected order is completed/removed, fall
  // back to the new top so the kitchen always has an order in view.
  useEffect(() => {
    if (loading || groups.length === 0) return;
    const exists = groups.some((g) => g.key === selectedKey);
    if (!exists) setSelectedKey(groups[0].key);
  }, [groups, selectedKey, loading]);

  const selectedGroup = groups.find((g) => g.key === selectedKey) || null;

  const advance = async (order, status) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status } : o)),
    );
    try {
      await pb
        .collection("kitchen_orders")
        .update(order.id, { status }, { $autoCancel: false });
    } catch (err) {
      console.error(err);
      toast.error(t("kds_updateFailed"));
      fetchOrders();
    }
  };

  // Reprint / Resend a KOT using the EXISTING kotPrint.js flow (iframe print,
  // stays on the KDS page — never navigates away from the kitchen display).
  // Reuses the existing kitchen_orders record: no new record, no new Order
  // ID, no KOT suffix increment. After printing, update printedAt and bump
  // printCount so the duplicate-protection guard is consistent with the
  // Waiter workflow (which reads the same fields).
  const doReprint = async (order) => {
    if (!order) return;
    // Resolve the full Shared/Linked table combination ("Tables 4 + 5 + 6")
    // from the normalized table_group_members (the source of truth) so a
    // multi-table KOT prints the complete table label, not just the KOT's
    // copied tableNumber. Single-table orders are unaffected.
    const tableDisplay = tableDisplayForKot(order, groupMap);
    printKOT(tableDisplay ? { ...order, tableDisplay } : order);
    setReprintBusy(true);
    try {
      const nextCount = (Number(order.printCount) || 0) + 1;
      const updated = await pb
        .collection("kitchen_orders")
        .update(
          order.id,
          { printedAt: new Date().toISOString(), printCount: nextCount },
          { $autoCancel: false, requestKey: `reprint-kot-${order.id}` },
        );
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, ...updated } : o)),
      );
      toast.success(`${t("kds_reprinted")} ${resolveOrderId(order)}`);
    } catch (err) {
      console.error("Reprint tracking update failed:", err);
      toast.error(t("kds_printTrackFailed"));
      fetchOrders();
    } finally {
      setReprintBusy(false);
    }
  };

  // Duplicate-protection guard: if the KOT was already printed/sent
  // (printedAt set OR printCount > 0), confirm before reprinting; otherwise
  // reprint immediately. Mirrors the existing Waiter handlePrintKOT logic.
  const handleReprint = (order) => {
    if (!order) return;
    // Defense-in-depth: even if a stale UI element triggers this, never
    // reprint while the restaurant-wide master switch is OFF. The button is
    // hidden in that state, and the server-side hook also blocks the
    // tracking write — this guard closes the client-side gap.
    if (!printAllowed) {
      toast.error(t("kds_printingDisabled"));
      return;
    }
    const alreadyPrinted =
      !!order.printedAt || (Number(order.printCount) || 0) > 0;
    if (alreadyPrinted) {
      setReprintTarget(order);
      return;
    }
    doReprint(order);
  };

  // Logout is an EXPLICIT user action only — never triggered by device sleep,
  // backgrounding, or visibility changes (those must not clear the KDS auth
  // store; see Prompt 11 persistence).
  const logout = () => {
    // An admin viewing the KDS Dashboard returns to the Admin Dashboard
    // without touching the admin's own auth session. Only real KDS users go
    // through the full KDS logout (auth clear) below.
    if (isAdmin) {
      navigate("/admin-dashboard", { replace: true });
      return;
    }
    try {
      pb.collection("kitchen_orders").unsubscribe("*");
    } catch (_) {
      /* ignore */
    }
    pb.authStore.clear();
    navigate("/kds-login", { replace: true });
    setTimeout(() => {
      if (window.location.pathname !== "/kds-login") {
        window.location.assign("/kds-login");
      }
    }, 120);
  };

  return (
    <>
      <Helmet>
        <title>{t("kds_title")} - Tripti Genusswelt</title>
      </Helmet>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shadow-md">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <ChefHat className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
            <h1 className="text-base sm:text-xl font-serif font-bold whitespace-nowrap">
              {t("kds_title")}
            </h1>
            <Badge className="bg-secondary text-secondary-foreground shrink-0">
              {orders.length} {t("kds_active")}
            </Badge>
            {delayedCount > 0 ? (
              <Badge className="bg-destructive text-destructive-foreground animate-pulse shrink-0">
                {delayedCount} {t("kds_delayed")}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                className="touch-target px-2 sm:px-3"
                onClick={() => navigate("/admin-dashboard")}
                aria-label="Back to Admin Dashboard"
                title="Back to Admin Dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Admin</span>
              </Button>
            )}
            {settings.soundEnabled ? (
              <Volume2 className="h-4 w-4 opacity-80 shrink-0" />
            ) : (
              <VolumeX className="h-4 w-4 opacity-60 shrink-0" />
            )}
            <Button
              variant="secondary"
              size="sm"
              className="touch-target px-2 sm:px-3"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("kds_settings")}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="touch-target px-2 sm:px-3"
              onClick={fetchOrders}
              aria-label={t("kds_refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="touch-target px-2 sm:px-3"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">{t("logout")}</span>
            </Button>
          </div>
        </header>

        <main className="p-3 sm:p-4">
          {!printAllowed && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <Printer className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive font-medium">
                {t("kds_printDisabledNotice")}
              </p>
            </div>
          )}
          {authed && <KdsQuickMessage pbClient={pb} displayName={chatName} />}
          {loading ? (
            <p className="text-center text-muted-foreground py-20">
              {t("kds_loadingOrders")}
            </p>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <ChefHat className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">{t("kds_noActiveOrders")}</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* Left: Order Queue — parent Order IDs only, FCFS (oldest first) */}
              <aside className="w-full lg:w-72 xl:w-80 shrink-0">
                <div className="rounded-xl border border-border bg-muted/30 p-2.5 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> {t("kds_orderQueue")}
                  </h2>
                </div>
                <OrderQueue
                  groups={groups}
                  now={now}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  groupMap={groupMap}
                />
              </aside>

              {/* Right: selected order's existing KOT/KDS detail (reuses KotGroup) */}
              <section className="flex-1 min-w-0 w-full">
                {selectedGroup ? (
                  <KotGroup
                    key={selectedGroup.key}
                    kots={selectedGroup.list}
                    now={now}
                    onAdvance={advance}
                    onReprint={handleReprint}
                    printAllowed={printAllowed}
                    groupMap={groupMap}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                    <ChefHat className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-base font-medium">
                      {t("kds_selectOrderPrompt")}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" /> {t("kds_settingsTitle")}
            </DialogTitle>
            <DialogDescription>{t("kds_settingsDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <Label className="font-semibold">
                    {t("kds_soundAlerts")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("kds_soundAlertsDesc")}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(v) =>
                  setSettings((s) => ({ ...s, soundEnabled: v }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>
              {t("kds_done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprint / Resend confirmation — shown when a KOT that was already
          printed/sent is being reprinted. Mirrors the Waiter duplicate-
          protection dialog. Reuses the existing kitchen_orders record. */}
      <AlertDialog
        open={!!reprintTarget}
        onOpenChange={(o) => {
          if (!o) setReprintTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md w-[92vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary shrink-0" />{" "}
              {t("kds_reprintConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              {reprintTarget
                ? `${t("kds_reprintConfirmDescPrefix")} ${resolveOrderId(reprintTarget)} ${t("kds_reprintConfirmDescForTable")} ${reprintTarget.tableNumber || ""} ${t("kds_reprintConfirmDescAlready")}${(Number(reprintTarget.printCount) || 0) > 1 ? ` (${reprintTarget.printCount} ${t("kds_reprintConfirmDescTimes")})` : ""}. ${t("kds_reprintConfirmDescSuffix")}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel
              className="w-full sm:w-auto mt-0"
              disabled={reprintBusy}
            >
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto"
              disabled={reprintBusy}
              onClick={() => {
                const target = reprintTarget;
                setReprintTarget(null);
                doReprint(target);
              }}
            >
              {reprintBusy ? t("kds_sending") : t("kds_sendAgain")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {authed && <StaffChat role="kds" pbClient={pb} displayName={chatName} />}
    </>
  );
}
