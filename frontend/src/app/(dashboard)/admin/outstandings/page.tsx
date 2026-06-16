"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, DetailPanel } from "@/components/ui/operations";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  listOutstandings,
  outstandingsExportUrl,
  type OutstandingFilters,
  type OutstandingListResponse,
  type OutstandingOperation,
  type OutstandingRow,
  type OutstandingState,
} from "@/services/outstandings";


function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN");
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load outstandings.";
}

export default function AdminOutstandingsPage() {
  const [payload, setPayload] = useState<OutstandingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [operation, setOperation] = useState<"all" | OutstandingOperation>("all");
  const [state, setState] = useState<OutstandingState>("all");
  const [ageBucket, setAgeBucket] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const filters = useMemo<OutstandingFilters>(
    () => ({
      q,
      operation,
      state,
      age_bucket: ageBucket as OutstandingFilters["age_bucket"],
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      min_amount: minAmount || undefined,
      max_amount: maxAmount || undefined,
      page_size: 100,
    }),
    [q, operation, state, ageBucket, fromDate, toDate, minAmount, maxAmount]
  );

  useEffect(() => {
    let active = true;
    // Avoid sync state updates in effect body (eslint react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void listOutstandings(filters)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(toMessage(err));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  const rows = payload?.results ?? [];
  const summary = payload?.summary;

  const columns = useMemo<Column<OutstandingRow>[]>(
    () => [
      {
        key: "customer",
        title: "Customer",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium">{row.customer_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.customer_phone || "—"}</div>
          </div>
        ),
      },
      { key: "operation_type", title: "Operation" },
      {
        key: "reference",
        title: "Reference",
        render: (row) => row.contract_reference || row.document_no || "Reference unavailable",
      },
      { key: "product_summary", title: "Product" },
      {
        key: "due_date",
        title: "Due Date",
        render: (row) => formatDate(row.due_date),
      },
      {
        key: "outstanding_amount",
        title: "Amount Due",
        render: (row) => (
          <div className="space-y-1 text-right">
            <div className="font-semibold">{formatRupee(row.outstanding_amount)}</div>
            <div className="text-xs text-muted-foreground">Paid: {formatRupee(row.paid_amount)}</div>
          </div>
        ),
      },
      {
        key: "age",
        title: "Overdue Age",
        render: (row) => (
          <span className={row.overdue_days > 30 ? "font-semibold text-red-700" : "text-foreground"}>
            {row.overdue_days}d
          </span>
        ),
      },
      {
        key: "status",
        title: "Due Status",
        render: (row) => <StatusBadge status={row.status} hideIcon />,
      },
      {
        key: "actions",
        title: "Collection Action",
        render: (row) => (
          <div className="flex flex-col gap-1.5">
            {row.collection_allowed && row.payment_url ? (
              <Link
                className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                href={row.payment_url}
              >
                Open Collection Workspace
              </Link>
            ) : null}
            {row.customer_url ? (
              <Link className="text-xs text-muted-foreground hover:underline" href={row.customer_url}>
                View Customer Profile
              </Link>
            ) : null}
            {row.detail_url ? (
              <Link className="text-xs text-muted-foreground hover:underline" href={row.detail_url}>
                View Contract
              </Link>
            ) : null}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <ERPPageShell
      eyebrow="Finance Operations"
      title="Outstandings Register"
      subtitle="Finance source workflow — Outstandings. Amount due posture across Advance EMI, Rent, Lease, Direct Sale, and invoice obligations."
      helperNote="This page shows amount due and overdue posture only. Collection action (cash/UPI/bank posting and receipt) belongs to Collections & Cashier. Receipt status and accounting bridge posting belong to Accounting & Reconciliation. No collection or posting happens from this page — the Collection Workspace link navigates there."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Outstandings" },
      ]}
      actions={[
        { href: ROUTES.admin.financeCollect, label: "Collection Workspace", variant: "primary" },
        { href: outstandingsExportUrl(filters), label: "Export CSV", variant: "secondary" },
        { href: ROUTES.admin.financeOutstandings, label: "Finance alias", variant: "secondary" },
        { href: ROUTES.admin.reconciliation, label: "Reconciliation (Accounting)", variant: "secondary" },
      ]}
      statusBadge={{ label: "Finance Operations Source", tone: "info" }}
      stats={[
        { label: "Total Outstanding", value: formatRupee(summary?.total_outstanding_amount), tone: "info" },
        { label: "Overdue", value: formatRupee(summary?.overdue_amount), tone: "warning" },
        { label: "Due Today", value: formatRupee(summary?.due_today_amount) },
        { label: "30+ Day Risk", value: String(summary?.serious_30_plus_count || 0), tone: (summary?.serious_30_plus_count ?? 0) > 0 ? "danger" : "default" },
      ]}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Amount due — by operation type"
          description="Amount due is derived from the contract source record. Collection, receipt, and accounting bridge status each belong to their respective modules."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Advance EMI due</div>
              <div className="text-lg font-semibold text-foreground">{formatRupee(summary?.advance_emi_outstanding)}</div>
              <div className="text-xs text-muted-foreground">Lucky Plan EMI outstanding</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rent due</div>
              <div className="text-lg font-semibold text-foreground">{formatRupee(summary?.rent_outstanding)}</div>
              <div className="text-xs text-muted-foreground">Rent contract monthly demand</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lease due</div>
              <div className="text-lg font-semibold text-foreground">{formatRupee(summary?.lease_outstanding)}</div>
              <div className="text-xs text-muted-foreground">Lease contract monthly demand</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Direct Sale due</div>
              <div className="text-lg font-semibold text-foreground">{formatRupee(summary?.direct_sale_outstanding)}</div>
              <div className="text-xs text-muted-foreground">Direct sale invoice balance</div>
            </div>
            <div className="rounded-xl border border-border bg-amber-50 border-amber-200 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-amber-700 uppercase tracking-wide">Overdue</div>
              <div className="text-lg font-semibold text-amber-900">{formatRupee(summary?.overdue_amount)}</div>
              <div className="text-xs text-amber-700">Past due date — action required</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-red-700 uppercase tracking-wide">30+ Day risk</div>
              <div className="text-lg font-semibold text-red-900">{summary?.serious_30_plus_count ?? 0} rows</div>
              <div className="text-xs text-red-700">Serious overdue — escalate to Collections & Cashier</div>
            </div>
          </div>
        </ERPSectionShell>

        <DetailPanel
          title="Module boundary — what this page does and does not do"
          description="Outstandings is a Finance Operations source page. Each downstream action belongs to the correct module."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="font-semibold text-foreground">Amount due</div>
              <div className="text-xs text-muted-foreground">Shown here — Finance Operations source record</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="font-semibold text-foreground">Collection action</div>
              <div className="text-xs text-muted-foreground">
                <Link href={ROUTES.admin.financeCollect} className="text-primary hover:underline">Collection Workspace</Link>
                {" "}— Collections & Cashier
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="font-semibold text-foreground">Receipt status</div>
              <div className="text-xs text-muted-foreground">
                Tracked in Collections & Cashier — not shown on this page
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="font-semibold text-foreground">Accounting bridge & reconciliation</div>
              <div className="text-xs text-muted-foreground">
                <Link href={ROUTES.admin.reconciliation} className="text-primary hover:underline">Accounting & Reconciliation</Link>
                {" "}— separate module
              </div>
            </div>
          </div>
        </DetailPanel>

        <DetailPanel
          title="Filters"
          description="Filter the outstanding register by customer, operation type, due state, age bucket, and amount range."
        >
          <div className="grid gap-3 md:grid-cols-4">
            <input
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="Search customer / reference / product"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              title="Operation type filter"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              value={operation}
              onChange={(e) => setOperation(e.target.value as "all" | OutstandingOperation)}
            >
              <option value="all">All operations</option>
              <option value="advance_emi">Advance EMI</option>
              <option value="rent">Rent</option>
              <option value="lease">Lease</option>
              <option value="direct_sale">Direct Sale</option>
              <option value="billing_invoice">Billing Invoice</option>
            </select>
            <select
              title="Due state filter"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              value={state}
              onChange={(e) => setState(e.target.value as OutstandingState)}
            >
              <option value="all">All states</option>
              <option value="overdue">Overdue</option>
              <option value="due_today">Due today</option>
              <option value="upcoming">Upcoming</option>
              <option value="not_due">Not due</option>
            </select>
            <select
              title="Age bucket filter"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              value={ageBucket}
              onChange={(e) => setAgeBucket(e.target.value)}
            >
              <option value="all">All age buckets</option>
              <option value="current">Current</option>
              <option value="1_7">1–7 days</option>
              <option value="8_15">8–15 days</option>
              <option value="16_30">16–30 days</option>
              <option value="31_60">31–60 days</option>
              <option value="60_plus">60+ days</option>
            </select>
            <input
              title="From date"
              placeholder="From date"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <input
              title="To date"
              placeholder="To date"
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            <input
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              type="number"
              placeholder="Min amount"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
            <input
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              type="number"
              placeholder="Max amount"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
        </DetailPanel>

        {loading ? <ERPLoadingState label="Loading outstanding ledger..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load outstanding ledger" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title={q || operation !== "all" || state !== "all" ? "No matching rows" : "No outstanding rows"}
            description="No outstanding records matched the current filter set. Outstanding rows appear here when contract demands become due."
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <ERPSectionShell
            title="Outstanding rows"
            description="Each row shows amount due. Use the Collection Workspace link to post a collection through Collections & Cashier."
          >
            <DataTableShell>
              <DataTable rows={rows} columns={columns} emptyText="No outstanding rows." />
            </DataTableShell>
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
