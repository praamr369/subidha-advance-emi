"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { Party360Embed, UniversalQuickWidgetsEmbed } from "@/components/profile/Profile360";
import ActionButton from "@/components/ui/ActionButton";
import {
  DataTableShell,
  DetailPanel,
  FormSection,
  Timeline,
} from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import {
  createAdminStaffIdentity,
  listAdminStaffIdentities,
  resetAdminStaffLoginPassword,
  updateAdminStaffLogin,
  type AdminStaffIdentity,
} from "@/services/staff";
import {
  approveSalarySheet,
  approveHrStaffAdvance,
  createHrLeaveRequest,
  createHrStaffAdvance,
  createHrStaffDocument,
  disburseHrStaffAdvance,
  downloadHrSalaryAgreementPdf,
  downloadHrStaffProfilePdf,
  getAdminAuditTimeline,
  getHrPayroll,
  getHrStaff,
  getHrStaffLeaveBalance,
  listHrAttendance,
  listHrExpenseClaims,
  listHrLeaveRequests,
  listHrLeaveTypes,
  listHrSalaryPayments,
  listHrStaffAdvances,
  listHrStaffDocuments,
  markHrAttendance,
  patchHrExpenseClaim,
  patchHrLeaveRequest,
  patchHrStaff,
  postSalarySheet,
  recoverHrStaffAdvance,
  recordSalaryPayment,
  reviewHrStaffDocument,
  setHrStaffStatus,
  type AdminAuditEntry,
  type HrAttendance,
  type HrExpenseClaim,
  type HrLeaveBalanceRow,
  type HrLeaveRequest,
  type HrLeaveType,
  type HrPayrollSheet,
  type HrSalaryPayment,
  type HrStaff,
  type HrStaffAdvance,
  type HrStaffDocument,
} from "@/services/admin-hr";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";

// ─── Constants ────────────────────────────────────────────────────────────────

const DETAIL_TABS = [
  "Overview", "360 View", "Employment", "Attendance",
  "Payroll", "Advances", "Documents", "KYC", "Access", "Timeline",
] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const ATT_STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "LATE", "LEAVE", "HOLIDAY", "WEEKLY_OFF"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffAuditEntry = AdminAuditEntry & { source_label: string };

type EditForm = {
  name: string; phone: string; designation: string; department: string;
  branch: string; joining_date: string; employment_type: string; weekly_off: string;
  base_salary: string; daily_wage_rate: string; hourly_wage_rate: string;
  piece_rate_amount: string; piece_rate_unit_label: string;
  salary_effective_from: string; salary_pay_day: string;
  temporary_contract_end_date: string; kyc_id_type: string; kyc_id_number: string;
  kyc_verified: boolean; address: string; emergency_contact_name: string;
  emergency_contact_relation: string; emergency_contact_phone: string;
  cost_center_code: string; payroll_expense_account: string;
  employment_status: string; reporting_manager: string; work_location: string;
  probation_end_date: string; attendance_policy: string; shift_name: string;
  payroll_eligible: boolean; payment_mode: string; bank_account_name: string;
  bank_account_number: string; bank_ifsc: string; upi_id: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function fmtCur(v?: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : "₹" + n.toLocaleString("en-IN");
}

function fmtDatetime(iso?: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

function mask(value?: string | null) {
  const text = (value || "").trim();
  if (!text) return "—";
  if (text.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formFromStaff(staff: HrStaff): EditForm {
  return {
    name: staff.name || "", phone: staff.phone || "", designation: staff.designation || "",
    department: staff.department || "", branch: staff.branch ? String(staff.branch) : "",
    joining_date: staff.joining_date || "", employment_type: staff.employment_type || "PERMANENT_MONTHLY",
    weekly_off: staff.weekly_off || "", base_salary: staff.base_salary || "",
    daily_wage_rate: staff.daily_wage_rate || "", hourly_wage_rate: staff.hourly_wage_rate || "",
    piece_rate_amount: staff.piece_rate_amount || "", piece_rate_unit_label: staff.piece_rate_unit_label || "",
    salary_effective_from: staff.salary_effective_from || "",
    salary_pay_day: staff.salary_pay_day != null ? String(staff.salary_pay_day) : "",
    temporary_contract_end_date: staff.temporary_contract_end_date || "",
    kyc_id_type: staff.kyc_id_type || "", kyc_id_number: staff.kyc_id_number || "",
    kyc_verified: Boolean(staff.kyc_verified), address: staff.address || "",
    emergency_contact_name: staff.emergency_contact_name || "",
    emergency_contact_relation: staff.emergency_contact_relation || "",
    emergency_contact_phone: staff.emergency_contact_phone || "",
    cost_center_code: staff.cost_center_code || "",
    payroll_expense_account: staff.payroll_expense_account ? String(staff.payroll_expense_account) : "",
    employment_status: staff.employment_status || (staff.is_active ? "ACTIVE" : "DRAFT"),
    reporting_manager: staff.reporting_manager || "", work_location: staff.work_location || "",
    probation_end_date: staff.probation_end_date || "", attendance_policy: staff.attendance_policy || "",
    shift_name: staff.shift_name || "", payroll_eligible: Boolean(staff.payroll_eligible),
    payment_mode: staff.payment_mode || "CASH", bank_account_name: staff.bank_account_name || "",
    bank_account_number: staff.bank_account_number || "", bank_ifsc: staff.bank_ifsc || "",
    upi_id: staff.upi_id || "",
  };
}

function formatAuditAction(actionType: string) {
  return actionType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAuditMeta(metadata?: Record<string, unknown>) {
  if (!metadata) return "";
  const parts: string[] = [];
  const get = (k: string) => metadata[k] ? String(metadata[k]) : "";
  if (get("document_type") || get("title")) parts.push([get("document_type"), get("title")].filter(Boolean).join(" · "));
  if (get("status")) parts.push(`Status: ${get("status")}`);
  if (get("reason")) parts.push(`Reason: ${get("reason")}`);
  if (get("notes")) parts.push(get("notes"));
  return parts.join(" | ");
}

// ─── Small UI components ──────────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function ReadinessBadge({ ready, label }: { ready?: boolean; label: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      {ready ? "✓" : "!"} {label}
    </span>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: string; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const bg = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-red-200 bg-red-50", neutral: "border-border bg-card" };
  const tx = { ok: "text-emerald-900", warn: "text-amber-900", bad: "text-red-900", neutral: "text-foreground" };
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg[tone]}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold leading-tight ${tx[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TinyTable({ empty, columns, rows }: { empty: string; columns: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return <ERPEmptyState title={empty} />;
  return (
    <DataTableShell className="p-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>{columns.map((c) => <th key={c} className="py-2 pr-4 font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-muted/20">
                {row.map((cell, j) => <td key={j} className="py-2 pr-4 align-top">{cell ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataTableShell>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-bold text-foreground">{children}</h3>;
}

function Notice({ ok, children, onClose }: { ok?: boolean; children: ReactNode; onClose?: () => void }) {
  const cls = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <span className="flex-1">{children}</span>
      {onClose && <button type="button" onClick={onClose} className="ml-2 text-xs opacity-60 hover:opacity-100">✕</button>}
    </div>
  );
}

// ─── EditPanel ────────────────────────────────────────────────────────────────

function EditPanel({ staff, branches, onCancel, onSaved }: {
  staff: HrStaff; branches: BranchRecord[]; onCancel: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState("BASIC");
  const [form, setForm] = useState<EditForm>(() => formFromStaff(staff));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm((c) => ({ ...c, [k]: v }));
  const canSave = form.name.trim().length >= 2 && form.phone.trim().length >= 8;

  const TABS = ["BASIC", "EMPLOYMENT", "PAYROLL", "KYC", "EMERGENCY", "ACCESS"];

  async function save() {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      await patchHrStaff(staff.id, {
        name: form.name.trim(), phone: form.phone.trim(), designation: form.designation.trim(),
        department: form.department.trim(), branch: form.branch ? Number(form.branch) : null,
        joining_date: form.joining_date || null, employment_status: form.employment_status,
        employment_type: form.employment_type, weekly_off: form.weekly_off.trim(),
        reporting_manager: form.reporting_manager.trim(), work_location: form.work_location.trim(),
        probation_end_date: form.probation_end_date || null,
        attendance_policy: form.attendance_policy.trim(), shift_name: form.shift_name.trim(),
        base_salary: form.base_salary.trim() || null, daily_wage_rate: form.daily_wage_rate.trim() || null,
        hourly_wage_rate: form.hourly_wage_rate.trim() || null,
        piece_rate_amount: form.piece_rate_amount.trim() || null,
        piece_rate_unit_label: form.piece_rate_unit_label.trim(),
        payroll_eligible: form.payroll_eligible, payment_mode: form.payment_mode,
        bank_account_name: form.bank_account_name.trim(),
        bank_account_number: form.bank_account_number.trim(), bank_ifsc: form.bank_ifsc.trim(),
        upi_id: form.upi_id.trim(), salary_effective_from: form.salary_effective_from || null,
        salary_pay_day: form.salary_pay_day ? Number(form.salary_pay_day) : null,
        temporary_contract_end_date: form.temporary_contract_end_date || null,
        kyc_id_type: form.kyc_id_type.trim(), kyc_id_number: form.kyc_id_number.trim(),
        kyc_verified: form.kyc_verified, address: form.address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_relation: form.emergency_contact_relation.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        cost_center_code: form.cost_center_code.trim(),
        payroll_expense_account: form.payroll_expense_account ? Number(form.payroll_expense_account) : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save changes.");
    } finally {
      setSaving(false);
    }
  }

  function inp(label: string, key: keyof EditForm, type = "text") {
    return (
      <label key={key} className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        <input type={type} value={String(form[key])} onChange={(e) => up(key, e.target.value as EditForm[typeof key])}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary" />
      </label>
    );
  }

  return (
    <FormSection title="Edit Staff Profile" description="Changes are saved immediately to this employee's HR record.">
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {tab === "BASIC" && (
        <div className="grid gap-3 md:grid-cols-3">
          {inp("Full name", "name")}
          {inp("Phone", "phone")}
          {inp("Role / title", "designation")}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Branch
            <select value={form.branch} onChange={(e) => up("branch", e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
              <option value="">No branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          {inp("Department", "department")}
          {inp("Joining date", "joining_date", "date")}
          {inp("Address", "address")}
        </div>
      )}

      {tab === "EMPLOYMENT" && (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
            <select value={form.employment_status} onChange={(e) => up("employment_status", e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
              {["DRAFT", "ONBOARDING", "ACTIVE", "INACTIVE"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Employment type
            <select value={form.employment_type} onChange={(e) => up("employment_type", e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
              {["PERMANENT_MONTHLY", "TEMPORARY", "DAILY_WAGE", "HOURLY", "PIECE_RATE", "MANUFACTURING", "SERVICE"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          {inp("Reporting manager", "reporting_manager")}
          {inp("Work location", "work_location")}
          {inp("Probation end date", "probation_end_date", "date")}
          {inp("Attendance policy", "attendance_policy")}
          {inp("Shift", "shift_name")}
          {inp("Weekly off", "weekly_off")}
          {inp("Contract end date", "temporary_contract_end_date", "date")}
        </div>
      )}

      {tab === "PAYROLL" && (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground md:col-span-3">
            <input type="checkbox" checked={form.payroll_eligible} onChange={(e) => up("payroll_eligible", e.target.checked)} />
            Payroll eligible
          </label>
          {inp("Base salary", "base_salary")}
          {inp("Daily wage rate", "daily_wage_rate")}
          {inp("Hourly wage rate", "hourly_wage_rate")}
          {inp("Piece rate amount", "piece_rate_amount")}
          {inp("Piece rate unit", "piece_rate_unit_label")}
          {inp("Salary effective from", "salary_effective_from", "date")}
          {inp("Salary pay day (1–31)", "salary_pay_day")}
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment mode
            <select value={form.payment_mode} onChange={(e) => up("payment_mode", e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
              <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option>
            </select>
          </label>
          {inp("Bank account name", "bank_account_name")}
          {inp("Bank account number", "bank_account_number")}
          {inp("IFSC", "bank_ifsc")}
          {inp("UPI ID", "upi_id")}
          {inp("Cost center", "cost_center_code")}
          {inp("Payroll expense account (ID)", "payroll_expense_account")}
        </div>
      )}

      {tab === "KYC" && (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            KYC ID type
            <select value={form.kyc_id_type} onChange={(e) => up("kyc_id_type", e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
              {["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT", "OTHER"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          {inp("KYC ID number", "kyc_id_number")}
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input type="checkbox" checked={form.kyc_verified} onChange={(e) => up("kyc_verified", e.target.checked)} />
            KYC verified
          </label>
        </div>
      )}

      {tab === "EMERGENCY" && (
        <div className="grid gap-3 md:grid-cols-3">
          {inp("Emergency contact name", "emergency_contact_name")}
          {inp("Emergency relation", "emergency_contact_relation")}
          {inp("Emergency phone", "emergency_contact_phone")}
        </div>
      )}

      {tab === "ACCESS" && (
        <p className="text-sm text-muted-foreground">Login management is on the Access tab below. Use this panel for profile data only.</p>
      )}

      {error && <Notice>{error}</Notice>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Changes save to HR record only — no payroll journals posted here.</span>
        <div className="flex gap-2">
          <ActionButton variant="ghost" onClick={onCancel}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={!canSave} loading={saving} onClick={() => void save()}>Save Profile</ActionButton>
        </div>
      </div>
    </FormSection>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminHrStaffProfilePage() {
  const params = useParams<{ id: string }>();
  const staffId = Number(params.id);

  // Core data
  const [staff,          setStaff]          = useState<HrStaff | null>(null);
  const [identity,       setIdentity]       = useState<AdminStaffIdentity | null>(null);
  const [branches,       setBranches]       = useState<BranchRecord[]>([]);
  const [documents,      setDocuments]      = useState<HrStaffDocument[]>([]);
  const [attendance,     setAttendance]     = useState<HrAttendance[]>([]);
  const [leave,          setLeave]          = useState<HrLeaveRequest[]>([]);
  const [leaveBalance,   setLeaveBalance]   = useState<HrLeaveBalanceRow[]>([]);
  const [leaveTypes,     setLeaveTypes]     = useState<HrLeaveType[]>([]);
  const [expenses,       setExpenses]       = useState<HrExpenseClaim[]>([]);
  const [salarySheets,   setSalarySheets]   = useState<HrPayrollSheet[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<HrSalaryPayment[]>([]);
  const [advances,       setAdvances]       = useState<HrStaffAdvance[]>([]);
  const [auditEntries,   setAuditEntries]   = useState<StaffAuditEntry[]>([]);
  const [financeAccounts,setFinanceAccounts]= useState<FinanceAccount[]>([]);

  // UI
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [notice,       setNotice]       = useState<string | null>(null);
  const [editing,      setEditing]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<DetailTab>("Overview");

  // Deactivation
  const [deactivateOpen,   setDeactivateOpen]   = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [deactivateSaving, setDeactivateSaving] = useState(false);

  // Documents
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState({ document_type: "OTHER", title: "", document_no: "", notes: "", file: null as File | null });
  const [uploadSaving, setUploadSaving] = useState(false);
  const [reviewModal, setReviewModal] = useState<{ documentId: number; action: "verify" | "reject"; title: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  // Access
  const [loginUsername,    setLoginUsername]    = useState("");
  const [loginEmail,       setLoginEmail]       = useState("");
  const [accessSaving,     setAccessSaving]     = useState(false);
  const [accessError,      setAccessError]      = useState<string | null>(null);
  const [generatedPassword,setGeneratedPassword]= useState<string | null>(null);

  // Payroll
  const [payrollSaving, setPayrollSaving] = useState<number | null>(null);
  const [payrollError,  setPayrollError]  = useState<string | null>(null);
  const [payForm, setPayForm] = useState<{ salarySheetId: number; amount: string; financeAccount: string; referenceNo: string; paymentDate: string } | null>(null);

  // Attendance
  const [attMonth, setAttMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [attForm, setAttForm] = useState({ date: new Date().toISOString().slice(0, 10), status: "PRESENT", worked_hours: "", overtime_hours: "", notes: "" });
  const [attSaving, setAttSaving] = useState(false);
  const [attError,  setAttError]  = useState<string | null>(null);
  const [attMsg,    setAttMsg]    = useState<string | null>(null);

  // Leave request form
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_type: "", start_date: "", end_date: "", reason: "" });
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveFormErr, setLeaveFormErr] = useState<string | null>(null);

  // Expense actions
  const [expenseBusy, setExpenseBusy] = useState<number | null>(null);
  const [expenseErr,  setExpenseErr]  = useState<string | null>(null);

  // Advance form
  const [advanceFormOpen, setAdvanceFormOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: "", reason: "", notes: "", request_date: new Date().toISOString().slice(0, 10) });
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceErr, setAdvanceErr] = useState<string | null>(null);

  // Advance disburse
  const [disburseForm, setDisburseForm] = useState<{ advanceId: number; finance_account: string; disbursement_date: string; reference_no: string } | null>(null);
  const [disburseSaving, setDisburseSaving] = useState(false);

  // Recovery form
  const [recoverForm, setRecoverForm] = useState<{ advanceId: number; finance_account: string; recovery_date: string; amount: string; reference_no: string } | null>(null);
  const [recoverSaving, setRecoverSaving] = useState(false);

  const attendanceSummary = useMemo(() => {
    const count = (s: string) => attendance.filter((r) => r.status === s).length;
    const [y, m] = attMonth.split("-").map(Number);
    const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 0;
    return {
      present: count("PRESENT"), halfDay: count("HALF_DAY"),
      absent: count("ABSENT"), late: count("LATE"),
      leave: count("LEAVE"), holiday: count("HOLIDAY"),
      weeklyOff: count("WEEKLY_OFF"),
      notMarked: Math.max(daysInMonth - attendance.length, 0), daysInMonth,
    };
  }, [attendance, attMonth]);

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadAttendanceMonth(month: string) {
    if (!staffId) return;
    const [year, monthNo] = month.split("-").map(Number);
    if (!year || !monthNo) return;
    const lastDay = new Date(year, monthNo, 0).getDate();
    try {
      const payload = await listHrAttendance(`employee=${staffId}&from=${month}-01&to=${month}-${String(lastDay).padStart(2, "0")}`);
      setAttendance([...payload.results].sort((a, b) => a.attendance_date < b.attendance_date ? -1 : 1));
      setAttError(null);
    } catch (err) {
      setAttError(err instanceof Error ? err.message : "Unable to load attendance.");
    }
  }

  const load = useCallback(async () => {
    if (!staffId) return;
    try {
      setLoading(true);
      const [staffRes, branchRes, docsRes, leaveRes, expenseRes, payrollRes, paymentRes, identityRes, financeRes, leaveBalRes, advRes, leaveTypeRes] = await Promise.all([
        getHrStaff(staffId),
        listBranches({ status: "ACTIVE" }),
        listHrStaffDocuments({ employee: staffId }),
        listHrLeaveRequests({ employee: staffId }),
        listHrExpenseClaims({ employee: staffId }),
        getHrPayroll({ employee: staffId }),
        listHrSalaryPayments({ employee: staffId }),
        listAdminStaffIdentities(),
        listFinanceAccounts({ is_active: 1 }),
        getHrStaffLeaveBalance(staffId).catch(() => ({ results: [] as HrLeaveBalanceRow[], year: 0, employee_id: staffId })),
        listHrStaffAdvances().catch(() => ({ count: 0, results: [] as HrStaffAdvance[] })),
        listHrLeaveTypes().catch(() => ({ count: 0, results: [] as HrLeaveType[] })),
      ]);

      const foundIdentity = identityRes.results.find((i) => i.employee === staffRes.id) ?? null;

      const auditPayloads = await Promise.all([
        getAdminAuditTimeline("EmployeeProfile", staffRes.id),
        foundIdentity ? getAdminAuditTimeline("StaffIdentity", foundIdentity.id) : Promise.resolve([] as AdminAuditEntry[]),
        getAdminAuditTimeline("EmployeeDocument", staffRes.id),
      ]);

      setStaff(staffRes);
      setIdentity(foundIdentity);
      setBranches(branchRes.results ?? []);
      setDocuments(docsRes.results ?? []);
      setLeave(leaveRes.results ?? []);
      setLeaveBalance(leaveBalRes.results ?? []);
      setLeaveTypes(leaveTypeRes.results ?? []);
      setExpenses(expenseRes.results ?? []);
      setSalarySheets(payrollRes.salary_sheets ?? []);
      setSalaryPayments(paymentRes.results ?? []);
      setFinanceAccounts(financeRes.results ?? []);
      setAdvances((advRes.results ?? []).filter((a) => a.employee === staffRes.id));
      setAuditEntries(
        auditPayloads
          .flatMap((entries, idx) => entries.map((e) => ({ ...e, source_label: idx === 0 ? "EmployeeProfile" : idx === 1 ? "StaffIdentity" : "EmployeeDocument" })))
          .sort((a, b) => a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load staff profile.");
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAttendanceMonth(attMonth); }, [staffId, attMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleDeactivate() {
    if (!staff || !deactivateReason.trim()) return;
    setDeactivateSaving(true);
    try {
      await setHrStaffStatus(staff.id, "DEACTIVATE", deactivateReason.trim());
      setNotice(`${staff.name} deactivated. All history preserved.`);
      setDeactivateOpen(false); setDeactivateReason("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to deactivate."); }
    finally { setDeactivateSaving(false); }
  }

  async function handleReactivate() {
    if (!staff) return;
    try {
      await setHrStaffStatus(staff.id, "REACTIVATE");
      setNotice(`${staff.name} reactivated.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reactivate."); }
  }

  async function submitAttendance() {
    if (!staff || !attForm.date) { setAttError("Pick a date."); return; }
    setAttSaving(true); setAttError(null); setAttMsg(null);
    try {
      await markHrAttendance({ employee: staff.id, attendance_date: attForm.date, status: attForm.status, notes: attForm.notes || undefined, worked_hours: attForm.worked_hours || null, overtime_hours: attForm.overtime_hours || null });
      setAttMsg(`Attendance saved: ${attForm.date} — ${attForm.status}`);
      setAttForm((c) => ({ ...c, notes: "", worked_hours: "", overtime_hours: "" }));
      await loadAttendanceMonth(attMonth);
    } catch (err) { setAttError(err instanceof Error ? err.message : "Failed to save."); }
    finally { setAttSaving(false); }
  }

  async function submitLeaveRequest() {
    if (!staff || !leaveForm.leave_type || !leaveForm.start_date) { setLeaveFormErr("Leave type and start date are required."); return; }
    setLeaveSaving(true); setLeaveFormErr(null);
    try {
      await createHrLeaveRequest({ employee: staff.id, leave_type: Number(leaveForm.leave_type), start_date: leaveForm.start_date, end_date: leaveForm.end_date || undefined, reason: leaveForm.reason || undefined });
      setNotice("Leave request submitted.");
      setLeaveFormOpen(false); setLeaveForm({ leave_type: "", start_date: "", end_date: "", reason: "" });
      await load();
    } catch (err) { setLeaveFormErr(err instanceof Error ? err.message : "Failed to submit."); }
    finally { setLeaveSaving(false); }
  }

  async function actOnExpense(id: number, action: "APPROVE" | "REJECT") {
    setExpenseBusy(id); setExpenseErr(null);
    try {
      await patchHrExpenseClaim(id, { action });
      await load();
    } catch (err) { setExpenseErr(err instanceof Error ? err.message : "Action failed."); }
    finally { setExpenseBusy(null); }
  }

  async function actOnLeave(id: number, action: "APPROVE" | "REJECT") {
    try {
      await patchHrLeaveRequest(id, { action });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); }
  }

  async function submitAdvance() {
    if (!staff || !advanceForm.amount.trim() || !advanceForm.reason.trim()) { setAdvanceErr("Amount and reason are required."); return; }
    setAdvanceSaving(true); setAdvanceErr(null);
    try {
      await createHrStaffAdvance({ employee: staff.id, request_date: advanceForm.request_date, amount: advanceForm.amount.trim(), reason: advanceForm.reason.trim(), notes: advanceForm.notes.trim() || undefined });
      setNotice("Staff advance request created.");
      setAdvanceFormOpen(false); setAdvanceForm({ amount: "", reason: "", notes: "", request_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (err) { setAdvanceErr(err instanceof Error ? err.message : "Failed to create."); }
    finally { setAdvanceSaving(false); }
  }

  async function advanceApprove(id: number) {
    try {
      await approveHrStaffAdvance(id);
      setNotice("Advance approved.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to approve."); }
  }

  async function submitDisburse() {
    if (!disburseForm) return;
    setDisburseSaving(true);
    try {
      await disburseHrStaffAdvance(disburseForm.advanceId, { finance_account: Number(disburseForm.finance_account), disbursement_date: disburseForm.disbursement_date, reference_no: disburseForm.reference_no || undefined });
      setNotice("Advance disbursed.");
      setDisburseForm(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to disburse."); }
    finally { setDisburseSaving(false); }
  }

  async function submitRecover() {
    if (!recoverForm) return;
    setRecoverSaving(true);
    try {
      await recoverHrStaffAdvance(recoverForm.advanceId, { finance_account: Number(recoverForm.finance_account), recovery_date: recoverForm.recovery_date, amount: recoverForm.amount, reference_no: recoverForm.reference_no || undefined });
      setNotice("Recovery recorded.");
      setRecoverForm(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to record recovery."); }
    finally { setRecoverSaving(false); }
  }

  async function uploadDocument() {
    if (!staff || !upload.title.trim() || !upload.file) return;
    setUploadSaving(true);
    try {
      const fd = new FormData();
      fd.append("employee", String(staff.id));
      fd.append("document_type", upload.document_type);
      fd.append("title", upload.title.trim());
      fd.append("document_no", upload.document_no.trim());
      fd.append("notes", upload.notes.trim());
      fd.append("file", upload.file);
      await createHrStaffDocument(fd);
      setUpload({ document_type: "OTHER", title: "", document_no: "", notes: "", file: null });
      setUploadOpen(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setUploadSaving(false); }
  }

  async function submitReview() {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      await reviewHrStaffDocument(reviewModal.documentId, reviewModal.action, reviewNotes);
      setNotice(`Document ${reviewModal.action === "verify" ? "verified" : "rejected"}.`);
      setReviewModal(null); setReviewNotes("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Review failed."); }
    finally { setReviewSaving(false); }
  }

  async function createLoginForStaff() {
    if (!staff || !loginUsername.trim()) { setAccessError("Enter a username."); return; }
    setAccessSaving(true); setAccessError(null);
    try {
      const created = await createAdminStaffIdentity({ employee: staff.id, name: staff.name, phone: staff.phone, email: loginEmail.trim() || undefined, username: loginUsername.trim(), joining_date: staff.joining_date, login_enabled: true });
      setGeneratedPassword(created.temporary_password ?? null);
      setLoginUsername(""); setLoginEmail("");
      await load();
    } catch (err) { setAccessError(err instanceof Error ? err.message : "Unable to create login."); }
    finally { setAccessSaving(false); }
  }

  async function toggleLoginEnabled() {
    if (!identity) return;
    setAccessSaving(true); setAccessError(null);
    try { await updateAdminStaffLogin(identity.id, !identity.login_enabled); await load(); }
    catch (err) { setAccessError(err instanceof Error ? err.message : "Unable to toggle."); }
    finally { setAccessSaving(false); }
  }

  async function resetLoginPassword() {
    if (!identity) return;
    setAccessSaving(true); setAccessError(null);
    try {
      const updated = await resetAdminStaffLoginPassword(identity.id);
      setGeneratedPassword(updated.temporary_password ?? null);
      await load();
    } catch (err) { setAccessError(err instanceof Error ? err.message : "Unable to reset."); }
    finally { setAccessSaving(false); }
  }

  async function approveSheet(id: number) {
    setPayrollSaving(id); setPayrollError(null);
    try { await approveSalarySheet(id); await load(); }
    catch (err) { setPayrollError(err instanceof Error ? err.message : "Failed."); }
    finally { setPayrollSaving(null); }
  }

  async function postSheet(id: number) {
    setPayrollSaving(id); setPayrollError(null);
    try { await postSalarySheet(id); await load(); }
    catch (err) { setPayrollError(err instanceof Error ? err.message : "Failed."); }
    finally { setPayrollSaving(null); }
  }

  async function submitPayment() {
    if (!payForm?.financeAccount) { setPayrollError("Select an account."); return; }
    setPayrollSaving(payForm.salarySheetId); setPayrollError(null);
    try {
      await recordSalaryPayment({ salary_sheet: payForm.salarySheetId, payment_date: payForm.paymentDate, amount: payForm.amount, finance_account: Number(payForm.financeAccount), reference_no: payForm.referenceNo.trim() || undefined });
      setPayForm(null); await load();
    } catch (err) { setPayrollError(err instanceof Error ? err.message : "Failed."); }
    finally { setPayrollSaving(null); }
  }

  // ── Render states ─────────────────────────────────────────────────────────────

  if (loading) return <ERPPageShell title="Staff Profile"><ERPLoadingState label="Loading staff profile…" /></ERPPageShell>;
  if (error && !staff) return <ERPPageShell title="Staff Profile"><ERPErrorState title="Profile unavailable" description={error} onRetry={() => void load()} /></ERPPageShell>;
  if (!staff) return <ERPPageShell title="Staff Profile"><ERPEmptyState title="Staff not found" /></ERPPageShell>;

  const pendingLeave    = leave.filter((l) => l.status === "PENDING");
  const pendingExpenses = expenses.filter((e) => e.status === "PENDING");
  const pendingAdvances = advances.filter((a) => a.status === "DRAFT");
  const outstandingAdv  = advances.filter((a) => ["DISBURSED", "PARTIALLY_RECOVERED"].includes(a.status));
  const avatarBg        = staff.is_active ? "bg-primary" : "bg-muted";

  return (
    <ERPPageShell
      eyebrow="HR · Staff 360"
      title={staff.name}
      subtitle={`${staff.employee_code || `Staff #${staff.id}`} · ${staff.department || "No department"} · ${staff.designation || staff.employment_type || "No role"}`}
      breadcrumbs={[
        { label: "Admin",          href: ROUTES.admin.dashboard },
        { label: "HR",             href: ROUTES.admin.hr },
        { label: "Staff Register", href: ROUTES.admin.hrStaff },
        { label: staff.name },
      ]}
      statusBadge={{ label: staff.employment_status || (staff.is_active ? "Active" : "Inactive"), tone: staff.is_active ? "success" : "warning" }}
      maxWidth="1180px"
    >
      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          {/* Avatar */}
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${avatarBg} text-2xl font-bold text-primary-foreground`}>
            {initials(staff.name)}
          </div>

          {/* Identity block */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{staff.name}</h1>
              <ERPStatusBadge status={staff.is_active ? "ACTIVE" : "INACTIVE"} label={staff.is_active ? "Active" : "Inactive"} size="md" />
              {staff.employment_status && staff.employment_status !== "ACTIVE" && staff.employment_status !== "INACTIVE" && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{staff.employment_status}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>ID: <strong className="text-foreground">{staff.employee_code || staff.id}</strong></span>
              {staff.designation && <span>Role: <strong className="text-foreground">{staff.designation}</strong></span>}
              {staff.department && <span>Dept: <strong className="text-foreground">{staff.department}</strong></span>}
              {staff.branch_name && <span>Branch: <strong className="text-foreground">{staff.branch_name}</strong></span>}
              {staff.phone && <span>Phone: <strong className="text-foreground">{staff.phone}</strong></span>}
              {staff.joining_date && <span>Joined: <strong className="text-foreground">{fmt(staff.joining_date)}</strong></span>}
            </div>

            {/* Readiness strip */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ReadinessBadge ready={staff.profile_ready}    label="Profile" />
              <ReadinessBadge ready={staff.employment_ready} label="Employment" />
              <ReadinessBadge ready={staff.payroll_ready}    label="Payroll" />
              <ReadinessBadge ready={staff.attendance_ready} label="Attendance" />
              <ReadinessBadge ready={staff.documents_ready}  label="KYC Docs" />
              <ReadinessBadge ready={staff.access_ready}     label="Portal Access" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <ActionButton variant="primary" onClick={() => setEditing(true)}>Edit Profile</ActionButton>
            {staff.is_active ? (
              <ActionButton variant="destructive" onClick={() => setDeactivateOpen(true)}>Deactivate</ActionButton>
            ) : (
              <ActionButton variant="secondary" onClick={() => void handleReactivate()}>Reactivate</ActionButton>
            )}
            <ActionButton onClick={() => void downloadHrStaffProfilePdf(staff.id, `staff-${staff.employee_code || staff.id}.pdf`)}>Profile PDF</ActionButton>
            <ActionButton onClick={() => void downloadHrSalaryAgreementPdf(staff.id, `salary-agreement-${staff.employee_code || staff.id}.pdf`)}>Salary Agreement</ActionButton>
          </div>
        </div>

        {/* Setup checklist — info only, admin can act regardless */}
        {!warningsDismissed && staff.readiness_warnings?.length ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            <span className="flex-1">
              <span className="font-semibold">Setup checklist: </span>
              {staff.readiness_warnings.join(" · ")}
              <span className="ml-2 text-blue-600 text-xs">(Admin can still mark attendance and run payroll)</span>
            </span>
            <button type="button" onClick={() => setWarningsDismissed(true)}
              className="shrink-0 text-blue-400 hover:text-blue-700 transition">✕</button>
          </div>
        ) : null}
      </div>

      {/* Deactivation dialog */}
      {deactivateOpen && (
        <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Deactivate {staff.name}</h3>
          <p className="text-xs text-muted-foreground">Payroll, attendance, documents, and audit history are fully preserved. The staff can be reactivated at any time.</p>
          <textarea value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder="Reason for deactivation (required)"
            className="w-full min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2 justify-end">
            <ActionButton variant="ghost" onClick={() => { setDeactivateOpen(false); setDeactivateReason(""); }}>Cancel</ActionButton>
            <ActionButton variant="destructive" disabled={!deactivateReason.trim()} loading={deactivateSaving} onClick={() => void handleDeactivate()}>Confirm Deactivation</ActionButton>
          </div>
        </div>
      )}

      {/* Notices */}
      {notice && <Notice ok onClose={() => setNotice(null)}>{notice}</Notice>}
      {error  && <Notice onClose={() => setError(null)}>{error}</Notice>}

      {/* Edit panel */}
      {editing && <EditPanel staff={staff} branches={branches} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}

      {/* Quick KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Present (month)" value={attendanceSummary.present} tone={attendanceSummary.present > 0 ? "ok" : "neutral"} />
        <Kpi label="Absent (month)"  value={attendanceSummary.absent}  tone={attendanceSummary.absent  > 0 ? "bad" : "ok"} />
        <Kpi label="Leave balance"   value={leaveBalance.reduce((s, r) => s + parseFloat(r.available_now ?? "0"), 0).toFixed(0)} />
        <Kpi label="Pending leave"   value={pendingLeave.length}    tone={pendingLeave.length    > 0 ? "warn" : "ok"} />
        <Kpi label="Pending expenses" value={pendingExpenses.length} tone={pendingExpenses.length > 0 ? "warn" : "ok"} />
        <Kpi label="Outstanding adv" value={fmtCur(outstandingAdv.reduce((s, a) => s + parseFloat(a.outstanding_amount ?? "0"), 0).toFixed(2))} tone={outstandingAdv.length > 0 ? "warn" : "ok"} />
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-0 border-b border-border overflow-x-auto">
        {DETAIL_TABS.map((t) => {
          const badge = t === "Attendance" && pendingLeave.length > 0 ? pendingLeave.length
            : t === "Advances" && pendingAdvances.length > 0 ? pendingAdvances.length : 0;
          return (
            <button key={t} type="button" onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t}
              {badge > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════ OVERVIEW */}
      {activeTab === "Overview" && (
        <DetailPanel title="Overview" description="Identity, KYC, emergency contacts, and current readiness.">
          <div className="mb-5">
            <UniversalQuickWidgetsEmbed role="STAFF" sourceId={staff.id} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="Employee code"  value={staff.employee_code || `#${staff.id}`} />
            <Detail label="Phone"          value={staff.phone} />
            <Detail label="Role / title"   value={staff.designation} />
            <Detail label="Department"     value={staff.department} />
            <Detail label="Branch"         value={staff.branch_name} />
            <Detail label="Joining date"   value={fmt(staff.joining_date)} />
            <Detail label="Weekly off"     value={staff.weekly_off} />
            <Detail label="KYC status"     value={<ERPStatusBadge status={staff.kyc_verified ? "ACTIVE" : "PENDING"} label={staff.kyc_verified ? "Verified" : "Pending"} />} />
            <Detail label="KYC reference"  value={`${staff.kyc_id_type || "KYC"} ${mask(staff.kyc_id_number)}`} />
            <Detail label="Address"        value={staff.address} />
            <Detail label="Emergency contact" value={[staff.emergency_contact_name, staff.emergency_contact_phone].filter(Boolean).join(" · ") || "—"} />
            <Detail label="Emergency relation" value={staff.emergency_contact_relation} />
          </div>
          {staff.notes && (
            <div className="mt-4 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes:</span>
              {staff.notes}
            </div>
          )}
        </DetailPanel>
      )}

      {/* ══════════════════════════════════════════ 360 VIEW */}
      {activeTab === "360 View" && <Party360Embed role="STAFF" sourceId={staff.id} />}

      {/* ══════════════════════════════════════════ EMPLOYMENT */}
      {activeTab === "Employment" && (
        <DetailPanel title="Employment Details" description="Workflow status, reporting structure, shift, and probation.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="Employment status" value={<ERPStatusBadge status={staff.employment_status || (staff.is_active ? "ACTIVE" : "DRAFT")} label={staff.employment_status || (staff.is_active ? "Active" : "Draft")} />} />
            <Detail label="Employment type"   value={(staff.employment_type || "—").replace(/_/g, " ")} />
            <Detail label="Reporting manager" value={staff.reporting_manager} />
            <Detail label="Work location"     value={staff.work_location} />
            <Detail label="Probation end"     value={fmt(staff.probation_end_date)} />
            <Detail label="Attendance policy" value={staff.attendance_policy} />
            <Detail label="Shift"             value={staff.shift_name} />
            <Detail label="Weekly off"        value={staff.weekly_off} />
            <Detail label="Contract end"      value={fmt(staff.temporary_contract_end_date)} />
            {staff.deactivation_reason && <Detail label="Deactivation reason" value={staff.deactivation_reason} />}
          </div>
        </DetailPanel>
      )}

      {/* ══════════════════════════════════════════ ATTENDANCE */}
      {activeTab === "Attendance" && (
        <>
          {/* Month summary */}
          <DetailPanel title="Attendance" description="Month-wise attendance. Re-marking the same date corrects it.">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month</label>
              <input type="month" value={attMonth} onChange={(e) => setAttMonth(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <span className="text-xs text-muted-foreground">{attendanceSummary.daysInMonth} days · {attendance.length} marked</span>
            </div>

            <div className="mb-4 grid gap-2 grid-cols-4 sm:grid-cols-7">
              {[
                { label: "Present",    value: attendanceSummary.present,   ok: true },
                { label: "Half day",   value: attendanceSummary.halfDay },
                { label: "Late",       value: attendanceSummary.late },
                { label: "Leave",      value: attendanceSummary.leave },
                { label: "Absent",     value: attendanceSummary.absent,    bad: true },
                { label: "Holiday",    value: attendanceSummary.holiday },
                { label: "Not marked", value: attendanceSummary.notMarked, bad: attendanceSummary.notMarked > 0 },
              ].map(({ label, value, ok, bad }) => (
                <div key={label} className={`rounded-xl border px-3 py-2 text-center ${ok ? "border-emerald-200 bg-emerald-50" : bad ? "border-red-200 bg-red-50" : "border-border bg-card"}`}>
                  <p className={`text-xl font-bold ${ok ? "text-emerald-800" : bad ? "text-red-800" : "text-foreground"}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {attMsg   && <Notice ok onClose={() => setAttMsg(null)}>{attMsg}</Notice>}
            {attError && <Notice onClose={() => setAttError(null)}>{attError}</Notice>}

            {/* Mark form */}
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Mark / correct attendance</p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Date
                  <input type="date" value={attForm.date} onChange={(e) => setAttForm((c) => ({ ...c, date: e.target.value }))}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                  <select value={attForm.status} onChange={(e) => setAttForm((c) => ({ ...c, status: e.target.value }))}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
                    {ATT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Worked hrs
                  <input type="number" step="0.5" min="0" value={attForm.worked_hours} onChange={(e) => setAttForm((c) => ({ ...c, worked_hours: e.target.value }))}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  OT hrs
                  <input type="number" step="0.5" min="0" value={attForm.overtime_hours} onChange={(e) => setAttForm((c) => ({ ...c, overtime_hours: e.target.value }))}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide lg:col-span-2">
                  Notes
                  <input value={attForm.notes} onChange={(e) => setAttForm((c) => ({ ...c, notes: e.target.value }))}
                    placeholder="Optional" className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                </label>
              </div>
              <button type="button" disabled={attSaving} onClick={() => void submitAttendance()}
                className="mt-3 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                {attSaving ? "Saving…" : "Save attendance"}
              </button>
            </div>

            <TinyTable empty="No attendance marked this month"
              columns={["Date", "Status", "Worked hrs", "OT hrs", "Notes"]}
              rows={attendance.map((r) => [fmt(r.attendance_date), r.status.replace(/_/g, " "), r.worked_hours, r.overtime_hours, r.notes])} />
            <Link href={ROUTES.admin.hrAttendance} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open full attendance register →</Link>
          </DetailPanel>

          {/* Leave balance */}
          <DetailPanel title="Leave Balance" description="Earned, used, and available per leave type for the current year.">
            {leaveBalance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active leave types configured.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {leaveBalance.map((row) => (
                  <div key={row.leave_type_id} className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{row.leave_type_name} ({row.leave_type_code})</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.is_paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{row.is_paid ? "Paid" : "Unpaid"}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{row.available_now ?? "—"} <span className="text-sm font-normal text-muted-foreground">available</span></p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <dt>Earned to date</dt><dd className="text-right font-semibold text-foreground">{row.earned_to_date ?? "—"}</dd>
                      <dt>Used (approved)</dt><dd className="text-right font-semibold text-foreground">{row.taken_this_year}</dd>
                      <dt>Pending approval</dt><dd className="text-right font-semibold text-foreground">{row.pending_approval}</dd>
                      <dt>Annual allowance</dt><dd className="text-right font-semibold text-foreground">{row.annual_allowance_days ?? "Unlimited"}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </DetailPanel>

          {/* Leave requests */}
          <DetailPanel title="Leave Requests">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{pendingLeave.length} pending · {leave.length} total</p>
              <button type="button" onClick={() => setLeaveFormOpen((v) => !v)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition">
                + Request Leave
              </button>
            </div>

            {leaveFormOpen && (
              <div className="mb-4 rounded-xl border border-border bg-background p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Submit leave request on behalf of {staff.name}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Leave type
                    <select value={leaveForm.leave_type} onChange={(e) => setLeaveForm((c) => ({ ...c, leave_type: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="">Select…</option>
                      {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Start date
                    <input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm((c) => ({ ...c, start_date: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    End date
                    <input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm((c) => ({ ...c, end_date: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reason
                    <input value={leaveForm.reason} onChange={(e) => setLeaveForm((c) => ({ ...c, reason: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                {leaveFormErr && <Notice>{leaveFormErr}</Notice>}
                <div className="flex gap-2">
                  <button type="button" disabled={leaveSaving} onClick={() => void submitLeaveRequest()}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                    {leaveSaving ? "Submitting…" : "Submit Request"}
                  </button>
                  <button type="button" onClick={() => { setLeaveFormOpen(false); setLeaveFormErr(null); }}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
                </div>
              </div>
            )}

            <TinyTable empty="No leave requests" columns={["Request #", "Type", "From", "To", "Days", "Status", "Action"]}
              rows={leave.slice(0, 12).map((r) => [
                r.request_no,
                r.leave_type_name,
                fmt(r.start_date),
                fmt(r.end_date),
                r.day_count,
                <ERPStatusBadge key="s" status={r.status} label={r.status} />,
                r.status === "PENDING" ? (
                  <div key="a" className="flex gap-1.5">
                    <button type="button" onClick={() => void actOnLeave(r.id, "APPROVE")}
                      className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 transition">Approve</button>
                    <button type="button" onClick={() => void actOnLeave(r.id, "REJECT")}
                      className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-200 transition">Reject</button>
                  </div>
                ) : null,
              ])} />
          </DetailPanel>

          {/* Expense claims */}
          <DetailPanel title="Expense Claims">
            {expenseErr && <Notice onClose={() => setExpenseErr(null)}>{expenseErr}</Notice>}
            <TinyTable empty="No expense claims" columns={["Claim #", "Date", "Amount", "Purpose", "Status", "Action"]}
              rows={expenses.slice(0, 12).map((e) => [
                e.claim_no,
                fmt(e.claim_date),
                fmtCur(e.amount),
                e.purpose,
                <ERPStatusBadge key="s" status={e.status} label={e.status} />,
                e.status === "PENDING" ? (
                  <div key="a" className="flex gap-1.5">
                    <button type="button" disabled={expenseBusy === e.id} onClick={() => void actOnExpense(e.id, "APPROVE")}
                      className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 transition">Approve</button>
                    <button type="button" disabled={expenseBusy === e.id} onClick={() => void actOnExpense(e.id, "REJECT")}
                      className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50 transition">Reject</button>
                  </div>
                ) : null,
              ])} />
          </DetailPanel>
        </>
      )}

      {/* ══════════════════════════════════════════ PAYROLL */}
      {activeTab === "Payroll" && (
        <>
          <DetailPanel title="Payroll Setup">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Pay basis"          value={staff.pay_basis || (staff.base_salary ? "Monthly" : staff.daily_wage_rate ? "Daily" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "Not configured")} />
              <Detail label="Payroll eligible"   value={staff.payroll_eligible ? "Yes" : "No"} />
              <Detail label="Base salary"        value={fmtCur(staff.base_salary)} />
              <Detail label="Daily wage"         value={fmtCur(staff.daily_wage_rate)} />
              <Detail label="Hourly wage"        value={fmtCur(staff.hourly_wage_rate)} />
              <Detail label="Piece rate"         value={staff.piece_rate_amount ? `${fmtCur(staff.piece_rate_amount)} / ${staff.piece_rate_unit_label || "unit"}` : "—"} />
              <Detail label="Payment mode"       value={staff.payment_mode} />
              <Detail label="Bank account"       value={staff.bank_account_number ? mask(staff.bank_account_number) : "—"} />
              <Detail label="IFSC"               value={staff.bank_ifsc} />
              <Detail label="UPI ID"             value={staff.upi_id} />
              <Detail label="Cost center"        value={staff.cost_center_code} />
              <Detail label="Salary effective"   value={fmt(staff.salary_effective_from)} />
              <Detail label="Pay day"            value={staff.salary_pay_day ? `Day ${staff.salary_pay_day} of month` : "—"} />
              <Detail label="Contract end"       value={fmt(staff.temporary_contract_end_date)} />
            </div>
          </DetailPanel>

          <DetailPanel title="Payroll History" description="DRAFT → Approve → Post → Pay. Payment records a real salary journal.">
            {payrollError && <Notice onClose={() => setPayrollError(null)}>{payrollError}</Notice>}
            <div className="grid gap-4 xl:grid-cols-2">
              <TinyTable empty="No salary sheets" columns={["Period", "Gross", "Net", "Outstanding", "Status", "Actions"]}
                rows={salarySheets.slice(0, 10).map((r) => [
                  `${r.year}-${String(r.month).padStart(2, "0")}`,
                  fmtCur(r.gross_amount),
                  fmtCur(r.net_amount),
                  fmtCur(r.outstanding_amount || r.net_amount),
                  <ERPStatusBadge key="s" status={r.status} />,
                  <div key="a" className="flex flex-wrap gap-1.5">
                    {r.status === "DRAFT" && <button type="button" disabled={payrollSaving === r.id} onClick={() => void approveSheet(r.id)} className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold disabled:opacity-50 hover:bg-muted transition">Approve</button>}
                    {r.status === "APPROVED" && <button type="button" disabled={payrollSaving === r.id} onClick={() => void postSheet(r.id)} className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold disabled:opacity-50 hover:bg-muted transition">Post</button>}
                    {(r.status === "POSTED" || r.status === "PAID_PARTIAL") && <button type="button" disabled={payrollSaving === r.id} onClick={() => setPayForm({ salarySheetId: r.id, amount: r.outstanding_amount || r.net_amount, financeAccount: financeAccounts[0] ? String(financeAccounts[0].id) : "", referenceNo: "", paymentDate: new Date().toISOString().slice(0, 10) })} className="rounded-md border border-emerald-500 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition">Pay</button>}
                    {r.status === "PAID" && <span className="text-xs text-muted-foreground">Fully paid</span>}
                  </div>,
                ])} />

              <TinyTable empty="No salary payments" columns={["Date", "Amount", "Account", "Reference"]}
                rows={salaryPayments.slice(0, 10).map((r) => [fmt(r.payment_date), fmtCur(r.amount), r.finance_account_name, r.reference_no])} />
            </div>

            {payForm && (
              <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                <p className="mb-3 text-sm font-semibold text-emerald-900">Record salary payment</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Payment date
                    <input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((c) => c && { ...c, paymentDate: e.target.value })}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Amount
                    <input value={payForm.amount} onChange={(e) => setPayForm((c) => c && { ...c, amount: e.target.value })}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Pay from account
                    <select value={payForm.financeAccount} onChange={(e) => setPayForm((c) => c && { ...c, financeAccount: e.target.value })}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
                      <option value="">Select account</option>
                      {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reference
                    <input value={payForm.referenceNo} onChange={(e) => setPayForm((c) => c && { ...c, referenceNo: e.target.value })}
                      placeholder="Optional" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <ActionButton variant="primary" loading={payrollSaving === payForm.salarySheetId} onClick={() => void submitPayment()}>Confirm Payment</ActionButton>
                  <ActionButton variant="ghost" onClick={() => setPayForm(null)}>Cancel</ActionButton>
                </div>
              </div>
            )}
            <Link href={ROUTES.admin.hrPayroll} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open full payroll page →</Link>
          </DetailPanel>
        </>
      )}

      {/* ══════════════════════════════════════════ ADVANCES */}
      {activeTab === "Advances" && (
        <>
          <DetailPanel title="Staff Advances" description="Request, approve, disburse, and recover salary advances. All entries post to HR ledger.">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-3 text-sm text-muted-foreground">
                <span>{pendingAdvances.length} pending · {outstandingAdv.length} outstanding</span>
              </div>
              <button type="button" onClick={() => setAdvanceFormOpen((v) => !v)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition">
                + New Advance
              </button>
            </div>

            {advanceFormOpen && (
              <div className="mb-4 rounded-xl border border-border bg-background p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Request advance for {staff.name}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Request date
                    <input type="date" value={advanceForm.request_date} onChange={(e) => setAdvanceForm((c) => ({ ...c, request_date: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Amount (₹)
                    <input value={advanceForm.amount} onChange={(e) => setAdvanceForm((c) => ({ ...c, amount: e.target.value }))}
                      placeholder="e.g. 5000" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide lg:col-span-2">
                    Reason
                    <input value={advanceForm.reason} onChange={(e) => setAdvanceForm((c) => ({ ...c, reason: e.target.value }))}
                      placeholder="Reason for advance" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide lg:col-span-4">
                    Notes (optional)
                    <input value={advanceForm.notes} onChange={(e) => setAdvanceForm((c) => ({ ...c, notes: e.target.value }))}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                {advanceErr && <Notice>{advanceErr}</Notice>}
                <div className="flex gap-2">
                  <button type="button" disabled={advanceSaving} onClick={() => void submitAdvance()}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                    {advanceSaving ? "Creating…" : "Create Advance"}
                  </button>
                  <button type="button" onClick={() => { setAdvanceFormOpen(false); setAdvanceErr(null); }}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
                </div>
              </div>
            )}

            {/* Disburse form */}
            {disburseForm && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Disburse advance</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Finance account
                    <select value={disburseForm.finance_account} onChange={(e) => setDisburseForm((c) => c && { ...c, finance_account: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="">Select…</option>
                      {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Disbursement date
                    <input type="date" value={disburseForm.disbursement_date} onChange={(e) => setDisburseForm((c) => c && { ...c, disbursement_date: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reference
                    <input value={disburseForm.reference_no} onChange={(e) => setDisburseForm((c) => c && { ...c, reference_no: e.target.value })}
                      placeholder="Optional" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={disburseSaving} onClick={() => void submitDisburse()}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                    {disburseSaving ? "Disbursing…" : "Confirm Disburse"}
                  </button>
                  <button type="button" onClick={() => setDisburseForm(null)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
                </div>
              </div>
            )}

            {/* Recovery form */}
            {recoverForm && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">Record recovery</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Finance account
                    <select value={recoverForm.finance_account} onChange={(e) => setRecoverForm((c) => c && { ...c, finance_account: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="">Select…</option>
                      {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Recovery date
                    <input type="date" value={recoverForm.recovery_date} onChange={(e) => setRecoverForm((c) => c && { ...c, recovery_date: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Amount
                    <input value={recoverForm.amount} onChange={(e) => setRecoverForm((c) => c && { ...c, amount: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reference
                    <input value={recoverForm.reference_no} onChange={(e) => setRecoverForm((c) => c && { ...c, reference_no: e.target.value })}
                      placeholder="Optional" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={recoverSaving} onClick={() => void submitRecover()}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition">
                    {recoverSaving ? "Saving…" : "Record Recovery"}
                  </button>
                  <button type="button" onClick={() => setRecoverForm(null)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
                </div>
              </div>
            )}

            {advances.length === 0 ? (
              <ERPEmptyState title="No advances on record" description="Use the button above to request a staff advance." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      {["Date", "Amount", "Outstanding", "Reason", "Status", "Actions"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {advances.map((a) => (
                      <tr key={a.id} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(a.request_date)}</td>
                        <td className="px-4 py-3 font-mono">{fmtCur(a.amount)}</td>
                        <td className="px-4 py-3 font-mono">{fmtCur(a.outstanding_amount)}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground" title={a.reason}>{a.reason}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            a.status === "RECOVERED" ? "bg-emerald-100 text-emerald-800" :
                            a.status === "DISBURSED" || a.status === "PARTIALLY_RECOVERED" ? "bg-blue-100 text-blue-800" :
                            a.status === "APPROVED"  ? "bg-amber-100 text-amber-800" :
                            a.status === "CANCELLED" ? "bg-muted text-muted-foreground" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {a.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {a.status === "DRAFT" && (
                              <button type="button" onClick={() => void advanceApprove(a.id)}
                                className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 transition">Approve</button>
                            )}
                            {a.status === "APPROVED" && (
                              <button type="button" onClick={() => setDisburseForm({ advanceId: a.id, finance_account: "", disbursement_date: new Date().toISOString().slice(0, 10), reference_no: "" })}
                                className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 transition">Disburse</button>
                            )}
                            {(a.status === "DISBURSED" || a.status === "PARTIALLY_RECOVERED") && (
                              <button type="button" onClick={() => setRecoverForm({ advanceId: a.id, finance_account: "", recovery_date: new Date().toISOString().slice(0, 10), amount: a.outstanding_amount ?? "", reference_no: "" })}
                                className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 transition">Record Recovery</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailPanel>
        </>
      )}

      {/* ══════════════════════════════════════════ DOCUMENTS */}
      {activeTab === "Documents" && (
        <DetailPanel title="Documents" description="Upload, verify, and reject staff documents. Verify/Reject preserves full audit history.">
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={() => setUploadOpen((v) => !v)}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition">
              {uploadOpen ? "Cancel upload" : "Upload Document"}
            </button>
          </div>

          {uploadOpen && (
            <div className="mb-4 rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Document type
                  <select value={upload.document_type} onChange={(e) => setUpload((c) => ({ ...c, document_type: e.target.value }))}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="ID_PROOF">ID Proof</option>
                    <option value="ADDRESS_PROOF">Address Proof</option>
                    <option value="SALARY_AGREEMENT">Salary Agreement</option>
                    <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Title
                  <input value={upload.title} onChange={(e) => setUpload((c) => ({ ...c, title: e.target.value }))}
                    placeholder="e.g. Aadhaar Card" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Document no.
                  <input value={upload.document_no} onChange={(e) => setUpload((c) => ({ ...c, document_no: e.target.value }))}
                    placeholder="Optional" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Notes
                  <input value={upload.notes} onChange={(e) => setUpload((c) => ({ ...c, notes: e.target.value }))}
                    placeholder="Optional" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:col-span-2">
                  File
                  <input type="file" onChange={(e) => setUpload((c) => ({ ...c, file: e.target.files?.[0] ?? null }))}
                    className="h-9 rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
                </label>
              </div>
              <button type="button" disabled={!upload.title.trim() || !upload.file || uploadSaving} onClick={() => void uploadDocument()}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                {uploadSaving ? "Uploading…" : "Upload"}
              </button>
            </div>
          )}

          <TinyTable empty="No documents uploaded" columns={["Type", "Title", "Doc No.", "Status", "Uploaded", "By", "Actions"]}
            rows={documents.map((doc) => [
              doc.document_type?.replace(/_/g, " "),
              doc.title,
              doc.document_no || "—",
              <ERPStatusBadge key="s" status={doc.status} />,
              fmt(doc.created_at?.slice(0, 10)),
              doc.uploaded_by_username || "—",
              <div key="a" className="flex flex-wrap gap-1.5">
                {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold hover:bg-muted transition">Open</a>}
                <button type="button" onClick={() => { setReviewModal({ documentId: doc.id, action: "verify", title: doc.title }); setReviewNotes(""); }}
                  className="rounded-md border border-emerald-500 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition">Verify</button>
                <button type="button" onClick={() => { setReviewModal({ documentId: doc.id, action: "reject", title: doc.title }); setReviewNotes(""); }}
                  className="rounded-md border border-red-400 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition">Reject</button>
              </div>,
            ])} />
        </DetailPanel>
      )}

      {/* ══════════════════════════════════════════ KYC */}
      {activeTab === "KYC" && <KycDocumentPanel mode="admin" owner="staff" ownerId={staff.id} />}

      {/* ══════════════════════════════════════════ ACCESS */}
      {activeTab === "Access" && (
        <DetailPanel title="Portal Access" description="Staff portal login tied to this employee profile.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
            <Detail label="Login created"  value={identity ? "Yes" : "No"} />
            <Detail label="Username"       value={identity?.username} />
            <Detail label="Login enabled"  value={identity ? (identity.login_enabled ? "Enabled" : "Disabled") : "—"} />
            <Detail label="Role"           value={identity ? "STAFF" : "—"} />
          </div>

          {accessError && <Notice onClose={() => setAccessError(null)}>{accessError}</Notice>}

          {generatedPassword && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-bold text-amber-900">New password — copy it now (shown once only):</p>
              <p className="mt-1 font-mono text-base text-amber-900 select-all">{generatedPassword}</p>
              <button type="button" onClick={() => setGeneratedPassword(null)} className="mt-2 text-xs text-amber-700 hover:underline">Dismiss</button>
            </div>
          )}

          {!identity ? (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Create staff portal login</p>
              <p className="text-xs text-muted-foreground">Creates a STAFF-role account tied to this employee. A temporary password will be generated.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Username
                  <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder={staff.phone || "username"}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Email (optional)
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
                </label>
              </div>
              <ActionButton variant="primary" loading={accessSaving} onClick={() => void createLoginForStaff()}>Create Login</ActionButton>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" loading={accessSaving} onClick={() => void toggleLoginEnabled()}>
                {identity.login_enabled ? "Disable Login" : "Enable Login"}
              </ActionButton>
              <ActionButton variant="secondary" loading={accessSaving} onClick={() => void resetLoginPassword()}>Reset Password</ActionButton>
            </div>
          )}
        </DetailPanel>
      )}

      {/* ══════════════════════════════════════════ TIMELINE */}
      {activeTab === "Timeline" && (
        <Timeline title="Audit / Activity Timeline">
          {auditEntries.length ? auditEntries.map((entry) => (
            <div key={`${entry.source_label}-${entry.id}`} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{formatAuditAction(entry.action_type)}</p>
                  <p className="text-xs text-muted-foreground">{entry.source_label} · {entry.performed_by_username || "system"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{fmtDatetime(entry.created_at)}</p>
              </div>
              {formatAuditMeta(entry.metadata) && <p className="mt-2 text-sm text-muted-foreground">{formatAuditMeta(entry.metadata)}</p>}
            </div>
          )) : (
            <ERPEmptyState title="No audit events yet" description="Staff profile, identity, and document changes will appear here." />
          )}
        </Timeline>
      )}

      {/* ── Document review modal ─────────────────────────────────────────── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-bold text-foreground">
              {reviewModal.action === "verify" ? "Verify document" : "Reject document"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong>{reviewModal.title}</strong> will be marked {reviewModal.action === "verify" ? "verified (ACTIVE)" : "rejected (INACTIVE)"}.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes {reviewModal.action === "reject" ? "(strongly recommended)" : "(optional)"}
            </label>
            <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)}
              placeholder={reviewModal.action === "reject" ? "Reason for rejection" : "Optional review notes"}
              className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton variant="ghost" onClick={() => setReviewModal(null)}>Cancel</ActionButton>
              <ActionButton variant={reviewModal.action === "verify" ? "primary" : "destructive"} loading={reviewSaving} onClick={() => void submitReview()}>
                {reviewModal.action === "verify" ? "Verify" : "Reject"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
