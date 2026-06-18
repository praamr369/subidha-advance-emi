"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchDocumentReadiness,
  type DocumentReadiness,
  type VaultDocumentItem,
} from "@/services/kyc-readiness";

type Props = {
  subscriptionId: number;
};

const STATUS_CLASSES: Record<string, string> = {
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PRESENT: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-red-300 bg-red-50 text-red-800",
  EXPIRED: "border-orange-200 bg-orange-50 text-orange-800",
  NOT_REQUIRED: "border-border bg-muted text-muted-foreground",
  MISSING: "border-red-200 bg-red-50 text-red-700",
};

function statusClasses(status: string): string {
  return STATUS_CLASSES[status] ?? "border-border bg-muted text-foreground";
}

function VaultDocumentRow({ doc }: { doc: VaultDocumentItem }) {
  const isOk = doc.status === "VERIFIED" || doc.status === "NOT_REQUIRED";
  const dotColor =
    doc.status === "VERIFIED"
      ? "bg-emerald-500"
      : doc.status === "NOT_REQUIRED"
        ? "bg-border"
        : doc.status === "PRESENT"
          ? "bg-amber-400"
          : "bg-red-400";

  return (
    <div
      className="rounded-xl border border-border bg-background px-4 py-3"
      data-testid="document-readiness-row"
      data-status={doc.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`mt-0.5 h-3 w-3 flex-none rounded-full ${dotColor}`} aria-hidden />
          <span className={`text-sm font-medium ${isOk ? "text-foreground" : "text-foreground"}`}>
            {doc.label}
            {!doc.required && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </span>
        </div>
        <span
          className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${statusClasses(doc.status)}`}
        >
          {doc.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 pl-5 text-xs text-muted-foreground">
        {doc.signed_status !== "NOT_REQUIRED" && doc.signed_status !== "UNKNOWN" && (
          <span
            className={
              doc.signed_status === "SIGNED" ? "text-emerald-700" : "text-amber-700"
            }
          >
            {doc.signed_status === "SIGNED" ? "Signed" : "Unsigned"}
          </span>
        )}
        {doc.access_level === "SENSITIVE" && (
          <span className="text-amber-700">Sensitive</span>
        )}
        {doc.access_level === "HIGHLY_SENSITIVE" && (
          <span className="text-red-700">Highly Sensitive</span>
        )}
        {doc.expires_on && (
          <span className={doc.status === "EXPIRED" ? "text-orange-700" : ""}>
            Expires {doc.expires_on}
          </span>
        )}
        {doc.blocker_code && (
          <span className="font-medium text-red-700">Blocker: {doc.blocker_code}</span>
        )}
      </div>
    </div>
  );
}

export function DocumentReadinessPanel({ subscriptionId }: Props) {
  const [data, setData] = useState<DocumentReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDocumentReadiness(subscriptionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document readiness.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="document-readiness-loading"
      >
        Checking document readiness...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        data-testid="document-readiness-error"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Document readiness unavailable: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.required_documents.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        data-testid="document-readiness-empty"
      >
        {data?.is_direct_sale
          ? "KYC documents are not required for direct sale contracts."
          : "No required documents returned for this subscription."}
      </div>
    );
  }

  const blockerCodes = data.overall.blocker_codes;
  const isReady = data.overall.ready;

  return (
    <div
      className={`rounded-2xl border p-5 ${isReady ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/50"}`}
      data-testid="document-readiness-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Document Vault Readiness
          </div>
          <div className={`mt-2 text-sm font-semibold ${isReady ? "text-emerald-800" : "text-red-800"}`}>
            {isReady ? "All required documents present" : "Required documents missing or blocked"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Plan: {data.plan_type}
          </div>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${isReady ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-red-200 bg-red-100 text-red-800"}`}
        >
          {isReady ? "READY" : "BLOCKED"}
        </span>
      </div>

      {blockerCodes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="document-readiness-blockers">
          {blockerCodes.map((code) => (
            <span
              key={code}
              className="inline-flex rounded border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"
            >
              {code}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2" data-testid="document-readiness-list">
        {data.required_documents.map((doc) => (
          <VaultDocumentRow key={doc.document_key} doc={doc} />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        Read-only. Upload, verify, and reject actions are not available from this panel.
      </div>
    </div>
  );
}
