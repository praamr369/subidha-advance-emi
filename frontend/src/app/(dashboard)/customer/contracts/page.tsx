"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";
import type { CustomerSubscription } from "@/services/customer";

const PAGE_SIZE = 50;


function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Failed to load contracts.";
}

function statusTone(status: string): string {
  const s = (status || "").toUpperCase();
  if (["ACTIVE", "COMPLETED", "HANDED_OVER"].includes(s))
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (["APPROVED", "DELIVERED"].includes(s))
    return "bg-blue-100 text-blue-800 border-blue-200";
  if (["CANCELLED", "DEFAULTED"].includes(s))
    return "bg-red-100 text-red-800 border-red-200";
  if (["DRAFT", "REQUESTED", "PENDING_APPROVAL"].includes(s))
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (["RETURNED", "CLOSED"].includes(s))
    return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {status}
    </span>
  );
}

function PlanTypeBadge({ planType }: { planType: string }) {
  const pt = (planType || "").toUpperCase();
  const style =
    pt === "EMI"
      ? "bg-purple-100 text-purple-800 border-purple-200"
      : pt === "RENT"
        ? "bg-sky-100 text-sky-800 border-sky-200"
        : pt === "LEASE"
          ? "bg-indigo-100 text-indigo-800 border-indigo-200"
          : "bg-slate-100 text-slate-700 border-slate-200";
  const label =
    pt === "EMI" ? "Advance EMI" : pt === "RENT" ? "Rent" : pt === "LEASE" ? "Lease" : pt;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

function ContractCard({ sub }: { sub: CustomerSubscription }) {
  const planType = (sub.plan_type ?? "").toUpperCase();
  const isEmi = planType === "EMI";
  const isRentOrLease = planType === "RENT" || planType === "LEASE";

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {sub.product_name || `Product #${sub.product}`}
            </span>
            <PlanTypeBadge planType={sub.plan_type ?? ""} />
            <StatusBadge status={sub.status ?? "—"} />
          </div>

          {sub.subscription_number && (
            <div className="text-xs font-mono text-muted-foreground">
              {sub.subscription_number}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Tenure: {sub.tenure_months ? `${sub.tenure_months} months` : "—"}</span>
            <span>Start: {formatDate(sub.start_date)}</span>
            <span>Monthly: {formatRupee(sub.monthly_amount)}</span>
            <span>Total: {formatRupee(sub.total_amount)}</span>
          </div>

          {isEmi && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {sub.batch_code && <span>Batch: {sub.batch_code}</span>}
              {sub.lucky_number != null && (
                <span>Lucky ID: #{String(sub.lucky_number).padStart(2, "0")}</span>
              )}
              {sub.winner_month != null && (
                <span className="font-medium text-emerald-700">
                  Winner — Month {sub.winner_month}
                </span>
              )}
              {Number(sub.waived_amount ?? 0) > 0 && (
                <span className="text-emerald-700">
                  Waived: {formatRupee(sub.waived_amount)}
                </span>
              )}
            </div>
          )}

          {isRentOrLease && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {sub.next_due_date && (
                <span>Next due: {formatDate(sub.next_due_date)}</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Paid: {formatRupee(sub.total_paid_amount)}</span>
            {Number(sub.outstanding_amount ?? 0) > 0 && (
              <span className="text-amber-700">
                Outstanding: {formatRupee(sub.outstanding_amount)}
              </span>
            )}
            {sub.delivery_status && (
              <span>Delivery: {sub.delivery_status}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/customer/subscriptions/${sub.id}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            View Detail
          </Link>
          {planType === "RENT" ? (
            <a
              href={`/api/v1/customer/rent-contracts/${sub.id}/pdf/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              Contract PDF
            </a>
          ) : null}
          {planType === "LEASE" ? (
            <a
              href={`/api/v1/customer/lease-contracts/${sub.id}/pdf/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              Contract PDF
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function CustomerContractsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCustomerSubscriptionsRegister({ page: 1, pageSize: PAGE_SIZE });
      const rows = Array.isArray(result)
        ? (result as CustomerSubscription[])
        : (result as { results: CustomerSubscription[] }).results ?? [];
      setSubscriptions(rows);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const emi: CustomerSubscription[] = [];
    const rent: CustomerSubscription[] = [];
    const lease: CustomerSubscription[] = [];
    const other: CustomerSubscription[] = [];

    for (const sub of subscriptions) {
      const pt = (sub.plan_type ?? "").toUpperCase();
      if (pt === "EMI") emi.push(sub);
      else if (pt === "RENT") rent.push(sub);
      else if (pt === "LEASE") lease.push(sub);
      else other.push(sub);
    }

    return { emi, rent, lease, other };
  }, [subscriptions]);

  const activeCount = useMemo(
    () => subscriptions.filter((s) => ["ACTIVE", "HANDED_OVER"].includes((s.status ?? "").toUpperCase())).length,
    [subscriptions]
  );

  return (
    <ERPPageShell
      title="My Contracts"
      subtitle="Overview of all Advance EMI, Rent, and Lease contracts linked to your account."
      breadcrumbs={[
        { label: "Dashboard", href: "/customer" },
        { label: "Contracts" },
      ]}
      actions={[
        { href: "/customer/subscriptions", label: "All Subscriptions", variant: "secondary" },
        { href: "/customer/payments", label: "Payments", variant: "ghost" },
      ]}
      stats={[
        { label: "Total Contracts", value: String(subscriptions.length) },
        { label: "Active", value: String(activeCount), tone: activeCount > 0 ? "success" : "default" },
        { label: "Advance EMI", value: String(grouped.emi.length), tone: "info" },
        { label: "Rent / Lease", value: String(grouped.rent.length + grouped.lease.length) },
      ]}
      statusBadge={{ label: "My Contracts", tone: "info" }}
    >
      <div className="space-y-8">
        {loading && <ERPLoadingState label="Loading your contracts..." />}

        {!loading && error && (
          <ERPErrorState
            title="Unable to load contracts"
            description={error}
            onRetry={() => void load()}
          />
        )}

        {!loading && !error && subscriptions.length === 0 && (
          <ERPEmptyState
            title="No contracts found"
            description="You don't have any Advance EMI, Rent, or Lease contracts yet. Contact the store to set one up."
          />
        )}

        {!loading && !error && grouped.emi.length > 0 && (
          <WorkspaceSection
            title="Advance EMI Contracts"
            description="15-month Lucky Plan subscriptions. Each contract is linked to a batch and lucky ID."
          >
            <div className="grid gap-3">
              {grouped.emi.map((sub) => (
                <ContractCard key={sub.id} sub={sub} />
              ))}
            </div>
          </WorkspaceSection>
        )}

        {!loading && !error && grouped.rent.length > 0 && (
          <WorkspaceSection
            title="Rent Contracts"
            description="Short-term product rental contracts with security deposit and return tracking."
          >
            <div className="grid gap-3">
              {grouped.rent.map((sub) => (
                <ContractCard key={sub.id} sub={sub} />
              ))}
            </div>
          </WorkspaceSection>
        )}

        {!loading && !error && grouped.lease.length > 0 && (
          <WorkspaceSection
            title="Lease Contracts"
            description="Structured lease contracts with possession tracking and deposit management."
          >
            <div className="grid gap-3">
              {grouped.lease.map((sub) => (
                <ContractCard key={sub.id} sub={sub} />
              ))}
            </div>
          </WorkspaceSection>
        )}

        {!loading && !error && grouped.other.length > 0 && (
          <WorkspaceSection
            title="Other Contracts"
            description="Additional contracts not classified as EMI, Rent, or Lease."
          >
            <div className="grid gap-3">
              {grouped.other.map((sub) => (
                <ContractCard key={sub.id} sub={sub} />
              ))}
            </div>
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
