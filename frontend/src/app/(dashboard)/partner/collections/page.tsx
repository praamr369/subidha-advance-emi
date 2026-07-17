"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Briefcase, Plus } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import { formatRupee } from "@/lib/utils/currency";
import { getPartnerDashboard } from "@/services/partner";

type DashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;

type CollectionRequestRow = {
  id: string;
  subscription_id?: number;
  subscription_code: string;
  customer_name: string;
  amount: string;
  method: string;
  payment_date: string;
  submitted_at: string;
  status: string;
  reference_no: string;
  review_note: string;
};

type VerifiedPaymentRow = {
  id: string;
  subscription_id?: number;
  subscription_code: string;
  customer_name: string;
  amount: string;
  method: string;
  payment_date: string;
  verified_at: string;
  reference_no: string;
};

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner collection workspace.";
}

function normalizeCollectionRequestRow(
  item: Record<string, unknown>
): CollectionRequestRow {
  const subscriptionId =
    toNumber(item.subscription_id) ?? toNumber(item.subscription) ?? undefined;

  return {
    id: String(item.id ?? ""),
    subscription_id: subscriptionId,
    subscription_code:
      toText(item.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : "—"),
    customer_name: toText(item.customer_name, "Unknown customer"),
    amount: String(item.amount ?? "0"),
    method: toText(item.method, "—"),
    payment_date: toText(item.payment_date),
    submitted_at: toText(item.submitted_at) || toText(item.created_at),
    status: toText(item.status, "SUBMITTED"),
    reference_no: toText(item.reference_no, "—"),
    review_note: toText(item.review_note, ""),
  };
}

function normalizeVerifiedPaymentRow(
  item: Record<string, unknown>
): VerifiedPaymentRow {
  const subscriptionId =
    toNumber(item.subscription_id) ?? toNumber(item.subscription) ?? undefined;

  return {
    id: String(item.id ?? ""),
    subscription_id: subscriptionId,
    subscription_code:
      toText(item.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : "—"),
    customer_name: toText(item.customer_name, "Unknown customer"),
    amount: String(item.amount ?? "0"),
    method: toText(item.method, "—"),
    payment_date: toText(item.payment_date),
    verified_at: toText(item.verified_at) || toText(item.created_at),
    reference_no: toText(item.reference_no, "—"),
  };
}

export default function PartnerCollectionsPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getPartnerDashboard();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const dynamicCollectionsData = useMemo(() => {
    const root = (data ?? {}) as Record<string, unknown>;

    const recentCollectionRequests = asArray(root.recent_collection_requests).map(
      normalizeCollectionRequestRow
    );

    const recentVerifiedPayments = asArray(root.recent_verified_payments).map(
      normalizeVerifiedPaymentRow
    );

    const followUpQueue = asArray(root.follow_up_queue).map(
      normalizeCollectionRequestRow
    );

    return {
      recentCollectionRequests,
      recentVerifiedPayments,
      followUpQueue,
    };
  }, [data]);

  const requests = dynamicCollectionsData.recentCollectionRequests;
  const verifiedPayments = dynamicCollectionsData.recentVerifiedPayments;
  const followUpQueue = dynamicCollectionsData.followUpQueue;

  const totalItems = requests.length + verifiedPayments.length + followUpQueue.length;

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage field collections & payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/partner/collections/create"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition active:scale-95"
          >
            <Plus className="size-5" />
          </Link>
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Briefcase className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{totalItems}</div>
          <div className="text-xs font-medium text-muted-foreground">Recent Activities</div>
        </div>
      </div>

      {/* Lists */}
      <div className="space-y-6">
        {loading ? (
          <LoadingBlock label="Loading collections..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadPage("initial")} />
        ) : totalItems === 0 ? (
          <EmptyState
            title="No collections found"
            description="You have no recent collection requests or payments."
          />
        ) : (
          <>
            {followUpQueue.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Needs Action</h2>
                {followUpQueue.map((row) => (
                  <Link
                    key={row.id}
                    href={`/partner/collections/${row.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 p-4 shadow-sm transition active:scale-95"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-foreground truncate">{row.customer_name}</div>
                        <div className="font-bold text-foreground">{formatRupee(row.amount)}</div>
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.subscription_code} · {row.method}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} />
                        {row.review_note && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold truncate">
                            {row.review_note}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            )}

            {requests.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Recent Requests</h2>
                {requests.map((row) => (
                  <Link
                    key={row.id}
                    href={`/partner/collections/${row.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-foreground truncate">{row.customer_name}</div>
                        <div className="font-bold text-foreground">{formatRupee(row.amount)}</div>
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.subscription_code} · {row.method}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {formatDate(row.payment_date)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            )}

            {verifiedPayments.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Verified Payments</h2>
                {verifiedPayments.map((row) => (
                  <Link
                    key={row.id}
                    href={row.subscription_id ? `/partner/payments?subscription=${row.subscription_id}` : "/partner/payments"}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-foreground truncate">{row.customer_name}</div>
                        <div className="font-bold text-green-600 dark:text-green-500">{formatRupee(row.amount)}</div>
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.subscription_code} · {row.method}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status="VERIFIED" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {formatDate(row.payment_date)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
