"use client";

import { useEffect, useState } from "react";

import {
  fetchContractKycReadiness,
  type ContractKycReadiness,
  type KycRequiredDocument,
  type VaultDocumentItem,
} from "@/services/kyc-readiness";

type Props = {
  customerId: number | null;
  planType: string;
  onReadinessChange?: (readiness: ContractKycReadiness | null) => void;
};

function DocRow({ doc }: { doc: KycRequiredDocument }) {
  const statusClass =
    doc.status === "VERIFIED"
      ? "bg-green-100 text-green-700"
      : doc.status === "PENDING"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`h-3.5 w-3.5 flex-none rounded-full ${doc.present ? "bg-green-500" : "bg-red-400"}`}
        aria-hidden
      />
      <span className={doc.present ? "text-green-800" : "text-red-700"}>
        {doc.label}
        {!doc.required && (
          <span className="ml-1 text-muted-foreground">(optional)</span>
        )}
      </span>
      <span
        className={`ml-auto rounded px-1.5 py-0.5 font-medium ${statusClass}`}
        data-testid="kyc-doc-status"
      >
        {doc.present ? (doc.status || "PRESENT") : "MISSING"}
      </span>
    </div>
  );
}

/** P3A: Vault-enriched document row showing signed/access/expiry metadata. */
function VaultDocRow({ doc }: { doc: VaultDocumentItem }) {
  const statusClass =
    doc.status === "VERIFIED"
      ? "bg-green-100 text-green-700"
      : doc.status === "PRESENT"
        ? "bg-yellow-100 text-yellow-700"
        : doc.status === "REJECTED"
          ? "bg-red-200 text-red-800"
          : doc.status === "EXPIRED"
            ? "bg-orange-100 text-orange-800"
            : doc.status === "NOT_REQUIRED"
              ? "bg-slate-100 text-slate-500"
              : "bg-red-100 text-red-700";

  const isOk = doc.status === "VERIFIED" || doc.status === "NOT_REQUIRED";
  const signedLabel =
    doc.signed_status === "SIGNED"
      ? "Signed"
      : doc.signed_status === "UNSIGNED"
        ? "Unsigned"
        : null;

  const accessLabel =
    doc.access_level === "SENSITIVE"
      ? "Sensitive"
      : doc.access_level === "HIGHLY_SENSITIVE"
        ? "Highly Sensitive"
        : null;

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`h-3.5 w-3.5 flex-none rounded-full ${isOk ? "bg-green-500" : doc.status === "PRESENT" ? "bg-yellow-400" : "bg-red-400"}`}
          aria-hidden
        />
        <span className={isOk ? "text-green-800" : "text-red-700"}>
          {doc.label}
          {!doc.required && (
            <span className="ml-1 text-muted-foreground">(optional)</span>
          )}
        </span>
        <span
          className={`ml-auto rounded px-1.5 py-0.5 font-medium ${statusClass}`}
          data-testid="vault-doc-status"
        >
          {doc.status}
        </span>
      </div>
      {(signedLabel || accessLabel || doc.expires_on) && (
        <div className="ml-5 flex gap-2 text-muted-foreground">
          {signedLabel && <span>{signedLabel}</span>}
          {accessLabel && (
            <span className="text-amber-700">{accessLabel}</span>
          )}
          {doc.expires_on && (
            <span className={doc.status === "EXPIRED" ? "text-orange-700" : ""}>
              Expires {doc.expires_on}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function KycReadinessPanel({
  customerId,
  planType,
  onReadinessChange,
}: Props) {
  const [readiness, setReadiness] = useState<ContractKycReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || !planType) {
      setReadiness(null);
      setError(null);
      onReadinessChange?.(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchContractKycReadiness(customerId, planType)
      .then((data) => {
        if (!cancelled) {
          setReadiness(data);
          onReadinessChange?.(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load KYC readiness"
          );
          setReadiness(null);
          onReadinessChange?.(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, planType]);

  if (!customerId || !planType) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
        Checking KYC readiness...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-medium">KYC readiness check unavailable.</span>{" "}
        {error}
      </div>
    );
  }

  if (!readiness) return null;

  if (readiness.is_direct_sale) {
    return (
      <div
        className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm"
        data-testid="kyc-readiness-panel"
        data-plan-type={planType}
      >
        <div className="font-medium text-green-800">
          KYC optional for direct sale
        </div>
        <div className="mt-1 text-xs text-green-700">
          KYC documents are not required for direct sale contracts.
        </div>
      </div>
    );
  }

  const kycOk = readiness.can_activate;
  const kycStatusLabel = readiness.exception_approved
    ? "Exception Approved"
    : (readiness.kyc_status || "NOT VERIFIED");
  const kycStatusClass =
    readiness.kyc_verified || readiness.exception_approved
      ? "bg-green-100 text-green-700"
      : readiness.kyc_status === "PENDING" || readiness.kyc_status === "SUBMITTED"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";

  return (
    <div
      className={`rounded-xl border px-4 py-4 ${kycOk ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
      data-testid="kyc-readiness-panel"
      data-plan-type={planType}
      data-can-activate={String(kycOk)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className={`text-sm font-semibold ${kycOk ? "text-green-800" : "text-red-800"}`}
          data-testid="kyc-readiness-headline"
        >
          KYC Readiness:{" "}
          {kycOk ? "Ready to activate" : "Required documents missing"}
        </div>
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${kycStatusClass}`}
          data-testid="kyc-status-badge"
        >
          KYC: {kycStatusLabel}
        </span>
      </div>

      {readiness.blocker_messages.length > 0 && (
        <ul
          className="mt-3 space-y-1"
          data-testid="kyc-blocker-messages"
        >
          {readiness.blocker_messages.map((msg, i) => (
            <li key={i} className="text-xs text-red-700">
              {msg}
            </li>
          ))}
        </ul>
      )}

      {readiness.required_documents.length > 0 && (
        <div className="mt-3" data-testid="kyc-document-checklist">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Required documents
          </div>
          <div className="space-y-1.5">
            {readiness.required_documents.map((doc) => (
              <DocRow key={doc.code} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {readiness.missing_documents.length > 0 && !kycOk && (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-white/60 px-3 py-2 text-xs text-red-800"
          data-testid="kyc-missing-summary"
        >
          Missing: {readiness.missing_documents.join(", ")}
        </div>
      )}

      {kycOk && (
        <div className="mt-3 text-xs text-green-700">
          All required documents are present. The contract can be activated.
        </div>
      )}

      {readiness.activation_milestone &&
        readiness.activation_milestone.required_documents.length > 0 && (
          <div
            className="mt-4 border-t border-border/60 pt-3"
            data-testid="handover-milestone"
            data-can-handover={String(
              readiness.activation_milestone.can_reach_active_or_handover
            )}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Handover readiness
              {readiness.activation_milestone.enforced ? "" : " (advisory)"}
            </div>
            <div className="space-y-1.5">
              {readiness.activation_milestone.required_documents.map((doc) => (
                <DocRow key={`ms-${doc.code}`} doc={doc} />
              ))}
            </div>
            {readiness.activation_milestone.blocker_messages.length > 0 && (
              <ul className="mt-2 space-y-1" data-testid="handover-blocker-messages">
                {readiness.activation_milestone.blocker_messages.map((msg, i) => (
                  <li key={i} className="text-xs text-red-700">
                    {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </div>
  );
}

export { VaultDocRow };
