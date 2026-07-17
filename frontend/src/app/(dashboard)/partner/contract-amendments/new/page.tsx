"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import AmendmentValueFields from "@/components/amendments/AmendmentValueFields";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { buildRequestedValues, validateRequestedValues } from "@/services/amendment-fields";
import { AMENDMENT_TYPES, createPartnerAmendment, type AmendmentContractType, type AmendmentType } from "@/services/amendments";
import { listPartnerSubscriptionsRegister } from "@/services/partner/registers";
import type { PartnerSubscription } from "@/services/partner";

type Option = { id: number; label: string; planType: string };

function optionFromSubscription(row: PartnerSubscription): Option {
  return {
    id: row.id,
    planType: (row.plan_type || "EMI").toUpperCase(),
    label: `${row.subscription_number || `SUB-${row.id}`} · ${row.customer_name || "Customer"} · ${row.product_name || "Contract"} · ${(row.plan_type || "EMI").toUpperCase()}`,
  };
}

export default function PartnerAmendmentCreatePage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Option[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [contractType, setContractType] = useState<AmendmentContractType>("EMI_SUBSCRIPTION");
  const [sourceId, setSourceId] = useState("");
  const [amendmentType, setAmendmentType] = useState<AmendmentType>("ADDRESS_CHANGE");
  const [reason, setReason] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadContracts() {
      setLoadingContracts(true);
      try {
        const payload = await listPartnerSubscriptionsRegister({ pageSize: 100 });
        if (alive) setContracts(payload.results.map(optionFromSubscription).filter((row) => ["EMI", "RENT", "LEASE"].includes(row.planType)));
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load linked contracts.");
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
      if (!Number.isFinite(id) || id <= 0) throw new Error("Select a linked source contract.");
      if (!reason.trim()) throw new Error("Reason is required.");
      const fieldError = validateRequestedValues(amendmentType, fieldValues);
      if (fieldError) throw new Error(fieldError);
      const created = await createPartnerAmendment({
        contract_type: contractType,
        subscription: contractType === "EMI_SUBSCRIPTION" ? id : null,
        rent_lease_contract: contractType === "RENT_LEASE" ? id : null,
        amendment_type: amendmentType,
        requested_values: buildRequestedValues(amendmentType, fieldValues),
        reason: reason.trim(),
        metadata: { ui_phase: "PHASE_2_REQUEST_ONLY" },
      });
      router.push(`/partner/contract-amendments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit amendment request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">New Amendment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a linked customer contract amendment
        </p>
      </div>

      <AmendmentSafetyNotice />
      {error ? <ErrorState title="Error" description={error} /> : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        {loadingContracts ? <LoadingBlock label="Loading linked contracts..." /> : null}
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-foreground">Contract type</label>
            <select 
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
              value={contractType} 
              onChange={(event) => { setContractType(event.target.value as AmendmentContractType); setSourceId(""); }}
            >
              <option value="EMI_SUBSCRIPTION">EMI Subscription</option>
              <option value="RENT_LEASE">Rent / Lease</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-bold text-foreground">Linked source contract</label>
            <select 
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
              value={sourceId} 
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">Select contract</option>
              {eligibleContracts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground">Amendment type</label>
            <select 
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
              value={amendmentType} 
              onChange={(event) => { setAmendmentType(event.target.value as AmendmentType); setFieldValues({}); }}
            >
              {AMENDMENT_TYPES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground">Reason</label>
            <input 
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" 
              value={reason} 
              onChange={(event) => setReason(event.target.value)} 
              placeholder="Why is this amendment required?" 
            />
          </div>
        </div>
        
        <AmendmentValueFields 
          amendmentType={amendmentType} 
          values={fieldValues} 
          onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))} 
        />
        
        <div className="pt-4 flex gap-3">
          <button 
            type="button"
            className="h-12 flex-1 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95 transition"
            onClick={() => void submit()} 
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit request"}
          </button>
          <button 
            type="button"
            className="h-12 flex-1 rounded-2xl border border-border bg-card px-4 text-sm font-bold text-foreground active:scale-95 transition"
            onClick={() => router.push("/partner/contract-amendments")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
