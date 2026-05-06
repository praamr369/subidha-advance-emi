"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { ROUTES } from "@/lib/routes";
import {
  listOutstandings,
  outstandingsExportUrl,
  type OutstandingFilters,
  type OutstandingListResponse,
  type OutstandingOperation,
  type OutstandingRow,
  type OutstandingState,
} from "@/services/outstandings";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

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
        render: (row) => row.contract_reference || row.document_no || `#${row.source_id}`,
      },
      { key: "product_summary", title: "Product" },
      {
        key: "due_date",
        title: "Due Date",
        render: (row) => formatDate(row.due_date),
      },
      {
        key: "outstanding_amount",
        title: "Outstanding",
        render: (row) => money(row.outstanding_amount),
      },
      {
        key: "paid_amount",
        title: "Paid",
        render: (row) => money(row.paid_amount),
      },
      {
        key: "age",
        title: "Age",
        render: (row) => `${row.overdue_days}d`,
      },
      { key: "status", title: "Status" },
      {
        key: "actions",
        title: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            {row.collection_allowed && row.payment_url ? (
              <Link className="text-xs font-medium text-primary hover:underline" href={row.payment_url}>
                Collect Payment
              </Link>
            ) : null}
            {row.customer_url ? (
              <Link className="text-xs text-muted-foreground hover:underline" href={row.customer_url}>
                View Customer
              </Link>
            ) : null}
            {row.detail_url ? (
              <Link className="text-xs text-muted-foreground hover:underline" href={row.detail_url}>
                View Details
              </Link>
            ) : null}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Outstanding Ledger"
      subtitle="Single control center for Advance EMI, Rent, Lease, Direct Sale and invoice dues."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Outstanding Ledger" },
      ]}
      actions={[
        { href: outstandingsExportUrl(filters), label: "Export CSV", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Outstanding" value={money(summary?.total_outstanding_amount)} />
          <StatCard label="Overdue" value={money(summary?.overdue_amount)} tone="warning" />
          <StatCard label="Due Today" value={money(summary?.due_today_amount)} />
          <StatCard label="Advance EMI" value={money(summary?.advance_emi_outstanding)} />
          <StatCard label="Rent / Lease" value={money((Number(summary?.rent_outstanding || 0) + Number(summary?.lease_outstanding || 0)).toFixed(2))} />
          <StatCard label="Direct Sale" value={money(summary?.direct_sale_outstanding)} />
          <StatCard label="30+ Days Risk" value={String(summary?.serious_30_plus_count || 0)} tone="danger" />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <input className="h-10 rounded border px-3 text-sm" placeholder="Search customer/reference/product" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="h-10 rounded border px-3 text-sm" value={operation} onChange={(e) => setOperation(e.target.value as "all" | OutstandingOperation)}>
            <option value="all">All operations</option>
            <option value="advance_emi">Advance EMI</option>
            <option value="rent">Rent</option>
            <option value="lease">Lease</option>
            <option value="direct_sale">Direct Sale</option>
            <option value="billing_invoice">Billing Invoice</option>
          </select>
          <select className="h-10 rounded border px-3 text-sm" value={state} onChange={(e) => setState(e.target.value as OutstandingState)}>
            <option value="all">All states</option>
            <option value="overdue">Overdue</option>
            <option value="due_today">Due today</option>
            <option value="upcoming">Upcoming</option>
            <option value="not_due">Not due</option>
          </select>
          <select className="h-10 rounded border px-3 text-sm" value={ageBucket} onChange={(e) => setAgeBucket(e.target.value)}>
            <option value="all">All age buckets</option>
            <option value="current">Current</option>
            <option value="1_7">1-7</option>
            <option value="8_15">8-15</option>
            <option value="16_30">16-30</option>
            <option value="31_60">31-60</option>
            <option value="60_plus">60+</option>
          </select>
          <input className="h-10 rounded border px-3 text-sm" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="h-10 rounded border px-3 text-sm" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <input className="h-10 rounded border px-3 text-sm" type="number" placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          <input className="h-10 rounded border px-3 text-sm" type="number" placeholder="Max amount" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        </div>

        {loading ? <LoadingBlock label="Loading outstanding ledger..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load outstanding ledger" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title={q || operation !== "all" || state !== "all" ? "No matching rows" : "No outstanding rows"} description="No collectible outstandings are currently available for this filter view." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DataTable rows={rows} columns={columns} emptyText="No outstanding rows." />
        ) : null}
      </div>
    </PortalPage>
  );
}
