"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import {
  AMENDMENT_TYPES,
  createAdminAmendment,
  type AmendmentContractType,
  type AmendmentRequesterRole,
  type AmendmentType,
} from "@/services/amendments";

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Requested values must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export default function AdminContractAmendmentCreatePage() {
  const router = useRouter();
  const [contractType, setContractType] = useState<AmendmentContractType>("EMI_SUBSCRIPTION");
  const [requestedRole, setRequestedRole] = useState<AmendmentRequesterRole>("CUSTOMER");
  const [sourceId, setSourceId] = useState("");
  const [amendmentType, setAmendmentType] = useState<AmendmentType>("ADDRESS_CHANGE");
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [valuesJson, setValuesJson] = useState("{}\n");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const id = Number(sourceId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter a valid source contract/subscription ID.");
      if (!reason.trim()) throw new Error("Reason is required.");
      const created = await createAdminAmendment({
        contract_type: contractType,
        subscription: contractType === "EMI_SUBSCRIPTION" ? id : null,
        rent_lease_contract: contractType === "RENT_LEASE" ? id : null,
        amendment_type: amendmentType,
        requested_values: parseJsonObject(valuesJson),
        reason: reason.trim(),
        requested_role: requestedRole,
        admin_note: adminNote.trim(),
        metadata: { ui_phase: "PHASE_10A_ADMIN_CREATE", source_record_mutation: false },
      });
      router.push(`/admin/contract-amendments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create amendment request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Admin amendments"
      title="Create amendment"
      subtitle="Create an auditable amendment request on behalf of a customer or partner. This does not mutate the source contract."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Contract Amendments", href: "/admin/contract-amendments" },
        { label: "New" },
      ]}
      statusBadge={{ label: "Request only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {error ? <ERPErrorState title="Unable to create amendment" description={error} /> : null}
        <DetailPanel
          title="Admin-side request"
          description="Use an existing EMI subscription ID or rent/lease contract ID. Backend validation verifies the source contract and customer/partner linkage."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Requested by role
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={requestedRole}
                onChange={(event) => setRequestedRole(event.target.value as AmendmentRequesterRole)}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="PARTNER">Partner</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Contract type
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={contractType}
                onChange={(event) => {
                  setContractType(event.target.value as AmendmentContractType);
                  setSourceId("");
                }}
              >
                <option value="EMI_SUBSCRIPTION">EMI Subscription</option>
                <option value="RENT_LEASE">Rent / Lease</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              {contractType === "EMI_SUBSCRIPTION" ? "Subscription ID" : "Rent / lease contract ID"}
              <input
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                inputMode="numeric"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                placeholder="Existing source record ID"
              />
            </label>
            <label className="text-sm font-medium">
              Amendment type
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={amendmentType}
                onChange={(event) => setAmendmentType(event.target.value as AmendmentType)}
              >
                {AMENDMENT_TYPES.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Reason
              <input
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this amendment required?"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Requested values JSON
            <textarea
              className="mt-2 min-h-40 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm"
              value={valuesJson}
              onChange={(event) => setValuesJson(event.target.value)}
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Admin note
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              placeholder="Optional internal review note"
            />
          </label>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            No generic apply path is created here. Preview-only workflows remain preview-only, and product recontract execution remains evidence-gated.
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Creating..." : "Create amendment"}
            </ActionButton>
            <ActionButton href="/admin/contract-amendments" variant="outline">
              Cancel
            </ActionButton>
          </div>
        </DetailPanel>
      </div>
    </ERPPageShell>
  );
}
