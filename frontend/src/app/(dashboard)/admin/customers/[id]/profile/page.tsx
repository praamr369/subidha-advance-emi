"use client";

import { useEffect, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { getInternalCustomerCrmProfile } from "@/services/crm-module";

type ProfilePayload = {
  identity: { id: number; name: string; phone: string; address: string; city: string };
  kyc: { status: string };
  contracts: Array<{ id: number; subscription_number: string; status: string; plan_type: string }>;
  dues: { pending_emi_total: string };
  payments: Array<{ id: number; amount: string; method: string; payment_date: string }>;
  delivery_status: Array<{ id: number; fulfillment_status: string; delivery_status: string }>;
  notes: Array<{ id: number; interaction_type: string; note: string; happened_at: string }>;
  follow_ups: Array<{ id: number; due_at: string; status: string; call_note: string; is_overdue: boolean }>;
  risk_flags: Array<{ id: number; code: string; reason: string; severity: string }>;
  audit_timeline: Array<{ id: number; action_type: string; model_name: string; created_at: string }>;
};

export default function AdminCustomerProfilePage({ params }: { params: { id: string } }) {
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const customerId = Number(params.id);
    if (!Number.isFinite(customerId)) return;
    let active = true;
    void (async () => {
      try {
        const data = await getInternalCustomerCrmProfile(customerId);
        if (!active) return;
        setPayload(data as ProfilePayload);
        setError(null);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : "Unable to load Party 360 profile.";
        setError(message);
        setPayload(null);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [params.id]);

  return (
    <ERPPageShell
      title="Party 360 Profile"
      subtitle="Identity, contracts, dues, payments, delivery, notes, follow-ups, risk flags, and audit timeline."
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading Party 360 profile..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load Party 360 profile" description={error} /> : null}
        {!loading && !error && !payload ? (
          <ERPEmptyState title="Profile not available" description="No Party 360 profile payload was returned for this customer." />
        ) : null}

        {payload ? (
          <>
            <ERPSectionShell
              title="Identity summary"
              description="Read-only identity snapshot and current KYC posture. Operational edits remain in the canonical customer module."
            >
              <ERPDetailGrid
                columns={3}
                items={[
                  { label: "Customer", value: payload.identity.name },
                  { label: "Phone", value: payload.identity.phone || "—" },
                  { label: "City", value: payload.identity.city || "—" },
                  { label: "Address", value: payload.identity.address || "—", className: "sm:col-span-2 xl:col-span-3" },
                  { label: "KYC", value: payload.kyc.status || "—" },
                  { label: "Pending Dues", value: payload.dues.pending_emi_total || "—" },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell title="Workspace signals" description="Counts below reflect the current payload sections returned by the CRM profile service.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contracts</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{payload.contracts.length}</div>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Payments</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{payload.payments.length}</div>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Follow-ups</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{payload.follow_ups.length}</div>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Risk flags</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{payload.risk_flags.length}</div>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Audit timeline</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{payload.audit_timeline.length}</div>
                </div>
              </div>
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
