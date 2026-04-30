"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Download, RefreshCw, Search, ShieldCheck, UserPlus, Users } from "lucide-react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import {
  DataTableShell,
  DetailPanel,
  KpiCard,
  QuickActionGrid,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import ActionButton from "@/components/ui/ActionButton";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import {
  importCustomers,
  previewCustomerImport,
  type CustomerImportCommitResponse,
  type CustomerImportPreviewResponse,
} from "@/domains/customers/api";
import OtpDeliveryReadinessCard from "@/domains/customers/components/OtpDeliveryReadinessCard";
import { buildForgotPasswordHref } from "@/lib/auth/password-reset";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";
import { ROUTES } from "@/lib/routes";

type CustomerStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
type KycStatus =
  | "NOT_PROVIDED"
  | "PENDING"
  | "APPROVED"
  | "VERIFIED"
  | "REJECTED"
  | "UNKNOWN";

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  kyc_status: KycStatus;
  status: CustomerStatus;
  user_id?: number | null;
  created_at?: string | null;
  active_subscription_count?: number;
  total_subscription_value?: string;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (value === null) return null;
  return undefined;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customer register.";
}

function toActionMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const raw = error.message.trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }

      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function normalizeCustomerStatus(raw: Record<string, unknown>): CustomerStatus {
  const status = String(raw.status ?? raw.customer_status ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "INACTIVE") return "INACTIVE";
  return "UNKNOWN";
}

function normalizeKycStatus(raw: Record<string, unknown>): KycStatus {
  const status = String(raw.kyc_status ?? raw.kyc ?? "").toUpperCase();
  if (status === "NOT_PROVIDED") return "NOT_PROVIDED";
  if (status === "PENDING") return "PENDING";
  if (status === "APPROVED") return "APPROVED";
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "REJECTED") return "REJECTED";
  return "UNKNOWN";
}

function normalizeCustomerRow(raw: Record<string, unknown>): CustomerRow {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed customer",
    phone: toStringValue(raw.phone) || "—",
    email: toNullableString(raw.email),
    address: toNullableString(raw.address),
    city: toNullableString(raw.city),
    kyc_status: normalizeKycStatus(raw),
    status: normalizeCustomerStatus(raw),
    user_id: toNullableNumber(raw.user_id) ?? toNullableNumber(raw.user),
    created_at: toNullableString(raw.created_at),
    active_subscription_count:
      toOptionalNumber(raw.active_subscription_count) ??
      toOptionalNumber(raw.subscription_count) ??
      0,
    total_subscription_value: toMoneyString(
      raw.total_subscription_value ?? raw.total_contract_value
    ),
  };
}

export default function AdminCustomersPage() {
  const { openWorkflow } = useWorkflowLauncher();
  const customerImportFileRef = useRef<HTMLInputElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();

  const initialQuery = (searchParams.get("q") || "").trim();
  const initialKyc = ((searchParams.get("kyc_status") || "").trim().toUpperCase() ||
    "") as "" | KycStatus;
  const initialStatus = ((searchParams.get("status") || "").trim().toUpperCase() ||
    "") as "" | CustomerStatus;

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [kycInput, setKycInput] = useState<"" | KycStatus>(initialKyc);
  const [statusInput, setStatusInput] = useState<"" | CustomerStatus>(initialStatus);

  const [query, setQuery] = useState(initialQuery);
  const [kycFilter, setKycFilter] = useState<"" | KycStatus>(initialKyc);
  const [statusFilter, setStatusFilter] = useState<"" | CustomerStatus>(initialStatus);

  const [customerImportFile, setCustomerImportFile] = useState<File | null>(null);
  const [customerImportPreviewState, setCustomerImportPreviewState] =
    useState<CustomerImportPreviewResponse | null>(null);
  const [customerImportCommitState, setCustomerImportCommitState] =
    useState<CustomerImportCommitResponse | null>(null);
  const [customerImportPreviewing, setCustomerImportPreviewing] = useState(false);
  const [customerImportSubmitting, setCustomerImportSubmitting] = useState(false);
  const [customerImportMessage, setCustomerImportMessage] = useState<string | null>(
    null
  );
  const [customerImportError, setCustomerImportError] = useState<string | null>(
    null
  );

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (kycFilter) params.set("kyc_status", kycFilter);
        if (statusFilter) params.set("status", statusFilter);

        const payload = await apiFetch<unknown>(
          `/admin/customers/${params.toString() ? `?${params.toString()}` : ""}`
        );
        setRows(toArray<Record<string, unknown>>(payload).map(normalizeCustomerRow));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") setRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [kycFilter, query, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamKey);
    const nextQuery = (params.get("q") || "").trim();
    const nextKyc = ((params.get("kyc_status") || "").trim().toUpperCase() ||
      "") as "" | KycStatus;
    const nextStatus = ((params.get("status") || "").trim().toUpperCase() ||
      "") as "" | CustomerStatus;

    setQueryInput(nextQuery);
    setKycInput(nextKyc);
    setStatusInput(nextStatus);
    setQuery(nextQuery);
    setKycFilter(nextKyc);
    setStatusFilter(nextStatus);
  }, [searchParamKey]);

  function replaceFilters(params: URLSearchParams) {
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = queryInput.trim();
    if (nextQuery) params.set("q", nextQuery);
    if (kycInput) params.set("kyc_status", kycInput);
    if (statusInput) params.set("status", statusInput);
    replaceFilters(params);
  }

  function handleResetFilters() {
    setQueryInput("");
    setKycInput("");
    setStatusInput("");
    replaceFilters(new URLSearchParams());
  }

  function resetCustomerImportState() {
    setCustomerImportPreviewState(null);
    setCustomerImportCommitState(null);
    setCustomerImportMessage(null);
    setCustomerImportError(null);
  }

  function clearCustomerImportSelection() {
    setCustomerImportFile(null);
    resetCustomerImportState();
    if (customerImportFileRef.current) {
      customerImportFileRef.current.value = "";
    }
  }

  function handleCustomerImportFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    setCustomerImportFile(nextFile);
    resetCustomerImportState();
  }

  async function handleCustomerImportPreview() {
    if (!customerImportFile) {
      setCustomerImportError("Select a customer CSV file first.");
      setCustomerImportMessage(null);
      return;
    }

    setCustomerImportPreviewing(true);
    setCustomerImportMessage(null);
    setCustomerImportError(null);
    setCustomerImportCommitState(null);

    try {
      const preview = await previewCustomerImport(customerImportFile);
      setCustomerImportPreviewState(preview);
      if (preview.invalid_count > 0) {
        setCustomerImportMessage(
          "Preview completed. Fix invalid rows before confirm import is enabled."
        );
      } else {
        setCustomerImportMessage(
          `Preview ready. ${preview.valid_count} row${preview.valid_count === 1 ? "" : "s"} can be imported safely.`
        );
      }
    } catch (err) {
      setCustomerImportPreviewState(null);
      setCustomerImportError(
        toActionMessage(err, "Unable to preview customer CSV.")
      );
    } finally {
      setCustomerImportPreviewing(false);
    }
  }

  async function handleCustomerImportConfirm() {
    if (!customerImportFile) {
      setCustomerImportError("Select a customer CSV file first.");
      return;
    }

    if (!customerImportPreviewState) {
      setCustomerImportError(
        "Run preview first so the current file is validated before import."
      );
      return;
    }

    if (customerImportPreviewState.invalid_count > 0) {
      setCustomerImportError(
        "Fix invalid rows in preview before confirming customer import."
      );
      return;
    }

    setCustomerImportSubmitting(true);
    setCustomerImportMessage(null);
    setCustomerImportError(null);

    try {
      const result = await importCustomers(customerImportFile);
      setCustomerImportCommitState(result);
      setCustomerImportPreviewState(null);
      setCustomerImportMessage(
        `Customer import completed. Created ${result.created} row${
          result.created === 1 ? "" : "s"
        } and skipped ${result.skipped}.`
      );
      setCustomerImportFile(null);
      if (customerImportFileRef.current) {
        customerImportFileRef.current.value = "";
      }
      await loadPage("refresh");
    } catch (err) {
      setCustomerImportError(
        toActionMessage(err, "Unable to confirm customer import.")
      );
    } finally {
      setCustomerImportSubmitting(false);
    }
  }

  const customerImportCanConfirm = useMemo(
    () =>
      Boolean(
        customerImportFile &&
          customerImportPreviewState &&
          customerImportPreviewState.valid_count > 0 &&
          customerImportPreviewState.invalid_count === 0
      ),
    [customerImportFile, customerImportPreviewState]
  );

  const totalContractValue = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + Number(row.total_subscription_value || 0),
        0
      ),
    [rows]
  );

  const activeCustomers = useMemo(
    () => rows.filter((row) => row.status === "ACTIVE").length,
    [rows]
  );

  const pendingKyc = useMemo(
    () => rows.filter((row) => row.kyc_status === "PENDING").length,
    [rows]
  );

  const activeSubscriptions = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.active_subscription_count || 0), 0),
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email ?? "",
        city: row.city ?? "",
        address: row.address ?? "",
        kyc_status: row.kyc_status,
        status: row.status,
        active_subscription_count: row.active_subscription_count ?? 0,
        total_subscription_value: row.total_subscription_value ?? "0.00",
        created_at: row.created_at ?? "",
      })),
    [rows]
  );

  const columns = useMemo<Column<CustomerRow>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.name}</div>
            <div className="text-xs text-muted-foreground">Customer #{row.id}</div>
          </div>
        ),
      },
      {
        key: "phone",
        title: "Contact",
        render: (row) => (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{row.phone || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.email || "No email"}</div>
            <div className="text-xs text-muted-foreground">
              {row.city || row.address || "No location"}
            </div>
          </div>
        ),
      },
      {
        key: "kyc_status",
        title: "Compliance",
        sortable: true,
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={row.kyc_status} />
            <StatusBadge status={row.status} />
          </div>
        ),
      },
      {
        key: "active_subscription_count",
        title: "Contract Context",
        align: "right",
        sortable: true,
        render: (row) => (
          <div className="space-y-1 text-right">
            <div className="font-semibold text-foreground">
              {row.active_subscription_count ?? 0} active
            </div>
            <div className="text-xs text-muted-foreground">
              {money(row.total_subscription_value)}
            </div>
          </div>
        ),
      },
      {
        key: "created_at",
        title: "Created",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.created_at || "") || 0,
        render: (row) => formatDateTime(row.created_at),
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Customer Operations"
      title="Customer Register"
      subtitle="Search, review, and route customer records into KYC, subscription, and payment workflows with clear operational context."
      helperNote="Customer rows here are source-linked for onboarding, subscription sale, direct sale, and collection operations. Use filters to narrow high-volume registers before action."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Customers" },
      ]}
      actions={[
        { href: "/admin/customers/create", label: "Create Customer", variant: "primary" },
        { href: ROUTES.admin.subscriptionsAdvanceEmiCreate, label: "Create Subscription", variant: "secondary" },
        { href: ROUTES.admin.financeCollect, label: "Collect Payment", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
        { href: "/admin/subscriptions", label: "Subscriptions", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible Customers", value: rows.length },
        { label: "Active Customers", value: activeCustomers, tone: "success" },
        { label: "Pending KYC", value: pendingKyc, tone: pendingKyc > 0 ? "warning" : undefined },
        { label: "Active Subscriptions", value: activeSubscriptions },
      ]}
      statusBadge={{ label: "Customer Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <ControlLaneGrid
          title="Customer control lanes"
          description="Customer onboarding, subscription sale, direct sale, collection operations, and support handling stay linked but operationally separate."
          lanes={[
            {
              title: "Create customer",
              description: "Start a new customer record in the canonical admin register.",
              href: `${ROUTES.admin.customers}/create`,
              icon: <UserPlus className="h-4 w-4" />,
              badge: "Setup",
            },
            {
              title: "Create subscription",
              description: "Route a verified customer into the canonical subscription-sale workflow.",
              href: ROUTES.admin.subscriptionsAdvanceEmiCreate,
              icon: <RefreshCw className="h-4 w-4" />,
              badge: "Sale",
            },
            {
              title: "Collect payment",
              description: "Open the admin payment workflow without blending collection into profile edits.",
              href: ROUTES.admin.financeCollect,
              icon: <RefreshCw className="h-4 w-4" />,
              badge: "Payment",
            },
            {
              title: "Direct sales lane",
              description: "Retail sale and billing work remain explicit and separate from EMI subscriptions.",
              href: ROUTES.admin.billingDirectSales,
              icon: <Users className="h-4 w-4" />,
              badge: "Retail",
            },
            {
              title: "CRM directory",
              description: "Review party continuity and follow-up posture before conversion or escalation.",
              href: ROUTES.admin.crmParties,
              icon: <Users className="h-4 w-4" />,
              badge: "CRM",
            },
            {
              title: "Support queue",
              description: "Customer disputes and service issues remain in their own route-safe queue.",
              href: ROUTES.admin.supportRequests,
              icon: <ShieldCheck className="h-4 w-4" />,
              badge: "Support",
            },
          ]}
        />
        <QuickActionGrid className="sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Visible customers"
            value={rows.length}
            helper="Rows matching the current filter set"
          />
          <KpiCard
            label="Active customers"
            value={activeCustomers}
            helper="Account status ACTIVE in this view"
          />
          <KpiCard
            label="Pending KYC"
            value={pendingKyc}
            helper={pendingKyc > 0 ? "Needs compliance follow-up" : "No pending KYC in view"}
          />
          <KpiCard
            label="Visible contract value"
            value={money(totalContractValue)}
            helper="Sum of total_subscription_value for visible rows"
          />
        </QuickActionGrid>

        <DetailPanel
          title="Customer workflow"
          description="Use server-backed search and KYC/status filters to reduce noise, then route directly into customer detail, subscriptions, or payment history."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => openWorkflow("admin.createCustomer")}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Quick Create Customer
            </ActionButton>
            <ActionButton
              variant="primary"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "customer-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "name", header: "name" },
                    { key: "phone", header: "phone" },
                    { key: "email", header: "email" },
                    { key: "city", header: "city" },
                    { key: "address", header: "address" },
                    { key: "kyc_status", header: "kyc_status" },
                    { key: "status", header: "status" },
                    { key: "active_subscription_count", header: "active_subscription_count" },
                    { key: "total_subscription_value", header: "total_subscription_value" },
                    { key: "created_at", header: "created_at" },
                  ],
                  exportRows
                )
              }
              leftIcon={<Download className="h-4 w-4" />}
            >
              Export Current View
            </ActionButton>
          </div>
          <TableToolbar
            title="Search and filter"
            description="Use query, KYC, and account-state filters to narrow high-volume customer rows for collection and onboarding operations."
            footer={
              query || kycFilter || statusFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
                  {query ? <StatusBadge status="OPEN" label={`Search: ${query}`} hideIcon /> : null}
                  {kycFilter ? <StatusBadge status={kycFilter} hideIcon /> : null}
                  {statusFilter ? <StatusBadge status={statusFilter} hideIcon /> : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Search-first workflow: name, phone, username, KYC state, and account state stay aligned with the backend filter set.
                </div>
              )
            }
          >
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="Search by name, phone, username"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <select
                value={kycInput}
                onChange={(event) => setKycInput(event.target.value as "" | KycStatus)}
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All KYC</option>
                <option value="NOT_PROVIDED">Not Provided</option>
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(event.target.value as "" | CustomerStatus)
                }
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All states</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  type="submit"
                  variant="primary"
                >
                  Apply
                </ActionButton>
                <ActionButton
                  type="button"
                  onClick={handleResetFilters}
                  variant="outline"
                >
                  Reset
                </ActionButton>
              </div>
            </form>
          </TableToolbar>
        </DetailPanel>

        <DetailPanel
          title="Customer CSV onboarding"
          description="Preview and confirm the existing backend customer import flow from the admin workspace. Confirm import is intentionally gated behind a clean preview."
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Import controls
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use this only for profile preload. Generated passwords are not
                  returned by the backend, so portal credential handoff still
                  needs a separate OTP reset or controlled first-password step.
                </p>
              </div>

              <OtpDeliveryReadinessCard operatorContext="import" />

              <div className="space-y-2">
                <label
                  htmlFor="customer-import-file"
                  className="block text-sm font-medium text-foreground"
                >
                  Customer CSV file
                </label>
                <input
                  id="customer-import-file"
                  ref={customerImportFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCustomerImportFileChange}
                  disabled={customerImportPreviewing || customerImportSubmitting}
                  className="block w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                />
                <div className="text-xs text-muted-foreground">
                  Required backend headers: <code>name</code>, <code>phone</code>
                </div>
                {customerImportFile ? (
                  <div className="text-xs text-muted-foreground">
                    Selected file: {customerImportFile.name}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  type="button"
                  variant="primary"
                  onClick={() => void handleCustomerImportPreview()}
                  disabled={
                    !customerImportFile ||
                    customerImportPreviewing ||
                    customerImportSubmitting
                  }
                >
                  {customerImportPreviewing ? "Previewing..." : "Preview CSV"}
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="outline"
                  onClick={() => void handleCustomerImportConfirm()}
                  disabled={
                    !customerImportCanConfirm ||
                    customerImportPreviewing ||
                    customerImportSubmitting
                  }
                >
                  {customerImportSubmitting ? "Importing..." : "Confirm Import"}
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={clearCustomerImportSelection}
                  disabled={customerImportPreviewing || customerImportSubmitting}
                >
                  Clear
                </ActionButton>
              </div>

              {customerImportMessage ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  {customerImportMessage}
                </div>
              ) : null}

              {customerImportError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {customerImportError}
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Preview and result
                </h3>
                <p className="text-sm text-muted-foreground">
                  Preview must be clean before confirm import is enabled. This
                  keeps the admin UI aligned with the safest current backend flow.
                </p>
              </div>

              {customerImportPreviewState ? (
                <div className="space-y-4">
                  <QuickActionGrid className="sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      label="Columns"
                      value={customerImportPreviewState.columns.length}
                      helper="Detected from CSV header"
                    />
                    <KpiCard
                      label="Valid rows"
                      value={customerImportPreviewState.valid_count}
                      helper="Rows passing preview validation"
                    />
                    <KpiCard
                      label="Invalid rows"
                      value={customerImportPreviewState.invalid_count}
                      helper={
                        customerImportPreviewState.invalid_count > 0
                          ? "Fix before confirm import"
                          : "None"
                      }
                    />
                    <KpiCard
                      label="Confirm ready"
                      value={
                        customerImportPreviewState.invalid_count === 0 &&
                        customerImportPreviewState.valid_count > 0
                          ? "Yes"
                          : "No"
                      }
                      helper="Requires valid rows and zero invalid"
                    />
                  </QuickActionGrid>

                  <div className="text-xs text-muted-foreground">
                    Detected columns:{" "}
                    {customerImportPreviewState.columns.join(", ") || "—"}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          <th className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Row
                          </th>
                          <th className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Name
                          </th>
                          <th className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Phone
                          </th>
                          <th className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Valid
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerImportPreviewState.preview_rows.map((row) => (
                          <tr key={row.row_number}>
                            <td className="border-b border-border px-3 py-2 text-sm text-foreground">
                              {row.row_number}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-sm text-foreground">
                              {row.name || "—"}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-sm text-foreground">
                              {row.phone || "—"}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-sm text-foreground">
                              {row.valid ? "Yes" : "No"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {customerImportPreviewState.errors.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <div className="font-medium">Invalid row details</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {customerImportPreviewState.errors.map((item, index) => (
                          <li key={`${item.row_number ?? "header"}-${index}`}>
                            Row {item.row_number ?? "header"}
                            {item.phone ? ` (${item.phone})` : ""}:{" "}
                            {item.errors.join(", ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {customerImportCommitState ? (
                <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                  <div className="font-medium">Import result</div>
                  <div>
                    Created {customerImportCommitState.created} row
                    {customerImportCommitState.created === 1 ? "" : "s"} and
                    skipped {customerImportCommitState.skipped}.
                  </div>

                  {customerImportCommitState.rows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left">
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Row
                            </th>
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Name
                            </th>
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Phone
                            </th>
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Username
                            </th>
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Customer ID
                            </th>
                            <th className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                              Access Handoff
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerImportCommitState.rows
                            .filter((row) => row.created_customer_id)
                            .slice(0, 10)
                            .map((row) => (
                              <tr key={row.row_number}>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.row_number}
                                </td>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.name || "—"}
                                </td>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.phone || "—"}
                                </td>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.generated_username || "—"}
                                </td>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.created_customer_id ?? "—"}
                                </td>
                                <td className="border-b border-emerald-200 px-3 py-2 text-sm">
                                  {row.email ? (
                                    <Link
                                      href={buildForgotPasswordHref(row.email)}
                                      className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
                                    >
                                      Start OTP Reset
                                    </Link>
                                  ) : (
                                    "Add email before reset"
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div className="text-xs text-emerald-900/80">
                    Generated passwords are not returned by the backend. Use a
                    separate credential handoff or the OTP reset workflow for
                    customers who need portal access.
                  </div>
                </div>
              ) : null}

              {!customerImportPreviewState && !customerImportCommitState ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  Select a CSV file and run preview to inspect the current backend
                  import result before confirm import is enabled.
                </div>
              ) : null}
            </div>
          </div>
        </DetailPanel>

        {loading ? <LoadingBlock label="Loading customer register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load customer register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Customer rows"
            description="Open the customer detail page for KYC decisions, subscription context, and recent payment visibility."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No customers found"
                description="No customer records matched the current search and filter set."
                action={
                  <Link
                    href="/admin/customers/create"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Customer
                  </Link>
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<CustomerRow>
                  rows={rows}
                  columns={columns}
                  pageSize={12}
                  rowActions={(row) => (
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/admin/customers/${row.id}`}
                        className="inline-flex items-center rounded-md border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
                      >
                        Open Customer
                      </Link>
                      <Link
                        href={`/admin/customers/${row.id}/edit`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/subscriptions?customer=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscriptions
                      </Link>
                      <Link
                        href={`/admin/payments?customer=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payments
                      </Link>
                    </div>
                  )}
                />
              </DataTableShell>
            )}
          </DetailPanel>
        ) : null}
      </div>
    </PortalPage>
  );
}
