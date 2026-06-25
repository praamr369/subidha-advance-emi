"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { FINANCE_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch, toArray } from "@/lib/api";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";
import { downloadCsv } from "@/lib/export/csv";
import { getAdminCommissionStatementExportPath } from "@/services/commissions";
import type { AdminCommissionSummaryResponse } from "@/types/commission";

type CommissionStatus = "UNSETTLED" | "SETTLED" | "REVERSED";

type CommissionRow = {
  id: number;
  amount: string;
  status: CommissionStatus;

  partner_id?: number | null;
  partner_name?: string;
  partner_phone?: string | null;

  customer_name?: string;
  customer_phone?: string | null;

  subscription_id?: number | null;
  subscription_number?: string;

  batch_code?: string | null;
  lucky_number?: number | null;

  payment_id?: number | null;
  payment_amount?: string | null;
  payment_date?: string | null;
  payment_reference_no?: string | null;
  payment_method?: string | null;

  emi_id?: number | null;
  emi_month_no?: number | null;

  commission_rate?: string | null;
  settlement_date?: string | null;
  settled_at?: string | null;

  payout_batch_id?: number | null;
  created_at?: string;
  updated_at?: string;

  note?: string | null;
  reversal_reason?: string | null;

  metadata?: Record<string, unknown> | null;
};

type BulkSettleResponse = {
  detail?: string;
  settled_count?: number;
  skipped_count?: number;
  results?: Array<Record<string, unknown>>;
};

function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value === null) return null;
  return undefined;
}

function toMetadata(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseStatus(raw: Record<string, unknown>): CommissionStatus {
  const explicit = toStringValue(raw.status || raw.settlement_status).toUpperCase();

  if (explicit === "SETTLED") return "SETTLED";
  if (explicit === "REVERSED") return "REVERSED";
  if (explicit === "UNSETTLED") return "UNSETTLED";
  if (explicit === "PENDING") return "UNSETTLED";

  const isReversed =
    raw.is_reversed === true ||
    raw.reversed === true ||
    explicit === "REVERSED";

  if (isReversed) return "REVERSED";

  const isSettled =
    raw.is_settled === true ||
    raw.settled === true ||
    explicit === "SETTLED";

  return isSettled ? "SETTLED" : "UNSETTLED";
}

function toBackendStatusFilter(
  status: "" | "UNSETTLED" | "SETTLED" | "REVERSED"
): "" | "PENDING" | "SETTLED" | "REVERSED" {
  if (status === "UNSETTLED") return "PENDING";
  if (status === "SETTLED" || status === "REVERSED") return status;
  return "";
}

function normalizeStatusParam(
  status: string
): "" | "UNSETTLED" | "SETTLED" | "REVERSED" {
  if (status === "PENDING" || status === "UNSETTLED") return "UNSETTLED";
  if (status === "SETTLED" || status === "REVERSED") return status;
  return "";
}

function formatDateTime(value: string | null | undefined): string {
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load commission register.";

  const raw = error.message?.trim();
  if (!raw) return "Failed to load commission register.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const value of Object.values(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return String(value[0]);
      }
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  } catch {
    return raw;
  }

  return raw;
}

function normalizeCommissionRow(raw: Record<string, unknown>): CommissionRow {
  const subscriptionId =
    toNullableNumber(raw.subscription_id) ??
    toNullableNumber(raw.subscription) ??
    null;

  const partnerId =
    toNullableNumber(raw.partner_id) ??
    toNullableNumber(raw.partner) ??
    null;

  const payoutBatchId =
    toNullableNumber(raw.payout_batch_id) ??
    toNullableNumber(raw.batch_id) ??
    null;

  const paymentId =
    toNullableNumber(raw.payment_id) ??
    toNullableNumber(raw.payment) ??
    null;

  const emiId =
    toNullableNumber(raw.emi_id) ??
    toNullableNumber(raw.emi) ??
    null;

  const paymentReference =
    toNullableString(raw.payment_reference_no) ??
    toNullableString(raw.reference_no) ??
    undefined;

  return {
    id: toNumber(raw.id),
    amount: toMoneyString(
      raw.amount ??
        raw.commission_amount ??
        raw.total_amount ??
        0
    ),
    status: parseStatus(raw),

    partner_id: partnerId,
    partner_name:
      toStringValue(raw.partner_name) ||
      toStringValue(raw.partner_username) ||
      undefined,
    partner_phone:
      toNullableString(raw.partner_phone) ??
      undefined,

    customer_name:
      toStringValue(raw.customer_name) || undefined,
    customer_phone:
      toNullableString(raw.customer_phone) ?? undefined,

    subscription_id: subscriptionId,
    subscription_number:
      toStringValue(raw.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : undefined),

    batch_code: toNullableString(raw.batch_code),
    lucky_number: toNullableNumber(raw.lucky_number),

    payment_id: paymentId,
    payment_amount:
      raw.payment_amount !== undefined && raw.payment_amount !== null
        ? toMoneyString(raw.payment_amount)
        : null,
    payment_date:
      toNullableString(raw.payment_date) ?? null,
    payment_reference_no: paymentReference ?? null,
    payment_method:
      toNullableString(raw.payment_method) ??
      toNullableString(raw.method) ??
      null,

    emi_id: emiId,
    emi_month_no: toNullableNumber(raw.emi_month_no),

    commission_rate:
      raw.commission_rate !== undefined && raw.commission_rate !== null
        ? String(raw.commission_rate)
        : null,

    settlement_date:
      toNullableString(raw.settlement_date) ?? null,
    settled_at:
      toNullableString(raw.settled_at) ??
      toNullableString(raw.settlement_date) ??
      null,

    payout_batch_id: payoutBatchId,

    created_at: toStringValue(raw.created_at) || undefined,
    updated_at:
      toNullableString(raw.updated_at) ?? undefined,

    note:
      toNullableString(raw.note) ??
      toNullableString(raw.notes) ??
      null,

    reversal_reason:
      toNullableString(raw.reversal_reason) ?? null,

    metadata: toMetadata(raw.metadata),
  };
}

function statusTone(status: CommissionStatus): string {
  switch (status) {
    case "UNSETTLED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "SETTLED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REVERSED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceSection title={title} description={description}>
      {children}
    </WorkspaceSection>
  );
}

export default function AdminFinanceCommissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const partnerId = (searchParams.get("partner") || "").trim();
  const subscriptionId = (searchParams.get("subscription") || "").trim();
  const paymentId = (searchParams.get("payment") || "").trim();
  const queryParam = (searchParams.get("q") || "").trim();
  const statusParam = normalizeStatusParam(
    (searchParams.get("status") || "").trim().toUpperCase()
  );
  const [summary, setSummary] = useState<AdminCommissionSummaryResponse | null>(null);
  const [allRows, setAllRows] = useState<CommissionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(queryParam);
  const [statusInput, setStatusInput] = useState<
    "" | "UNSETTLED" | "SETTLED" | "REVERSED"
  >(statusParam);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState(queryParam.toLowerCase());
  const [statusFilter, setStatusFilter] = useState<
    "" | "UNSETTLED" | "SETTLED" | "REVERSED"
  >(statusParam);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [actingIds, setActingIds] = useState<number[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "pdf" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(queryParam);
    setSearchQuery(queryParam.toLowerCase());
    setStatusInput(statusParam);
    setStatusFilter(statusParam);
  }, [queryParam, statusParam]);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (partnerId) params.set("partner", partnerId);
      if (subscriptionId) params.set("subscription", subscriptionId);
      if (paymentId) params.set("payment", paymentId);
      if (statusParam) {
        params.set("status", toBackendStatusFilter(statusParam));
      }
      const summaryQuery = params.toString();
      const summarySuffix = summaryQuery ? `?${summaryQuery}` : "";

      const summaryPayload = await apiFetch<AdminCommissionSummaryResponse>(
        `/admin/commissions/summary/${summarySuffix}`
      );

      params.set("limit", "all");
      const listQuery = params.toString();
      const rowsPayload = await apiFetch<unknown>(
        `/admin/commissions/${listQuery ? `?${listQuery}` : ""}`
      );

      setSummary(summaryPayload);
      setAllRows(
        toArray<Record<string, unknown>>(rowsPayload).map(normalizeCommissionRow)
      );
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setSummary(null);
        setAllRows([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [partnerId, paymentId, statusParam, subscriptionId]);

  const scopedPartnerSummary = useMemo(() => {
    if (!partnerId || !summary?.per_partner?.length) return null;
    return (
      summary.per_partner.find(
        (row) => String(row.partner_id) === String(partnerId)
      ) ?? null
    );
  }, [partnerId, summary]);

  const settledQueueHref = useMemo(() => {
    const next = new URLSearchParams();
    if (partnerId) next.set("partner", partnerId);
    return next.toString()
      ? `/admin/finance/commissions/settled?${next.toString()}`
      : "/admin/finance/commissions/settled";
  }, [partnerId]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (partnerId) next.set("partner", partnerId);
    if (subscriptionId) next.set("subscription", subscriptionId);
    if (paymentId) next.set("payment", paymentId);
    if (searchInput.trim()) next.set("q", searchInput.trim());
    if (statusInput) next.set("status", statusInput);

    const query = next.toString();
    router.replace(query ? `/admin/finance/commissions?${query}` : "/admin/finance/commissions");
  }

  function handleResetFilters() {
    setSearchInput("");
    setStatusInput("");
    const next = new URLSearchParams();
    if (partnerId) next.set("partner", partnerId);
    if (subscriptionId) next.set("subscription", subscriptionId);
    if (paymentId) next.set("payment", paymentId);

    const query = next.toString();
    router.replace(query ? `/admin/finance/commissions?${query}` : "/admin/finance/commissions");
  }

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      const matchesStatus = statusFilter ? row.status === statusFilter : true;
      if (!matchesStatus) return false;

      if (!searchQuery) return true;

      const haystack = [
        row.id,
        row.partner_name,
        row.partner_phone,
        row.customer_name,
        row.customer_phone,
        row.subscription_number,
        row.batch_code,
        row.payment_id,
        row.payment_reference_no,
        row.note,
        row.reversal_reason,
        row.payout_batch_id,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });
  }, [allRows, searchQuery, statusFilter]);

  const unsettledRows = useMemo(
    () => rows.filter((row) => row.status === "UNSETTLED"),
    [rows]
  );

  const visibleAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rows]
  );

  const visibleSettledCount = useMemo(
    () => rows.filter((row) => row.status === "SETTLED").length,
    [rows]
  );

  const visibleUnsettledCount = useMemo(
    () => rows.filter((row) => row.status === "UNSETTLED").length,
    [rows]
  );

  const visibleReversedCount = useMemo(
    () => rows.filter((row) => row.status === "REVERSED").length,
    [rows]
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const selectedUnsettledRows = useMemo(
    () => selectedRows.filter((row) => row.status === "UNSETTLED"),
    [selectedRows]
  );

  const selectedUnsettledAmount = useMemo(
    () =>
      selectedUnsettledRows.reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      ),
    [selectedUnsettledRows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        status: row.status,
        partner_name: row.partner_name ?? "",
        partner_phone: row.partner_phone ?? "",
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone ?? "",
        subscription_number: row.subscription_number ?? "",
        batch_code: row.batch_code ?? "",
        lucky_number:
          typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        payment_id:
          typeof row.payment_id === "number" ? String(row.payment_id) : "",
        payment_amount: row.payment_amount ?? "",
        payment_date: row.payment_date ?? "",
        payment_reference_no: row.payment_reference_no ?? "",
        payment_method: row.payment_method ?? "",
        emi_id: typeof row.emi_id === "number" ? String(row.emi_id) : "",
        emi_month_no:
          typeof row.emi_month_no === "number" ? String(row.emi_month_no) : "",
        commission_rate: row.commission_rate ?? "",
        settled_at: row.settled_at ?? "",
        payout_batch_id:
          typeof row.payout_batch_id === "number"
            ? String(row.payout_batch_id)
            : "",
        created_at: row.created_at ?? "",
        updated_at: row.updated_at ?? "",
        note: row.note ?? "",
        reversal_reason: row.reversal_reason ?? "",
      })),
    [rows]
  );

  function toggleSelection(rowId: number) {
    setSelectedIds((current) =>
      current.includes(rowId)
        ? current.filter((item) => item !== rowId)
        : [...current, rowId]
    );
  }

  function selectAllVisibleUnsettled() {
    setSelectedIds(unsettledRows.map((row) => row.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function settleSingleCommission(row: CommissionRow) {
    if (row.status !== "UNSETTLED") return;

    setSuccessMessage(null);
    setError(null);
    setActingIds((current) => [...current, row.id]);

    try {
      await apiFetch(`/admin/commissions/${row.id}/settle/`, {
        method: "POST",
      });

      setSuccessMessage(`Commission #${row.id} settled successfully.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActingIds((current) => current.filter((id) => id !== row.id));
    }
  }

  async function settleSelectedRows() {
    if (selectedUnsettledRows.length === 0) {
      setError("Select at least one unsettled commission row.");
      return;
    }

    setBulkSubmitting(true);
    setSuccessMessage(null);
    setError(null);

    try {
      const payload = {
        commission_ids: selectedUnsettledRows.map((row) => row.id),
      };

      const result = await apiFetch<BulkSettleResponse>(
        "/admin/commissions/bulk-settle/",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSuccessMessage(
        result.detail ||
          `${selectedUnsettledRows.length} commission row(s) submitted for settlement.`
      );
      setSelectedIds([]);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function settleVisibleUnsettledRows() {
    if (unsettledRows.length === 0) {
      setError("No visible unsettled commission rows available.");
      return;
    }

    setBulkSubmitting(true);
    setSuccessMessage(null);
    setError(null);

    try {
      const payload = {
        commission_ids: unsettledRows.map((row) => row.id),
      };

      const result = await apiFetch<BulkSettleResponse>(
        "/admin/commissions/bulk-settle/",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSuccessMessage(
        result.detail ||
          `${unsettledRows.length} visible unsettled commission row(s) submitted for settlement.`
      );
      setSelectedIds([]);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function handleExport(format: "csv" | "pdf") {
    setExportingFormat(format);
    setError(null);

    try {
      await downloadAuthenticatedFile(
        getAdminCommissionStatementExportPath({
          partner: partnerId || undefined,
          status: toBackendStatusFilter(statusFilter) || undefined,
          date_from: exportDateFrom || undefined,
          date_to: exportDateTo || undefined,
          export_format: format,
        }),
        `commission-statement.${format}`
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Finance Commission Control"
      title="Commission Register"
      subtitle="Track commission liability, partner earning history, settlement readiness, and payout handoff with payment-linked financial context."
      helperNote="Commission review, payout preparation, and commission reconciliation stay in finance. They are not merged into cashier collection or accounting posting lanes."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Commissions" },
      ]}
      actions={[
        {
          href: settledQueueHref,
          label: "Open Payout Queue",
          variant: "primary",
        },
        {
          href: "/admin/finance/payout-batches",
          label: "Open Payout Batches",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Rows",
          value: String(rows.length),
        },
        {
          label: "Visible Amount",
          value: money(visibleAmount),
          tone: "success",
        },
        {
          label: "Unsettled",
          value: String(visibleUnsettledCount),
          tone: visibleUnsettledCount > 0 ? "warning" : undefined,
        },
        {
          label: "Settled",
          value: String(visibleSettledCount),
        },
      ]}
      statusBadge={{
        label: "Commission Finance Control",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <WorkspaceDirectory
          title="Finance route map"
          description="Move between commission review, finance verification, payout execution, and downstream accounting handoff without crossing domain boundaries."
          groups={FINANCE_CONTROL_DIRECTORY_GROUPS}
        />

        <SectionCard
          title="Finance summary"
          description="Top-level commission exposure across unsettled, settled, and reversed records."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Commission
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(summary?.summary?.total_commission)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pending Commission
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(summary?.summary?.pending_commission)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {String(summary?.summary?.pending_count ?? 0)} unsettled rows
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Settled Commission
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(summary?.summary?.settled_commission)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {String(summary?.summary?.settled_count ?? 0)} settled rows
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reversed Commission
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(summary?.summary?.reversed_commission)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {String(summary?.summary?.reversed_count ?? 0)} reversed rows
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Operational control"
          description="Settle one or many commissions only after the underlying payment is financially valid. Settlement here should represent commission liability movement, not a fake wallet transfer."
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Rows
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {selectedRows.length}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Unsettled
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {selectedUnsettledRows.length}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Amount
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(selectedUnsettledAmount)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reversed Visible
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {visibleReversedCount}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllVisibleUnsettled}
              disabled={loading || unsettledRows.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Select Visible Unsettled
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={loading || selectedIds.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear Selection
            </button>

            <button
              type="button"
              onClick={() => void settleSelectedRows()}
              disabled={loading || bulkSubmitting || selectedUnsettledRows.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkSubmitting ? "Processing..." : "Settle Selected"}
            </button>

            <button
              type="button"
              onClick={() => void settleVisibleUnsettledRows()}
              disabled={loading || bulkSubmitting || unsettledRows.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkSubmitting ? "Processing..." : "Settle Visible Unsettled"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Use settlement to move commission rows into finance-ready state. Actual cash payout should still be handled through payout batches and accounting records, not by pretending this page directly debits a partner wallet.
          </div>

          {successMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {successMessage}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Filter register"
          description="Filter loaded rows by partner, customer, subscription, payment reference, payout batch, reversal reason, or note."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <label
                htmlFor="commission-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="commission-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Partner, customer, subscription, payment ref, batch, note"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="commission-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="commission-status"
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(
                    event.target.value as "" | "UNSETTLED" | "SETTLED" | "REVERSED"
                  )
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="UNSETTLED">Unsettled</option>
                <option value="SETTLED">Settled</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "commission-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "amount", header: "amount" },
                    { key: "status", header: "status" },
                    { key: "partner_name", header: "partner_name" },
                    { key: "partner_phone", header: "partner_phone" },
                    { key: "customer_name", header: "customer_name" },
                    { key: "customer_phone", header: "customer_phone" },
                    { key: "subscription_number", header: "subscription_number" },
                    { key: "batch_code", header: "batch_code" },
                    { key: "lucky_number", header: "lucky_number" },
                    { key: "payment_id", header: "payment_id" },
                    { key: "payment_amount", header: "payment_amount" },
                    { key: "payment_date", header: "payment_date" },
                    { key: "payment_reference_no", header: "payment_reference_no" },
                    { key: "payment_method", header: "payment_method" },
                    { key: "emi_id", header: "emi_id" },
                    { key: "emi_month_no", header: "emi_month_no" },
                    { key: "commission_rate", header: "commission_rate" },
                    { key: "settled_at", header: "settled_at" },
                    { key: "payout_batch_id", header: "payout_batch_id" },
                    { key: "created_at", header: "created_at" },
                    { key: "updated_at", header: "updated_at" },
                    { key: "note", header: "note" },
                    { key: "reversal_reason", header: "reversal_reason" },
                  ],
                  exportRows
                )
              }
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>

          {(partnerId || subscriptionId || paymentId) && !loading ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Scoped handoff active:
              {partnerId
                ? ` partner ${
                    scopedPartnerSummary?.partner_username
                      ? `${scopedPartnerSummary.partner_username} (#${partnerId})`
                      : `#${partnerId}`
                  }`
                : ""}
              {partnerId && subscriptionId ? " · " : ""}
              {subscriptionId ? ` subscription ${subscriptionId}` : ""}
              {(partnerId || subscriptionId) && paymentId ? " · " : ""}
              {paymentId ? ` payment ${paymentId}` : ""}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Statement export"
          description="Export backend-truth commission statements for admin review, partner sharing, or payout preparation. Export respects partner scope from the current handoff and optional date filters below."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                From
              </label>
              <input
                type="date"
                value={exportDateFrom}
                onChange={(event) => setExportDateFrom(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                To
              </label>
              <input
                type="date"
                value={exportDateTo}
                onChange={(event) => setExportDateTo(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                disabled={exportingFormat !== null}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingFormat === "csv" ? "Exporting..." : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                disabled={exportingFormat !== null}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingFormat === "pdf" ? "Exporting..." : "Export PDF"}
              </button>
            </div>
          </div>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading commission register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load commission register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Commission history"
            description="Row-level partner earning history aligned with payment, EMI, subscription, settlement, reversal, and payout context."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No commission rows"
                description="No commission records match the current filter set."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Select
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Commission
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Partner / Customer
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Subscription / EMI
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Payment History
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                        Amount
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Settlement State
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => {
                      const isSelected = selectedIds.includes(row.id);
                      const isActing = actingIds.includes(row.id);

                      return (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={row.status !== "UNSETTLED"}
                              onChange={() => toggleSelection(row.id)}
                              className="h-4 w-4 rounded border-border"
                            />
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">#{row.id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Created {formatDateTime(row.created_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Updated {formatDateTime(row.updated_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Rate {row.commission_rate ? `${row.commission_rate}%` : "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.partner_name || "Unknown partner"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.partner_phone || "No partner phone"}
                            </div>
                            <div className="mt-2 text-sm font-medium text-foreground">
                              {row.customer_name || "No customer linked"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.customer_phone || "No customer phone"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.subscription_number || "—"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.batch_code || "No batch"}
                              {typeof row.lucky_number === "number"
                                ? ` · Lucky #${row.lucky_number}`
                                : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              EMI {typeof row.emi_month_no === "number" ? `Month ${row.emi_month_no}` : "—"}
                              {typeof row.emi_id === "number" ? ` · #${row.emi_id}` : ""}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {typeof row.payment_id === "number"
                                ? `Payment #${row.payment_id}`
                                : "No payment linked"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.payment_method || "—"} · {formatDate(row.payment_date)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Ref {row.payment_reference_no || "—"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Payment Amount {money(row.payment_amount)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.amount)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                statusTone(row.status),
                              ].join(" ")}
                            >
                              {row.status}
                            </span>

                            <div className="mt-2 text-xs text-muted-foreground">
                              Settled {formatDateTime(row.settled_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Payout Batch{" "}
                              {typeof row.payout_batch_id === "number"
                                ? `#${row.payout_batch_id}`
                                : "—"}
                            </div>

                            {row.note ? (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Note: {row.note}
                              </div>
                            ) : null}

                            {row.reversal_reason ? (
                              <div className="mt-1 text-xs text-red-700">
                                Reversal: {row.reversal_reason}
                              </div>
                            ) : null}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              {typeof row.subscription_id === "number" ? (
                                <Link
                                  href={`/admin/subscriptions/${row.subscription_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Subscription
                                </Link>
                              ) : null}

                              {typeof row.partner_id === "number" ? (
                                <Link
                                  href={`/admin/finance/commissions?partner=${row.partner_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Partner Rows
                                </Link>
                              ) : null}

                              {typeof row.payment_id === "number" ? (
                                <Link
                                  href={`/admin/payments/${row.payment_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Payment
                                </Link>
                              ) : null}

                              {row.status === "SETTLED" ? (
                                <Link
                                  href={
                                    typeof row.partner_id === "number"
                                      ? `/admin/finance/commissions/settled?partner=${row.partner_id}`
                                      : settledQueueHref
                                  }
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Payout Queue
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void settleSingleCommission(row)}
                                  disabled={row.status !== "UNSETTLED" || isActing}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isActing ? "Settling..." : "Settle Row"}
                                </button>
                              )}

                              {typeof row.payout_batch_id === "number" ? (
                                <Link
                                  href={`/admin/finance/payout-batches/${row.payout_batch_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Payout Batch
                                </Link>
                              ) : (
                                <Link
                                  href="/admin/finance/payout-batches"
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Payout Workflow
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
