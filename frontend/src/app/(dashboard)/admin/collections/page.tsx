// frontend/src/app/(dashboard)/admin/collections/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ArrowDownRight,
  
  Clock,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  Wallet,
  X,
  RefreshCw,
  AlertCircle,
  BarChart3,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  getAdminPaymentRegister,
  type PaymentRegisterRow,
  type PaymentRegisterSummary,
} from "@/services/payments";

// =====================================================
// TYPES
// =====================================================
type EmiRow = {
  id: number;
  subscription: number;
  customer_name?: string;
  customer_phone?: string;
  month_no: number;
  due_date?: string;
  amount: string;
  total_paid?: string;
  balance_amount?: string;
  outstanding_amount?: string;
  status: string;
  batch_code?: string | null;
  lucky_number?: number | null;
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function overdueDays(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const parsed = Date.parse(dueDate);
  if (Number.isNaN(parsed)) return 0;
  const diffMs = Date.now() - parsed;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load collections workspace.";
}

function localDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildVisiblePaymentSummary(rows: PaymentRegisterRow[]): PaymentRegisterSummary {
  const grossAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const activeRows = rows.filter((row) => !row.is_reversed);
  const reversedRows = rows.filter((row) => row.is_reversed);
  const activeAmount = activeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const reversedAmount = reversedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    visible_payments: rows.length,
    gross_amount: grossAmount.toFixed(2),
    active_payments: activeRows.length,
    active_amount: activeAmount.toFixed(2),
    reversed_payments: reversedRows.length,
    reversed_amount: reversedAmount.toFixed(2),
    net_collected_amount: activeAmount.toFixed(2),
  };
}

function normalizeEmi(row: Record<string, unknown>): EmiRow {
  return {
    id: Number(row.id ?? 0),
    subscription: Number(row.subscription ?? 0),
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    month_no: Number(row.month_no ?? 0),
    due_date: typeof row.due_date === "string" ? row.due_date : undefined,
    amount: String(row.amount ?? "0.00"),
    total_paid:
      typeof row.total_paid === "string" ? row.total_paid : undefined,
    balance_amount:
      typeof row.balance_amount === "string" ? row.balance_amount : undefined,
    outstanding_amount:
      typeof row.outstanding_amount === "string"
        ? row.outstanding_amount
        : undefined,
    status: typeof row.status === "string" ? row.status : "PENDING",
    batch_code:
      typeof row.batch_code === "string" || row.batch_code === null
        ? (row.batch_code as string | null)
        : undefined,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
  };
}

// =====================================================
// UI COMPONENTS
// =====================================================
function KpiCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  tone = "default",
  progress,
  progressValue,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  tone?: "default" | "success" | "warning" | "danger";
  progress?: number;
  progressValue?: string;
  href?: string;
}) {
  const toneColors = {
    default: "border-border bg-card hover:border-ring",
    success: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300",
    warning: "border-amber-200 bg-amber-50/50 hover:border-amber-300",
    danger: "border-red-200 bg-red-50/50 hover:border-red-300",
  };

  const card = (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
        toneColors[tone]
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-xl bg-background/50 p-2 text-muted-foreground">
          {icon}
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {progressValue || "Progress"}
            </span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : trend === "down" ? (
            <ArrowDownRight className="h-3 w-3 text-red-600" />
          ) : null}
          <span
            className={
              trend === "up"
                ? "text-emerald-600"
                : trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }
          >
            {trendValue}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

function SectionCard({
  title,
  description,
  children,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Enhanced Due Today Table (unchanged)
function DueTodayTable({ rows }: { rows: EmiRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof EmiRow>("customer_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        (row.customer_name?.toLowerCase() || "").includes(term) ||
        (row.customer_phone || "").includes(term) ||
        row.subscription.toString().includes(term) ||
        (row.batch_code?.toLowerCase() || "").includes(term)
    );
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal === bVal) return 0;
      const direction = sortDirection === "asc" ? 1 : -1;
      return (aVal < bVal ? -1 : 1) * direction;
    });
  }, [filteredRows, sortField, sortDirection]);

  const handleSort = (field: keyof EmiRow) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof EmiRow) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No due-today EMI rows"
        description="No pending EMI rows are due today."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer, phone, subscription..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th
                onClick={() => handleSort("customer_name")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Customer {getSortIcon("customer_name")}
              </th>
              <th
                onClick={() => handleSort("subscription")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Contract {getSortIcon("subscription")}
              </th>
              <th
                onClick={() => handleSort("due_date")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Due {getSortIcon("due_date")}
              </th>
              <th
                onClick={() => handleSort("amount")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right hover:text-foreground"
              >
                Amounts {getSortIcon("amount")}
              </th>
              <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
             </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => {
              const balance =
                row.balance_amount ?? row.outstanding_amount ?? row.amount;

              return (
                <tr key={row.id} className="align-top hover:bg-muted/30 transition">
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">
                      {row.customer_name || "Unknown customer"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.customer_phone || "No phone"}
                    </div>
                  </td>

                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">SUB-{row.subscription}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Advance EMI Month {row.month_no}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Batch {row.batch_code || "—"}
                      {typeof row.lucky_number === "number"
                        ? ` · Lucky #${row.lucky_number}`
                        : ""}
                    </div>
                  </td>

                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">{formatDate(row.due_date)}</div>
                    <div className="mt-1 text-xs text-blue-700">Due today</div>
                  </td>

                  <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                    <div className="font-medium">{money(row.amount)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Paid {money(row.total_paid)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Balance {money(balance)}
                    </div>
                  </td>

                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="flex flex-col items-start gap-2">
                      <Link
                        href={`/admin/subscriptions/${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscription
                      </Link>

                      <Link
                        href={`/admin/payments/create?subscription=${row.subscription}&emi=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Collect
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Enhanced Recent Payments Table (unchanged)
function RecentPaymentsTable({ rows }: { rows: PaymentRegisterRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof PaymentRegisterRow>("payment_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        (row.customer_name?.toLowerCase() || "").includes(term) ||
        (row.customer_phone || "").includes(term) ||
        (row.subscription_number || "").toLowerCase().includes(term) ||
        (row.reference_no || "").toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal === bVal) return 0;
      const direction = sortDirection === "asc" ? 1 : -1;
      return (aVal < bVal ? -1 : 1) * direction;
    });
  }, [filteredRows, sortField, sortDirection]);

  const handleSort = (field: keyof PaymentRegisterRow) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof PaymentRegisterRow) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No collections posted today"
        description="No posted payments were returned for today. After a cashier or admin collection is recorded, refresh this page."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer, subscription..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th
                onClick={() => handleSort("id")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Payment {getSortIcon("id")}
              </th>
              <th
                onClick={() => handleSort("customer_name")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Customer {getSortIcon("customer_name")}
              </th>
              <th
                onClick={() => handleSort("subscription_number")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Contract {getSortIcon("subscription_number")}
              </th>
              <th
                onClick={() => handleSort("method")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Method {getSortIcon("method")}
              </th>
              <th
                onClick={() => handleSort("amount")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right hover:text-foreground"
              >
                Amount {getSortIcon("amount")}
              </th>
              <th
                onClick={() => handleSort("is_reversed")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                State {getSortIcon("is_reversed")}
              </th>
              <th
                onClick={() => handleSort("payment_date")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Posted {getSortIcon("payment_date")}
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/30 transition">
                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">#{row.id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.reference_no || "No reference"}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">
                    {row.customer_name || "Unknown customer"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.customer_phone || "No phone"}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">
                    {row.subscription_number ||
                      (row.subscription ? `SUB-${row.subscription}` : "—")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.batch_code || "No batch"}
                    {typeof row.lucky_number === "number"
                      ? ` · Lucky #${row.lucky_number}`
                      : ""}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                    {row.method || "—"}
                  </span>
                </td>

                <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                  {money(row.amount)}
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <span
                    className={[
                      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                      row.is_reversed
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {row.is_reversed ? "Reversed" : "Active"}
                  </span>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  {formatDate(row.payment_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Enhanced Overdue Preview (unchanged)
function OverduePreview({ rows }: { rows: EmiRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No overdue preview rows"
        description="No overdue pending EMI rows are currently available."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const balance = row.balance_amount ?? row.outstanding_amount ?? row.amount;
        const daysOverdue = overdueDays(row.due_date);
        const priority = daysOverdue > 30 ? "danger" : daysOverdue > 15 ? "warning" : "info";

        const priorityClasses = {
          danger: "border-red-200 bg-red-50",
          warning: "border-amber-200 bg-amber-50",
          info: "border-border bg-muted/40",
        };

        return (
          <div
            key={row.id}
            className={`rounded-xl border p-4 transition hover:shadow-sm ${priorityClasses[priority]}`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-foreground">
                    {row.customer_name || "Unknown customer"} · SUB-{row.subscription}
                  </div>
                  {daysOverdue > 30 && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Critical
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Advance EMI Month {row.month_no} · Due {formatDate(row.due_date)} ·{" "}
                  {daysOverdue} days overdue
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.customer_phone || "No phone"} · Batch {row.batch_code || "—"}
                  {typeof row.lucky_number === "number"
                    ? ` · Lucky #${row.lucky_number}`
                    : ""}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-semibold text-foreground">
                    {money(balance)}
                  </div>
                  <div className="text-xs text-muted-foreground">Balance</div>
                </div>

                <Link
                  href={`/admin/subscriptions/${row.subscription}`}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Subscription
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function AdminCollectionsPage() {
  const searchParams = useSearchParams();
  const [dueTodayRows, setDueTodayRows] = useState<EmiRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<EmiRow[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    const today = localDateISO();

    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [dueTodayPayload, overduePayload, recentPaymentsPayload] =
        await Promise.all([
          apiFetch<unknown>(
            `/admin/emis/?status=PENDING&date_from=${today}&date_to=${today}`
          ),
          apiFetch<unknown>("/admin/emis/?overdue_only=true"),
          getAdminPaymentRegister({
            dateFrom: today,
            dateTo: today,
          }),
        ]);

      setDueTodayRows(
        toArray<Record<string, unknown>>(dueTodayPayload).map(normalizeEmi)
      );
      setOverdueRows(
        toArray<Record<string, unknown>>(overduePayload).map(normalizeEmi)
      );
      setRecentPayments(recentPaymentsPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setDueTodayRows([]);
        setOverdueRows([]);
        setRecentPayments([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const rawSubscriptionFilter = searchParams.get("subscription");
  const subscriptionFilter = parsePositiveInteger(rawSubscriptionFilter);
  const subscriptionFilterMessage =
    rawSubscriptionFilter && !subscriptionFilter
      ? `Subscription filter "${rawSubscriptionFilter}" was ignored because it is not a valid subscription id.`
      : null;

  const visibleDueTodayRows = useMemo(
    () =>
      subscriptionFilter
        ? dueTodayRows.filter((row) => row.subscription === subscriptionFilter)
        : dueTodayRows,
    [dueTodayRows, subscriptionFilter]
  );

  const visibleOverdueRows = useMemo(
    () =>
      subscriptionFilter
        ? overdueRows.filter((row) => row.subscription === subscriptionFilter)
        : overdueRows,
    [overdueRows, subscriptionFilter]
  );

  const visibleRecentPayments = useMemo(
    () =>
      subscriptionFilter
        ? recentPayments.filter((row) => row.subscription === subscriptionFilter)
        : recentPayments,
    [recentPayments, subscriptionFilter]
  );

  const visibleRecentPaymentsSummary = useMemo(
    () => buildVisiblePaymentSummary(visibleRecentPayments),
    [visibleRecentPayments]
  );

  const todayCollectedAmount = useMemo(
    () => Number(visibleRecentPaymentsSummary.net_collected_amount || 0),
    [visibleRecentPaymentsSummary.net_collected_amount]
  );

  const todayGrossCollectedAmount = useMemo(
    () => Number(visibleRecentPaymentsSummary.gross_amount || 0),
    [visibleRecentPaymentsSummary.gross_amount]
  );

  const overduePreview = useMemo(() => visibleOverdueRows.slice(0, 6), [visibleOverdueRows]);

  const exportRows = useMemo(
    () =>
      visibleDueTodayRows.map((row) => ({
        id: row.id,
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone ?? "",
        subscription: row.subscription,
        month_no: row.month_no,
        due_date: row.due_date ?? "",
        amount: row.amount,
        balance_amount:
          row.balance_amount ?? row.outstanding_amount ?? row.amount,
        status: row.status,
      })),
    [visibleDueTodayRows]
  );

  const collectionRate = todayGrossCollectedAmount > 0
    ? ((todayCollectedAmount / todayGrossCollectedAmount) * 100).toFixed(1)
    : "0";

  return (
    <PortalPage
      title="Collections Workspace"
      subtitle="Daily collections control center for due-today follow-up, posted payment verification, and overdue preview."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Collections & EMI", href: ROUTES.admin.collections },
        { label: "Collections" },
      ]}
      actions={[
        {
          href: subscriptionFilter
            ? `${ROUTES.admin.payments}?subscription=${subscriptionFilter}`
            : ROUTES.admin.payments,
          label: "Open Payments",
          variant: "primary",
        },
        {
          href: ROUTES.admin.emisOverdue,
          label: "Open Overdue EMI",
          variant: "secondary",
        },
        {
          href: buildAdminReconciliationRoute({ flagged: true }),
          label: "Flagged Reconciliation",
          variant: "ghost",
        },
      ]}
      stats={[]} // We'll replace with our own KPI row
      statusBadge={{
        label: "Daily Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        {/* Top Bar with Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "collections-due-today-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "customer_name", header: "customer_name" },
                    { key: "customer_phone", header: "customer_phone" },
                    { key: "subscription", header: "subscription" },
                    { key: "month_no", header: "month_no" },
                    { key: "due_date", header: "due_date" },
                    { key: "amount", header: "amount" },
                    { key: "balance_amount", header: "balance_amount" },
                    { key: "status", header: "status" },
                  ],
                  exportRows
                )
              }
              disabled={exportRows.length === 0 || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export Due Today
            </button>
          </div>

          {/* Quick stats */}
          <div className="flex gap-4 text-sm">
            <div className="rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className="ml-2 font-semibold text-foreground">
                {collectionRate}%
              </span>
              {Number(collectionRate) > 70 ? (
                <TrendingUp className="ml-1 inline h-3 w-3 text-emerald-600" />
              ) : (
                <TrendingDown className="ml-1 inline h-3 w-3 text-red-600" />
              )}
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Net Collection</span>
              <span className="ml-2 font-semibold text-foreground">
                {money(todayCollectedAmount)}
              </span>
            </div>
          </div>
        </div>

        {loading ? <LoadingBlock label="Loading collections workspace..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load collections workspace"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && (
          <>
            {/* Advanced KPI Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Due Today"
                value={String(visibleDueTodayRows.length)}
                icon={<Clock className="h-4 w-4" />}
                tone="warning"
                href="/admin/collections"
              />
              <KpiCard
                title="Net Collected Today"
                value={money(todayCollectedAmount)}
                icon={<Wallet className="h-4 w-4" />}
                trend={Number(collectionRate) > 70 ? "up" : "down"}
                trendValue={Number(collectionRate) > 70 ? "Above target" : "Below target"}
                tone="success"
                href="/admin/payments"
              />
              <KpiCard
                title="Active Collections Today"
                value={String(visibleRecentPaymentsSummary.active_payments)}
                icon={<BarChart3 className="h-4 w-4" />}
                tone="default"
                href="/admin/payments"
              />
              <KpiCard
                title="Overdue Preview"
                value={String(visibleOverdueRows.length)}
                icon={<AlertCircle className="h-4 w-4" />}
                tone={visibleOverdueRows.length > 0 ? "danger" : "warning"}
                href="/admin/emis/overdue"
              />
            </div>

            <SectionCard
              title="Workspace note"
              description="This page is for today’s collection operations. Use the full overdue page only when you need recovery-focused backlog review."
              actionHref="/admin/emis/overdue"
              actionLabel="View Full Overdue"
            >
              {subscriptionFilter ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <span className="font-medium">Filtered to subscription #{subscriptionFilter}</span>
                  <Link
                    href="/admin/collections"
                    className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-900 transition hover:bg-blue-100"
                  >
                    Clear Filter
                  </Link>
                </div>
              ) : null}

              {subscriptionFilterMessage ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {subscriptionFilterMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/cashier/collect"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Cashier Collect
                </Link>

                <Link
                  href={
                    subscriptionFilter
                      ? `/admin/payments/create?subscription=${subscriptionFilter}`
                      : "/admin/payments/create"
                  }
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Admin Collection
                </Link>
              </div>
            </SectionCard>

            <SectionCard
              title="Due Today Queue"
              description="Pending EMI rows due today for same-day follow-up and collection."
            >
              <DueTodayTable rows={visibleDueTodayRows} />
            </SectionCard>

            <SectionCard
              title="Recent Collections"
              description="Payments posted today for operational verification and quick review. Net collection excludes reversed payments."
            >
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Gross Amount
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {money(visibleRecentPaymentsSummary.gross_amount)}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Reversed Amount
                  </div>
                  <div className="mt-1 text-lg font-semibold text-amber-800">
                    {money(visibleRecentPaymentsSummary.reversed_amount)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Net Collected
                  </div>
                  <div className="mt-1 text-lg font-semibold text-emerald-800">
                    {money(visibleRecentPaymentsSummary.net_collected_amount)}
                  </div>
                </div>
              </div>

              <RecentPaymentsTable rows={visibleRecentPayments} />
            </SectionCard>

            <SectionCard
              title="Overdue Preview"
              description="Preview of overdue pending EMI rows. Open the full overdue page for the full recovery workspace."
              actionHref="/admin/emis/overdue"
              actionLabel="View All Overdue"
            >
              <OverduePreview rows={overduePreview} />
            </SectionCard>
          </>
        )}
      </div>
    </PortalPage>
  );
}
