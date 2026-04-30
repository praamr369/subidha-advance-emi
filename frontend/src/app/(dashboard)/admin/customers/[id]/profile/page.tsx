"use client";

import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
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

  useEffect(() => {
    const customerId = Number(params.id);
    if (!Number.isFinite(customerId)) return;
    void getInternalCustomerCrmProfile(customerId).then((data) => setPayload(data as ProfilePayload));
  }, [params.id]);

  return (
    <PortalPage title="Party 360 Profile" subtitle="Identity, contracts, dues, payments, delivery, notes, follow-ups, risk flags, and audit timeline.">
      {!payload ? <p className="text-sm text-muted-foreground">Loading customer profile...</p> : null}
      {payload ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-border p-3">
            <div className="font-semibold">{payload.identity.name}</div>
            <div>{payload.identity.phone}</div>
            <div>KYC: {payload.kyc.status}</div>
            <div>Pending dues: {payload.dues.pending_emi_total}</div>
          </div>
          <div className="rounded-xl border border-border p-3">Contracts: {payload.contracts.length}</div>
          <div className="rounded-xl border border-border p-3">Payments: {payload.payments.length}</div>
          <div className="rounded-xl border border-border p-3">Follow-ups: {payload.follow_ups.length}</div>
          <div className="rounded-xl border border-border p-3">Risk flags: {payload.risk_flags.length}</div>
          <div className="rounded-xl border border-border p-3">Audit timeline: {payload.audit_timeline.length}</div>
        </div>
      ) : null}
    </PortalPage>
  );
}

