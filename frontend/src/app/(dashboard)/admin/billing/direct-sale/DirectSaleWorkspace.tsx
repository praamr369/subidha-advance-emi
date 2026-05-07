"use client";

import Link from "next/link";
import { Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { DashboardGridSkeleton } from "@/components/feedback/Skeleton";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import AdminCancellationDialog from "@/components/ui/AdminCancellationDialog";
import { WorkspaceSection } from "@/components/ui/workspace";
import OperationalNextStepsPanel from "@/components/workflows/OperationalNextStepsPanel";
import DirectSaleCollectDrawer from "@/features/direct-sale/components/DirectSaleCollectDrawer";
import { listFinanceAccounts } from "@/services/accounting";
import { createAdminDirectSaleOrchestrated } from "@/services/admin-sales";
import {
  cancelDirectSale,
  adminFinalizeDirectSaleInvoice,
  createDirectSale,
  listDirectSales,
  type DirectSale,
  type DirectSaleLine,
} from "@/services/billing";
import { listCrmParties, type PartyListRow } from "@/services/crm";
import { searchCustomers, type CustomerRecord } from "@/services/customers";
import {
  listAdminInventoryRequirements,
  searchBillingProducts,
  type BillingProductSearchRow,
} from "@/services/direct-sale-workspace";
import { recheckStockNeed } from "@/services/inventory-ops";
import { getAdminDirectSaleReturnEligibility } from "@/services/reversals";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingInvoicesRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { ApiError } from "@/lib/api";
import {
  invalidateAfterDirectSaleCreate,
} from "@/lib/operational-query-invalidation";
import {
  directSalesKeys,
  financeAccountKeys,
  inventoryKeys,
} from "@/lib/query-keys";

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type DraftLine = {
  id: string;
  product_id: string;
  inventory_item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  gst_rate: string;
  product_search: string;
  product_results: BillingProductSearchRow[];
  product_loading: boolean;
  product_error: string | null;
  selected_product: BillingProductSearchRow | null;
  create_requirement: boolean;
  requirement_quantity: string;
  requirement_note: string;
};

type FormState = {
  sale_date: string;
  customer_mode: "EXISTING" | "NEW" | "WALK_IN";
  walkin_create_customer_profile: boolean;
  customer_id: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  customer_snapshot_email: string;
  customer_snapshot_billing_address_line1: string;
  customer_snapshot_billing_address_line2: string;
  customer_snapshot_city: string;
  customer_snapshot_district: string;
  customer_snapshot_state: string;
  customer_snapshot_pincode: string;
  customer_gstin: string;
  customer_gst_type: "UNREGISTERED_CONSUMER" | "REGISTERED_BUSINESS";
  customer_snapshot_place_of_supply: string;
  tax_mode: "GST" | "NON_GST";
  tax_calculation_mode: "NON_GST" | "GST_INCLUSIVE" | "GST_EXCLUSIVE";
  finance_account: string;
  delivery_required: boolean;
  delivery_snapshot_address_line1: string;
  delivery_snapshot_address_line2: string;
  delivery_snapshot_city: string;
  delivery_snapshot_district: string;
  delivery_snapshot_state: string;
  delivery_snapshot_pincode: string;
  received_total: string;
  notes: string;
  terms: string;
  new_customer_name: string;
  new_customer_phone: string;
  new_customer_email: string;
};

type LineTotals = {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  lineTotal: number;
};

function makeLine(): DraftLine {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    product_id: "",
    inventory_item_id: "",
    description: "",
    quantity: "1.000",
    unit_price: "0.00",
    discount_amount: "0.00",
    gst_rate: "0.00",
    product_search: "",
    product_results: [],
    product_loading: false,
    product_error: null,
    selected_product: null,
    create_requirement: false,
    requirement_quantity: "1.000",
    requirement_note: "",
  };
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function quantity(value: number): string {
  return value.toFixed(3);
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function prefillFromSearchQuery(raw: string): { name: string; phone: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { name: "", phone: "" };
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const numericTokens = tokens.filter((token) => /\d/.test(token));
  const textTokens = tokens.filter((token) => !/\d/.test(token));
  const phone = normalizePhone(numericTokens.join(" "));
  const name = textTokens.join(" ").trim() || trimmed.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  return { name, phone };
}

function flattenApiErrors(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    const cleaned = value.trim();
    return cleaned ? [prefix ? `${prefix}: ${cleaned}` : cleaned] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenApiErrors(entry, prefix));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, entry]) => {
    if (key === "status") return [];
    const nextPrefix = key === "non_field_errors" ? prefix : key;
    return flattenApiErrors(entry, nextPrefix);
  });
}

function calculateLine(line: DraftLine, taxMode: "GST" | "NON_GST"): LineTotals {
  const qty = Math.max(toNumber(line.quantity), 0);
  const price = Math.max(toNumber(line.unit_price), 0);
  const gross = qty * price;
  const discount = Math.max(toNumber(line.discount_amount), 0);
  const taxable = Math.max(gross - discount, 0);
  const gstRate = taxMode === "GST" ? Math.max(toNumber(line.gst_rate), 0) : 0;
  const tax = taxable * (gstRate / 100);
  return {
    gross,
    discount,
    taxable,
    tax,
    lineTotal: taxable + tax,
  };
}

function buildLinePayload(line: DraftLine, taxMode: "GST" | "NON_GST"): DirectSaleLine {
  const totals = calculateLine(line, taxMode);
  const gstRate = taxMode === "GST" ? Math.max(toNumber(line.gst_rate), 0) : 0;
  const cgst = taxMode === "GST" ? totals.tax / 2 : 0;
  const sgst = taxMode === "GST" ? totals.tax / 2 : 0;
  return {
    product: Number(line.product_id),
    inventory_item: line.inventory_item_id ? Number(line.inventory_item_id) : null,
    description: line.description.trim(),
    quantity: quantity(Math.max(toNumber(line.quantity), 0)),
    unit_price: money(Math.max(toNumber(line.unit_price), 0)),
    discount_amount: money(Math.max(toNumber(line.discount_amount), 0)),
    taxable_value: money(totals.taxable),
    gst_rate: taxMode === "GST" ? money(gstRate) : null,
    cgst_amount: money(cgst),
    sgst_amount: money(sgst),
    igst_amount: "0.00",
    line_total: money(totals.lineTotal),
    hsn_sac_code: "",
    create_purchase_requirement: line.create_requirement,
    requirement_quantity: line.create_requirement
      ? quantity(Math.max(toNumber(line.requirement_quantity), 0))
      : null,
    requirement_note: line.requirement_note.trim(),
  };
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `direct-sale-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type DirectSaleWorkspaceProps = {
  /** POST /admin/sales/direct-sales/ and surface stock/delivery/stock-need envelope (additive UX path). */
  orchestrationCreate?: boolean;
};

export default function DirectSaleWorkspace({ orchestrationCreate = false }: DirectSaleWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMode =
    orchestrationCreate ||
    (searchParams.get("mode") || "").trim().toLowerCase() === "create";
  const customerFilter = (searchParams.get("customer") || "").trim();
  const workspaceQueriesEnabled = !createMode;
  const queryClient = useQueryClient();

  const financeAccountsQuery = useQuery({
    queryKey: financeAccountKeys.collectionList(),
    queryFn: async () => {
      const payload = await listFinanceAccounts({
        is_active: "true",
        for_payment_collection: "true",
      });
      return payload.results;
    },
  });

  const salesQuery = useQuery({
    queryKey: [...directSalesKeys.adminRegister(), { customer: customerFilter || null }],
    queryFn: async () => {
      const payload = await listDirectSales(customerFilter ? { customer: customerFilter } : {});
      return payload.results;
    },
    enabled: workspaceQueriesEnabled,
  });

  const requirementsQuery = useQuery({
    queryKey: inventoryKeys.requirements({ status: "OPEN", source_module: "DIRECT_SALE" }),
    queryFn: async () => {
      const payload = await listAdminInventoryRequirements({
        status: "OPEN",
        source_module: "DIRECT_SALE",
      });
      return payload.results;
    },
    enabled: workspaceQueriesEnabled,
  });

  const rows = useMemo(() => salesQuery.data ?? [], [salesQuery.data]);
  const requirements = useMemo(() => requirementsQuery.data ?? [], [requirementsQuery.data]);
  const guidanceSale = useMemo(() => {
    if (!rows.length) return null;
    const draft = rows.find((r) => r.status === "DRAFT");
    if (draft) return draft;
    const withBlockers = rows.find((r) => (r.blocking_reasons || []).length > 0);
    if (withBlockers) return withBlockers;
    return rows[0];
  }, [rows]);
  const financeAccounts = financeAccountsQuery.data ?? [];

  const salesLoading = workspaceQueriesEnabled && salesQuery.isPending;
  const requirementsLoading = workspaceQueriesEnabled && requirementsQuery.isPending;

  const salesError = salesQuery.error
    ? accountingErrorMessage(salesQuery.error, "Failed to load direct-sale register list.")
    : null;
  const requirementsError = requirementsQuery.error
    ? accountingErrorMessage(requirementsQuery.error, "Failed to load inventory requirements.")
    : null;
  const financeAccountsError = financeAccountsQuery.error
    ? accountingErrorMessage(
        financeAccountsQuery.error,
        "Failed to load finance accounts for payment receipts.",
      )
    : null;

  const [submitting, setSubmitting] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [collectSaleId, setCollectSaleId] = useState<number | null>(null);
  const [cancelSaleTarget, setCancelSaleTarget] = useState<DirectSale | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [eligibilityLoadingSaleId, setEligibilityLoadingSaleId] = useState<number | null>(null);
  const [recheckingRequirementId, setRecheckingRequirementId] = useState<number | null>(null);
  const [customerModeError, setCustomerModeError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([]);
  const [customerPartyResults, setCustomerPartyResults] = useState<PartyListRow[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<FormState>({
    sale_date: todayIso(),
    customer_mode: "EXISTING",
    walkin_create_customer_profile: false,
    customer_id: "",
    customer_name_snapshot: "",
    customer_phone_snapshot: "",
    customer_snapshot_email: "",
    customer_snapshot_billing_address_line1: "",
    customer_snapshot_billing_address_line2: "",
    customer_snapshot_city: "",
    customer_snapshot_district: "",
    customer_snapshot_state: "",
    customer_snapshot_pincode: "",
    customer_gstin: "",
    customer_gst_type: "UNREGISTERED_CONSUMER",
    customer_snapshot_place_of_supply: "",
    tax_mode: "NON_GST",
    tax_calculation_mode: "NON_GST",
    finance_account: "",
    delivery_required: false,
    delivery_snapshot_address_line1: "",
    delivery_snapshot_address_line2: "",
    delivery_snapshot_city: "",
    delivery_snapshot_district: "",
    delivery_snapshot_state: "",
    delivery_snapshot_pincode: "",
    received_total: "0.00",
    notes: "",
    terms: "",
    new_customer_name: "",
    new_customer_phone: "",
    new_customer_email: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([makeLine()]);
  const lineSearchTimers = useRef<Record<string, number>>({});
  const customerSearchTimer = useRef<number | null>(null);
  const createAttemptKey = useRef<string | null>(null);

  useEffect(() => {
    if (!createMode) return;
    resetCreateForm();
  }, [createMode]);

  useEffect(() => {
    if (!createMode) return;
    const raw = (searchParams.get("delivery_required") || "").trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "yes") {
      setForm((current) => ({ ...current, delivery_required: true }));
    }
  }, [createMode, searchParams]);

  useEffect(() => {
    if (createMode) return;
    const raw = searchParams.get("focus_sale");
    const saleId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
    if (!saleId) return;
    const sale = rows.find((row) => row.id === saleId);
    if (!sale) return;
    const isCollectible =
      sale.status === "INVOICED" &&
      String(sale.billing_invoice_status || "").toUpperCase() === "POSTED" &&
      toNumber(sale.balance_total) > 0;
    if (isCollectible) setCollectSaleId(sale.id);
  }, [createMode, rows, searchParams]);

  const stats = useMemo(() => {
    const today = todayIso();
    const draftSales = rows.filter((row) => row.status === "DRAFT").length;
    const todaySales = rows.filter((row) => row.sale_date === today).length;
    const deliveryHold = rows.filter((row) => row.delivery_required && !row.delivered_at).length;
    const pendingRequirements = requirements.filter(
      (row) => row.status === "OPEN" && toNumber(row.shortage_quantity) > 0,
    ).length;
    return { draftSales, todaySales, deliveryHold, pendingRequirements };
  }, [requirements, rows]);

  const computedLines = useMemo(
    () =>
      lines.map((line) => ({
        line,
        totals: calculateLine(line, form.tax_mode),
      })),
    [form.tax_mode, lines]
  );

  const totals = useMemo(() => {
    const rollup = computedLines.reduce(
      (acc, entry) => {
        acc.subtotal += entry.totals.gross;
        acc.discount += entry.totals.discount;
        acc.taxable += entry.totals.taxable;
        acc.tax += entry.totals.tax;
        acc.grand += entry.totals.lineTotal;
        return acc;
      },
      { subtotal: 0, discount: 0, taxable: 0, tax: 0, grand: 0 }
    );
    const received = Math.max(toNumber(form.received_total), 0);
    return {
      ...rollup,
      received,
      balance: rollup.grand - received,
    };
  }, [computedLines, form.received_total]);
  const submitBlockedByFinance = totals.received > 0 && !form.finance_account;
  const submitBlockedByExistingCustomer =
    form.customer_mode === "EXISTING" && (!form.customer_id || Number(form.customer_id) <= 0 || !selectedCustomer?.id);
  const submitBlocked = submitBlockedByFinance || submitBlockedByExistingCustomer;

  const columns: EnterpriseColumnDef<DirectSale>[] = [
    {
      key: "sale_no",
      header: "Sale",
      render: (row) => row.sale_no || `Draft ${row.id}`,
    },
    {
      key: "sale_date",
      header: "Date",
      render: (row) => accountingDate(row.sale_date),
    },
    {
      key: "customer_name_snapshot",
      header: "Customer",
      render: (row) => (
        <CustomerIntelligenceTrigger
          customerId={row.customer ?? null}
          customerName={row.customer_name_snapshot || row.customer_name || "Walk-in"}
          scope="admin"
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => row.status,
    },
    {
      key: "grand_total",
      header: "Amount",
      render: (row) => accountingMoney(row.grand_total),
    },
    {
      key: "delivery_required",
      header: "Delivery",
      render: (row) =>
        row.delivery_display ||
        (row.delivery_required
          ? row.delivered_at
            ? "Delivered"
            : "Hold"
          : "Counter sale"),
    },
    {
      key: "billing_invoice_no",
      header: "Invoice",
      render: (row) =>
        row.billing_invoice_id ? (
          <Link
            href={buildAdminBillingDocumentRoute(row.billing_invoice_id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.billing_invoice_no || `Invoice ${row.billing_invoice_id}`}
          </Link>
        ) : (
          "Draft"
        ),
    },
    {
      key: "balance_total",
      header: "Balance",
      render: (row) => accountingMoney(row.balance_total),
    },
    {
      key: "id",
      header: "Action",
      render: (row) => {
        const nextActions = row.next_actions || [];
        const isFinalize = nextActions.includes("FINALIZE_INVOICE") || nextActions.includes("POST_INVOICE");
        const isCollect = nextActions.includes("COLLECT_DIRECT_SALE_BALANCE");
        const isStockBlocked = nextActions.includes("RESOLVE_STOCK_REQUIREMENT") || nextActions.includes("OPEN_PURCHASE_NEED");
        const isSchedule = nextActions.includes("SCHEDULE_DELIVERY");
        const balance = toNumber(row.balance_total);
        const isDraft = row.status === "DRAFT" || !row.billing_invoice_id;
        const invoiceStatus = String(row.billing_invoice_status || "").toUpperCase();
        const isCollectible = row.status === "INVOICED" && invoiceStatus === "POSTED" && balance > 0;
        const isDelivered = row.status === "DELIVERED";
        const isReturnedOrCancelled = row.status === "CANCELLED";
        const eligibilityButton = (
          <button
            type="button"
            disabled={eligibilityLoadingSaleId === row.id}
            onClick={async () => {
              setEligibilityLoadingSaleId(row.id);
              try {
                const payload = await getAdminDirectSaleReturnEligibility(row.id);
                setNotice(
                  `Return eligibility for ${row.sale_no || `#${row.id}`}: ${payload.allowed_actions.join(", ") || "view only"}.`
                );
              } catch (err) {
                setCreateFormError(accountingErrorMessage(err, "Return eligibility failed to load."));
              } finally {
                setEligibilityLoadingSaleId(null);
              }
            }}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            View Return Eligibility
          </button>
        );
        if (isReturnedOrCancelled) {
          return <div className="flex flex-wrap gap-2">{eligibilityButton}</div>;
        }
        if (isDelivered) {
          return (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`${ROUTES.admin.billingReversals}?direct_sale=${row.id}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Return Product
              </Link>
              <Link
                href={`${ROUTES.admin.billingReversals}?exchange_sale=${row.id}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Exchange Product
              </Link>
              {eligibilityButton}
            </div>
          );
        }
        if (isCollect || isCollectible) {
          return (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`${ROUTES.admin.financeCollect}?workflow=direct-sale&sale_id=${row.id}`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white transition hover:bg-amber-900"
              >
                Collect Direct-Sale Balance
              </Link>
              <button
                type="button"
                onClick={() => setCancelSaleTarget(row)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive bg-background px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                Post-Invoice Cancel/Reversal
              </button>
              {eligibilityButton}
            </div>
          );
        }
        if (isFinalize || isDraft) {
          return (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const finalized = await adminFinalizeDirectSaleInvoice(row.id);
                    setNotice(`Direct sale ${row.sale_no || `#${row.id}`} finalized and posted.`);
                    await Promise.all([
                      salesQuery.refetch(),
                      requirementsQuery.refetch(),
                      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-summary"], exact: false }),
                      queryClient.invalidateQueries({ queryKey: ["deliveries"], exact: false }),
                    ]);
                    if (
                      finalized?.direct_sale?.status === "INVOICED" &&
                      String(finalized?.direct_sale?.billing_invoice_status || "").toUpperCase() === "POSTED" &&
                      toNumber(finalized?.direct_sale?.balance_total) > 0
                    ) {
                      setCollectSaleId(finalized.direct_sale.id);
                    }
                  } catch (err) {
                    if (err instanceof ApiError) {
                      const body = (err.body || {}) as Record<string, unknown>;
                      const detail =
                        typeof body.detail === "string" ? body.detail.trim() : "";
                      const reasons = Array.isArray(body.blocking_reasons)
                        ? (body.blocking_reasons as unknown[]).filter((r) => typeof r === "string")
                        : [];
                      const actions = Array.isArray(body.next_actions)
                        ? (body.next_actions as unknown[]).filter((r) => typeof r === "string")
                        : [];
                      const parts = [
                        detail || "Direct-sale invoice finalization failed.",
                        reasons.length ? `Blocking: ${reasons.join(" | ")}` : null,
                        actions.length ? `Next actions: ${actions.join(", ")}` : null,
                      ].filter(Boolean);
                      setCreateFormError(parts.join("\n"));
                      return;
                    }
                    setCreateFormError(
                      accountingErrorMessage(err, "Direct-sale invoice finalization failed.")
                    );
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-orange-700 px-3 text-xs font-semibold text-white transition hover:bg-orange-800"
              >
                Finalize/Post invoice
              </button>
              <button
                type="button"
                onClick={() => setCancelSaleTarget(row)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive bg-background px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                Cancel Sale
              </button>
              <button
                type="button"
                onClick={() => setCancelSaleTarget(row)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive bg-background px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                Cancel draft
              </button>
            </div>
          );
        }
        if (isStockBlocked) {
          return (
            <Link
              href={ROUTES.admin.inventoryStockNeeds}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white transition hover:bg-amber-800"
            >
              Resolve stock requirement
            </Link>
          );
        }
        if (isSchedule) {
          const deliveryCaseId = row.delivery_request_id ?? null;
          const isManageState =
            row.operational_state === "PAID_READY_FOR_DELIVERY" ||
            row.delivery_status === "READY_FOR_DELIVERY";
          const label = row.delivered_at
            ? "View Delivery"
            : isManageState
              ? "Manage Delivery"
              : "Schedule Delivery";
          const href = deliveryCaseId
            ? `/admin/deliveries/direct-sale-cases/${deliveryCaseId}`
            : `${ROUTES.admin.deliveries}?source_type=DIRECT_SALE&focus_sale=${row.id}`;
          return (
            <Link
              href={href}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
            >
              {label}
            </Link>
          );
        }
        return (
          <Link
            href={`${ROUTES.admin.billingReceipts}?direct_sale=${row.id}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            View receipts
          </Link>
        );
      },
    },
  ];

  function resetCreateForm() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setCustomerPartyResults([]);
    setForm({
      sale_date: todayIso(),
      customer_mode: "EXISTING",
      walkin_create_customer_profile: false,
      customer_id: "",
      customer_name_snapshot: "",
      customer_phone_snapshot: "",
      customer_snapshot_email: "",
      customer_snapshot_billing_address_line1: "",
      customer_snapshot_billing_address_line2: "",
      customer_snapshot_city: "",
      customer_snapshot_district: "",
      customer_snapshot_state: "",
      customer_snapshot_pincode: "",
      customer_gstin: "",
      customer_gst_type: "UNREGISTERED_CONSUMER",
      customer_snapshot_place_of_supply: "",
      tax_mode: "NON_GST",
      tax_calculation_mode: "NON_GST",
      finance_account: "",
      delivery_required: false,
      delivery_snapshot_address_line1: "",
      delivery_snapshot_address_line2: "",
      delivery_snapshot_city: "",
      delivery_snapshot_district: "",
      delivery_snapshot_state: "",
      delivery_snapshot_pincode: "",
      received_total: "0.00",
      notes: "",
      terms: "",
      new_customer_name: "",
      new_customer_phone: "",
      new_customer_email: "",
    });
    setLines([makeLine()]);
    setValidationErrors([]);
    setCustomerModeError(null);
    setCustomerSearchError(null);
    createAttemptKey.current = null;
  }

  function updateLine(lineId: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
    setNotice(null);
  }

  function handleCustomerSearch(value: string) {
    setCustomerQuery(value);
    setCustomerSearchError(null);
    setValidationErrors([]);
    setCustomerModeError(null);
    setCustomerPartyResults([]);
    if (selectedCustomer) {
      setSelectedCustomer(null);
      setForm((current) => ({ ...current, customer_id: "" }));
    }
    if (customerSearchTimer.current) {
      window.clearTimeout(customerSearchTimer.current);
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      setCustomerPartyResults([]);
      setCustomerLoading(false);
      return;
    }
    setCustomerLoading(true);
    customerSearchTimer.current = window.setTimeout(async () => {
      try {
        const customerMatches = await searchCustomers(trimmed);
        setCustomerResults(customerMatches);
        if (!customerMatches.length) {
          const partyPayload = await listCrmParties({ q: trimmed });
          setCustomerPartyResults(partyPayload.results || []);
        } else {
          setCustomerPartyResults([]);
        }
      } catch (err) {
        setCustomerResults([]);
        setCustomerPartyResults([]);
        setCustomerSearchError(accountingErrorMessage(err, "Customer search failed."));
      } finally {
        setCustomerLoading(false);
      }
    }, 250);
  }

  function applySearchPrefill(targetMode: FormState["customer_mode"]) {
    const snapshot = prefillFromSearchQuery(customerQuery);
    setForm((current) => ({
      ...current,
      customer_mode: targetMode,
      customer_id: "",
      walkin_create_customer_profile:
        targetMode === "WALK_IN" ? current.walkin_create_customer_profile : false,
      customer_name_snapshot: current.customer_name_snapshot || snapshot.name,
      customer_phone_snapshot: current.customer_phone_snapshot || snapshot.phone,
      new_customer_name:
        targetMode === "NEW" ? current.new_customer_name || snapshot.name : current.new_customer_name,
      new_customer_phone:
        targetMode === "NEW" ? current.new_customer_phone || snapshot.phone : current.new_customer_phone,
    }));
    setSelectedCustomer(null);
    setCustomerResults([]);
    setCustomerPartyResults([]);
    setCustomerModeError(null);
    setValidationErrors([]);
  }

  function selectCustomer(customer: CustomerRecord) {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.name} ${customer.phone}`.trim());
    setCustomerResults([]);
    setCustomerPartyResults([]);
    setCustomerModeError(null);
    setForm((current) => ({
      ...current,
      customer_mode: "EXISTING",
      customer_id: String(customer.id),
      customer_name_snapshot: customer.name || current.customer_name_snapshot,
      customer_phone_snapshot: customer.phone || current.customer_phone_snapshot,
      customer_snapshot_email: customer.email || current.customer_snapshot_email,
      customer_snapshot_billing_address_line1: customer.address || current.customer_snapshot_billing_address_line1,
      customer_snapshot_city: customer.city || current.customer_snapshot_city,
      customer_gstin: customer.gstin || current.customer_gstin,
      customer_snapshot_place_of_supply: current.customer_snapshot_place_of_supply,
    }));
  }

  function handleProductSearch(lineId: string, value: string) {
    updateLine(lineId, {
      product_search: value,
      product_error: null,
      product_loading: value.trim().length >= 2,
    });
    if (lineSearchTimers.current[lineId]) {
      window.clearTimeout(lineSearchTimers.current[lineId]);
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      updateLine(lineId, { product_results: [], product_loading: false });
      return;
    }
    lineSearchTimers.current[lineId] = window.setTimeout(async () => {
      try {
        const payload = await searchBillingProducts({
          q: trimmed,
          page: 1,
          page_size: 20,
          include_inventory: true,
          direct_sale_enabled: true,
        });
        updateLine(lineId, {
          product_results: payload.results,
          product_loading: false,
          product_error: null,
        });
      } catch (err) {
        updateLine(lineId, {
          product_results: [],
          product_loading: false,
          product_error: accountingErrorMessage(err, "Product search failed."),
        });
      }
    }, 250);
  }

  function selectProduct(lineId: string, product: BillingProductSearchRow) {
    const basePrice = product.base_price || product.sale_price || "0.00";
    updateLine(lineId, {
      product_id: String(product.id),
      inventory_item_id: product.inventory_item_id ? String(product.inventory_item_id) : "",
      description: product.name,
      unit_price: Number(basePrice || 0).toFixed(2),
      product_search: `${product.product_code || product.sku || product.id} - ${product.name}`,
      product_results: [],
      product_loading: false,
      selected_product: product,
      requirement_quantity: "1.000",
    });
  }

  function validateForm(): { errors: string[]; customerMode: string | null } {
    const next: string[] = [];
    let nextCustomerModeError: string | null = null;
    if (form.customer_mode === "EXISTING") {
      if (!form.customer_id || Number(form.customer_id) <= 0 || !selectedCustomer?.id) {
        nextCustomerModeError = "Select a registered customer from search results.";
        next.push("Existing customer mode requires selecting a registered customer.");
      }
    }
    if (form.customer_mode === "NEW") {
      if (!form.new_customer_name.trim()) next.push("New customer full name is required.");
      if (!normalizePhone(form.new_customer_phone)) next.push("New customer phone is required.");
      if (!form.customer_snapshot_billing_address_line1.trim()) {
        next.push("New customer billing address line 1 is required.");
      }
      if (!form.customer_snapshot_city.trim()) next.push("New customer city is required.");
      if (!form.customer_snapshot_state.trim()) next.push("New customer state is required.");
      if (!form.customer_snapshot_pincode.trim()) next.push("New customer pincode is required.");
    }
    if (form.customer_mode === "WALK_IN") {
      if (!form.customer_name_snapshot.trim()) next.push("Walk-in snapshot name is required.");
      if (!normalizePhone(form.customer_phone_snapshot)) next.push("Walk-in snapshot phone is required.");
      if (!form.customer_snapshot_billing_address_line1.trim()) {
        next.push("Walk-in billing address line 1 is required.");
      }
    }
    if (form.tax_mode === "GST" && !form.customer_snapshot_place_of_supply.trim()) {
      next.push("Place of supply is required for GST invoices.");
    }
    if (
      form.tax_mode === "GST" &&
      form.customer_gst_type === "REGISTERED_BUSINESS" &&
      !form.customer_gstin.trim()
    ) {
      next.push("GSTIN is required for registered business GST invoices.");
    }
    if (totals.received > totals.grand) {
      next.push("Received total cannot exceed grand total.");
    }
    if (totals.received > 0 && !form.finance_account) {
      next.push("Finance account is required when received total is greater than zero.");
    }
    if (!lines.length) {
      next.push("At least one product line is required.");
    }
    lines.forEach((line, index) => {
      const lineNo = index + 1;
      const calculated = calculateLine(line, form.tax_mode);
      if (!line.product_id) next.push(`Line ${lineNo}: product is required.`);
      if (toNumber(line.quantity) <= 0) next.push(`Line ${lineNo}: quantity must be greater than zero.`);
      if (toNumber(line.unit_price) < 0) next.push(`Line ${lineNo}: unit price cannot be negative.`);
      if (toNumber(line.discount_amount) < 0) next.push(`Line ${lineNo}: discount cannot be negative.`);
      if (toNumber(line.discount_amount) > calculated.gross) {
        next.push(`Line ${lineNo}: discount cannot exceed line gross amount.`);
      }
      if (line.create_requirement && toNumber(line.requirement_quantity) <= 0) {
        next.push(`Line ${lineNo}: requirement quantity must be greater than zero.`);
      }
    });
    return { errors: next, customerMode: nextCustomerModeError };
  }

  function buildSubmitPayload() {
    const mode = form.customer_mode;
    const commonPayload = {
      sale_date: form.sale_date,
      customer_mode: mode,
      tax_mode: form.tax_mode,
      tax_calculation_mode: form.tax_calculation_mode,
      customer_gst_type: form.customer_gst_type,
      finance_account: form.finance_account ? Number(form.finance_account) : null,
      delivery_required: form.delivery_required,
      customer_name_snapshot: form.customer_name_snapshot.trim(),
      customer_phone_snapshot: normalizePhone(form.customer_phone_snapshot),
      customer_snapshot_email: form.customer_snapshot_email.trim(),
      customer_snapshot_billing_address_line1: form.customer_snapshot_billing_address_line1.trim(),
      customer_snapshot_billing_address_line2: form.customer_snapshot_billing_address_line2.trim(),
      customer_snapshot_city: form.customer_snapshot_city.trim(),
      customer_snapshot_district: form.customer_snapshot_district.trim(),
      customer_snapshot_state: form.customer_snapshot_state.trim(),
      customer_snapshot_pincode: form.customer_snapshot_pincode.trim(),
      customer_gstin: form.customer_gstin.trim() || null,
      customer_snapshot_place_of_supply: form.customer_snapshot_place_of_supply.trim(),
      delivery_snapshot_address_line1: form.delivery_snapshot_address_line1.trim(),
      delivery_snapshot_address_line2: form.delivery_snapshot_address_line2.trim(),
      delivery_snapshot_city: form.delivery_snapshot_city.trim(),
      delivery_snapshot_district: form.delivery_snapshot_district.trim(),
      delivery_snapshot_state: form.delivery_snapshot_state.trim(),
      delivery_snapshot_pincode: form.delivery_snapshot_pincode.trim(),
      subtotal: money(totals.subtotal),
      discount_total: money(totals.discount),
      taxable_total: money(totals.taxable),
      tax_total: money(totals.tax),
      grand_total: money(totals.grand),
      received_total: money(totals.received),
      balance_total: money(totals.balance),
      notes: form.notes.trim(),
      terms: form.terms.trim(),
      lines: lines.map((line) => buildLinePayload(line, form.tax_mode)),
    };

    if (mode === "EXISTING") {
      return {
        ...commonPayload,
        customer: Number(form.customer_id),
      };
    }

    if (mode === "NEW") {
      return {
        ...commonPayload,
        customer: null,
        walkin_create_customer_profile: false,
        new_customer_name: form.new_customer_name.trim(),
        new_customer_phone: normalizePhone(form.new_customer_phone),
        new_customer_email: form.new_customer_email.trim(),
        new_customer_billing_address_line1: form.customer_snapshot_billing_address_line1.trim(),
        new_customer_billing_address_line2: form.customer_snapshot_billing_address_line2.trim(),
        new_customer_city: form.customer_snapshot_city.trim(),
        new_customer_district: form.customer_snapshot_district.trim(),
        new_customer_state: form.customer_snapshot_state.trim(),
        new_customer_pincode: form.customer_snapshot_pincode.trim(),
        new_customer_gstin: form.customer_gstin.trim(),
        new_customer_type: form.customer_gst_type,
      };
    }

    return {
      ...commonPayload,
      customer: null,
      walkin_create_customer_profile: form.walkin_create_customer_profile,
      ...(form.walkin_create_customer_profile
        ? {
            new_customer_name: form.customer_name_snapshot.trim(),
            new_customer_phone: normalizePhone(form.customer_phone_snapshot),
            new_customer_email: form.customer_snapshot_email.trim(),
            new_customer_billing_address_line1: form.customer_snapshot_billing_address_line1.trim(),
            new_customer_billing_address_line2: form.customer_snapshot_billing_address_line2.trim(),
            new_customer_city: form.customer_snapshot_city.trim(),
            new_customer_district: form.customer_snapshot_district.trim(),
            new_customer_state: form.customer_snapshot_state.trim(),
            new_customer_pincode: form.customer_snapshot_pincode.trim(),
            new_customer_gstin: form.customer_gstin.trim(),
            new_customer_type: form.customer_gst_type,
          }
        : {}),
    };
  }

  async function submitCreate() {
    if (submitting) return;
    const { errors: nextErrors, customerMode } = validateForm();
    setValidationErrors(nextErrors);
    setCustomerModeError(customerMode);
    setCreateFormError(null);
    setNotice(null);
    if (nextErrors.length > 0) return;

    setSubmitting(true);
    createAttemptKey.current = createAttemptKey.current || makeIdempotencyKey();
    try {
      const payload = buildSubmitPayload();
      if (orchestrationCreate) {
        const envelope = await createAdminDirectSaleOrchestrated(payload, {
          idempotencyKey: createAttemptKey.current,
        });
        const created = envelope.sale;
        const invNo = created.billing_invoice_no?.trim();
        const reqCount = typeof created.requirement_count === "number" ? created.requirement_count : null;
        const deliveryLabel = created.delivery_display?.trim();
        const desk = envelope.delivery_request;
        const need = envelope.stock_need;
        const parts = [
          `Direct sale ${created.sale_no || `#${created.id}`} created`,
          `Stock status ${envelope.stock_status}`,
          invNo ? `invoice ${invNo}` : null,
          reqCount !== null ? `${reqCount} pending requirement(s)` : null,
          deliveryLabel || null,
          desk ? `Delivery desk case #${String(desk.id)} (${String(desk.status)})` : "No delivery desk case",
          need ? `Stock need ${String(need.need_no)} (${String(need.status)})` : "No open stock need",
          ...(envelope.warnings || []),
        ].filter(Boolean);
        setNotice(parts.join(". ") + ".");
      } else {
        const created = await createDirectSale(payload, {
          idempotencyKey: createAttemptKey.current,
        });
        const invNo = created.billing_invoice_no?.trim();
        const reqCount = typeof created.requirement_count === "number" ? created.requirement_count : null;
        const deliveryLabel = created.delivery_display?.trim();
        const parts = [
          `Direct sale ${created.sale_no || `#${created.id}`} created`,
          invNo ? `invoice ${invNo}` : null,
          reqCount !== null ? `${reqCount} pending requirement(s)` : null,
          deliveryLabel || null,
        ].filter(Boolean);
        setNotice(parts.join(". ") + ".");
      }
      await invalidateAfterDirectSaleCreate(queryClient);
      resetCreateForm();
      router.push(pathname);
    } catch (err) {
      if (err instanceof ApiError) {
        const parsedFromFields = Object.entries(err.fieldErrors || {}).flatMap(([field, values]) =>
          (values || []).map((value) => (field === "non_field_errors" ? value : `${field}: ${value}`))
        );
        const parsed = parsedFromFields.length ? parsedFromFields : flattenApiErrors(err.body);
        if (parsed.length) {
          setValidationErrors(parsed);
          const customerError = parsed.find((entry) =>
            /(customer|new_customer|customer_name_snapshot|customer_phone_snapshot)/i.test(entry)
          );
          if (customerError) setCustomerModeError(customerError);
        }
        if (process.env.NODE_ENV !== "production") {
          console.error("[DirectSale:create] request failed", {
            endpoint: orchestrationCreate ? "/api/v1/admin/sales/direct-sales/" : "/api/v1/billing/direct-sales/",
            status: err.status,
            responsePreview: err.rawBodyPreview || "",
            fieldErrors: err.fieldErrors || {},
          });
        }
        if (err.status === 400) {
          const numberingIssue = parsed.find((entry) => /numbering|document numbering|DIRECT_SALE_INVOICE/i.test(entry));
          if (numberingIssue) {
            setCreateFormError(
              "Direct sale invoice numbering is not configured. Complete Admin Settings -> Document Numbering."
            );
            return;
          }
          setCreateFormError("Direct sale could not be created. Please fix the highlighted fields.");
          return;
        }
        if (err.status === 401 || err.status === 403) {
          setCreateFormError("Your session or role does not allow this action.");
          return;
        }
        if (err.status === 404) {
          setCreateFormError("Direct sale API endpoint was not found. Check frontend API path.");
          return;
        }
        if (err.status >= 500) {
          setCreateFormError("Server error while creating direct sale. Check backend logs.");
          return;
        }
      }
      if (err instanceof Error && /failed to fetch|network|timeout|abort/i.test(err.message)) {
        setCreateFormError("Network request failed. Backend server or connection is unavailable.");
      } else {
        setCreateFormError(accountingErrorMessage(err, "Failed to create direct sale."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (createMode) {
    return (
      <PortalPage
        eyebrow="Admin Billing"
        title="Create Direct Sale Invoice"
        subtitle="Full-page direct-sale invoice workspace with customer snapshot controls, GST/non-GST handling, product search, requirement flags, and safe payment summary."
        helperNote="Customer snapshot is saved on the invoice so future profile edits do not rewrite old billing documents."
        helperTone="info"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Billing", href: ROUTES.admin.billing },
          { label: "Direct Sale", href: pathname },
          { label: "Create Invoice" },
        ]}
        actions={[
          { label: "Back to Direct Sale Workspace", href: pathname, variant: "secondary" },
          { label: "Retail Invoices", href: buildAdminBillingInvoicesRoute({ source_type: "DIRECT_SALE" }), variant: "secondary" },
        ]}
        statusBadge={{ label: "Retail Billing", tone: "info" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={pathname}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Back to Direct Sale Workspace
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void submitCreate()}
              disabled={submitting || submitBlocked}
              className="motion-safe:transition-colors inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={() => void submitCreate()}
              disabled={submitting || submitBlocked}
              className="motion-safe:transition-opacity inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground duration-150 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Direct Sale"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Customer</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Registered customer links this bill to profile history. Walk-in customer stores only bill snapshot.
                    </p>
                    <div className="mt-3 inline-flex rounded-lg border border-border bg-background p-1">
                      {[
                        ["EXISTING", "Existing Customer"],
                        ["NEW", "New Customer"],
                        ["WALK_IN", "Walk-in Snapshot"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => applySearchPrefill(value as FormState["customer_mode"])}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                            form.customer_mode === value
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {customerModeError ? (
                      <p className="mt-2 text-xs font-medium text-destructive">{customerModeError}</p>
                    ) : null}
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {form.customer_mode === "EXISTING" ? (
                      <div className="relative lg:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="direct-sale-customer-search">
                          Search Existing Customer
                        </label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <input
                            id="direct-sale-customer-search"
                            value={customerQuery}
                            onChange={(event) => handleCustomerSearch(event.target.value)}
                            disabled={submitting}
                            className={`${FIELD_CLASS} pl-9`}
                            placeholder="Name, phone, customer code, GSTIN"
                          />
                        </div>
                        {customerQuery.trim().length >= 2 && !selectedCustomer ? (
                          <div className="absolute z-[85] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-[var(--surface-card-elevated)] p-1 shadow-2xl">
                            {customerLoading ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">Searching customers...</div>
                            ) : customerResults.length ? (
                              customerResults.map((customer) => (
                                <button
                                  key={customer.id}
                                  type="button"
                                  onClick={() => selectCustomer(customer)}
                                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                >
                                  <span className="block font-medium">{customer.name}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {customer.phone}
                                    {customer.customer_code ? ` · ${customer.customer_code}` : ` · #${customer.id}`}
                                  </span>
                                </button>
                              ))
                            ) : customerPartyResults.length ? (
                              <div className="space-y-2 px-3 py-2 text-sm">
                                <p className="text-muted-foreground">
                                  No registered customer matched. CRM party records were found.
                                </p>
                                {customerPartyResults.slice(0, 6).map((party) => (
                                  <div key={party.id} className="rounded-md border border-border bg-background p-2">
                                    <p className="text-sm font-medium text-foreground">{party.display_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {party.primary_phone || "No phone"} · {party.party_no}
                                    </p>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground"
                                  title="Backend endpoint for customer creation from CRM party is not available."
                                >
                                  Create customer profile from party
                                </button>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => applySearchPrefill("NEW")}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Create New Customer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applySearchPrefill("WALK_IN")}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Use Walk-in Snapshot
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2 px-3 py-2 text-sm">
                                <p className="text-muted-foreground">No registered customer found.</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => applySearchPrefill("NEW")}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Create New Customer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applySearchPrefill("WALK_IN")}
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Use Walk-in Snapshot
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                        {customerSearchError ? (
                          <p className="mt-2 text-xs text-destructive">{customerSearchError}</p>
                        ) : null}
                      </div>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
                        {form.customer_mode === "NEW" ? (
                          <>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">New Customer Full Name</span>
                              <input
                                value={form.new_customer_name}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, new_customer_name: event.target.value }))
                                }
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">New Customer Phone</span>
                              <input
                                value={form.new_customer_phone}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    new_customer_phone: normalizePhone(event.target.value),
                                  }))
                                }
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                          </>
                        ) : null}
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">Snapshot Name</span>
                          <input
                            value={form.customer_name_snapshot}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, customer_name_snapshot: event.target.value }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">Phone</span>
                          <input
                            value={form.customer_phone_snapshot}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                customer_phone_snapshot: normalizePhone(event.target.value),
                              }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm sm:col-span-2">
                          <span className="font-medium text-foreground">Email</span>
                          <input
                            value={form.customer_snapshot_email}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, customer_snapshot_email: event.target.value }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm sm:col-span-2">
                          <span className="font-medium text-foreground">Billing Address Line 1</span>
                          <input
                            value={form.customer_snapshot_billing_address_line1}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, customer_snapshot_billing_address_line1: event.target.value }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm sm:col-span-2">
                          <span className="font-medium text-foreground">Billing Address Line 2</span>
                          <input
                            value={form.customer_snapshot_billing_address_line2}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, customer_snapshot_billing_address_line2: event.target.value }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">City</span>
                          <input value={form.customer_snapshot_city} onChange={(event) => setForm((current) => ({ ...current, customer_snapshot_city: event.target.value }))} disabled={submitting} className={FIELD_CLASS} />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">District</span>
                          <input value={form.customer_snapshot_district} onChange={(event) => setForm((current) => ({ ...current, customer_snapshot_district: event.target.value }))} disabled={submitting} className={FIELD_CLASS} />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">State</span>
                          <input value={form.customer_snapshot_state} onChange={(event) => setForm((current) => ({ ...current, customer_snapshot_state: event.target.value }))} disabled={submitting} className={FIELD_CLASS} />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">Pincode</span>
                          <input value={form.customer_snapshot_pincode} onChange={(event) => setForm((current) => ({ ...current, customer_snapshot_pincode: event.target.value }))} disabled={submitting} className={FIELD_CLASS} />
                        </label>
                        {form.customer_mode === "WALK_IN" ? (
                          <label className="sm:col-span-2 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={form.walkin_create_customer_profile}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  walkin_create_customer_profile: event.target.checked,
                                }))
                              }
                            />
                            Create customer profile from walk-in snapshot
                          </label>
                        ) : null}
                      </div>
                    </div>
                    {selectedCustomer ? (
                      <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">{selectedCustomer.name}</p>
                        <p>Customer ID: #{selectedCustomer.id}</p>
                        <p>Phone: {selectedCustomer.phone || "—"}</p>
                        <p>Customer Code: {selectedCustomer.customer_code || "—"}</p>
                        <p>
                          Address:{" "}
                          {selectedCustomer.address || selectedCustomer.city
                            ? `${selectedCustomer.address || ""}${selectedCustomer.city ? `, ${selectedCustomer.city}` : ""}`
                            : "No address on customer profile."}
                        </p>
                        <p>GSTIN: {selectedCustomer.gstin || form.customer_gstin || "—"}</p>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomer(null);
                              setForm((current) => ({ ...current, customer_id: "" }));
                              setCustomerQuery("");
                              setCustomerResults([]);
                              setCustomerPartyResults([]);
                            }}
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Change customer
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Bill Details</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Sale Date</span>
                        <input
                          type="date"
                          value={form.sale_date}
                          onChange={(event) => setForm((current) => ({ ...current, sale_date: event.target.value }))}
                          disabled={submitting}
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Tax Mode</span>
                        <select
                          value={form.tax_mode}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, tax_mode: event.target.value as "GST" | "NON_GST" }))
                          }
                          disabled={submitting}
                          className={FIELD_CLASS}
                        >
                          <option value="NON_GST">Non-GST</option>
                          <option value="GST">GST</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Tax Calculation</span>
                        <select
                          value={form.tax_calculation_mode}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              tax_calculation_mode: event.target.value as FormState["tax_calculation_mode"],
                            }))
                          }
                          disabled={submitting}
                          className={FIELD_CLASS}
                        >
                          <option value="NON_GST">Non-GST</option>
                          <option value="GST_INCLUSIVE">GST Inclusive</option>
                          <option value="GST_EXCLUSIVE">GST Exclusive</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Customer GST Type</span>
                        <select
                          value={form.customer_gst_type}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              customer_gst_type: event.target.value as FormState["customer_gst_type"],
                            }))
                          }
                          disabled={submitting}
                          className={FIELD_CLASS}
                        >
                          <option value="UNREGISTERED_CONSUMER">Unregistered Consumer</option>
                          <option value="REGISTERED_BUSINESS">Registered Business</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Finance Account</span>
                        <select
                          value={form.finance_account}
                          onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))}
                          disabled={submitting || financeAccountsQuery.isPending}
                          className={FIELD_CLASS}
                          aria-busy={financeAccountsQuery.isPending}
                        >
                          <option value="">No immediate receipt</option>
                          {financeAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        {financeAccountsError ? (
                          <div className="flex items-center gap-2 text-xs text-destructive">
                            <span>{financeAccountsError}</span>
                            <button
                              type="button"
                              onClick={() => void financeAccountsQuery.refetch()}
                              className="rounded border border-border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted"
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.delivery_required}
                          onChange={(event) => setForm((current) => ({ ...current, delivery_required: event.target.checked }))}
                          disabled={submitting}
                        />
                        Delivery required
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">GSTIN</span>
                        <input
                          value={form.customer_gstin}
                          onChange={(event) => setForm((current) => ({ ...current, customer_gstin: event.target.value.toUpperCase() }))}
                          disabled={submitting || form.tax_mode !== "GST"}
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Place of Supply / State</span>
                        <input
                          value={form.customer_snapshot_place_of_supply}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, customer_snapshot_place_of_supply: event.target.value }))
                          }
                          disabled={submitting || form.tax_mode !== "GST"}
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Terms & Conditions</span>
                        <input
                          value={form.terms}
                          onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))}
                          disabled={submitting}
                          className={FIELD_CLASS}
                        />
                      </label>
                    </div>
                    <label className="mt-4 grid gap-2 text-sm">
                      <span className="font-medium text-foreground">Notes</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        disabled={submitting}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Discount applies per bill line only. Product base price remains canonical in product master.
                    </p>
                    {form.tax_calculation_mode !== "NON_GST" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        GST inclusive/exclusive display is enabled; backend currently preserves existing GST amount fields and validations.
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Product Lines</h3>
                      <button
                        type="button"
                        onClick={() => setLines((current) => [...current, makeLine()])}
                        disabled={submitting}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add Line
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      {computedLines.map(({ line, totals: lineTotals }, index) => (
                        <div key={line.id} className="rounded-lg border border-border bg-background p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-foreground">Line {index + 1}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setLines((current) =>
                                  current.length === 1 ? current : current.filter((entry) => entry.id !== line.id)
                                )
                              }
                              disabled={submitting || lines.length === 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Remove line ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="mt-3 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                            <div className="relative">
                              <label className="mb-2 block text-sm font-medium text-foreground" htmlFor={`product-search-${line.id}`}>
                                Search Product
                              </label>
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <input
                                  id={`product-search-${line.id}`}
                                  value={line.product_search}
                                  onChange={(event) => handleProductSearch(line.id, event.target.value)}
                                  disabled={submitting}
                                  className={`${FIELD_CLASS} pl-9`}
                                  placeholder="Name, code, SKU, category"
                                />
                              </div>
                              {line.product_search.trim().length >= 2 && !line.selected_product ? (
                                <div className="absolute z-[85] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-[var(--surface-card-elevated)] p-1 shadow-2xl">
                                  {line.product_loading ? (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">Searching products...</div>
                                  ) : line.product_error ? (
                                    <div className="px-3 py-2 text-sm text-destructive">{line.product_error}</div>
                                  ) : line.product_results.length ? (
                                    line.product_results.map((product) => (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onClick={() => selectProduct(line.id, product)}
                                        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        <span className="block font-medium">
                                          {product.product_code || product.sku || `P-${product.id}`} - {product.name}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                          Base {accountingMoney(product.base_price)} | Stock {product.current_stock_qty || product.inventory_status.available}
                                        </span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">No products found. Try product name, code, or SKU.</div>
                                  )}
                                </div>
                              ) : null}
                              {line.selected_product ? (
                                <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                  {line.selected_product.product_code || line.selected_product.sku || `P-${line.selected_product.id}`} | Base {accountingMoney(line.selected_product.base_price)} | Stock {line.selected_product.current_stock_qty || line.selected_product.inventory_status.available} | Inventory {line.selected_product.inventory_ready ? "ready" : "not ready"} {!line.selected_product.inventory_status.is_in_stock ? " | OUT OF STOCK" : ""}
                                </div>
                              ) : null}
                            </div>

                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Description</span>
                              <input
                                value={line.description}
                                onChange={(event) => updateLine(line.id, { description: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Quantity</span>
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={line.quantity}
                                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Unit Price</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_price}
                                onChange={(event) => updateLine(line.id, { unit_price: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Line Discount</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.discount_amount}
                                onChange={(event) => updateLine(line.id, { discount_amount: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">GST Rate</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.gst_rate}
                                onChange={(event) => updateLine(line.id, { gst_rate: event.target.value })}
                                disabled={submitting || form.tax_mode !== "GST"}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                              <span>Gross {accountingMoney(lineTotals.gross)}</span>
                              <span>Taxable {accountingMoney(lineTotals.taxable)}</span>
                              <span>Tax {accountingMoney(lineTotals.tax)}</span>
                              <span className="font-semibold text-foreground">Total {accountingMoney(lineTotals.lineTotal)}</span>
                            </div>
                          </div>

                          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                            <label className="flex items-center gap-3 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={line.create_requirement}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  updateLine(line.id, {
                                    create_requirement: checked,
                                    ...(checked &&
                                    (!line.requirement_quantity.trim() ||
                                      toNumber(line.requirement_quantity) <= 0)
                                      ? { requirement_quantity: line.quantity }
                                      : {}),
                                  });
                                }}
                                disabled={submitting}
                              />
                              Create purchase/stock requirement
                            </label>
                            {line.create_requirement ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                                <label className="grid gap-2 text-sm">
                                  <span className="font-medium text-foreground">Required Qty</span>
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={line.requirement_quantity}
                                    onChange={(event) => updateLine(line.id, { requirement_quantity: event.target.value })}
                                    disabled={submitting}
                                    className={FIELD_CLASS}
                                  />
                                </label>
                                <label className="grid gap-2 text-sm">
                                  <span className="font-medium text-foreground">Requirement Note</span>
                                  <input
                                    value={line.requirement_note}
                                    onChange={(event) => updateLine(line.id, { requirement_note: event.target.value })}
                                    disabled={submitting}
                                    className={FIELD_CLASS}
                                  />
                                </label>
                              </div>
                            ) : null}
                            <p className="mt-2 text-xs text-muted-foreground">
                              Requirement does not create stock movement. It only alerts purchasing/inventory.
                            </p>
                            {line.selected_product && line.selected_product.stock_tracking_enabled === false ? (
                              <p className="mt-2 text-xs text-amber-800">
                                Stock tracking is off for this SKU. Enable tracking on the inventory item or check
                                &quot;Create purchase/stock requirement&quot; above to flag purchasing manually.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
          </div>

          <aside className="space-y-4">
            <section className="sticky top-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Totals / Payment</h3>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><strong>{accountingMoney(totals.subtotal)}</strong></div>
                <div className="flex justify-between"><span>Discount</span><strong>{accountingMoney(totals.discount)}</strong></div>
                <div className="flex justify-between"><span>Taxable</span><strong>{accountingMoney(totals.taxable)}</strong></div>
                <div className="flex justify-between"><span>Tax</span><strong>{accountingMoney(totals.tax)}</strong></div>
                <div className="flex justify-between border-t border-border pt-2 text-base"><span>Grand Total</span><strong>{accountingMoney(totals.grand)}</strong></div>
              </div>
              <label className="mt-4 grid gap-2 text-sm">
                <span className="font-medium text-foreground">Received Total</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.received_total}
                  onChange={(event) => setForm((current) => ({ ...current, received_total: event.target.value }))}
                  disabled={submitting}
                  className={FIELD_CLASS}
                />
              </label>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, received_total: money(totals.grand) }))}
                disabled={submitting}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark as fully paid
              </button>
              <div className="mt-3 flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span>Balance</span>
                <strong>{accountingMoney(totals.balance)}</strong>
              </div>
              {validationErrors.length ? (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {validationErrors.map((entry) => (
                    <p key={entry}>{entry}</p>
                  ))}
                </div>
              ) : null}
              {createFormError ? (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {createFormError}
                </div>
              ) : null}
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                disabled={submitting || submitBlocked}
                  className="motion-safe:transition-colors inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                disabled={submitting || submitBlocked}
                  className="motion-safe:transition-opacity inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground duration-150 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create Direct Sale"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Admin Billing"
      title="Direct Sale Workspace"
      subtitle="Create retail bills from the full product catalog while keeping product base price, EMI contracts, billing discounts, and inventory requirements separate."
      helperNote="Product base price stays unchanged. Discount applies only to this direct-sale bill."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Direct Sale" },
      ]}
      actions={[
        {
          label: "Retail Invoices",
          href: buildAdminBillingInvoicesRoute({ source_type: "DIRECT_SALE" }),
          variant: "secondary",
        },
        {
          label: "Document Register",
          href: ROUTES.admin.billingRegister,
          variant: "secondary",
        },
        {
          label: "Reversal Center",
          href: ROUTES.admin.billingReversals,
          variant: "secondary",
        },
      ]}
      stats={
        salesLoading
          ? []
          : [
              { label: "Draft Sales", value: stats.draftSales, tone: "info" },
              { label: "Today Sales", value: stats.todaySales, tone: "success" },
              {
                label: "Delivery Hold",
                value: stats.deliveryHold,
                tone: stats.deliveryHold ? "warning" : "default",
              },
              {
                label: "Pending Stock Requirements",
                value: stats.pendingRequirements,
                tone: stats.pendingRequirements ? "warning" : "success",
              },
            ]
      }
      statusBadge={{ label: "Retail Billing", tone: "info" }}
    >
      <WorkspaceDirectory
        title="Billing route map"
        description="Move between retail sales, invoices, receipts, documents, and billing books without mixing direct-sale and EMI collection workflows."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      <OperationalNextStepsPanel
        title="Direct Sale Workflow Guidance"
        context="Draft sale -> finalize/post invoice -> collect receivable -> resolve stock -> release delivery."
        state={guidanceSale?.operational_state || "NO_DIRECT_SALE"}
        blockers={guidanceSale?.blocking_reasons || []}
        nextActions={guidanceSale?.next_actions || []}
        relatedLinks={[
          {
            label: "Collections",
            href: guidanceSale?.id
              ? `${ROUTES.admin.financeCollect}?workflow=direct-sale&sale_id=${guidanceSale.id}`
              : `${ROUTES.admin.financeCollect}?workflow=direct-sale`,
          },
          { label: "Stock needs", href: ROUTES.admin.inventoryStockNeeds },
          { label: "Deliveries", href: ROUTES.admin.deliveries },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Direct Sale Billing Desk</h2>
          <p className="text-sm text-muted-foreground">
            Build cash/upfront bills with line discounts and purchase requirements from real backend endpoints.
          </p>
        </div>
        <Link
          href={ROUTES.admin.billingDirectSaleCreate}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Direct Sale Invoice
        </Link>
      </div>

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="motion-safe:transition-opacity rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 duration-150"
        >
          {notice}
        </div>
      ) : null}

      {salesLoading ? (
        <DashboardGridSkeleton cards={4} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
      ) : null}

      <WorkspaceSection
        title="Recent Direct Sales"
        description="Recent direct-sale bills, linked billing invoices, delivery hold state, customer snapshot, and amount."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={salesLoading}
          error={salesError}
          onRetry={() => void salesQuery.refetch()}
          emptyTitle="No direct-sale bills found"
          emptyDescription="Create a bill to start the retail direct-sale register."
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Pending Stock Requirements"
        description="Open direct-sale inventory requirement alerts created from out-of-stock bill lines."
      >
        <EnterpriseDataTable
          data={requirements}
          columns={[
            { key: "product_name", header: "Product" },
            { key: "required_quantity", header: "Required" },
            { key: "available_quantity", header: "Available" },
            { key: "shortage_quantity", header: "Shortage" },
            { key: "priority", header: "Priority" },
            { key: "status", header: "Status" },
            {
              key: "id",
              header: "Recheck",
              render: (row) => (
                <button
                  type="button"
                  disabled={recheckingRequirementId === row.id}
                  onClick={async () => {
                    setRecheckingRequirementId(row.id);
                    setCreateFormError(null);
                    try {
                      const payload = (await recheckStockNeed(row.id)) as {
                        recheck?: { outcome?: string; message?: string };
                        message?: string;
                      };
                      const msg = (payload?.message ?? payload?.recheck?.message ?? "").trim();
                      const oc = payload?.recheck?.outcome ?? "";
                      setNotice(
                        msg ||
                          (oc ? `Stock need recheck: ${oc}` : "Stock availability rechecked."),
                      );
                      await Promise.all([
                        requirementsQuery.refetch(),
                        salesQuery.refetch(),
                        queryClient.invalidateQueries({ queryKey: ["inventory", "stock-summary"], exact: false }),
                        queryClient.invalidateQueries({ queryKey: ["deliveries"], exact: false }),
                      ]);
                    } catch (err) {
                      setCreateFormError(
                        accountingErrorMessage(err, "Stock need recheck failed."),
                      );
                    } finally {
                      setRecheckingRequirementId(null);
                    }
                  }}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {recheckingRequirementId === row.id ? "…" : "Recheck stock"}
                </button>
              ),
            },
            { key: "created_at", header: "Created", render: (row) => accountingDate(row.created_at) },
          ]}
          loading={requirementsLoading}
          error={requirementsError}
          onRetry={() => void requirementsQuery.refetch()}
          emptyTitle="No pending inventory requirements"
          emptyDescription="Out-of-stock direct-sale lines will create requirement alerts here."
        />
      </WorkspaceSection>

      <DirectSaleCollectDrawer
        open={collectSaleId !== null}
        saleId={collectSaleId}
        onClose={() => setCollectSaleId(null)}
        onCollected={async () => {
          await salesQuery.refetch();
        }}
      />

      <AdminCancellationDialog
        open={cancelSaleTarget !== null}
        sourceType="DIRECT_SALE"
        sourceReference={cancelSaleTarget?.sale_no || `SALE-${cancelSaleTarget?.id || ""}`}
        currentStatus={cancelSaleTarget?.status || ""}
        affected={{
          invoices: true,
          receipts: Number(cancelSaleTarget?.received_total || 0) > 0,
          delivery: Boolean(cancelSaleTarget?.delivery_required),
          stock_requirements: true,
        }}
        financialImpactSummary={`Grand total ${accountingMoney(cancelSaleTarget?.grand_total || 0)} · Received ${accountingMoney(cancelSaleTarget?.received_total || 0)} · Balance ${accountingMoney(cancelSaleTarget?.balance_total || 0)}`}
        blockedReason={
          cancelSaleTarget?.status === "DELIVERED"
            ? "Delivered direct sales require return/reversal workflow before cancellation."
            : null
        }
        requiresReceiptReversal={Number(cancelSaleTarget?.received_total || 0) > 0}
        onClose={() => {
          if (!cancelSubmitting) setCancelSaleTarget(null);
        }}
        submitting={cancelSubmitting}
        confirmLabel="Confirm sale cancellation"
        onConfirm={async (payload) => {
          if (!cancelSaleTarget) return;
          setCancelSubmitting(true);
          try {
            await cancelDirectSale(cancelSaleTarget.id, {
              ...payload,
              reversal_policy: "REVERSE_RECEIPTS",
            });
            setNotice(`Direct sale ${cancelSaleTarget.sale_no || `#${cancelSaleTarget.id}`} cancelled with audit trail.`);
            setCancelSaleTarget(null);
            await salesQuery.refetch();
            await requirementsQuery.refetch();
          } catch (err) {
            throw new Error(accountingErrorMessage(err, "Direct sale cancellation failed."));
          } finally {
            setCancelSubmitting(false);
          }
        }}
      />
    </PortalPage>
  );
}
