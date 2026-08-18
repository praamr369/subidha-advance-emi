"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Gavel,
  Info,
  Lock,
  RefreshCw,
  Scale,
  Shield,
  Upload,
  X,
  Zap,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { fetchComplianceDocumentEvidence } from "@/services/business-compliance-evidence";
import { getBusinessRulePolicy, updateBusinessRulePolicy } from "@/services/compliance";
import {
  approveComplianceDocument,
  createComplianceDocument,
  listComplianceDocuments,
  rejectComplianceDocument,
  submitComplianceDocumentForReview,
} from "@/services/policies";
import { getWaiverClassificationMatrix } from "@/services/waiver-classification";
import type { ComplianceDocument } from "@/services/policies";
import type {
  BusinessRulePolicy,
  BusinessRulePolicyPayload,
  BusinessRulePolicyReadiness,
  LegalRiskStatus,
} from "@/types/compliance";
import type {
  WaiverClassificationMatrixRow,
  WaiverClassificationResult,
} from "@/services/waiver-classification";

// ─── Static data ─────────────────────────────────────────────────────────────

const ALL_DOC_TYPES = [
  { value: "CA_OPINION",           label: "CA Written Opinion" },
  { value: "ADVOCATE_OPINION",     label: "Advocate Legal Opinion" },
  { value: "SCHEME_APPROVAL_LETTER", label: "Scheme Approval Letter" },
  { value: "LEGAL_AGREEMENT",      label: "Signed Legal Agreement" },
  { value: "LEGAL_NOTICE",         label: "Legal Notice" },
  { value: "COURT_ORDER",          label: "Court Order / Judgment" },
  { value: "RENTAL_AGREEMENT",     label: "Rental Agreement" },
  { value: "OWNERSHIP_PROOF",      label: "Ownership Proof" },
  { value: "UDYAM_CERTIFICATE",    label: "Udyam Certificate" },
  { value: "GST_CERTIFICATE",      label: "GST Certificate" },
  { value: "SHOP_LICENSE",         label: "Shop License" },
  { value: "BANK_PROOF",           label: "Bank Proof" },
  { value: "PAN_OR_TAX_PROOF",     label: "PAN / Tax Proof" },
  { value: "OTHER",                label: "Other" },
] as const;

type DocTypeValue = typeof ALL_DOC_TYPES[number]["value"];
const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_DOC_TYPES.map((t) => [t.value, t.label])
);

const RISK_OPTIONS: { value: LegalRiskStatus; label: string; color: string; desc: string }[] = [
  { value: "DRAFT",                      label: "Draft",                       color: "text-muted-foreground",  desc: "Initial state — not reviewed" },
  { value: "CA_REVIEW_REQUIRED",         label: "CA Review Required",          color: "text-amber-700",         desc: "Pending CA sign-off" },
  { value: "ADVOCATE_REVIEW_REQUIRED",   label: "Advocate Review Required",    color: "text-amber-700",         desc: "Pending advocate sign-off" },
  { value: "APPROVED_FOR_INTERNAL_TEST", label: "Approved for Internal Test",  color: "text-blue-700",          desc: "Internal pilot only — not public" },
  { value: "APPROVED_FOR_PUBLIC_LAUNCH", label: "Approved for Public Launch",  color: "text-emerald-700",       desc: "All advisors cleared — public OK" },
  { value: "BLOCKED",                    label: "Blocked",                     color: "text-red-700",           desc: "Hard stop — must not launch" },
];

const PLAN_TYPE_OPTIONS = [
  { value: "PRODUCT_INSTALLMENT", label: "Product Installment Sale" },
  { value: "DIRECT_SALE",         label: "Direct Sale" },
  { value: "RENTAL",              label: "Rental" },
  { value: "LEASE",               label: "Lease" },
];
const BENEFIT_TYPE_OPTIONS = [
  { value: "NONE",                 label: "None" },
  { value: "CONTRACTUAL_WAIVER",   label: "Contractual Waiver (Lucky Plan)" },
  { value: "TRADE_DISCOUNT",       label: "Trade Discount" },
  { value: "PROMOTIONAL_CREDIT",   label: "Promotional Credit" },
];
const SELECTION_METHOD_OPTIONS = [
  { value: "NONE",               label: "None" },
  { value: "HASH_FAIRNESS",      label: "Hash-based Fairness Draw" },
  { value: "ADMIN_APPROVED",     label: "Admin Approved" },
  { value: "PERFORMANCE_BASED",  label: "Performance Based" },
];
const FUNDING_SOURCE_OPTIONS = [
  { value: "COMPANY_MARGIN",       label: "Company Margin (legal)" },
  { value: "CUSTOMER_POOL_BLOCKED", label: "Customer Pool (BLOCKED — illegal)" },
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

const DANGEROUS_PATTERNS = [
  { pattern: "Customer pays mainly to get chance of waiver",     risk: "Looks like chance/prize scheme" },
  { pattern: "100 members form Lucky Fund",                       risk: "Looks like pool/contribution scheme" },
  { pattern: "Backend ledger named Prize Fund / Winner Fund",     risk: "Creates bad audit evidence" },
  { pattern: "Admin modifies eligible list after hash commit",    risk: "Breaks fairness & auditability" },
  { pattern: "Public wording: lottery / jackpot / prize",        risk: "Creates legal classification risk" },
];

const GST_THRESHOLDS = [
  { amount: "₹10 lakh",  action: "CA review warning" },
  { amount: "₹15 lakh",  action: "Prepare GST documents" },
  { amount: "₹18 lakh",  action: "Start GST registration planning" },
  { amount: "₹20 lakh",  action: "Conservative trigger (mixed goods/services)" },
  { amount: "₹40 lakh",  action: "Goods-exclusive threshold — verify with CA first" },
];

type Tab = "overview" | "policy" | "classification" | "documents" | "checklist";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",       label: "Overview",         icon: <Shield className="h-4 w-4" /> },
  { id: "policy",         label: "Policy Controls",  icon: <Scale className="h-4 w-4" /> },
  { id: "classification", label: "Classification",   icon: <Gavel className="h-4 w-4" /> },
  { id: "documents",      label: "Legal Documents",  icon: <FileText className="h-4 w-4" /> },
  { id: "checklist",      label: "Launch Checklist", icon: <CheckCircle2 className="h-4 w-4" /> },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function docStatusColor(s?: string) {
  if (s === "VERIFIED" || s === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (s === "REJECTED")  return "bg-red-100 text-red-800";
  if (s === "UNDER_REVIEW") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function scenarioColor(s: string) {
  const m: Record<string, string> = {
    A: "text-blue-700", B: "text-emerald-700", C: "text-purple-700",
    D: "text-orange-700", E: "text-red-700",
  };
  return m[s] ?? "text-muted-foreground";
}

// ─── Small components ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, tone = "neutral",
}: {
  label: string; value: string | number; sub?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const colors = {
    ok: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
    neutral: "border-border bg-card",
  };
  const text = {
    ok: "text-emerald-900", warn: "text-amber-900",
    bad: "text-red-900",    neutral: "text-foreground",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[tone]}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold leading-tight ${text[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Gate({
  label, ok, note, onFix,
}: {
  label: string; ok: boolean; note?: string; onFix?: () => void;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className={`mt-0.5 shrink-0 text-lg font-bold ${ok ? "text-emerald-600" : "text-red-400"}`}>
        {ok ? "✓" : "○"}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${ok ? "text-emerald-900" : "text-red-800"}`}>{label}</p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {!ok && onFix && (
        <button type="button" onClick={onFix}
          className="shrink-0 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 transition">
          Fix →
        </button>
      )}
    </div>
  );
}

function Blocker({
  title, cleared, reason, fix,
}: {
  title: string; cleared: boolean; reason: string; fix: string;
}) {
  const [open, setOpen] = useState(!cleared);
  return (
    <div className={`rounded-xl border overflow-hidden ${cleared ? "border-emerald-200" : "border-red-200"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${cleared ? "bg-emerald-50" : "bg-red-50"}`}>
        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${cleared ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
          {cleared ? "CLEARED ✓" : "BLOCKER"}
        </span>
        <span className={`text-sm font-semibold flex-1 ${cleared ? "text-emerald-900" : "text-red-900"}`}>{title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border bg-background px-4 py-3 space-y-2">
          <p className="text-xs text-foreground"><span className="font-semibold">Why:</span> {reason}</p>
          <p className="text-xs text-foreground"><span className="font-semibold">How to fix:</span> {fix}</p>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked, onChange, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-40 ${checked ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function FieldRow({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function SelectField({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Document action row ──────────────────────────────────────────────────────

function DocActionRow({
  doc, onUpdate,
}: {
  doc: ComplianceDocument;
  onUpdate: (updated: ComplianceDocument) => void;
}) {
  const [busy, setBusy]   = useState<string | null>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [rejectInput, setRejectInput] = useState("");
  const [showReject, setShowReject]   = useState(false);

  const status = doc.review_status ?? doc.verification_status ?? "PENDING";

  async function act(action: () => Promise<ComplianceDocument>, label: string) {
    setBusy(label); setErr(null);
    try {
      const updated = await action();
      onUpdate(updated);
      setShowReject(false);
      setRejectInput("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {(status === "PENDING" || status === "NOT_PROVIDED") && (
          <button type="button" disabled={!!busy}
            onClick={() => void act(() => submitComplianceDocumentForReview(doc.id), "submit")}
            className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 disabled:opacity-50 transition">
            {busy === "submit" ? "Submitting…" : "Submit for Review"}
          </button>
        )}
        {status === "UNDER_REVIEW" && (
          <>
            <button type="button" disabled={!!busy}
              onClick={() => void act(() => approveComplianceDocument(doc.id), "approve")}
              className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 transition">
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button type="button" disabled={!!busy}
              onClick={() => setShowReject((v) => !v)}
              className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50 transition">
              Reject
            </button>
          </>
        )}
        {doc.has_file && (
          <OpenDocButton docId={doc.id} />
        )}
      </div>
      {showReject && (
        <div className="flex gap-2 mt-1">
          <input
            value={rejectInput}
            onChange={(e) => setRejectInput(e.target.value)}
            placeholder="Rejection reason (required)"
            className="flex-1 h-8 rounded-lg border border-input bg-background px-2 text-xs"
          />
          <button type="button"
            disabled={!rejectInput.trim() || !!busy}
            onClick={() => void act(() => rejectComplianceDocument(doc.id, rejectInput), "reject")}
            className="rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition">
            {busy === "reject" ? "…" : "Confirm"}
          </button>
          <button type="button" onClick={() => setShowReject(false)}
            className="rounded-lg bg-muted px-2 text-xs text-muted-foreground hover:bg-muted/70 transition">
            Cancel
          </button>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function OpenDocButton({ docId }: { docId: number }) {
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    try {
      const blob = await fetchComplianceDocumentEvidence(docId);
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setOpening(false);
    }
  }
  return (
    <button type="button" disabled={opening} onClick={() => void open()}
      className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50 transition">
      {opening ? "Opening…" : "Open File"}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminLegalControlsPage() {
  const [data,   setData]   = useState<BusinessRulePolicyReadiness | null>(null);
  const [matrix, setMatrix] = useState<WaiverClassificationMatrixRow[]>([]);
  const [docs,   setDocs]   = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Policy form
  const [planType,         setPlanType]         = useState<BusinessRulePolicy["plan_type"]>("PRODUCT_INSTALLMENT");
  const [benefitType,      setBenefitType]      = useState<BusinessRulePolicy["benefit_type"]>("CONTRACTUAL_WAIVER");
  const [selectionMethod,  setSelectionMethod]  = useState<BusinessRulePolicy["selection_method"]>("HASH_FAIRNESS");
  const [fundingSource,    setFundingSource]    = useState<BusinessRulePolicy["funding_source"]>("COMPANY_MARGIN");
  const [riskStatus,       setRiskStatus]       = useState<LegalRiskStatus>("ADVOCATE_REVIEW_REQUIRED");
  const [refundSla,        setRefundSla]        = useState("7");
  const [lateConfigured,   setLateConfigured]   = useState(false);
  const [lateEnabled,      setLateEnabled]      = useState(false);
  const [lateLabel,        setLateLabel]        = useState("Late Payment Charge");
  const [kycMasking,       setKycMasking]       = useState(true);
  const [depositInspection, setDepositInspection] = useState(true);
  const [partnerApproval,  setPartnerApproval]  = useState(true);
  const [hsnSac,           setHsnSac]           = useState(true);
  const [notes,            setNotes]            = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Upload
  const [docType,  setDocType]  = useState<DocTypeValue>("ADVOCATE_OPINION");
  const [docTitle, setDocTitle] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docFile,  setDocFile]  = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadOk,   setUploadOk]   = useState<string | null>(null);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Waiver classifier
  const [classifyGst,      setClassifyGst]      = useState("GST_UNREGISTERED");
  const [classifyDelivery, setClassifyDelivery] = useState("DELIVERED");
  const [classifyInvoice,  setClassifyInvoice]  = useState("ISSUED");
  const [classifyResult,   setClassifyResult]   = useState<WaiverClassificationResult | null>(null);
  const [classifying,      setClassifying]      = useState(false);
  const [classifyErr,      setClassifyErr]      = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  function syncForm(rd: BusinessRulePolicyReadiness) {
    const p = rd.policy;
    setPlanType(p.plan_type);
    setBenefitType(p.benefit_type);
    setSelectionMethod(p.selection_method);
    setFundingSource(p.funding_source);
    setRiskStatus(p.risk_status);
    setRefundSla(String(p.refund_sla_working_days));
    setLateConfigured(p.late_payment_charge_configured);
    setLateEnabled(p.late_payment_charge_enabled);
    setLateLabel(p.late_payment_charge_label || "Late Payment Charge");
    setKycMasking(p.kyc_masking_required);
    setDepositInspection(p.deposit_refund_requires_inspection);
    setPartnerApproval(p.partner_receipt_admin_approval_required);
    setHsnSac(p.gst_documents_require_hsn_sac);
    setNotes(p.notes || "");
  }

  async function load() {
    setLoading(true);
    try {
      const [rd, mx, dl] = await Promise.all([
        getBusinessRulePolicy(),
        getWaiverClassificationMatrix().catch(() => ({ matrix: [] as WaiverClassificationMatrixRow[] })),
        listComplianceDocuments().catch(() => ({ count: 0, results: [] as ComplianceDocument[] })),
      ]);
      setData(rd);
      setMatrix(mx.matrix ?? []);
      setDocs(dl.results ?? []);
      syncForm(rd);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // ── Save policy ───────────────────────────────────────────────────────────

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr(null); setSaveOk(false);
    const payload: BusinessRulePolicyPayload = {
      plan_type:                          planType,
      benefit_type:                       benefitType,
      selection_method:                   selectionMethod,
      funding_source:                     fundingSource,
      risk_status:                        riskStatus,
      refund_sla_working_days:            Number(refundSla) || 7,
      late_payment_charge_configured:     lateConfigured,
      late_payment_charge_enabled:        lateEnabled,
      late_payment_charge_label:          lateLabel,
      kyc_masking_required:               kycMasking,
      deposit_refund_requires_inspection: depositInspection,
      partner_receipt_admin_approval_required: partnerApproval,
      gst_documents_require_hsn_sac:      hsnSac,
      notes,
    };
    try {
      const updated = await updateBusinessRulePolicy(payload);
      setData(updated);
      syncForm(updated);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 4000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Upload doc ────────────────────────────────────────────────────────────

  async function uploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) { setUploadErr("Select a file."); return; }
    setUploading(true); setUploadErr(null); setUploadOk(null);
    try {
      const form = new FormData();
      form.append("document_type", docType);
      form.append("title", docTitle.trim() || (DOC_TYPE_LABEL[docType] ?? docType));
      form.append("notes", docNotes.trim());
      form.append("file",  docFile);
      const created = await createComplianceDocument(form);
      setDocs((p) => [created, ...p]);
      setDocTitle(""); setDocNotes(""); setDocFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setUploadOk("Document uploaded. Use 'Submit for Review' in the document list to send for approval.");
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // ── Classifier ────────────────────────────────────────────────────────────

  async function runClassify() {
    setClassifying(true); setClassifyErr(null);
    try {
      const { classifyWaiver } = await import("@/services/waiver-classification");
      const res = await classifyWaiver({
        gst_status:      classifyGst,
        delivery_status: classifyDelivery,
        invoice_status:  classifyInvoice,
      });
      setClassifyResult(res);
    } catch (err) {
      setClassifyErr(err instanceof Error ? err.message : "Classification failed.");
      setClassifyResult(null);
    } finally {
      setClassifying(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const launchChecklist = useMemo(() => {
    if (!data) return [];
    const hasAdvisorDocs = docs.some((d) =>
      ["CA_OPINION", "ADVOCATE_OPINION", "SCHEME_APPROVAL_LETTER"].includes(d.document_type)
    );
    const hasApprovedAdvisorDoc = docs.some((d) =>
      ["CA_OPINION", "ADVOCATE_OPINION", "SCHEME_APPROVAL_LETTER"].includes(d.document_type) &&
      (d.review_status === "APPROVED" || d.verification_status === "VERIFIED")
    );
    return [
      {
        label: "Advocate approves Lucky Plan classification and contract wording",
        done:  data.policy.risk_status === "APPROVED_FOR_PUBLIC_LAUNCH",
        tab: "policy" as Tab,
        note: "Set Waiver launch status → Approved for Public Launch in Policy Controls",
      },
      {
        label: "CA approves pre-GST / post-GST accounting treatment",
        done:  data.policy.risk_status === "APPROVED_FOR_PUBLIC_LAUNCH",
        tab: "policy" as Tab,
        note: "Requires advocate/CA sign-off before setting to Approved",
      },
      {
        label: "GST mode configured in Tax Profile",
        done:  true,
        tab: null,
        note: null,
      },
      {
        label: "Waiver classification engine active",
        done:  true,
        tab: null,
        note: null,
      },
      {
        label: "No customer pool ledger — funding source is Company Margin",
        done:  data.policy.funding_source === "COMPANY_MARGIN",
        tab: "policy" as Tab,
        note: "Set Funding Source to Company Margin in Policy Controls",
      },
      {
        label: "Benefit type set to Contractual Waiver",
        done:  data.policy.benefit_type === "CONTRACTUAL_WAIVER",
        tab: "policy" as Tab,
        note: "Set Benefit Type to Contractual Waiver in Policy Controls",
      },
      {
        label: "Selection method: Hash-based Fairness Draw",
        done:  data.policy.selection_method === "HASH_FAIRNESS",
        tab: "policy" as Tab,
        note: "Set Selection Method to Hash-based Fairness Draw in Policy Controls",
      },
      {
        label: "Partner receipt requires admin approval",
        done:  data.policy.partner_receipt_admin_approval_required,
        tab: "policy" as Tab,
        note: "Enable in Policy Controls → Compliance Enforcement",
      },
      {
        label: "Refund SLA configured (≤7 working days)",
        done:  data.policy.refund_sla_working_days <= 7,
        tab: "policy" as Tab,
        note: "Set Refund SLA to 7 or fewer working days",
      },
      {
        label: "Deposit inspection workflow enforced",
        done:  data.policy.deposit_refund_requires_inspection,
        tab: "policy" as Tab,
        note: "Enable Deposit refund requires inspection in Policy Controls",
      },
      {
        label: "KYC masking enforced",
        done:  data.policy.kyc_masking_required,
        tab: "policy" as Tab,
        note: "Enable KYC masking in Policy Controls",
      },
      {
        label: "Legal advisor document uploaded (CA/Advocate opinion)",
        done:  hasAdvisorDocs,
        tab: "documents" as Tab,
        note: "Upload CA Written Opinion or Advocate Legal Opinion in Legal Documents tab",
      },
      {
        label: "Legal advisor document approved",
        done:  hasApprovedAdvisorDoc,
        tab: "documents" as Tab,
        note: "Submit uploaded document for review, then approve it",
      },
    ];
  }, [data, docs]);

  const doneCount = launchChecklist.filter((i) => i.done).length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ERPPageShell
      eyebrow="Settings · Governance"
      title="Legal & GST Controls"
      subtitle="Launch gates, waiver classification, GST mode, KYC, refund SLA, and legal advisor documents."
      breadcrumbs={[
        { label: "Admin",    href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Legal & GST Controls" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.icon}
            {t.label}
            {t.id === "checklist" && data && (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                doneCount === launchChecklist.length
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {doneCount}/{launchChecklist.length}
              </span>
            )}
            {t.id === "documents" && docs.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {docs.length}
              </span>
            )}
          </button>
        ))}
        <button type="button" onClick={() => void load()} disabled={loading}
          className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !data && (
        <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">
          Loading legal controls…
        </div>
      )}

      {data && (
        <>
          {/* ══════════════════════════════════════════════ OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Overall status" value={data.status.replace(/_/g, " ")}
                  tone={data.status === "READY" ? "ok" : data.status === "NEEDS_REVIEW" ? "warn" : "bad"} />
                <KpiCard label="GST mode" value={data.derived.gst_status.replace(/_/g, " ")}
                  tone={data.derived.gst_status === "GST_UNREGISTERED" ? "warn" : "ok"} />
                <KpiCard label="Waiver launch"
                  value={data.derived.waiver_public_launch_blocked ? "Blocked" : "Allowed"}
                  tone={data.derived.waiver_public_launch_blocked ? "bad" : "ok"}
                  sub={data.policy.risk_status.replace(/_/g, " ")} />
                <KpiCard label="Late charges"
                  value={data.derived.late_payment_charge_application_enabled ? "Enabled" : "Disabled"}
                  tone={data.derived.late_payment_charge_application_enabled ? "ok" : "warn"} />
              </div>

              {/* Blockers */}
              {data.blockers.length > 0 && (
                <section className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-red-900">
                    <AlertTriangle className="h-4 w-4" />
                    {data.blockers.length} Active Blocker{data.blockers.length > 1 ? "s" : ""}
                  </h3>
                  <ul className="space-y-1 pl-2">
                    {data.blockers.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-red-800">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> {b}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Warnings */}
              {data.warnings.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    {data.warnings.length} Warning{data.warnings.length > 1 ? "s" : ""}
                  </h3>
                  <ul className="space-y-1 pl-2">
                    {data.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-2 text-sm text-amber-800">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {w}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Policy classification snapshot */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Business model classification</h3>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
                  {[
                    { label: "Plan type",        value: data.policy.plan_type.replace(/_/g, " ") },
                    { label: "Benefit type",     value: data.policy.benefit_type.replace(/_/g, " ") },
                    { label: "Selection method", value: data.policy.selection_method.replace(/_/g, " ") },
                    { label: "Funding source",   value: data.policy.funding_source.replace(/_/g, " "),
                      warn: data.policy.funding_source === "CUSTOMER_POOL_BLOCKED" },
                  ].map(({ label, value, warn }) => (
                    <div key={label} className={`rounded-xl border px-3 py-2.5 ${warn ? "border-red-200 bg-red-50" : "border-border bg-muted/30"}`}>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className={`mt-0.5 text-xs font-bold ${warn ? "text-red-800" : "text-foreground"}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* GST feature gates */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">GST feature gates</h3>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                  {[
                    { label: "Tax invoice",    ok: data.derived.tax_invoice_enabled },
                    { label: "GST credit note", ok: data.derived.gst_credit_note_enabled },
                    { label: "GST debit note",  ok: data.derived.gst_debit_note_enabled },
                    { label: "GST collection",  ok: data.derived.gst_collection_enabled },
                    { label: "Receipt voucher", ok: data.derived.receipt_voucher_enabled },
                    { label: "Refund voucher",  ok: data.derived.refund_voucher_enabled },
                    { label: "ITC wording",     ok: data.derived.gst_status !== "GST_UNREGISTERED" },
                    { label: "GSTR reports",    ok: data.derived.gst_status !== "GST_UNREGISTERED" },
                  ].map(({ label, ok }) => (
                    <div key={label} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                      ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-border bg-muted/40 text-muted-foreground"
                    }`}>
                      <span className="text-base">{ok ? "✓" : "○"}</span> {label}
                    </div>
                  ))}
                </div>
              </section>

              {/* Document labels */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Active document labels</h3>
                <div className="flex flex-wrap gap-2">
                  {data.derived.document_labels.map((l) => (
                    <span key={l} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                      {l}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Labels auto-switch when GST mode changes.{" "}
                  <Link href="/admin/compliance/tax-profile" className="text-primary underline">
                    Update Tax Profile →
                  </Link>
                </p>
              </section>

              {/* Blocker resolution guide */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Blocker resolution guide</h3>
                <div className="space-y-3">
                  <Blocker
                    title="Lucky Plan waiver public launch blocked"
                    cleared={!data.derived.waiver_public_launch_blocked}
                    reason={`Waiver status is "${data.policy.risk_status.replace(/_/g, " ")}". System requires "Approved for Public Launch".`}
                    fix='Get advocate/CA sign-off on Lucky Plan contract wording. Upload their signed opinion in Legal Documents tab → submit for review → approve it. Then go to Policy Controls → set Waiver launch status → "Approved for Public Launch" → Save.' />
                  <Blocker
                    title="GST features blocked — UNREGISTERED mode"
                    cleared={data.derived.gst_status !== "GST_UNREGISTERED"}
                    reason="Business is operating as a non-GST supplier. GST invoice, credit note, and ITC are intentionally disabled."
                    fix="This is correct for pre-GST stage. When registration is issued: go to Compliance → Tax Profile → update to GST_REGULAR or GST_COMPOSITION → upload GST Certificate." />
                  <Blocker
                    title="Late payment charges disabled"
                    cleared={data.derived.late_payment_charge_application_enabled}
                    reason="Late payment charges are not yet configured or enabled."
                    fix='Policy Controls → tick "Policy configured" (confirm documented rate) → tick "Charges enabled" → Save.' />
                </div>
              </section>

              {/* Tax profile snapshot */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Tax profile snapshot</h3>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Mode</p>
                      <p className="font-semibold">{data.tax_profile.mode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">GST registered</p>
                      <p className="font-semibold">{data.tax_profile.is_gst_registered ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ITC claimable</p>
                      <p className="font-semibold">{data.tax_profile.itc_claimable ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">GSTIN</p>
                      <p className="font-mono font-semibold">{data.tax_profile.seller_gstin || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Effective from</p>
                      <p className="font-semibold">
                        {fmt(data.tax_profile.effective_from as string | undefined)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Invoice mode</p>
                      <p className="font-semibold">{data.derived.invoice_mode.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════ POLICY CONTROLS */}
          {tab === "policy" && (
            <div className="space-y-6">

              {saveOk && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Controls saved successfully.
                </div>
              )}
              {saveErr && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {saveErr}
                </div>
              )}

              <form onSubmit={(e) => void savePolicy(e)} className="space-y-6">

                {/* Business model classification */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Business model classification</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      These fields define the legal structure of the Lucky Plan. Must match advocate/CA sign-off.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldRow label="Plan type" hint="The primary commercial structure of customer contracts.">
                      <SelectField value={planType} onChange={(v) => setPlanType(v as BusinessRulePolicy["plan_type"])} options={PLAN_TYPE_OPTIONS} />
                    </FieldRow>
                    <FieldRow label="Benefit type" hint="How the monthly waiver benefit is legally classified.">
                      <SelectField value={benefitType} onChange={(v) => setBenefitType(v as BusinessRulePolicy["benefit_type"])} options={BENEFIT_TYPE_OPTIONS} />
                    </FieldRow>
                    <FieldRow label="Selection method" hint="How the waiver recipient is chosen each month.">
                      <SelectField value={selectionMethod} onChange={(v) => setSelectionMethod(v as BusinessRulePolicy["selection_method"])} options={SELECTION_METHOD_OPTIONS} />
                    </FieldRow>
                    <FieldRow label="Funding source" hint="Where the monthly waiver amount comes from.">
                      <SelectField value={fundingSource} onChange={(v) => setFundingSource(v as BusinessRulePolicy["funding_source"])} options={FUNDING_SOURCE_OPTIONS} />
                      {fundingSource === "CUSTOMER_POOL_BLOCKED" && (
                        <p className="mt-1 text-xs font-semibold text-red-700">
                          ⚠ Customer pool is legally blocked — set to Company Margin immediately.
                        </p>
                      )}
                    </FieldRow>
                  </div>
                </section>

                {/* Waiver launch gate */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Waiver launch gate</h3>

                  <FieldRow label="Waiver launch status"
                    hint="Must be 'Approved for Public Launch' before the Lucky Draw can go live. Do not set without actual advocate/CA sign-off.">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {RISK_OPTIONS.map((opt) => (
                        <label key={opt.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                            riskStatus === opt.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border bg-background hover:bg-muted/40"
                          }`}>
                          <input type="radio" name="risk_status" value={opt.value}
                            checked={riskStatus === opt.value}
                            onChange={() => setRiskStatus(opt.value)}
                            className="sr-only" />
                          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${riskStatus === opt.value ? "bg-primary" : "bg-muted-foreground/30"}`} />
                          <div>
                            <p className={`text-sm font-medium ${opt.color}`}>{opt.label}</p>
                            <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    {riskStatus === "APPROVED_FOR_PUBLIC_LAUNCH" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <Zap className="h-3.5 w-3.5" /> Waiver public launch is UNLOCKED.
                      </p>
                    )}
                    {riskStatus === "BLOCKED" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Launch is HARD BLOCKED. Do not proceed until resolved.
                      </p>
                    )}
                  </FieldRow>

                  <FieldRow label="Refund SLA (working days)"
                    hint="7 working days per Lucky Plan contract terms.">
                    <div className="flex items-center gap-3">
                      <input type="number" min={1} max={60} value={refundSla}
                        onChange={(e) => setRefundSla(e.target.value)}
                        className="h-10 w-28 rounded-xl border border-input bg-background px-3 text-sm font-mono" />
                      <span className="text-sm text-muted-foreground">working days</span>
                      {Number(refundSla) > 7 && (
                        <span className="text-xs font-semibold text-amber-700">⚠ Exceeds 7-day contract commitment</span>
                      )}
                    </div>
                  </FieldRow>
                </section>

                {/* Late payment */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Late payment charge</h3>
                  <div className="space-y-4">
                    <label className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Policy configured</p>
                        <p className="text-xs text-muted-foreground">Confirm you have documented the charge rate and terms.</p>
                      </div>
                      <Toggle checked={lateConfigured} onChange={setLateConfigured} />
                    </label>
                    <label className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Charges enabled</p>
                        <p className="text-xs text-muted-foreground">Late-paid customers lose that month's waiver eligibility. Requires policy to be configured first.</p>
                      </div>
                      <Toggle checked={lateEnabled} onChange={setLateEnabled} disabled={!lateConfigured} />
                    </label>
                    <FieldRow label="Charge label" hint='Use "Late Payment Charge" — never penalty/fine/punishment.'>
                      <input value={lateLabel} onChange={(e) => setLateLabel(e.target.value)}
                        className="h-10 rounded-xl border border-input bg-background px-3 text-sm" />
                    </FieldRow>
                  </div>
                </section>

                {/* Compliance enforcement */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Compliance enforcement</h3>
                  <div className="space-y-5">
                    {[
                      {
                        label: "KYC masking required",
                        hint:  "Full Aadhaar/PAN numbers must not appear in APIs, PDFs, tables, or invoices.",
                        checked: kycMasking, onChange: setKycMasking,
                      },
                      {
                        label: "Deposit refund requires inspection",
                        hint:  "Security deposit refund blocked until physical inspection report is recorded.",
                        checked: depositInspection, onChange: setDepositInspection,
                      },
                      {
                        label: "Partner final receipt requires admin approval",
                        hint:  "Partners create receipt requests only. Final receipt issued after admin confirms money received.",
                        checked: partnerApproval, onChange: setPartnerApproval,
                      },
                      {
                        label: "GST docs require HSN/SAC (when registered)",
                        hint:  "HSN/SAC codes must appear on tax invoices once GST registration is active.",
                        checked: hsnSac, onChange: setHsnSac,
                      },
                    ].map(({ label, hint, checked, onChange }) => (
                      <label key={label} className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">{hint}</p>
                        </div>
                        <Toggle checked={checked} onChange={onChange} />
                      </label>
                    ))}
                  </div>
                </section>

                {/* Governance notes */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Governance notes</h3>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
                    placeholder="Record advocate/CA review status, approval dates, reviewer names, scope of opinions…"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
                </section>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving}
                    className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition">
                    {saving ? "Saving…" : "Save controls"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Last updated: {fmt(data.policy.updated_at)}
                  </span>
                </div>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════ CLASSIFICATION */}
          {tab === "classification" && (
            <div className="space-y-6">

              {/* Legal classification framework */}
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-800">
                    APPROVED FRAMEWORK
                  </span>
                </div>
                <h3 className="mt-1 text-base font-bold text-foreground">
                  Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Legally-approved classification for Lucky Plan. Every document, API response, UI label, and
                  communication must conform.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">Approved wording</h4>
                    <ul className="space-y-1.5">
                      {APPROVED_WORDING.map((w) => (
                        <li key={w} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-red-700">Blocked wording</h4>
                    <ul className="space-y-1.5">
                      {BLOCKED_WORDING.map((w) => (
                        <li key={w} className="flex items-center gap-2 text-sm">
                          <X className="h-4 w-4 shrink-0 text-red-400" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Dangerous patterns */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Dangerous structural patterns</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Pattern</th>
                        <th className="pb-2 text-left text-xs font-semibold text-muted-foreground">Why dangerous</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {DANGEROUS_PATTERNS.map((r) => (
                        <tr key={r.pattern}>
                          <td className="py-2.5 pr-4 text-red-800 font-medium">{r.pattern}</td>
                          <td className="py-2.5 text-muted-foreground">{r.risk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* GST thresholds */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">GST turnover thresholds — CA guidance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[400px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Turnover</th>
                        <th className="pb-2 text-left text-xs font-semibold text-muted-foreground">Required action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {GST_THRESHOLDS.map((r) => (
                        <tr key={r.amount}>
                          <td className="py-2.5 pr-4 font-mono font-semibold text-foreground">{r.amount}</td>
                          <td className="py-2.5 text-muted-foreground">{r.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Waiver accounting matrix */}
              {matrix.length > 0 && (
                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-1 text-sm font-semibold text-foreground">Waiver accounting treatment matrix</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    CA-guided scenario mapping — delivery × invoice × GST status → accounting mode.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          {["Scenario", "GST status", "Delivery", "Invoice", "Accounting mode", "Document", "Description"].map((h) => (
                            <th key={h} className="pb-2 pr-3 text-left font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {matrix.map((row) => (
                          <tr key={row.scenario} className="hover:bg-muted/20">
                            <td className={`py-2 pr-3 font-bold ${scenarioColor(row.scenario)}`}>{row.scenario}</td>
                            <td className="py-2 pr-3 font-mono text-muted-foreground">{row.gst_status}</td>
                            <td className="py-2 pr-3">{row.delivery_status}</td>
                            <td className="py-2 pr-3">{row.invoice_status}</td>
                            <td className="py-2 pr-3">
                              <span className={`rounded px-1.5 py-0.5 font-semibold text-[11px] ${
                                row.gst_credit_note
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-muted text-muted-foreground"
                              }`}>
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
                  <p className="mt-2 text-xs text-amber-700 font-medium">
                    ⚠ Scenario D requires CA approval before a GST credit note can be generated.
                  </p>
                </section>
              )}

              {/* Live classifier */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-1 text-sm font-semibold text-foreground">Live waiver classifier</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Select the transaction conditions to see the required accounting treatment and documents.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  {[
                    { label: "GST status",      val: classifyGst,      set: setClassifyGst,      options: ["GST_UNREGISTERED", "GST_REGULAR", "GST_COMPOSITION"] },
                    { label: "Delivery status", val: classifyDelivery, set: setClassifyDelivery, options: ["DELIVERED", "NOT_DELIVERED"] },
                    { label: "Invoice status",  val: classifyInvoice,  set: setClassifyInvoice,  options: ["ISSUED", "NOT_ISSUED"] },
                  ].map(({ label, val, set, options }) => (
                    <label key={label} className="grid gap-1 text-sm">
                      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                      <select value={val} onChange={(e) => set(e.target.value)}
                        className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                        {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                  ))}
                  <button type="button" onClick={() => void runClassify()} disabled={classifying}
                    className="h-9 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition">
                    {classifying ? "Classifying…" : "Classify"}
                  </button>
                </div>

                {classifyErr && (
                  <p className="mt-3 text-xs text-red-600">{classifyErr}</p>
                )}

                {classifyResult && (
                  <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-base ${scenarioColor(classifyResult.scenario)}`}>
                        Scenario {classifyResult.scenario}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        classifyResult.gst_reduction_allowed
                          ? "bg-orange-100 text-orange-800"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {classifyResult.waiver_accounting_mode.replace(/_/g, " ")}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        classifyResult.waiver_allowed
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {classifyResult.waiver_allowed ? "Waiver allowed" : "Waiver blocked"}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{classifyResult.audit_reason}</p>
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      <div>
                        <span className="font-semibold">Document to generate:</span>{" "}
                        {classifyResult.document_to_generate.replace(/_/g, " ")}
                      </div>
                      <div>
                        <span className="font-semibold">Ledger posting:</span>{" "}
                        {classifyResult.ledger_posting_template}
                      </div>
                    </div>
                    {classifyResult.gst_reduction_allowed && (
                      <p className="text-xs text-orange-800 font-semibold">
                        ⚠ GST Credit Note required — needs CA approval before generation.
                      </p>
                    )}
                    {classifyResult.blockers.length > 0 && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-xs font-semibold text-red-800 mb-1">Blockers:</p>
                        <ul className="space-y-0.5">
                          {classifyResult.blockers.map((b) => (
                            <li key={b} className="text-xs text-red-700 flex items-start gap-1.5">
                              <X className="mt-0.5 h-3 w-3 shrink-0" /> {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {classifyResult.warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-1">Warnings:</p>
                        <ul className="space-y-0.5">
                          {classifyResult.warnings.map((w) => (
                            <li key={w} className="text-xs text-amber-700 flex items-start gap-1.5">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════ DOCUMENTS */}
          {tab === "documents" && (
            <div className="space-y-6">

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  All documents uploaded here are <strong>private and admin-only</strong>. They are not visible on any
                  public policy page. These are your internal legal records.
                </span>
              </div>

              {/* Upload form */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-foreground">Upload new document</h3>
                <form onSubmit={(e) => void uploadDoc(e)} className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Document type</span>
                    <select value={docType} onChange={(e) => setDocType(e.target.value as DocTypeValue)}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
                      {ALL_DOC_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">
                      Title / reference <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="e.g. Advocate Legal Opinion on Lucky Plan — Aug 2026"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1.5 text-sm md:col-span-2">
                    <span className="font-semibold">
                      Internal notes <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} rows={2}
                      placeholder="Reviewer name, date of advice, scope of opinion…"
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
                  </label>
                  <label className="grid gap-1.5 text-sm md:col-span-2">
                    <span className="font-semibold">File <span className="text-red-600">*</span></span>
                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-semibold" />
                    <span className="text-xs text-muted-foreground">PDF, DOC, DOCX, JPG, PNG. Max 20 MB.</span>
                  </label>
                  {uploadErr && (
                    <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      {uploadErr}
                    </p>
                  )}
                  {uploadOk && (
                    <p className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {uploadOk}
                    </p>
                  )}
                  <div className="md:col-span-2">
                    <button type="submit" disabled={uploading || !docFile}
                      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition">
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload document"}
                    </button>
                  </div>
                </form>
              </section>

              {/* Document list */}
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Uploaded documents ({docs.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Workflow: Upload → Submit for Review → Approve
                  </p>
                </div>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {docs.map((doc) => {
                      const status = doc.review_status ?? doc.verification_status ?? "PENDING";
                      return (
                        <div key={doc.id}
                          className="rounded-xl border border-border bg-background p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${docStatusColor(status)}`}>
                                  {status.replace(/_/g, " ")}
                                </span>
                                {!doc.has_file && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                    No file
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-medium text-sm text-foreground truncate" title={doc.title || undefined}>
                                {doc.title || <span className="italic text-muted-foreground">Untitled</span>}
                              </p>
                              {doc.notes && (
                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
                              )}
                              {doc.rejected_reason && (
                                <p className="mt-1 text-xs text-red-700 font-medium">
                                  Rejection reason: {doc.rejected_reason}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs text-muted-foreground">{fmt(doc.created_at)}</p>
                              {doc.verified_at && (
                                <p className="text-xs text-emerald-700">Verified {fmt(doc.verified_at)}</p>
                              )}
                            </div>
                          </div>
                          <DocActionRow
                            doc={doc}
                            onUpdate={(updated) =>
                              setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════ CHECKLIST */}
          {tab === "checklist" && (
            <div className="space-y-6">

              {/* Progress */}
              <div className="flex items-center gap-4">
                <div className="rounded-xl border border-border bg-card px-5 py-3 text-center shrink-0">
                  <div className={`text-2xl font-bold ${doneCount === launchChecklist.length ? "text-emerald-600" : "text-amber-600"}`}>
                    {doneCount}/{launchChecklist.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Gates cleared</div>
                </div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${doneCount === launchChecklist.length ? "bg-emerald-500" : "bg-amber-400"}`}
                      style={{ width: `${(doneCount / launchChecklist.length) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {launchChecklist.length - doneCount} item{launchChecklist.length - doneCount !== 1 ? "s" : ""} remaining before public launch
                  </p>
                </div>
              </div>

              {/* Gate list */}
              <div className="space-y-2">
                {launchChecklist.map((item) => (
                  <Gate
                    key={item.label}
                    label={item.label}
                    ok={item.done}
                    note={!item.done ? (item.note ?? undefined) : undefined}
                    onFix={!item.done && item.tab ? () => setTab(item.tab!) : undefined}
                  />
                ))}
              </div>

              {/* Completion / remaining banner */}
              {doneCount === launchChecklist.length ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                  <p className="text-base font-bold text-emerald-900">All launch gates cleared.</p>
                  <p className="mt-1 text-sm text-emerald-700">Lucky Plan waiver is ready for public launch.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <strong>{launchChecklist.length - doneCount} item{launchChecklist.length - doneCount !== 1 ? "s" : ""} remaining.</strong>{" "}
                  Use the <ChevronRight className="inline h-3.5 w-3.5" /> Fix buttons above to jump to the right tab.
                  Blockers in the Overview tab explain the full resolution path.
                </div>
              )}

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
                <p className="font-semibold">Compliance note</p>
                <p>
                  The two core blockers (waiver status + GST) are <em>expected</em> at pre-launch stage.
                  Blocker 1 clears after advocate/CA sign-off and setting waiver status to &quot;Approved for Public Launch&quot;.
                  Blocker 2 clears after GST registration and updating Tax Profile.
                  Normal non-GST bill operations continue unaffected.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
