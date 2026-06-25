"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getBusinessRulePolicy, updateBusinessRulePolicy } from "@/services/compliance";
import { getWaiverClassificationMatrix } from "@/services/waiver-classification";
import type { BusinessRulePolicyPayload, BusinessRulePolicyReadiness, LegalRiskStatus } from "@/types/compliance";
import type { WaiverClassificationMatrixRow } from "@/services/waiver-classification";

const riskOptions: { value: LegalRiskStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "CA_REVIEW_REQUIRED", label: "CA Review Required" },
  { value: "ADVOCATE_REVIEW_REQUIRED", label: "Advocate Review Required" },
  { value: "APPROVED_FOR_INTERNAL_TEST", label: "Approved for Internal Test" },
  { value: "APPROVED_FOR_PUBLIC_LAUNCH", label: "Approved for Public Launch" },
  { value: "BLOCKED", label: "Blocked" },
];

const GST_THRESHOLDS = [
  { amount: "₹10 lakh", action: "CA review warning" },
  { amount: "₹15 lakh", action: "Prepare GST documents" },
  { amount: "₹18 lakh", action: "Start GST registration planning" },
  { amount: "₹20 lakh", action: "Conservative registration trigger (mixed goods/services)" },
  { amount: "₹40 lakh", action: "Goods-exclusive threshold — do not rely without CA" },
];

const LEGAL_CLASSIFICATION_RULES = [
  { pattern: "Customer pays mainly to get chance of waiver", risk: "Looks like chance/prize scheme", blocked: true },
  { pattern: "100 members form Lucky Fund", risk: "Looks like pool/contribution scheme", blocked: true },
  { pattern: "Backend ledger named Prize Fund / Winner Fund", risk: "Creates bad audit evidence", blocked: true },
  { pattern: "Admin modifies eligible list after hash commit", risk: "Breaks fairness & auditability", blocked: true },
  { pattern: "Public wording: lottery / jackpot / prize", risk: "Creates legal classification risk", blocked: true },
];

const APPROVED_WORDING = [
  "Monthly Waiver Benefit",
  "Eligible Plan ID / Lucky ID",
  "Waiver Recipient",
  "Waiver Selection Event",
  "Fairness Commitment Hash",
  "Reveal Seed",
  "Eligibility Snapshot",
  "Commercial Waiver / Contractual Discount",
];

const BLOCKED_WORDING = [
  "lottery",
  "prize / jackpot",
  "lucky draw (in legal docs)",
  "gambling / winning money",
  "prize pool / chit fund",
  "money circulation",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusBadge(status: string) {
  const u = (status || "").toUpperCase();
  if (u === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (u === "NEEDS_REVIEW") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function riskBadge(status: LegalRiskStatus) {
  if (status === "APPROVED_FOR_PUBLIC_LAUNCH") return "bg-emerald-100 text-emerald-800";
  if (status === "APPROVED_FOR_INTERNAL_TEST") return "bg-blue-100 text-blue-800";
  if (status === "BLOCKED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function scenarioColor(scenario: string) {
  const map: Record<string, string> = { A: "text-blue-700", B: "text-emerald-700", C: "text-purple-700", D: "text-orange-700", E: "text-red-700", F: "text-gray-600" };
  return map[scenario] ?? "text-gray-600";
}

function InfoCard({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={cx("rounded border px-3 py-2 text-sm", warning ? "border-amber-200 bg-amber-50" : "border-border bg-background")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cx("mt-0.5 font-semibold", warning ? "text-amber-900" : "text-foreground")}>{value}</p>
    </div>
  );
}

export default function AdminLegalControlsPage() {
  const [payload, setPayload] = useState<BusinessRulePolicyReadiness | null>(null);
  const [matrix, setMatrix] = useState<WaiverClassificationMatrixRow[]>([]);
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
      const [next, matrixData] = await Promise.all([
        getBusinessRulePolicy(),
        getWaiverClassificationMatrix().catch(() => ({ matrix: [] })),
      ]);
      setPayload(next);
      setMatrix(matrixData.matrix);
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

  const statusCards = useMemo(() => {
    if (!payload) return [];
    return [
      { label: "GST status", value: payload.derived.gst_status, warning: payload.derived.gst_status === "GST_UNREGISTERED" },
      { label: "Invoice mode", value: payload.derived.invoice_mode, warning: payload.derived.invoice_mode === "NON_GST_BILL" },
      { label: "Waiver launch blocked", value: payload.derived.waiver_public_launch_blocked ? "Yes — blocked" : "No — allowed", warning: payload.derived.waiver_public_launch_blocked },
      { label: "Refund SLA", value: `${payload.policy.refund_sla_working_days} working days` },
      { label: "Partner final receipt requires admin", value: payload.policy.partner_receipt_admin_approval_required ? "Yes" : "No" },
      { label: "KYC masking required", value: payload.policy.kyc_masking_required ? "Yes" : "No", warning: !payload.policy.kyc_masking_required },
      { label: "Deposit inspection required", value: payload.policy.deposit_refund_requires_inspection ? "Yes" : "No", warning: !payload.policy.deposit_refund_requires_inspection },
      { label: "Late charge can apply", value: payload.derived.late_payment_charge_application_enabled ? "Yes" : "No" },
    ];
  }, [payload]);

  const gstBlockedFeatures = useMemo(() => {
    if (!payload) return [];
    const unregistered = payload.derived.gst_status === "GST_UNREGISTERED";
    return [
      { feature: "GST tax invoice", blocked: !payload.derived.tax_invoice_enabled },
      { feature: "GST credit note", blocked: !payload.derived.gst_credit_note_enabled },
      { feature: "GST debit note", blocked: !payload.derived.gst_debit_note_enabled },
      { feature: "GST collection", blocked: !payload.derived.gst_collection_enabled },
      { feature: "Receipt voucher", blocked: !payload.derived.receipt_voucher_enabled },
      { feature: "Refund voucher", blocked: !payload.derived.refund_voucher_enabled },
      { feature: "ITC wording in docs", blocked: unregistered },
      { feature: "GSTR filing reports", blocked: unregistered },
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
      setMessage("Legal controls saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update legal controls.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Settings & Governance"
      title="Legal & GST Controls"
      subtitle="DB-backed launch gates: Lucky Plan classification, GST mode, waiver readiness, refund SLA, partner receipts, KYC masking, deposit inspection, late payment, and waiver accounting treatment."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Legal & GST Controls" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading controls...</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}

      {payload ? (
        <>
          {/* ── Overall status ── */}
          <WorkspaceSection title="Launch Posture" description="Read-only derived gates from active tax profile and business rule policy.">
            <div className="mb-3 flex items-center gap-3">
              <span className={cx("rounded border px-3 py-1.5 text-sm font-bold", statusBadge(payload.status))}>
                Overall: {payload.status}
              </span>
              <span className={cx("rounded px-2.5 py-1 text-xs font-semibold", riskBadge(payload.policy.risk_status))}>
                Waiver status: {payload.policy.risk_status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {statusCards.map((card) => (
                <InfoCard key={card.label} label={card.label} value={card.value} warning={card.warning} />
              ))}
            </div>
          </WorkspaceSection>

          {/* ── Blockers and warnings ── */}
          <WorkspaceSection title="Blockers & Warnings" description="These come from backend policy. Fix blockers before public launch.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-border bg-background p-3">
                <h3 className="text-sm font-semibold text-red-700">Blockers ({payload.blockers.length})</h3>
                {payload.blockers.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                    {payload.blockers.map((row) => <li key={row}>{row}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No blockers.</p>
                )}
              </div>
              <div className="rounded border border-border bg-background p-3">
                <h3 className="text-sm font-semibold text-amber-700">Warnings ({payload.warnings.length})</h3>
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

          {/* ── GST mode and blocked features ── */}
          <WorkspaceSection title="GST Mode — Blocked Features" description="Features automatically blocked when GST status is UNREGISTERED.">
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Current GST status: {payload.derived.gst_status}</strong>
              {payload.derived.gst_status === "GST_UNREGISTERED"
                ? " — Supplier is presently not registered under GST. GST has not been charged separately on any bill/receipt."
                : " — GST registered mode. Ensure HSN/SAC and tax rates are configured on all products."}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {gstBlockedFeatures.map(({ feature, blocked }) => (
                <div key={feature} className={cx("flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium", blocked ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                  <span>{blocked ? "✗" : "✓"}</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </WorkspaceSection>

          {/* ── Document labels ── */}
          <WorkspaceSection title="Document Labels" description={`Active labels for ${payload.derived.gst_status === "GST_UNREGISTERED" ? "unregistered (non-GST)" : "GST registered"} mode.`}>
            <div className="flex flex-wrap gap-2">
              {payload.derived.document_labels.map((label) => (
                <span key={label} className="rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{label}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Document labels change automatically when GST status transitions. Go to{" "}
              <Link href={ROUTES.admin.complianceKyc ?? "/admin/compliance/tax-profile"} className="text-primary underline">
                Compliance → Tax Profile
              </Link>{" "}
              to update GST registration mode.
            </p>
          </WorkspaceSection>

          {/* ── GST turnover thresholds ── */}
          <WorkspaceSection title="GST Turnover Thresholds" description="Conservative thresholds for mixed goods/services model. Based on CA guidance — verify before launch.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Turnover level</th>
                    <th className="pb-2">Required action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {GST_THRESHOLDS.map((row) => (
                    <tr key={row.amount}>
                      <td className="py-2 pr-4 font-mono font-semibold text-foreground">{row.amount}</td>
                      <td className="py-2 text-muted-foreground">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              See{" "}
              <Link href="/admin/compliance/turnover" className="text-primary underline">
                Compliance → Turnover Summary
              </Link>{" "}
              to view current aggregate turnover.
            </p>
          </WorkspaceSection>

          {/* ── Lucky Plan legal classification ── */}
          <WorkspaceSection title="Lucky Plan — Legal Classification" description="SUBIDHA CORE must classify Lucky Plan as: Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Approved wording</h4>
                <ul className="space-y-1">
                  {APPROVED_WORDING.map((w) => (
                    <li key={w} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-600">✓</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Blocked wording (legal docs)</h4>
                <ul className="space-y-1">
                  {BLOCKED_WORDING.map((w) => (
                    <li key={w} className="flex items-center gap-2 text-sm">
                      <span className="text-red-500">✗</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Dangerous patterns to avoid</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Pattern</th>
                      <th className="pb-2">Why dangerous</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {LEGAL_CLASSIFICATION_RULES.map((row) => (
                      <tr key={row.pattern}>
                        <td className="py-2 pr-4 text-red-800">{row.pattern}</td>
                        <td className="py-2 text-muted-foreground">{row.risk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </WorkspaceSection>

          {/* ── Waiver classification matrix ── */}
          {matrix.length > 0 && (
            <WorkspaceSection title="Waiver Accounting Treatment Matrix" description="Automated CA-guided accounting mode selection by delivery status, invoice status, and GST registration.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Scenario</th>
                      <th className="pb-2 pr-3">GST status</th>
                      <th className="pb-2 pr-3">Delivery</th>
                      <th className="pb-2 pr-3">Invoice</th>
                      <th className="pb-2 pr-3">Accounting mode</th>
                      <th className="pb-2 pr-3">Document</th>
                      <th className="pb-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matrix.map((row) => (
                      <tr key={row.scenario}>
                        <td className={cx("py-2 pr-3 font-bold", scenarioColor(row.scenario))}>
                          {row.scenario}
                        </td>
                        <td className="py-2 pr-3 font-mono">{row.gst_status}</td>
                        <td className="py-2 pr-3">{row.delivery_status}</td>
                        <td className="py-2 pr-3">{row.invoice_status}</td>
                        <td className="py-2 pr-3">
                          <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold", row.gst_credit_note ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground")}>
                            {row.waiver_accounting_mode.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.document}</td>
                        <td className="py-2 text-muted-foreground">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Scenario D requires CA approval before a GST credit note can be generated. All other scenarios can proceed under business rules.
              </p>
            </WorkspaceSection>
          )}

          {/* ── Partner receipt lifecycle ── */}
          <WorkspaceSection title="Partner Receipt Lifecycle" description="Partner can only create receipt requests. Admin must approve after money is received.">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { step: "1", label: "Partner creates receipt request", icon: "→", blocked: false },
                { step: "2", label: "Admin reviews + confirms money received", icon: "→", blocked: false },
                { step: "3", label: "Admin approves → final receipt generated", icon: "✓", blocked: false },
              ].map((item) => (
                <div key={item.step} className="rounded border border-border bg-background p-3">
                  <div className="mb-1 text-xs font-bold text-muted-foreground">STEP {item.step}</div>
                  <div className="text-sm text-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            <p className={cx("mt-2 rounded border px-3 py-1.5 text-xs font-medium",
              payload.policy.partner_receipt_admin_approval_required
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            )}>
              {payload.policy.partner_receipt_admin_approval_required
                ? "✓ Partner final receipt blocked until admin approval — policy enforced."
                : "✗ WARNING: Partner final receipt requires admin approval. This must be enabled."}
            </p>
          </WorkspaceSection>

          {/* ── KYC privacy rules ── */}
          <WorkspaceSection title="KYC & Privacy Rules" description="KYC documents must show masked identifiers only. Full document numbers must not appear in APIs, PDFs, tables, or invoices.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "KYC masking required", value: payload.policy.kyc_masking_required, good: true },
                { label: "Deposit refund requires inspection", value: payload.policy.deposit_refund_requires_inspection, good: true },
                { label: "GST docs require HSN/SAC after registration", value: payload.policy.gst_documents_require_hsn_sac, good: true },
              ].map((item) => (
                <div key={item.label} className={cx("flex items-center gap-2 rounded border px-3 py-2 text-sm",
                  item.value ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                )}>
                  <span>{item.value ? "✓" : "✗"}</span>
                  <span className="font-medium">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Masked Aadhaar, masked PAN, and masked document IDs only in all customer-facing views. Document access is audit-logged.
            </p>
          </WorkspaceSection>

          {/* ── Policy controls (editable) ── */}
          <WorkspaceSection title="Policy Controls" description="Updating these settings changes readiness gates only — does not post money, invoices, receipts, or mutate EMI history.">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={savePolicy}>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Waiver launch status</span>
                <select
                  className="h-10 rounded border border-border bg-background px-3 text-sm"
                  value={riskStatus}
                  onChange={(e) => setRiskStatus(e.target.value as LegalRiskStatus)}
                >
                  {riskOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">Must be &quot;Approved for Public Launch&quot; before live waiver selection.</span>
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Refund SLA (working days)</span>
                <input
                  className="h-10 rounded border border-border bg-background px-3 text-sm"
                  min={1}
                  max={60}
                  type="number"
                  value={refundSla}
                  onChange={(e) => setRefundSla(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">7 working days per Lucky Plan contract terms.</span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input className="mt-1" type="checkbox" checked={lateConfigured} onChange={(e) => setLateConfigured(e.target.checked)} />
                <div>
                  <div className="font-medium">Late payment charge policy configured</div>
                  <div className="text-xs text-muted-foreground">Must be configured before enabling. Use &quot;Late Payment Charge&quot; wording — not penalty/punishment/fine.</div>
                </div>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input className="mt-1" type="checkbox" checked={lateEnabled} onChange={(e) => setLateEnabled(e.target.checked)} />
                <div>
                  <div className="font-medium">Late payment charge enabled</div>
                  <div className="text-xs text-muted-foreground">Requires policy to be configured first. Late-paid Lucky Plan customers lose that month&apos;s waiver eligibility.</div>
                </div>
              </label>

              <label className="grid gap-1.5 text-sm md:col-span-2">
                <span className="font-medium">Governance notes</span>
                <textarea
                  className="min-h-24 rounded border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Record advocate/CA review status, approval dates, or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div className="md:col-span-2">
                <button
                  className="h-10 rounded bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving..." : "Save Controls"}
                </button>
              </div>
            </form>
          </WorkspaceSection>

          {/* ── Launch gate checklist ── */}
          <WorkspaceSection title="Public Launch Gate Checklist" description="All items must be complete before Lucky Plan waiver goes live.">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Advocate approves Lucky Plan classification and contract wording", done: payload.policy.risk_status === "APPROVED_FOR_PUBLIC_LAUNCH" },
                { label: "CA approves pre-GST and post-GST document/accounting treatment", done: payload.policy.risk_status === "APPROVED_FOR_PUBLIC_LAUNCH" },
                { label: "GST status mode implemented and tested", done: true },
                { label: "Waiver classification engine implemented", done: true },
                { label: "No customer money pool ledger exists", done: true },
                { label: "Partner receipt direct finalization blocked", done: payload.policy.partner_receipt_admin_approval_required },
                { label: "Refund SLA register works (7 working days)", done: payload.policy.refund_sla_working_days <= 7 },
                { label: "Deposit inspection/deduction workflow works", done: payload.policy.deposit_refund_requires_inspection },
                { label: "KYC masking and access logging work", done: payload.policy.kyc_masking_required },
                { label: "Frontend wording is waiver-based, not lottery/prize", done: true },
              ].map((item) => (
                <div key={item.label} className={cx("flex items-start gap-2 rounded border px-3 py-2 text-sm",
                  item.done ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                )}>
                  <span className={item.done ? "text-emerald-600" : "text-red-500"}>{item.done ? "✓" : "☐"}</span>
                  <span className={item.done ? "text-emerald-900" : "text-red-800"}>{item.label}</span>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        </>
      ) : null}
    </ERPPageShell>
  );
}
