"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Factory,
  PackageSearch,
  Percent,
  RefreshCw,
  ShoppingCart,
  ShieldAlert,
  Siren,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardWidgetBoard from "@/components/dashboard/DashboardWidgetBoard";
import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import WidgetLauncher, {
  type WidgetLauncherItem,
} from "@/components/admin/dashboard/WidgetLauncher";
import WidgetShell from "@/components/admin/dashboard/WidgetShell";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ExecutiveDashboardShell } from "@/components/layout/page-shells";
import { MetricStrip } from "@/components/ui/operations";
import StatCard from "@/components/ui/StatCard";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import {
  buildAdminCollectionsRoute,
  buildAdminDeliveriesRoute,
  buildAdminLeadsRoute,
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRequestsRoute,
  buildAdminSupportRequestsRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  ADMIN_DASHBOARD_WIDGET_PREFS_VERSION,
  readAdminDashboardWidgetPrefs,
  writeAdminDashboardWidgetPrefs,
  type AdminDashboardWidgetAttention,
  type AdminDashboardWidgetPrefs,
} from "@/lib/admin-dashboard-widgets";
import { getAdminDashboard } from "@/services/admin";
import {
  listExpenseClaimsSafe,
  listPurchaseBills,
  listSalarySheetsSafe,
  type AccountingPaginatedResponse,
  type AccountingPurchaseBill,
  type EmployeeExpenseClaim,
  type SalarySheet,
} from "@/services/accounting";
import {
  getBranchReportingOverview,
  type BranchReportingOverview,
} from "@/services/branch-control";
import { getAdminDeliverySummary } from "@/services/deliveries";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardReconciliationExceptions,
  listDashboardUpcoming,
  listDashboardWinners,
} from "@/services/dashboards";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
import { getStockSummary } from "@/services/inventory";
import { listAdminLeads } from "@/services/admin-leads";
import { listAdminSupportRequests } from "@/services/admin-support-requests";
import { listReminders } from "@/services/reminders";
import {
  getServiceDeskOverview,
  listServiceDeskCases,
  type ServiceDeskOverview,
} from "@/services/service-desk";
import { listSubscriptionRequests } from "@/services/subscription-requests";

type LegacyDashboardPayload = Awaited<ReturnType<typeof getAdminDashboard>>;
type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DashboardDuePayload = Awaited<ReturnType<typeof listDashboardOverdue>>;
type DashboardPaymentsPayload = Awaited<
  ReturnType<typeof listDashboardRecentPayments>
>;
type DashboardReconciliationPayload = Awaited<
  ReturnType<typeof listDashboardReconciliationExceptions>
>;
type DashboardWinnersPayload = Awaited<ReturnType<typeof listDashboardWinners>>;
type DeliverySummaryPayload = Awaited<ReturnType<typeof getAdminDeliverySummary>>;
type SupportQueuePayload = Awaited<ReturnType<typeof listAdminSupportRequests>>;
type LeadQueuePayload = Awaited<ReturnType<typeof listAdminLeads>>;
type RequestQueuePayload = Awaited<ReturnType<typeof listSubscriptionRequests>>;
type StockSummaryPayload = Awaited<ReturnType<typeof getStockSummary>>;
type PurchaseBillListPayload = AccountingPaginatedResponse<AccountingPurchaseBill>;
type ExpenseClaimListPayload = AccountingPaginatedResponse<EmployeeExpenseClaim>;
type SalarySheetListPayload = AccountingPaginatedResponse<SalarySheet>;
type ServiceDeskCasePayload = Awaited<ReturnType<typeof listServiceDeskCases>>;
type ReminderQueuePayload = Awaited<ReturnType<typeof listReminders>>;

const WIDGET_IDS = [
  "due-followup",
  "recent-payments",
  "reconciliation-exceptions",
  "deliveries",
  "inventory-alerts",
  "purchase-queue",
  "payroll-queue",
  "service-desk",
  "reminders",
  "onboarding",
  "support-queue",
  "winners",
  "branch-snapshot",
  "module-directory",
] as const;

type WidgetId = (typeof WIDGET_IDS)[number];

const DEFAULT_WIDGET_PREFS: AdminDashboardWidgetPrefs = {
  version: ADMIN_DASHBOARD_WIDGET_PREFS_VERSION,
  open: [
    "due-followup",
    "reconciliation-exceptions",
    "deliveries",
    "inventory-alerts",
    "purchase-queue",
    "reminders",
  ],
  pinned: ["due-followup", "reconciliation-exceptions", "deliveries"],
  collapsed: [],
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load admin dashboard.";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveWindowDateRange(
  preset: DashboardWindowPreset,
  customStartDate: string,
  customEndDate: string
): { start: string | undefined; end: string | undefined; label: string } {
  const today = new Date();
  const todayLabel = formatLocalDate(today);

  if (preset === "CUSTOM") {
    return {
      start: customStartDate || undefined,
      end: customEndDate || undefined,
      label:
        customStartDate && customEndDate
          ? `${customStartDate} → ${customEndDate}`
          : "Custom range",
    };
  }

  if (preset === "THIS_MONTH") {
    const start = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
    return { start, end: todayLabel, label: `This month (${start} → ${todayLabel})` };
  }

  if (preset === "LAST_30_DAYS") {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    const start = formatLocalDate(startDate);
    return { start, end: todayLabel, label: `Last 30 days (${start} → ${todayLabel})` };
  }

  return { start: undefined, end: undefined, label: "Default view" };
}

function attentionFromCount(params: {
  urgentThreshold?: number;
  warningThreshold?: number;
  count: number;
}): AdminDashboardWidgetAttention {
  const urgentThreshold = params.urgentThreshold ?? 10;
  const warningThreshold = params.warningThreshold ?? 1;
  if (params.count >= urgentThreshold) return "urgent";
  if (params.count >= warningThreshold) return "warning";
  return "quiet";
}

export default function AdminOperationsDashboard() {
  const { openWorkflow } = useWorkflowLauncher();
  const [legacy, setLegacy] = useState<LegacyDashboardPayload | null>(null);
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [deliverySummary, setDeliverySummary] =
    useState<DeliverySummaryPayload | null>(null);
  const [branchOverview, setBranchOverview] =
    useState<BranchReportingOverview | null>(null);
  const [todayBranchOverview, setTodayBranchOverview] =
    useState<BranchReportingOverview | null>(null);

  const [overdue, setOverdue] = useState<DashboardDuePayload | null>(null);
  const [upcoming, setUpcoming] = useState<DashboardDuePayload | null>(null);
  const [recentPayments, setRecentPayments] =
    useState<DashboardPaymentsPayload | null>(null);
  const [reconciliationItems, setReconciliationItems] =
    useState<DashboardReconciliationPayload | null>(null);
  const [winnerItems, setWinnerItems] = useState<DashboardWinnersPayload | null>(
    null
  );
  const [stockSummary, setStockSummary] = useState<StockSummaryPayload | null>(null);
  const [purchaseDrafts, setPurchaseDrafts] =
    useState<PurchaseBillListPayload | null>(null);
  const [purchaseApproved, setPurchaseApproved] =
    useState<PurchaseBillListPayload | null>(null);
  const [salaryPayables, setSalaryPayables] =
    useState<SalarySheetListPayload | null>(null);
  const [expenseClaimQueue, setExpenseClaimQueue] =
    useState<ExpenseClaimListPayload | null>(null);
  const [serviceDeskOverview, setServiceDeskOverview] =
    useState<ServiceDeskOverview | null>(null);
  const [openServiceCases, setOpenServiceCases] =
    useState<ServiceDeskCasePayload | null>(null);
  const [pendingReminderQueue, setPendingReminderQueue] =
    useState<ReminderQueuePayload | null>(null);
  const [failedReminderQueue, setFailedReminderQueue] =
    useState<ReminderQueuePayload | null>(null);
  const [supportQueue, setSupportQueue] = useState<SupportQueuePayload | null>(null);
  const [leadQueue, setLeadQueue] = useState<LeadQueuePayload | null>(null);
  const [requestQueue, setRequestQueue] = useState<RequestQueuePayload | null>(null);

  const [loadingCore, setLoadingCore] = useState(true);
  const [refreshingCore, setRefreshingCore] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [widgetLoading, setWidgetLoading] = useState<Record<string, boolean>>({});
  const [widgetError, setWidgetError] = useState<Record<string, string>>({});

  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("THIS_MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const branchWindow = useMemo(
    () => resolveWindowDateRange(windowPreset, startDate, endDate),
    [endDate, startDate, windowPreset]
  );

  const dashboardQuery = useMemo(
    () =>
      windowPreset === "CUSTOM"
        ? {
            window: windowPreset,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          }
        : { window: windowPreset },
    [endDate, startDate, windowPreset]
  );

  const branchReportingQuery = useMemo(
    () => ({
      branch_id: selectedBranchId || undefined,
      start_date: branchWindow.start,
      end_date: branchWindow.end,
    }),
    [branchWindow.end, branchWindow.start, selectedBranchId]
  );

  const todayBranchReportingQuery = useMemo(() => {
    const today = formatLocalDate(new Date());
    return {
      branch_id: selectedBranchId || undefined,
      start_date: today,
      end_date: today,
    };
  }, [selectedBranchId]);

  const branchScopedQuery = useMemo(
    () => ({
      branch: selectedBranchId || undefined,
      page_size: 6,
    }),
    [selectedBranchId]
  );

  const [widgetPrefs, setWidgetPrefs] =
    useState<AdminDashboardWidgetPrefs>(DEFAULT_WIDGET_PREFS);
  const operationsBoardStorageKey = "subidha:dashboard-widgets:admin-operations:v1";
  const prefsHydratedRef = useRef(false);
  const prevOpenRef = useRef<readonly string[]>([]);

  const openIds = useMemo(() => new Set(widgetPrefs.open), [widgetPrefs.open]);
  const pinnedIds = useMemo(() => new Set(widgetPrefs.pinned), [widgetPrefs.pinned]);
  const collapsedIds = useMemo(
    () => new Set(widgetPrefs.collapsed),
    [widgetPrefs.collapsed]
  );

  const updateWidgetPrefs = useCallback(
    (updater: (current: AdminDashboardWidgetPrefs) => AdminDashboardWidgetPrefs) => {
      setWidgetPrefs((current) => {
        const next = updater(current);
        if (prefsHydratedRef.current) {
          writeAdminDashboardWidgetPrefs(next);
        }
        return next;
      });
    },
    []
  );

  useLayoutEffect(() => {
    const hydrated = readAdminDashboardWidgetPrefs({
      defaults: DEFAULT_WIDGET_PREFS,
      allowedWidgetIds: WIDGET_IDS,
    });
    prefsHydratedRef.current = true;
    setWidgetPrefs(hydrated);
  }, []);

  const openWidget = useCallback((id: WidgetId) => {
    updateWidgetPrefs((current) => {
      if (current.open.includes(id)) return current;
      return { ...current, open: [...current.open, id] };
    });
  }, [updateWidgetPrefs]);

  const removeWidget = useCallback((id: WidgetId) => {
    updateWidgetPrefs((current) => ({
      ...current,
      open: current.open.filter((item) => item !== id),
      pinned: current.pinned.filter((item) => item !== id),
      collapsed: current.collapsed.filter((item) => item !== id),
    }));
  }, [updateWidgetPrefs]);

  const togglePinned = useCallback((id: WidgetId) => {
    updateWidgetPrefs((current) => {
      const isPinned = current.pinned.includes(id);
      return {
        ...current,
        pinned: isPinned
          ? current.pinned.filter((item) => item !== id)
          : [...current.pinned, id],
      };
    });
  }, [updateWidgetPrefs]);

  const toggleCollapsed = useCallback((id: WidgetId) => {
    updateWidgetPrefs((current) => {
      const isCollapsed = current.collapsed.includes(id);
      return {
        ...current,
        collapsed: isCollapsed
          ? current.collapsed.filter((item) => item !== id)
          : [...current.collapsed, id],
      };
    });
  }, [updateWidgetPrefs]);

  const moveWidget = useCallback((id: WidgetId, direction: -1 | 1) => {
    updateWidgetPrefs((current) => {
      const index = current.open.indexOf(id);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.open.length) return current;
      const next = current.open.slice();
      const [removed] = next.splice(index, 1);
      next.splice(nextIndex, 0, removed);
      return { ...current, open: next };
    });
  }, [updateWidgetPrefs]);

  const resetWidgets = useCallback(() => {
    updateWidgetPrefs(() => DEFAULT_WIDGET_PREFS);
  }, [updateWidgetPrefs]);

  const closeUnpinnedWidgets = useCallback(() => {
    updateWidgetPrefs((current) => {
      const pinned = new Set(current.pinned);
      const open = current.open.filter((id) => pinned.has(id));
      return {
        ...current,
        open,
        collapsed: current.collapsed.filter((id) => pinned.has(id)),
      };
    });
  }, [updateWidgetPrefs]);

  const loadCore = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoadingCore(true);
      else setRefreshingCore(true);

      try {
        const [
          legacyPayload,
          canonicalPayload,
          deliverySummaryPayload,
          branchOverviewPayload,
          todayBranchOverviewPayload,
        ] = await Promise.all([
          getAdminDashboard(),
          getDashboardSummaryV2(dashboardQuery),
          getAdminDeliverySummary(),
          getBranchReportingOverview(branchReportingQuery),
          getBranchReportingOverview(todayBranchReportingQuery),
        ]);

        setLegacy(legacyPayload);
        setCanonical(canonicalPayload);
        setDeliverySummary(deliverySummaryPayload);
        setBranchOverview(branchOverviewPayload);
        setTodayBranchOverview(todayBranchOverviewPayload);
        setCoreError(null);
      } catch (err) {
        setCoreError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoadingCore(false);
        else setRefreshingCore(false);
      }
    },
    [branchReportingQuery, dashboardQuery, todayBranchReportingQuery]
  );

  const setWidgetLoadingState = useCallback((id: WidgetId, value: boolean) => {
    setWidgetLoading((current) => ({ ...current, [id]: value }));
  }, []);

  const setWidgetErrorState = useCallback((id: WidgetId, value: string | null) => {
    setWidgetError((current) => {
      const next = { ...current };
      if (!value) {
        delete next[id];
        return next;
      }
      next[id] = value;
      return next;
    });
  }, []);

  const loadWidget = useCallback(
    async (id: WidgetId) => {
      setWidgetLoadingState(id, true);
      setWidgetErrorState(id, null);

      try {
        switch (id) {
          case "due-followup": {
            const [overduePayload, upcomingPayload] = await Promise.all([
              listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
              listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
            ]);
            setOverdue(overduePayload);
            setUpcoming(upcomingPayload);
            break;
          }
          case "recent-payments": {
            const payload = await listDashboardRecentPayments({
              ...dashboardQuery,
              limit: 8,
            });
            setRecentPayments(payload);
            break;
          }
          case "reconciliation-exceptions": {
            const payload = await listDashboardReconciliationExceptions({
              ...dashboardQuery,
              limit: 6,
            });
            setReconciliationItems(payload);
            break;
          }
          case "winners": {
            const payload = await listDashboardWinners({ ...dashboardQuery, limit: 4 });
            setWinnerItems(payload);
            break;
          }
          case "inventory-alerts": {
            const payload = await getStockSummary({
              branch: selectedBranchId || undefined,
            });
            setStockSummary(payload);
            break;
          }
          case "purchase-queue": {
            const [draftPayload, approvedPayload] = await Promise.all([
              listPurchaseBills({ ...branchScopedQuery, status: "DRAFT" }),
              listPurchaseBills({ ...branchScopedQuery, status: "APPROVED" }),
            ]);
            setPurchaseDrafts(draftPayload);
            setPurchaseApproved(approvedPayload);
            break;
          }
          case "payroll-queue": {
            const [salaryPayload, expensePayload] = await Promise.all([
              listSalarySheetsSafe({ ...branchScopedQuery, status: "POSTED" }),
              listExpenseClaimsSafe({ ...branchScopedQuery, status: "POSTED" }),
            ]);
            setSalaryPayables(salaryPayload);
            setExpenseClaimQueue(expensePayload);
            break;
          }
          case "service-desk": {
            const [overviewPayload, casesPayload] = await Promise.all([
              getServiceDeskOverview(),
              listServiceDeskCases({ ...branchScopedQuery, status: "OPEN" }),
            ]);
            setServiceDeskOverview(overviewPayload);
            setOpenServiceCases(casesPayload);
            break;
          }
          case "reminders": {
            const [pendingPayload, failedPayload] = await Promise.all([
              listReminders({ status: "PENDING", page_size: 1 }),
              listReminders({ status: "FAILED", page_size: 1 }),
            ]);
            setPendingReminderQueue(pendingPayload);
            setFailedReminderQueue(failedPayload);
            break;
          }
          case "onboarding": {
            const [requestPayload, leadPayload] = await Promise.all([
              listSubscriptionRequests("admin", {
                status: "SUBMITTED",
                page: 1,
                pageSize: 5,
              }),
              listAdminLeads({}),
            ]);
            setRequestQueue(requestPayload);
            setLeadQueue(leadPayload);
            break;
          }
          case "support-queue": {
            const payload = await listAdminSupportRequests({ status: "SUBMITTED" });
            setSupportQueue(payload);
            break;
          }
          case "branch-snapshot": {
            // Branch overview is part of the core load; breakdowns are intentionally deferred.
            break;
          }
          case "deliveries":
          case "module-directory":
          default:
            break;
        }
      } catch (err) {
        setWidgetErrorState(id, toErrorMessage(err));
      } finally {
        setWidgetLoadingState(id, false);
      }
    },
    [
      branchScopedQuery,
      dashboardQuery,
      selectedBranchId,
      setWidgetErrorState,
      setWidgetLoadingState,
    ]
  );

  const refreshOpenWidgets = useCallback(async () => {
    const ids = widgetPrefs.open.filter((id): id is WidgetId =>
      (WIDGET_IDS as readonly string[]).includes(id)
    );
    await Promise.all(ids.map((id) => loadWidget(id)));
  }, [loadWidget, widgetPrefs.open]);

  const coreLoadedRef = useRef(false);
  useEffect(() => {
    void loadCore(coreLoadedRef.current ? "refresh" : "initial");
    coreLoadedRef.current = true;
  }, [loadCore]);

  useEffect(() => {
    const prev = new Set(prevOpenRef.current);
    const next = widgetPrefs.open;
    const newlyOpened = next.filter((id) => !prev.has(id)) as WidgetId[];
    prevOpenRef.current = next;
    if (newlyOpened.length === 0) return;
    void Promise.all(newlyOpened.map((id) => loadWidget(id)));
  }, [loadWidget, widgetPrefs.open]);

  useEffect(() => {
    setOverdue(null);
    setUpcoming(null);
    setRecentPayments(null);
    setReconciliationItems(null);
    setWinnerItems(null);

    setStockSummary(null);
    setPurchaseDrafts(null);
    setPurchaseApproved(null);
    setSalaryPayables(null);
    setExpenseClaimQueue(null);
    setServiceDeskOverview(null);
    setOpenServiceCases(null);
    setPendingReminderQueue(null);
    setFailedReminderQueue(null);
    setSupportQueue(null);
    setLeadQueue(null);
    setRequestQueue(null);

    void refreshOpenWidgets();
  }, [dashboardQuery, refreshOpenWidgets, selectedBranchId]);

  const summary = canonical?.summary ?? legacy?.summary ?? null;
  const reconciliationSurface = canonical?.reconciliation ?? legacy?.reconciliation;
  const winnerSurface = canonical?.winner_surface ?? legacy?.winner_surface;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const winnerPosture = buildWinnerPosture(winnerSurface, summary ?? undefined);
  const reconciliationPosture = buildReconciliationPosture(reconciliationSurface);

  const todayNetCollections =
    todayBranchOverview?.collections.net_amount ??
    legacy?.collections?.today_net_amount ??
    "0.00";
  const windowNetCollections =
    branchOverview?.collections.net_amount ??
    branchOverview?.collections.gross_amount ??
    summary?.total_paid_amount ??
    "0.00";

  const overdueCount = summary?.overdue_emis ?? 0;
  const flaggedReconciliationCount = reconciliationSurface?.flagged_count ?? 0;
  const deliveryActionCount = deliverySummary
    ? deliverySummary.pending +
      deliverySummary.scheduled +
      deliverySummary.in_transit
    : 0;
  const inventoryActionCount =
    stockSummary?.results?.filter((row) => row.is_below_reorder).length ?? 0;
  const purchaseActionCount =
    (purchaseDrafts?.count ?? 0) + (purchaseApproved?.count ?? 0);
  const leadActionCount =
    (legacy?.crm?.open_leads ?? 0) +
    (requestQueue?.count ?? 0);

  const selectedBranch = selectedBranchId
    ? branchOverview?.branches.find((branch) => String(branch.id) === selectedBranchId)
    : null;
  const selectedBranchLabel = selectedBranch
    ? `${selectedBranch.code} · ${selectedBranch.name}`
    : "All branches";

  const overdueFollowUpHref = ROUTES.admin.emisOverdue;
  const flaggedPaymentQueueHref = buildAdminReconciliationRoute({
    view: "payments",
    flagged: true,
  });
  const dueCollectionWorkspaceHref = buildAdminCollectionsRoute();
  const deliveryQueueHref = buildAdminDeliveriesRoute({ bucket: "PENDING" });
  const supportQueueHref = buildAdminSupportRequestsRoute({ status: "SUBMITTED" });
  const onboardingRequestsHref = buildAdminSubscriptionRequestsRoute({
    status: "SUBMITTED",
  });
  const newLeadQueueHref = buildAdminLeadsRoute({ status: "NEW" });

  function widgetMeta(id: WidgetId): {
    title: string;
    description: string;
    icon: ReactNode;
    openHref?: string;
  } {
    switch (id) {
      case "due-followup":
        return {
          title: "Collections follow-up",
          description: "Overdue and upcoming Advance EMI dues in the current window.",
          icon: <CalendarClock className="h-5 w-5" />,
          openHref: overdueFollowUpHref,
        };
      case "recent-payments":
        return {
          title: "Recent payments",
          description: "Latest payment postings and reversal signal in the current scope.",
          icon: <CircleDollarSign className="h-5 w-5" />,
          openHref: ROUTES.admin.payments,
        };
      case "reconciliation-exceptions":
        return {
          title: "Reconciliation exceptions",
          description: "Flagged reconciliation deltas requiring controlled review.",
          icon: <ShieldAlert className="h-5 w-5" />,
          openHref: flaggedPaymentQueueHref,
        };
      case "deliveries":
        return {
          title: "Delivery queue",
          description: "Pending delivery actions and in-transit workload.",
          icon: <Truck className="h-5 w-5" />,
          openHref: deliveryQueueHref,
        };
      case "inventory-alerts":
        return {
          title: "Inventory alerts",
          description: "Low-stock and reorder signals from the inventory register.",
          icon: <PackageSearch className="h-5 w-5" />,
          openHref: ROUTES.admin.inventory,
        };
      case "purchase-queue":
        return {
          title: "Purchase queue",
          description: "Draft and approved purchase bills waiting posting.",
          icon: <Factory className="h-5 w-5" />,
          openHref: ROUTES.admin.accountingPurchaseBills,
        };
      case "payroll-queue":
        return {
          title: "Payroll & reimbursements",
          description: "Posted salary sheets and expense claims awaiting settlement.",
          icon: <Users className="h-5 w-5" />,
          openHref: ROUTES.admin.accountingSalary,
        };
      case "service-desk":
        return {
          title: "Service desk",
          description: "Open after-sales cases and service workload signals.",
          icon: <ShieldAlert className="h-5 w-5" />,
          openHref: ROUTES.admin.serviceDesk,
        };
      case "reminders":
        return {
          title: "Reminder operations",
          description: "Pending and failed reminders requiring operator follow-up.",
          icon: <Siren className="h-5 w-5" />,
          openHref: ROUTES.admin.reminders,
        };
      case "onboarding":
        return {
          title: "Onboarding handoff",
          description: "Subscription requests and lead handoff into real customer/contract records.",
          icon: <ShoppingCart className="h-5 w-5" />,
          openHref: onboardingRequestsHref,
        };
      case "support-queue":
        return {
          title: "Support queue",
          description: "Submitted support issues requiring assignment and resolution.",
          icon: <AlertTriangle className="h-5 w-5" />,
          openHref: supportQueueHref,
        };
      case "winners":
        return {
          title: "Lucky draw & waiver surface",
          description: "Winner subscriptions and future EMI waiver surface summary.",
          icon: <BadgeCheck className="h-5 w-5" />,
          openHref: ROUTES.admin.luckyDraws,
        };
      case "branch-snapshot":
        return {
          title: "Branch snapshot",
          description: "Branch-scoped collections and direct sale posture for the current window.",
          icon: <Building2 className="h-5 w-5" />,
          openHref: ROUTES.admin.branchReporting,
        };
      case "module-directory":
        return {
          title: "Module directory",
          description: "Cross-module launchpad for daily admin operations.",
          icon: <Wallet className="h-5 w-5" />,
          openHref: ROUTES.admin.root,
        };
      default:
        return {
          title: "Widget",
          description: "Operational widget.",
          icon: <Banknote className="h-5 w-5" />,
        };
    }
  }

  function widgetAttention(id: WidgetId): { attention: AdminDashboardWidgetAttention; label?: string } {
    if (id === "due-followup") {
      const attention = attentionFromCount({
        count: overdueCount,
        urgentThreshold: 25,
        warningThreshold: 1,
      });
      return { attention, label: overdueCount > 0 ? `${overdueCount} overdue` : "Quiet" };
    }
    if (id === "reconciliation-exceptions") {
      const count = flaggedReconciliationCount ?? 0;
      const attention = attentionFromCount({
        count,
        urgentThreshold: 20,
        warningThreshold: 1,
      });
      return { attention, label: count > 0 ? `${count} flagged` : "Quiet" };
    }
    if (id === "deliveries") {
      const attention = attentionFromCount({
        count: deliveryActionCount,
        urgentThreshold: 20,
        warningThreshold: 1,
      });
      return {
        attention,
        label: deliveryActionCount > 0 ? `${deliveryActionCount} actions` : "Quiet",
      };
    }
    if (id === "inventory-alerts") {
      const count = inventoryActionCount;
      const attention = attentionFromCount({
        count,
        urgentThreshold: 10,
        warningThreshold: 1,
      });
      return { attention, label: count > 0 ? `${count} low stock` : "Quiet" };
    }
    if (id === "purchase-queue") {
      const count = purchaseActionCount;
      const attention = attentionFromCount({ count, urgentThreshold: 15, warningThreshold: 1 });
      return { attention, label: count > 0 ? `${count} pending` : "Quiet" };
    }
    if (id === "reminders") {
      const failed = failedReminderQueue?.count ?? 0;
      const pending = pendingReminderQueue?.count ?? 0;
      if (failed > 0) return { attention: "urgent", label: `${failed} failed` };
      const attention = attentionFromCount({ count: pending, urgentThreshold: 25, warningThreshold: 1 });
      return { attention, label: pending > 0 ? `${pending} pending` : "Quiet" };
    }
    if (id === "onboarding") {
      const count = leadActionCount;
      if (count > 0) return { attention: "warning", label: `${count} pending` };
      return { attention: "quiet", label: "Quiet" };
    }
    if (id === "support-queue") {
      const count = supportQueue?.count ?? 0;
      const attention = attentionFromCount({ count, urgentThreshold: 10, warningThreshold: 1 });
      return { attention, label: count > 0 ? `${count} submitted` : "Quiet" };
    }
    if (id === "service-desk") {
      const count =
        openServiceCases?.count ??
        serviceDeskOverview?.summary?.open_count ??
        0;
      const attention = attentionFromCount({
        count,
        urgentThreshold: 10,
        warningThreshold: 1,
      });
      return { attention, label: count > 0 ? `${count} open` : "Quiet" };
    }
    if (id === "winners") {
      const count = winnerSurface?.winner_subscriptions ?? 0;
      if (count > 0) return { attention: "normal", label: `${count} winners` };
      return { attention: "quiet", label: "Quiet" };
    }
    return { attention: "normal" };
  }

  const launcherItems: WidgetLauncherItem[] = useMemo(
    () =>
      WIDGET_IDS.map((id) => {
        const meta = widgetMeta(id);
        const attention = widgetAttention(id);
        return {
          id,
          title: meta.title,
          description: meta.description,
          icon: meta.icon,
          attention: attention.attention,
          attentionLabel: attention.label,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      overdueCount,
      flaggedReconciliationCount,
      deliveryActionCount,
      inventoryActionCount,
      purchaseActionCount,
      leadActionCount,
      supportQueue?.count,
      openServiceCases?.count,
      serviceDeskOverview?.summary?.open_count,
      winnerSurface?.winner_subscriptions,
      failedReminderQueue?.count,
      pendingReminderQueue?.count,
    ]
  );

  if (loadingCore) {
    return (
      <PortalPage
        title="Operations Workspace"
        subtitle="Action workspace for collections, Advance EMI follow-up, reconciliation, delivery, inventory, purchase, service, reminders, and onboarding queues."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Operations" },
        ]}
      >
        <LoadingBlock label="Loading dashboard..." />
      </PortalPage>
    );
  }

  if (coreError) {
    return (
      <PortalPage
        title="Operations Workspace"
        subtitle="Action workspace for collections, Advance EMI follow-up, reconciliation, delivery, inventory, purchase, service, reminders, and onboarding queues."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Operations" },
        ]}
        actions={[
          {
            href: ROUTES.admin.financeCollect,
            label: "Collect Payment",
            variant: "primary",
          },
        ]}
      >
        <ErrorState title="Dashboard failed to load" message={coreError} onRetry={() => void loadCore("refresh")} />
      </PortalPage>
    );
  }

  const cashToday = toNumber(
    todayBranchOverview?.collections.cash_net_total ?? todayBranchOverview?.collections.cash_total
  );
  const bankToday = toNumber(
    todayBranchOverview?.collections.bank_net_total ?? todayBranchOverview?.collections.bank_total
  );
  const upiToday = toNumber(
    todayBranchOverview?.collections.upi_net_total ?? todayBranchOverview?.collections.upi_total
  );

  return (
    <PortalPage
      eyebrow="Operations Control"
      title="Operations Workspace"
      subtitle="Action-first workspace for finance, collections, Advance EMI, fulfillment, inventory, service desk, reminders, onboarding, and governance queues."
      helperNote="Widgets use live module data only. No synthetic operational KPIs are generated in the dashboard layer."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Operations" },
      ]}
      actions={[
        {
          href: ROUTES.admin.dashboard,
          label: "Executive Dashboard",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.financeCollect,
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: ROUTES.admin.finance,
          label: "Finance Control",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.reports,
          label: "Reports",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.collections,
          label: "Collections",
          variant: "secondary",
        },
        {
          href: flaggedPaymentQueueHref,
          label: "Reconciliation Flags",
          variant: "secondary",
        },
      ]}
      statusBadge={{
        label: summary?.has_payment_adjustments ? "Canonical + Adjustments" : "Canonical",
        tone: summary?.has_payment_adjustments ? "warning" : "info",
      }}
    >
      <ExecutiveDashboardShell
        posture={
          <>
        <div className="surface-panel-elevated flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
          <label className="min-w-[240px] flex-1 text-sm text-muted-foreground md:max-w-sm">
            <span className="enterprise-eyebrow mb-2 block">Branch scope</span>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              disabled={refreshingCore}
              className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-border focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">All branches</option>
              {(branchOverview?.branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm text-muted-foreground">
            <div className="enterprise-eyebrow">Active scope</div>
            <div className="mt-2 font-semibold text-foreground">{selectedBranchLabel}</div>
          </div>

          <ActionButton
            variant="outline"
            onClick={() => void loadCore("refresh")}
            disabled={refreshingCore}
            leftIcon={
              <RefreshCw className={refreshingCore ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            }
          >
            {refreshingCore ? "Refreshing..." : "Refresh core"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void refreshOpenWidgets()}
            disabled={refreshingCore}
          >
            Refresh open widgets
          </ActionButton>
          <ActionButton variant="ghost" onClick={resetWidgets} disabled={refreshingCore}>
            Restore defaults
          </ActionButton>
          <ActionButton
            variant="ghost"
            onClick={closeUnpinnedWidgets}
            disabled={refreshingCore}
          >
            Close unpinned
          </ActionButton>
        </div>

        <DashboardTimeWindowSelector
          value={windowPreset}
          startDate={startDate}
          endDate={endDate}
          loading={refreshingCore}
          title="Operations window"
          description="Window applies to canonical dashboard surfaces and branch reporting summaries. Financial posting semantics remain unchanged."
          onWindowChange={setWindowPreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        <MetricStrip
          className="xl:grid-cols-4"
          items={[
            {
              label: "Active subscriptions",
              value: String(summary?.active_subscriptions ?? 0),
              helper: `${summary?.subscription_count ?? 0} total contracts`,
            },
            {
              label: "Outstanding receivables",
              value: money(summary?.outstanding_amount ?? "0.00"),
              helper: `${money(summary?.overdue_amount ?? "0.00")} overdue`,
            },
            {
              label: "Deliveries pending",
              value: String(deliveryActionCount),
              helper: `${deliverySummary?.pending ?? 0} pending · ${deliverySummary?.in_transit ?? 0} in transit`,
            },
            {
              label: "Collections split (today)",
              value: money(todayNetCollections),
              helper: `Cash ${cashToday.toFixed(2)} · Bank ${bankToday.toFixed(2)} · UPI ${upiToday.toFixed(2)}`,
            },
          ]}
        />
          </>
        }
        queues={
        <>
        <WorkspaceDirectory
          title="Operational launch map"
          description="Use the route-safe launcher below to move from dashboard posture into the exact workspace that owns the underlying records. Finance, billing, support, and collections stay cross-linked but operationally separate."
          groups={[
            {
              title: "Customer intake and collections",
              description: "High-frequency admin workflows for onboarding, due follow-up, and payment execution.",
              items: [
                {
                  title: "Collections workspace",
                  description: "Advance EMI, overdue follow-up, and collection execution lanes.",
                  href: ROUTES.admin.collections,
                  icon: <CircleDollarSign className="h-4 w-4" />,
                  badge: "Collection",
                },
                {
                  title: "Payment register",
                  description: "Review payment history and open individual payment timelines.",
                  href: ROUTES.admin.payments,
                  icon: <Wallet className="h-4 w-4" />,
                  badge: "Register",
                },
                {
                  title: "Customer register",
                  description: "Profile, KYC, subscription context, and support-aware customer routing.",
                  href: ROUTES.admin.customers,
                  icon: <Users className="h-4 w-4" />,
                  badge: "Customer",
                },
                {
                  title: "Lead inbox",
                  description: "Assignment, follow-up, and conversion handoff for new enquiries.",
                  href: ROUTES.admin.leads,
                  icon: <Percent className="h-4 w-4" />,
                  badge: "Onboarding",
                },
              ],
            },
            {
              title: "Branch and service execution",
              description: "Operational visibility for branch health, dispatch pressure, and complaint handling.",
              items: [
                {
                  title: "Branch reporting",
                  description: "Branch, desk, sales, stock, and people-cost visibility by operating scope.",
                  href: ROUTES.admin.branchReporting,
                  icon: <Building2 className="h-4 w-4" />,
                  badge: "Branch",
                },
                {
                  title: "Delivery workspace",
                  description: "Pending, scheduled, in-transit, and delivery action lanes.",
                  href: ROUTES.admin.deliveries,
                  icon: <Truck className="h-4 w-4" />,
                  badge: "Fulfillment",
                },
                {
                  title: "Support requests",
                  description: "Customer-submitted issue queue with payment and subscription context.",
                  href: ROUTES.admin.supportRequests,
                  icon: <ShieldAlert className="h-4 w-4" />,
                  badge: "Triage",
                },
                {
                  title: "Service desk",
                  description: "Complaint escalation, return cases, and after-sales execution.",
                  href: ROUTES.admin.serviceDesk,
                  icon: <CheckCircle2 className="h-4 w-4" />,
                  badge: "After-sales",
                },
              ],
            },
            {
              title: "Commercial and business control",
              description: "Separate operational control lanes for reporting, stock, retail billing, and finance posture.",
              items: [
                {
                  title: "Reports overview",
                  description: "Backend-prepared operational analytics, receivable posture, and report routing.",
                  href: ROUTES.admin.reports,
                  icon: <BadgeCheck className="h-4 w-4" />,
                  badge: "Reports",
                },
                {
                  title: "Billing operations",
                  description: "Direct sales, invoices, receipts, contracts, and note registers.",
                  href: ROUTES.admin.billing,
                  icon: <ShoppingCart className="h-4 w-4" />,
                  badge: "Billing",
                },
                {
                  title: "Inventory operations",
                  description: "Stock, location, movement, and warehouse visibility lanes.",
                  href: ROUTES.admin.inventory,
                  icon: <PackageSearch className="h-4 w-4" />,
                  badge: "Stock",
                },
                {
                  title: "Finance control",
                  description: "Receivables, payout, and reconciliation posture without merging into cashier flows.",
                  href: ROUTES.admin.finance,
                  icon: <Banknote className="h-4 w-4" />,
                  badge: "Finance",
                },
              ],
            },
          ]}
        />

        <DashboardWidgetBoard
          storageKey={operationsBoardStorageKey}
          version={1}
          title="Operations cockpit board"
          description="Reorder route-safe operations clusters for daily focus while keeping core queues always visible."
          presets={[
            {
              id: "collections-heavy",
              label: "Collections heavy",
              description: "Prioritize collections and finance follow-up clusters.",
              order: [
                "collections-followup",
                "finance-visibility",
                "customers-sales",
                "crm-support",
                "billing-queues",
              ],
              pinned: ["collections-followup", "finance-visibility"],
            },
            {
              id: "support-heavy",
              label: "Support heavy",
              description: "Surface CRM/support and customer clusters for triage days.",
              order: [
                "crm-support",
                "customers-sales",
                "collections-followup",
                "billing-queues",
                "finance-visibility",
              ],
              pinned: ["crm-support", "customers-sales"],
            },
            {
              id: "finance-watch",
              label: "Finance watch",
              description: "Keep finance and collections cross-links at top.",
              order: [
                "finance-visibility",
                "collections-followup",
                "billing-queues",
                "crm-support",
                "customers-sales",
              ],
              pinned: ["finance-visibility", "collections-followup"],
            },
            {
              id: "sales-followup",
              label: "Sales follow-up",
              description: "Push customer/sales and billing queue routes first.",
              order: [
                "customers-sales",
                "billing-queues",
                "collections-followup",
                "crm-support",
                "finance-visibility",
              ],
              pinned: ["customers-sales", "billing-queues"],
            },
          ]}
          widgets={[
            {
              id: "collections-followup",
              title: "Collections follow-up",
              subtitle: "Overdue and upcoming EMI queues with reconciliation cross-check links.",
              group: "core",
              fixed: true,
              defaultPinned: true,
              content: (
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton href={buildAdminCollectionsRoute()} variant="outline" className="justify-between">
                    Overdue collections
                    <Siren className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton href={buildAdminCollectionsRoute()} variant="outline" className="justify-between">
                    Upcoming dues
                    <CalendarClock className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton href={buildAdminReconciliationRoute({ flagged: true })} variant="outline" className="justify-between">
                    Reconciliation flags
                    <ShieldAlert className="h-4 w-4" />
                  </ActionButton>
                </div>
              ),
            },
            {
              id: "customers-sales",
              title: "Customers & sales",
              subtitle: "Customer onboarding and subscription pipeline routes.",
              group: "quick-actions",
              defaultPinned: true,
              content: (
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton href={ROUTES.admin.customers} variant="outline">Customer register</ActionButton>
                  <ActionButton href={ROUTES.admin.subscriptions} variant="outline">Subscription register</ActionButton>
                  <ActionButton href={ROUTES.admin.leads} variant="outline">Lead inbox</ActionButton>
                </div>
              ),
            },
            {
              id: "billing-queues",
              title: "Billing queues",
              subtitle: "Direct sales and billing operations routed separately from EMI collections.",
              group: "operational",
              content: (
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton href={ROUTES.admin.billing} variant="outline">Billing workspace</ActionButton>
                  <ActionButton href={ROUTES.admin.billingDirectSales} variant="outline">Direct sales</ActionButton>
                  <ActionButton href={ROUTES.admin.payments} variant="outline">Payment register</ActionButton>
                </div>
              ),
            },
            {
              id: "crm-support",
              title: "CRM and support workload",
              subtitle: "Service desk and support triage queues for operational follow-up.",
              group: "attention",
              fixed: true,
              content: (
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton href={ROUTES.admin.supportRequests} variant="outline">Support requests</ActionButton>
                  <ActionButton href={ROUTES.admin.serviceDesk} variant="outline">Service desk</ActionButton>
                  <ActionButton href={buildAdminLeadsRoute({ status: "OPEN" })} variant="outline">Open leads</ActionButton>
                </div>
              ),
            },
            {
              id: "finance-visibility",
              title: "Finance visibility cross-links",
              subtitle: "Finance/accounting visibility links kept separate from collection posting.",
              group: "operational",
              content: (
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionButton href={ROUTES.admin.finance} variant="outline">Finance control</ActionButton>
                  <ActionButton href={ROUTES.admin.accounting} variant="outline">Accounting lanes</ActionButton>
                  <ActionButton href={ROUTES.admin.reports} variant="outline">Reports hub</ActionButton>
                </div>
              ),
            },
          ]}
        />

        <WidgetShell
          title="Settlement posture"
          subtitle="Canonical finance posture derived from the current scope. This is a read-only summary and does not change posting truth."
          icon={<Wallet className="h-5 w-5" />}
          attention="normal"
          attentionLabel={settlementPosture?.badgeLabel ?? "Canonical"}
          isFixed
          collapsed={false}
          openHref={ROUTES.admin.finance}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
              <div className="enterprise-eyebrow">Posture</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {settlementPosture?.title ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {settlementPosture?.description ?? "Settlement posture summary"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
              <div className="enterprise-eyebrow">Next due</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {summary?.next_due_subscription_number ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {summary?.next_due_date && summary.next_due_amount
                  ? `${money(summary.next_due_amount)} on ${formatDate(summary.next_due_date)}`
                  : "No next due row visible"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
              <div className="enterprise-eyebrow">Collections today</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {money(todayNetCollections)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Cash {cashToday.toFixed(2)} · Bank {bankToday.toFixed(2)} · UPI {upiToday.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
              <div className="enterprise-eyebrow">Lucky draw</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {legacy?.batches?.next_draw_batch?.batch_code ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {legacy?.batches?.next_draw_batch?.draw_date
                  ? `${legacy.batches.next_draw_batch.days_until_draw ?? 0} days to ${formatDate(
                      legacy.batches.next_draw_batch.draw_date
                    )}`
                  : "No draw scheduled"}
              </div>
            </div>
          </div>
        </WidgetShell>

        <WidgetLauncher
          items={launcherItems}
          openIds={openIds}
          pinnedIds={pinnedIds}
          onOpen={(id) => openWidget(id as WidgetId)}
        />

        {widgetPrefs.open.length === 0 ? (
          <EmptyState
            title="No optional widgets open"
            description="Use the operations palette above to open widgets for the current workload."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {widgetPrefs.open.map((idRaw) => {
              const id = idRaw as WidgetId;
              if (!(WIDGET_IDS as readonly string[]).includes(id)) return null;

              const meta = widgetMeta(id);
              const attention = widgetAttention(id);
              const isCollapsed = collapsedIds.has(id);
              const isPinned = pinnedIds.has(id);

              const error = widgetError[id];
              const isLoading = widgetLoading[id] ?? false;

              const content = (() => {
                  if (error) {
                    return (
                    <ErrorState title="Widget failed to load" message={error} onRetry={() => void loadWidget(id)} />
                    );
                  }

                  if (isLoading) {
                  return <LoadingBlock label="Loading widget..." />;
                  }

                switch (id) {
                  case "due-followup": {
                    const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
                      0,
                      8
                    );
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Overdue EMI"
                            value={String(overdueCount)}
                            subtext={`${money(summary?.overdue_amount ?? "0.00")} overdue`}
                            tone={overdueCount > 0 ? "warning" : "success"}
                            icon={<AlertTriangle className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Upcoming EMI"
                            value={String(summary?.upcoming_emis ?? 0)}
                            subtext={
                              summary?.next_due_date && summary.next_due_amount
                                ? `${money(summary.next_due_amount)} next on ${formatDate(
                                    summary.next_due_date
                                  )}`
                                : "No next due row visible"
                            }
                            tone="default"
                            icon={<CalendarClock className="h-5 w-5" />}
                          />
                        </div>

                        {dueRows.length > 0 ? (
                          <div className="grid gap-2">
                            {dueRows.map((row) => (
                              <div
                                key={String(row.id)}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50"
                              >
                                <Link
                                  href={
                                    row.subscription_id
                                      ? buildAdminCollectionsRoute({
                                          subscription: String(row.subscription_id),
                                        })
                                      : dueCollectionWorkspaceHref
                                  }
                                  className="min-w-0 flex-1"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="font-semibold text-slate-950">
                                      {row.subscription_number ?? row.subscription_id ?? "Subscription"}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {row.due_date ? formatDate(row.due_date) : "—"}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {row.customer_name ?? "Unknown customer"}
                                    {row.pending_amount ? ` • Due ${money(row.pending_amount)}` : ""}
                                    {row.is_overdue ? ` • ${row.overdue_days ?? 0}d overdue` : ""}
                                  </div>
                                </Link>

                                {row.subscription_id && typeof row.emi_id === "number" && row.emi_id > 0 ? (
                                  <ActionButton
                                    size="sm"
                                    variant="secondary"
                                    leftIcon={<CircleDollarSign className="h-4 w-4" />}
                                    ariaLabel="Collect payment"
                                    onClick={() =>
                                      openWorkflow("admin.collectPayment", {
                                        query: {
                                          subscription: row.subscription_id,
                                          emi: row.emi_id,
                                        },
                                      })
                                    }
                                  >
                                    Collect
                                  </ActionButton>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No due rows in window"
                            description="Overdue and upcoming dues are clear in the current window."
                          />
                        )}
                      </div>
                    );
                  }

                  case "reconciliation-exceptions": {
                    const rows = reconciliationItems?.results ?? [];
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Flagged rows"
                            value={String(reconciliationSurface?.flagged_count ?? 0)}
                            subtext={`${reconciliationSurface?.checked_count ?? 0} checked`}
                            tone={
                              (reconciliationSurface?.flagged_count ?? 0) > 0
                                ? "warning"
                                : "success"
                            }
                            icon={<ShieldAlert className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Posture"
                            value={reconciliationPosture.badgeLabel}
                            subtext={reconciliationPosture.description}
                            tone="default"
                          />
                        </div>

                        {rows.length > 0 ? (
                          <div className="grid gap-2">
                            {rows.slice(0, 6).map((row) => (
                              <Link
                                key={row.subscription_id}
                                href={buildAdminReconciliationRoute({
                                  subscription: row.subscription_id,
                                  flagged: true,
                                })}
                                className="rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="font-semibold text-slate-950">
                                    {row.subscription_number}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    Δ {money(row.delta ?? "0.00")}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.customer_name ?? "Unknown customer"} • Paid{" "}
                                  {money(row.paid_amount ?? "0.00")} • Waived{" "}
                                  {money(row.waived_amount ?? "0.00")}
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No reconciliation exceptions"
                            description="No flagged reconciliation rows are visible in the current window."
                          />
                        )}
                      </div>
                    );
                  }

                  case "deliveries": {
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <StatCard
                            label="Pending"
                            value={String(deliverySummary?.pending ?? 0)}
                            subtext="Requires scheduling / dispatch"
                            tone={(deliverySummary?.pending ?? 0) > 0 ? "warning" : "success"}
                            icon={<Truck className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Scheduled"
                            value={String(deliverySummary?.scheduled ?? 0)}
                            subtext="Planned deliveries"
                            tone="default"
                          />
                          <StatCard
                            label="In transit"
                            value={String(deliverySummary?.in_transit ?? 0)}
                            subtext="Active movement"
                            tone="default"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={deliveryQueueHref} variant="secondary" className="h-9 px-3 text-xs">
                            Open pending queue
                          </ActionButton>
                          <ActionButton href={ROUTES.admin.deliveries} variant="outline" className="h-9 px-3 text-xs">
                            All deliveries
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "inventory-alerts": {
                    const rows = stockSummary?.results ?? [];
                    const lowStock = rows.filter((row) => row.is_below_reorder);
                    // Phase 2: reserved stock aggregation
                    const totalReserved = rows.reduce(
                      (sum, row) => sum + parseFloat(row.reserved_qty ?? "0"),
                      0
                    );
                    const totalAvailable = rows.reduce(
                      (sum, row) => sum + parseFloat(row.available_qty ?? row.on_hand_qty ?? "0"),
                      0
                    );
                    const outOfStock = rows.filter((row) => parseFloat(row.on_hand_qty ?? "0") <= 0);
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <StatCard
                            label="Low stock items"
                            value={String(lowStock.length)}
                            subtext="Below reorder threshold"
                            tone={lowStock.length > 0 ? "warning" : "success"}
                            icon={<PackageSearch className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Tracked items"
                            value={String(rows.length)}
                            subtext="From stock summary"
                            tone="default"
                          />
                          {/* Phase 2: reserved stock widgets */}
                          <StatCard
                            label="Total reserved"
                            value={totalReserved.toFixed(0)}
                            subtext="Units soft-held for orders"
                            tone={totalReserved > 0 ? "warning" : "default"}
                          />
                          <StatCard
                            label="Available to promise"
                            value={totalAvailable.toFixed(0)}
                            subtext={outOfStock.length > 0 ? `${outOfStock.length} items out of stock` : "All items have stock"}
                            tone={outOfStock.length > 0 ? "danger" : "success"}
                          />
                        </div>
                        {lowStock.length > 0 ? (
                          <div className="grid gap-2">
                            {lowStock.slice(0, 6).map((row) => (
                              <div
                                key={`${row.item_id}-${row.default_stock_location_id ?? "na"}-${row.branch_id ?? "na"}`}
                                className="rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
                              >
                                <div className="font-semibold text-slate-950">
                                  {row.product_name ?? "Inventory item"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  On hand {row.on_hand_qty}
                                  {row.reserved_qty && ` • Reserved ${row.reserved_qty}`}
                                  {row.available_qty && ` • Available ${row.available_qty}`}
                                  {` • Reorder ${row.reorder_level_qty ?? "—"}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No low stock alerts"
                            description="No stock items are below reorder thresholds for the current branch scope."
                          />
                        )}
                      </div>
                    );
                  }

                  case "purchase-queue": {
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Draft purchase bills"
                            value={String(purchaseDrafts?.count ?? 0)}
                            subtext="Awaiting approval"
                            tone={(purchaseDrafts?.count ?? 0) > 0 ? "warning" : "success"}
                            icon={<Factory className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Approved purchase bills"
                            value={String(purchaseApproved?.count ?? 0)}
                            subtext="Awaiting posting"
                            tone={(purchaseApproved?.count ?? 0) > 0 ? "warning" : "success"}
                            icon={<CheckCircle2 className="h-5 w-5" />}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            href={ROUTES.admin.accountingPurchaseBills}
                            variant="secondary"
                            className="h-9 px-3 text-xs"
                          >
                            Open purchase bills
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "payroll-queue": {
                    const salaryCount = salaryPayables?.count ?? 0;
                    const expenseCount = expenseClaimQueue?.count ?? 0;
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Salary sheets (posted)"
                            value={String(salaryCount)}
                            subtext="Awaiting settlement"
                            tone={salaryCount > 0 ? "warning" : "success"}
                            icon={<Users className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Expense claims (posted)"
                            value={String(expenseCount)}
                            subtext="Awaiting reimbursement"
                            tone={expenseCount > 0 ? "warning" : "success"}
                            icon={<Wallet className="h-5 w-5" />}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            href={ROUTES.admin.accountingSalary}
                            variant="secondary"
                            className="h-9 px-3 text-xs"
                          >
                            Open salary
                          </ActionButton>
                          <ActionButton
                            href={ROUTES.admin.accountingExpenseClaims}
                            variant="outline"
                            className="h-9 px-3 text-xs"
                          >
                            Expense claims
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "service-desk": {
                    const openCount =
                      openServiceCases?.count ??
                      serviceDeskOverview?.summary?.open_count ??
                      0;
                    const financePending =
                      serviceDeskOverview?.summary?.finance_pending_count ?? 0;
                    const stockPending =
                      serviceDeskOverview?.summary?.stock_pending_count ?? 0;
                    const openSupport =
                      serviceDeskOverview?.summary?.open_support_request_count ?? 0;
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Open cases"
                            value={String(openCount)}
                            subtext="After-sales / returns / tickets"
                            tone={openCount > 0 ? "warning" : "success"}
                            icon={<ShieldAlert className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Pending lanes"
                            value={`${financePending + stockPending}`}
                            subtext={`Finance ${financePending} · Stock ${stockPending} · Support ${openSupport}`}
                            tone="default"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={ROUTES.admin.serviceDesk} variant="secondary" className="h-9 px-3 text-xs">
                            Open service desk
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "reminders": {
                    const pendingCount = pendingReminderQueue?.count ?? 0;
                    const failedCount = failedReminderQueue?.count ?? 0;
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Pending reminders"
                            value={String(pendingCount)}
                            subtext="Waiting dispatch"
                            tone={pendingCount > 0 ? "warning" : "success"}
                            icon={<Siren className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Failed reminders"
                            value={String(failedCount)}
                            subtext="Needs operator review"
                            tone={failedCount > 0 ? "danger" : "success"}
                            icon={<AlertTriangle className="h-5 w-5" />}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={ROUTES.admin.reminders} variant="secondary" className="h-9 px-3 text-xs">
                            Open reminders
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "onboarding": {
                    const requestCount = requestQueue?.count ?? 0;
                    const openLeads = legacy?.crm?.open_leads ?? 0;
                    const leads = leadQueue?.results ?? [];
                    const requests = requestQueue?.results ?? [];
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Subscription requests"
                            value={String(requestCount)}
                            subtext="Submitted for admin review"
                            tone={requestCount > 0 ? "warning" : "success"}
                            icon={<ShoppingCart className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Open leads"
                            value={String(openLeads)}
                            subtext="From CRM lead pipeline"
                            tone={openLeads > 0 ? "info" : "success"}
                            icon={<Percent className="h-5 w-5" />}
                          />
                        </div>
                        {requests.length > 0 || leads.length > 0 ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            <div className="rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] p-4">
                              <div className="enterprise-eyebrow">Recent requests</div>
                              <div className="mt-3 grid gap-2">
                                {requests.slice(0, 4).map((req) => (
                                  <Link
                                    key={req.id}
                                    href={`${ROUTES.admin.subscriptionRequests}/${req.id}`}
                                    className="rounded-[1.1rem] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:bg-muted/50"
                                  >
                                    #{req.id} · {req.requested_customer_name || req.customer_name || "Customer"} ·{" "}
                                    {req.batch_code || "Batch"}
                                  </Link>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] p-4">
                              <div className="enterprise-eyebrow">Recent leads</div>
                              <div className="mt-3 grid gap-2">
                                {leads.slice(0, 4).map((lead) => (
                                  <Link
                                    key={lead.id}
                                    href={`${ROUTES.admin.leads}/${lead.id}`}
                                    className="rounded-[1.1rem] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:bg-muted/50"
                                  >
                                    #{lead.id} · {lead.name} · {lead.status}
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {lead.product_name || lead.interested_product || "General"} •{" "}
                                      {formatDateTime(lead.created_at)}
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <EmptyState
                            title="No onboarding workload"
                            description="No subscription requests or open leads are visible right now."
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            href={onboardingRequestsHref}
                            variant="secondary"
                            className="h-9 px-3 text-xs"
                          >
                            Open request queue
                          </ActionButton>
                          <ActionButton
                            href={newLeadQueueHref}
                            variant="outline"
                            className="h-9 px-3 text-xs"
                          >
                            Open new leads
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "support-queue": {
                    const rows = supportQueue?.results ?? [];
                    const count = supportQueue?.count ?? 0;
                    return (
                      <div className="space-y-4">
                        <StatCard
                          label="Submitted support issues"
                          value={String(count)}
                          subtext={`${supportQueue?.summary.unassigned ?? 0} unassigned`}
                          tone={count > 0 ? "warning" : "success"}
                          icon={<ShieldAlert className="h-5 w-5" />}
                        />
                        {rows.length > 0 ? (
                          <div className="grid gap-2">
                            {rows.slice(0, 5).map((row) => (
                              <Link
                                key={row.id}
                                href={`${ROUTES.admin.supportRequests}/${row.id}`}
                                className="rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50"
                              >
                                <div className="font-semibold text-slate-950">
                                  #{row.id} · {row.category}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.customer_name ?? "Unknown customer"} • {row.status}
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No submitted support issues"
                            description="No support requests are currently submitted."
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={supportQueueHref} variant="secondary" className="h-9 px-3 text-xs">
                            Open support queue
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "recent-payments": {
                    const rows = recentPayments?.results ?? [];
                    return (
                      <div className="space-y-4">
                        {rows.length > 0 ? (
                          <div className="grid gap-2">
                            {rows.slice(0, 8).map((row) => (
                              <Link
                                key={row.payment_id}
                                href={buildAdminPaymentRoute(row.payment_id)}
                                className="rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="font-semibold text-slate-950">
                                    {money(row.amount)}{" "}
                                    <span className="text-xs font-semibold text-muted-foreground">
                                      {row.method ?? "—"}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDateTime(row.created_at ?? row.payment_date)}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.customer_name ?? "Unknown customer"}
                                  {row.subscription_number ? ` • ${row.subscription_number}` : ""}
                                  {row.is_reversed ? " • Reversed" : ""}
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No recent payments"
                            description="No payment postings are visible in the current window."
                          />
                        )}
                      </div>
                    );
                  }

                  case "winners": {
                    const rows = winnerItems?.results ?? [];
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label="Winner subscriptions"
                            value={String(winnerSurface?.winner_subscriptions ?? 0)}
                            subtext={`${winnerSurface?.waived_emis ?? 0} waived EMI rows`}
                            tone="info"
                            icon={<BadgeCheck className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Waived value"
                            value={money(winnerSurface?.total_waived_amount ?? "0.00")}
                            subtext={winnerPosture.badgeLabel}
                            tone="default"
                          />
                        </div>

                        {rows.length > 0 ? (
                          <div className="grid gap-2">
                            {rows.slice(0, 6).map((row) => (
                              <Link
                                key={row.subscription_id}
                                href={buildAdminCollectionsRoute({
                                  subscription: String(row.subscription_id),
                                })}
                                className="rounded-[1.2rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50"
                              >
                                <div className="font-semibold text-slate-950">
                                  {row.subscription_number}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.customer_name ?? "Unknown customer"}
                                  {row.waived_amount ? ` • Waived ${money(row.waived_amount)}` : ""}
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            title="No winner rows"
                            description="No winner subscriptions are visible in the current window."
                          />
                        )}
                      </div>
                    );
                  }

                  case "branch-snapshot": {
                    const cashWindow = branchOverview?.collections.cash_net_total ?? branchOverview?.collections.cash_total;
                    const bankWindow = branchOverview?.collections.bank_net_total ?? branchOverview?.collections.bank_total;
                    const upiWindow = branchOverview?.collections.upi_net_total ?? branchOverview?.collections.upi_total;
                    return (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatCard
                            label={`Collections · ${branchWindow.label}`}
                            value={money(windowNetCollections)}
                            subtext={`Count ${branchOverview?.collections.count ?? 0}`}
                            tone="info"
                            icon={<Building2 className="h-5 w-5" />}
                          />
                          <StatCard
                            label="Direct sales"
                            value={money(branchOverview?.direct_sales.gross_total ?? "0.00")}
                            subtext={`${branchOverview?.direct_sales.count ?? 0} invoices`}
                            tone="default"
                            icon={<ShoppingCart className="h-5 w-5" />}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <StatCard
                            label="Cash"
                            value={money(cashWindow ?? "0.00")}
                            subtext="Window total"
                            tone="default"
                          />
                          <StatCard
                            label="Bank"
                            value={money(bankWindow ?? "0.00")}
                            subtext="Window total"
                            tone="default"
                          />
                          <StatCard
                            label="UPI"
                            value={money(upiWindow ?? "0.00")}
                            subtext="Window total"
                            tone="default"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={ROUTES.admin.branchReporting} variant="secondary" className="h-9 px-3 text-xs">
                            Open branch reporting
                          </ActionButton>
                        </div>
                      </div>
                    );
                  }

                  case "module-directory": {
                    return (
                      <ControlLaneGrid
                        title="Module lanes"
                        description="Canonical admin workspaces stay route-safe. Collections, accounting, billing, inventory, and service remain explicit lanes instead of being merged into a single popup workflow."
                        className="border-0 bg-transparent p-0 shadow-none"
                        lanes={[
                          {
                            title: "Collections & Advance EMI",
                            description: "Collections, payments, due lanes, and reconciliation workspaces.",
                            href: ROUTES.admin.collections,
                            icon: <CircleDollarSign className="h-4 w-4" />,
                            badge: "Ops",
                          },
                          {
                            title: "Inventory & Manufacturing",
                            description: "Stock control, locations, and manufacturing operations.",
                            href: ROUTES.admin.inventory,
                            icon: <PackageSearch className="h-4 w-4" />,
                            badge: "Stock",
                          },
                          {
                            title: "Billing & Direct Sales",
                            description: "Direct sales register, billing documents, and retail recovery surfaces.",
                            href: ROUTES.admin.billing,
                            icon: <ShoppingCart className="h-4 w-4" />,
                            badge: "Billing",
                          },
                          {
                            title: "Accounting & Books",
                            description: "Books, bridges, vendors, payroll, and procurement controls.",
                            href: ROUTES.admin.accounting,
                            icon: <Banknote className="h-4 w-4" />,
                            badge: "Control",
                          },
                        ]}
                      />
                    );
                  }

                  default:
                    return (
                      <EmptyState
                        title="Widget not available"
                        description="This widget does not have a configured surface yet."
                      />
                    );
                }
              })();

              return (
                <WidgetShell
                  key={id}
                  title={meta.title}
                  subtitle={meta.description}
                  icon={meta.icon}
                  attention={attention.attention}
                  attentionLabel={attention.label}
                  openHref={meta.openHref}
                  pinned={isPinned}
                  collapsed={isCollapsed}
                  onTogglePinned={() => togglePinned(id)}
                  onToggleCollapsed={() => toggleCollapsed(id)}
                  onRemove={() => removeWidget(id)}
                  onRefresh={() => void loadWidget(id)}
                  onMoveLeft={
                    widgetPrefs.open.indexOf(id) > 0 ? () => moveWidget(id, -1) : undefined
                  }
                  onMoveRight={
                    widgetPrefs.open.indexOf(id) < widgetPrefs.open.length - 1
                      ? () => moveWidget(id, 1)
                      : undefined
                  }
                >
                  {content}
                </WidgetShell>
              );
            })}
          </div>
        )}

        </>
        }
      />
    </PortalPage>
  );
}
