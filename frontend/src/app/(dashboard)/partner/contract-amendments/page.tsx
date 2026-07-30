"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, RefreshCw, FileText } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listPartnerAmendments,
  type AmendmentRecord,
} from "@/services/amendments";

export default function PartnerAmendmentsPage() {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      setRows(await listPartnerAmendments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment requests.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    void load("initial");
  }, []);

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Amendments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer amendment requests
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/partner/contract-amendments/new"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition active:scale-95"
          >
            New
          </Link>
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={refreshing}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <AmendmentSafetyNotice />

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingBlock label="Loading amendments..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void load("initial")} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No amendments"
            description="You have no amendment requests."
          />
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/partner/contract-amendments/${row.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-foreground truncate">{row.amendment_no || `AMD-${row.id}`}</div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.customer_name || "Customer"} · {amendmentContractTypeLabel(row.contract_type)}</div>
                <div className="mt-1 text-xs text-muted-foreground truncate">{amendmentTypeLabel(row.amendment_type)} · {row.reason}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status || "PENDING"} />
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
