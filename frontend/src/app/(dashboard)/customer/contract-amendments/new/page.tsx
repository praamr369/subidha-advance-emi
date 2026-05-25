"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { AMENDMENT_TYPES, createCustomerAmendment, type AmendmentContractType, type AmendmentType } from "@/services/amendments";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";
import type { CustomerSubscription } from "@/services/customer";

type Option = { id: number; label: string; planType: string };

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Requested values must be a JSON object.");
  return parsed as Record<string, unknown>;
}

function optionFromSubscription(row: CustomerSubscription): Option {
  return {
    id: row.id,
    planType: (row.plan_type || "EMI").toUpperCase(),
    label: `${row.subscription_number || `SUB-${row.id}`} · ${row.product_name || "Contract"} · ${(row.plan_type || "EMI").toUpperCase()}`,
  };
}

export default function CustomerAmendmentCreatePage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Option[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [contractType, setContractType] = useState<AmendmentContractType>("EMI_SUBSCRIPTION");
  const [sourceId, setSourceId] = useState("");
  const [amendmentType, setAmendmentType] = useState<AmendmentType>("ADDRESS_CHANGE");
  const [reason, setReason] = useState("");
  const [valuesJson, setValuesJson] = useState("{}\n");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadContracts() {
      setLoadingContracts(true);
      try {
        const payload = await listCustomerSubscriptionsRegister({ pageSize: 100 });
        if (alive) setContracts(payload.results.map(optionFromSubscription).filter((row) => ["EMI", "RENT", "LEASE"].includes(row.planType)));
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load eligible contracts.");
      } finally {
        if (alive) setLoadingContracts(false);
      }
    }
    void loadContracts();
    return () => { alive = false; };
  }, []);

  const eligibleContracts = useMemo(
    () => contracts.filter((row) => contractType === "EMI_SUBSCRIPTION" ? row.planType === "EMI" : row.planType === "RENT" || row.planType === "LEASE"),
    [contracts, contractType]
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const id = Number(sourceId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Select a source contract.");
      if (!reason.trim()) throw new Error("Reason is required.");
      const created = await createCustomerAmendment({
        contract_type: contractType,
        subscription: contractType === "EMI_SUBSCRIPTION" ? id : null,
        rent_lease_contract: contractType === "RENT_LEASE" ? id : null,
        amendment_type: amendmentType,
        requested_values: parseJsonObject(valuesJson),
        reason: reason.trim(),
        metadata: { ui_phase: "PHASE_2_REQUEST_ONLY" },
      });
      router.push(`/customer/contract-amendments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit amendment request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell eyebrow="Customer amendment" title="New amendment request" subtitle="Submit a request for admin review. This page does not change your contract." breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Contract Amendments", href: "/customer/contract-amendments" }, { label: "New" }]} statusBadge={{ label: "Request only", tone: "warning" }}>
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {error ? <ERPErrorState title="Unable to submit request" description={error} /> : null}
        <DetailPanel title="Request details" description="Select one of your eligible EMI or rent/lease contracts and describe the requested change.">
          {loadingContracts ? <ERPLoadingState label="Loading eligible contracts..." /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Contract type
              <select className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" value={contractType} onChange={(event) => { setContractType(event.target.value as AmendmentContractType); setSourceId(""); }}>
                <option value="EMI_SUBSCRIPTION">EMI Subscription</option>
                <option value="RENT_LEASE">Rent / Lease</option>
              </select>
            </label>
            <label className="text-sm font-medium">Source contract
              <select className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">Select contract</option>
                {eligibleContracts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Amendment type
              <select className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" value={amendmentType} onChange={(event) => setAmendmentType(event.target.value as AmendmentType)}>
                {AMENDMENT_TYPES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Reason
              <input className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this amendment required?" />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium">Requested values JSON
            <textarea className="mt-2 min-h-40 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm" value={valuesJson} onChange={(event) => setValuesJson(event.target.value)} />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton onClick={() => void submit()} disabled={submitting}>{submitting ? "Submitting..." : "Submit request"}</ActionButton>
            <ActionButton href="/customer/contract-amendments" variant="outline">Cancel</ActionButton>
          </div>
        </DetailPanel>
      </div>
    </ERPPageShell>
  );
}
