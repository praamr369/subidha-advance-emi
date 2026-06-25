"use client";

/**
 * PartyKycPanel
 *
 * CRM party-level KYC cockpit. Resolves a CRM PartyMaster to its linked
 * canonical KYC owner (customer / partner / vendor / staff) via
 * `/admin/crm/parties/{id}/kyc/` and renders that owner's existing KYC review
 * surface by reusing the shared `KycDocumentPanel` (admin mode). It never
 * creates a separate party KYC store and never fabricates an upload for an
 * unconverted lead — those show a controlled conversion-required state instead.
 */

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { getPartyKyc, type PartyKycResponse } from "@/services/kyc";

const OWNER_LABEL: Record<string, string> = {
  customer: "Customer",
  partner: "Partner",
  vendor: "Vendor",
  staff: "Staff",
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load party KYC.";
}

export default function PartyKycPanel({ partyId }: { partyId: number }) {
  const [payload, setPayload] = useState<PartyKycResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!partyId) {
      setError("Party id is invalid.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const next = await getPartyKyc(partyId);
      setPayload(next);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        Loading party KYC…
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="Unable to load party KYC" description={error} onRetry={() => void load()} />
    );
  }

  if (!payload || !payload.kyc_available || !payload.owner_type || !payload.owner_id) {
    return (
      <EmptyState
        title="KYC not yet available for this party"
        description={
          payload?.reason ||
          "KYC is available after this party is converted or linked to a customer, partner, vendor, or staff profile."
        }
      />
    );
  }

  const ownerLabel = OWNER_LABEL[payload.owner_type] ?? payload.owner_type;

  return (
    <div className="space-y-3" data-party-kyc-linked>
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">
          Linked {ownerLabel}: {payload.owner_name || `#${payload.owner_id}`}
        </span>
        {payload.owner_phone ? (
          <span className="ml-2 text-muted-foreground">· {payload.owner_phone}</span>
        ) : null}
        {payload.owner_email ? (
          <span className="ml-2 text-muted-foreground">· {payload.owner_email}</span>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          KYC documents below belong to the linked {ownerLabel.toLowerCase()} profile and are
          reviewed through that owner&apos;s canonical KYC workflow.
        </p>
      </div>
      <KycDocumentPanel
        mode="admin"
        owner={payload.owner_type}
        ownerId={payload.owner_id}
        title={`${ownerLabel} KYC Documents & Review`}
        description={`Review the linked ${ownerLabel.toLowerCase()}'s KYC documents. Approvals, rejections and resubmission requests are recorded in the KYC audit trail.`}
      />
    </div>
  );
}
