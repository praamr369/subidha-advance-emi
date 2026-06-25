"use client";

import { useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getBusinessRulePolicy, updateBusinessRulePolicy } from "@/services/compliance";
import type { BusinessRulePolicyPayload, BusinessRulePolicyReadiness, LegalRiskStatus } from "@/types/compliance";

const riskOptions: LegalRiskStatus[] = [
  "DRAFT",
  "CA_REVIEW_REQUIRED",
  "ADVOCATE_REVIEW_REQUIRED",
  "APPROVED_FOR_INTERNAL_TEST",
  "APPROVED_FOR_PUBLIC_LAUNCH",
  "BLOCKED",
];

function statusClass(status: string) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "NEEDS_REVIEW") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function booleanText(value: boolean) {
  return value ? "Yes" : "No";
}

export default function AdminLegalControlsPage() {
  const [payload, setPayload] = useState<BusinessRulePolicyReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [riskStatus, setRiskStatus] = useState<LegalRiskStatus>("ADVOCATE_REVIEW_REQUIRED");
  const [refundSla, setRefundSla] = useState("7");
  const [lateConfigured, setLateConfigured] = useState(false);
  const [lateEnabled, setLateEnabled] = useState(false);
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await getBusinessRulePolicy();
      setPayload(next);
      setRiskStatus(next.policy.risk_status);
      setRefundSla(String(next.policy.refund_sla_working_days));
      setLateConfigured(next.policy.late_payment_charge_configured);
      setLateEnabled(next.policy.late_payment_charge_enabled);
      setNotes(next.policy.notes || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load legal controls.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const cards = useMemo(() => {
    if (!payload) return [];
    return [
      { label: "GST status", value: payload.derived.gst_status },
      { label: "Invoice mode", value: payload.derived.invoice_mode },
      { label: "Waiver public launch blocked", value: booleanText(payload.derived.waiver_public_launch_blocked) },
      { label: "Refund SLA", value: `${payload.policy.refund_sla_working_days} working days` },
      { label: "Partner final receipt requires admin", value: booleanText(payload.policy.partner_receipt_admin_approval_required) },
      { label: "KYC masking required", value: booleanText(payload.policy.kyc_masking_required) },
      { label: "Deposit inspection required", value: booleanText(payload.policy.deposit_refund_requires_inspection) },
      { label: "Late charge can apply", value: booleanText(payload.derived.late_payment_charge_application_enabled) },
    ];
  }, [payload]);

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const body: BusinessRulePolicyPayload = {
      risk_status: riskStatus,
      refund_sla_working_days: Number(refundSla || "7"),
      late_payment_charge_configured: lateConfigured,
      late_payment_charge_enabled: lateEnabled,
      late_payment_charge_label: "Late Payment Charge",
      notes,
    };
    try {
      const next = await updateBusinessRulePolicy(body);
      setPayload(next);
      setMessage("Legal controls updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update legal controls.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      title="Legal & GST Controls"
      subtitle="DB-backed launch gates for Product Instalment Sale classification, GST mode, waiver readiness, refund SLA, partner receipts, KYC masking, deposit inspection, and late payment charge controls."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Legal & GST Controls" },
      ]}
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading controls...</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}

      {payload ? (
        <>
          <WorkspaceSection title="Launch Posture" description="Read-only derived gates from active tax profile and business rule policy.">
            <div className="grid gap-3 md:grid-cols-4">
              <div className={`rounded border px-3 py-2 text-sm font-semibold ${statusClass(payload.status)}`}>Overall: {payload.status}</div>
              {cards.map((card) => (
                <div key={card.label} className="rounded border border-border bg-background px-3 py-2">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{card.value}</p>
                </div>
              ))}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Blocked Actions" description="These come from backend policy, not frontend-only assumptions.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-border bg-background p-3">
                <h3 className="text-sm font-semibold text-foreground">Blockers</h3>
                {payload.blockers.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                    {payload.blockers.map((row) => <li key={row}>{row}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No blockers.</p>
                )}
              </div>
              <div className="rounded border border-border bg-background p-3">
                <h3 className="text-sm font-semibold text-foreground">Warnings</h3>
                {payload.warnings.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {payload.warnings.map((row) => <li key={row}>{row}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No warnings.</p>
                )}
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Document Labels" description="Displayed labels change with GST registration mode.">
            <div className="flex flex-wrap gap-2">
              {payload.derived.document_labels.map((label) => (
                <span key={label} className="rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{label}</span>
              ))}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Policy Controls" description="Updating these settings changes readiness only; it does not post, invoice, receipt, refund, or mutate EMI history.">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={savePolicy}>
              <label className="grid gap-2 text-sm">
                <span>Waiver launch status</span>
                <select className="h-10 rounded border border-border bg-background px-3" value={riskStatus} onChange={(event) => setRiskStatus(event.target.value as LegalRiskStatus)}>
                  {riskOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Refund SLA working days</span>
                <input className="h-10 rounded border border-border bg-background px-3" min={1} max={60} type="number" value={refundSla} onChange={(event) => setRefundSla(event.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lateConfigured} onChange={(event) => setLateConfigured(event.target.checked)} />
                Late payment charge policy configured
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lateEnabled} onChange={(event) => setLateEnabled(event.target.checked)} />
                Late payment charge enabled
              </label>
              <label className="grid gap-2 text-sm md:col-span-2">
                <span>Notes</span>
                <textarea className="min-h-24 rounded border border-border bg-background px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <div className="md:col-span-2">
                <button className="h-10 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={saving} type="submit">
                  {saving ? "Saving..." : "Save Controls"}
                </button>
              </div>
            </form>
          </WorkspaceSection>
        </>
      ) : null}
    </ERPPageShell>
  );
}
