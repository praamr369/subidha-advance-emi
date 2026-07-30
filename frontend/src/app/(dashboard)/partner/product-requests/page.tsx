"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, Plus, RefreshCw } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  listProductRequests,
  type ProductRequestRecord,
} from "@/services/product-requests";

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(s: string): string {
  if (s === "SUBMITTED") return "Submitted";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function PartnerProductRequestsPage() {
  const [rows, setRows] = useState<ProductRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();

  const appliedSearch = searchParams.get("search") || "";

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const res = await listProductRequests("partner", {
        status: statusFilter || undefined,
        q: appliedSearch || undefined,
        pageSize: 50,
      });
      setRows(Array.isArray(res.results) ? res.results : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
      setRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [statusFilter, appliedSearch]);

  useEffect(() => { void load("initial"); }, [load]);

  const counts = useMemo(() => ({
    submitted: rows.filter((r) => r.status === "SUBMITTED").length,
    approved: rows.filter((r) => r.status === "APPROVED").length,
    rejected: rows.filter((r) => r.status === "REJECTED").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
  }), [rows]);

  const columns = useMemo<Column<ProductRequestRecord>[]>(() => [
    {
      key: "id",
      title: "Customer / Product",
      render: (row) => (
        <div className="space-y-1">
          <div className="font-medium text-foreground">
            {row.customer_name || row.requested_customer_name || "New Customer"}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.customer_phone || row.requested_customer_phone || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "product_name",
      title: "Product / Batch",
      render: (row) => (
        <div className="space-y-1">
          <div className="text-sm text-foreground">{row.product_name || "—"}</div>
          <div className="text-xs text-muted-foreground">{row.batch_code || "No batch"}</div>
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (row) => <ERPStatusBadge status={row.status} />,
    },
    {
      key: "created_at",
      title: "Submitted On",
      render: (row) => fmtDate(row.created_at),
    },
    {
      key: "review_note",
      title: "Admin Note",
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.review_note || "—"}</span>
      ),
    },
  ], []);

  return (
    <ERPPageShell
      eyebrow="Partner Portal"
      title="Product Requests"
      subtitle="Submit new plan requests for your customers and track approval status from admin."
      helperNote="Once admin approves a request, a subscription is created and linked to your partner account."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Product Requests" },
      ]}
      actions={[
        { label: "New Request", href: "/partner/product-requests/create", variant: "primary" },
        { label: "My Subscriptions", href: "/partner/subscriptions", variant: "secondary" },
        { label: "My Customers", href: "/partner/customers", variant: "secondary" },
      ]}
      stats={[
        { label: "Submitted", value: counts.submitted, tone: "default" },
        { label: "Approved", value: counts.approved, tone: "success" },
        { label: "Rejected", value: counts.rejected, tone: counts.rejected > 0 ? "danger" : "default" },
        { label: "Total", value: rows.length },
      ]}
      statusBadge={{ label: "Partner scope", tone: "info" }}
    >
      <div className="space-y-5">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {(["", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                if (s) next.set("status", s); else next.delete("status");
                setStatusFilter(s);
              }}
              className={`h-9 rounded-full border px-4 text-xs font-bold transition ${
                statusFilter === s
                  ? "border-primary/40 bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "" ? "All" : statusLabel(s)}
            </button>
          ))}
          <div className="ml-auto">
            <ActionButton
              variant="outline"
              onClick={() => void load("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </ActionButton>
          </div>
        </div>

        {/* CTA banner when no requests yet */}
        {!loading && !error && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ClipboardList className="size-7" />
            </div>
            <div>
              <div className="text-base font-bold text-foreground">No product requests yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {statusFilter
                  ? `No requests with status "${statusLabel(statusFilter)}".`
                  : "Submit a request to enrol a customer into a Lucky Plan product."}
              </div>
            </div>
            {!statusFilter ? (
              <Link
                href="/partner/product-requests/create"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
              >
                <Plus className="size-4" /> New Product Request
              </Link>
            ) : null}
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}{" "}
            <button type="button" onClick={() => void load("initial")} className="font-semibold underline">
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
            ))}
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {rows.map((row) => {
                const s = row.status || "SUBMITTED";
                const colorCls = STATUS_COLORS[s] ?? "bg-muted text-muted-foreground";
                const hasApprovedSub = row.approved_subscription_number || row.approved_subscription_id;
                return (
                  <div key={row.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                        #{row.id}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground text-sm truncate">
                          {row.customer_name || row.requested_customer_name || "New Customer"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {row.product_name || "—"}
                          {row.batch_code ? ` · ${row.batch_code}` : ""}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${colorCls}`}>
                            {statusLabel(s)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{fmtDate(row.created_at)}</span>
                        </div>
                        {row.review_note ? (
                          <div className="mt-1.5 text-xs text-muted-foreground italic">{row.review_note}</div>
                        ) : null}
                      </div>
                    </div>
                    {hasApprovedSub ? (
                      <div className="flex items-center gap-2 border-t border-border bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5">
                        <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex-1">
                          Approved → {row.approved_subscription_number || `SUB-${row.approved_subscription_id}`}
                        </span>
                        <Link
                          href={`/partner/subscriptions/${row.approved_subscription_id}`}
                          className="text-xs font-bold text-primary flex items-center gap-1"
                        >
                          Open <ChevronRight className="size-3" />
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <DataTableShell>
                <MobileSafeTable className="border-none bg-transparent">
                  <DataTable<ProductRequestRecord>
                    rows={rows}
                    columns={columns}
                    rowActions={(row) => (
                      <div className="flex flex-wrap gap-2">
                        {row.approved_subscription_id ? (
                          <ActionButton
                            href={`/partner/subscriptions/${row.approved_subscription_id}`}
                            variant="outline"
                            className="min-h-11"
                          >
                            View Subscription
                          </ActionButton>
                        ) : null}
                        {row.status === "SUBMITTED" ? (
                          <ActionButton
                            href={`/partner/subscription-requests/create`}
                            variant="ghost"
                            className="min-h-11"
                          >
                            New Request
                          </ActionButton>
                        ) : null}
                      </div>
                    )}
                  />
                </MobileSafeTable>
              </DataTableShell>
            </div>
          </>
        ) : null}

        {/* Always-visible new request button */}
        {!loading && rows.length > 0 ? (
          <div className="pt-2">
            <Link
              href="/partner/subscription-requests/create"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-sm font-bold text-primary transition hover:bg-primary/10 active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Submit a New Subscription Request
            </Link>
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
