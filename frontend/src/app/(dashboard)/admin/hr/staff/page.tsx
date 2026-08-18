"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  RefreshCw,
  Shield,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import { listAdminStaffIdentities, type AdminStaffIdentity } from "@/services/staff";
import {
  createHrStaff,
  getHrStaffOptions,
  getHrSummary,
  listHrAttendance,
  listHrLeaveRequests,
  listHrLeaveTypes,
  listHrStaff,
  listHrStaffAdvances,
  markHrAttendance,
  patchHrLeaveRequest,
  patchHrStaff,
  setHrStaffStatus,
  approveHrStaffAdvance,
  type HrLeaveRequest,
  type HrLeaveType,
  type HrOption,
  type HrStaff,
  type HrStaffAdvance,
  type HrStaffOptions,
  type HrSummary,
} from "@/services/admin-hr";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "register" | "leave" | "attendance" | "advances";
type EmploymentTypeValue = "PERMANENT_MONTHLY" | "TEMPORARY" | "DAILY_WAGE" | "HOURLY" | "PIECE_RATE" | "MANUFACTURING" | "SERVICE";
type EmploymentStatusValue = "DRAFT" | "ONBOARDING" | "ACTIVE";
type PaymentModeValue = "CASH" | "BANK" | "UPI";
type KycStatusValue = "PENDING" | "VERIFIED" | "REJECTED";

type StaffFormState = {
  name: string; phone: string; email: string; designation: string;
  branch: string; department: string; joining_date: string;
  employment_type: EmploymentTypeValue; employment_status: EmploymentStatusValue;
  reporting_manager: string; work_location: string; probation_end_date: string;
  attendance_policy: string; shift_name: string; weekly_off: string;
  payroll_eligible: boolean; salary_effective_from: string;
  base_salary: string; daily_wage_rate: string; hourly_wage_rate: string;
  piece_rate_amount: string; piece_rate_unit_label: string;
  cost_center_code: string; payment_mode: PaymentModeValue;
  bank_account_name: string; bank_account_number: string; bank_ifsc: string;
  upi_id: string; kyc_status: KycStatusValue; kyc_id_type: string; kyc_id_number: string;
  address: string; emergency_contact_name: string;
  emergency_contact_relation: string; emergency_contact_phone: string;
  create_login: boolean; user_role: "STAFF"; username: string; temporary_password: string;
  notes: string;
};

type FieldErrors = Record<string, string | string[]>;

// ─── Fallback options ─────────────────────────────────────────────────────────

const fallbackOptions: HrStaffOptions = {
  employment_statuses: [
    { value: "DRAFT", label: "Draft" }, { value: "ONBOARDING", label: "Onboarding" }, { value: "ACTIVE", label: "Active" },
  ],
  employment_types: [
    { value: "PERMANENT_MONTHLY", label: "Permanent Monthly" }, { value: "TEMPORARY", label: "Temporary" },
    { value: "DAILY_WAGE", label: "Daily Wage" }, { value: "HOURLY", label: "Hourly" },
    { value: "PIECE_RATE", label: "Piece Rate" }, { value: "MANUFACTURING", label: "Manufacturing" }, { value: "SERVICE", label: "Service" },
  ],
  payment_modes: [{ value: "CASH", label: "Cash" }, { value: "BANK", label: "Bank" }, { value: "UPI", label: "UPI" }],
  user_roles: [{ value: "STAFF", label: "Staff" }],
  departments: ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  roles_titles: ["Sales Executive", "Cashier", "Delivery Staff", "Inventory Staff", "Accountant", "HR Executive", "Service Staff", "Helper", "Manager"].map((l) => ({ value: l, label: l })),
  attendance_policies: ["DAY_SHIFT", "SHOP_STANDARD", "FIELD_STAFF", "FLEXIBLE"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  shifts: ["DAY", "EVENING", "FULL_DAY", "FIELD"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  weekly_offs: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "ROTATIONAL"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  cost_centers: ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  kyc_statuses: [{ value: "PENDING", label: "Pending" }, { value: "VERIFIED", label: "Verified" }, { value: "REJECTED", label: "Rejected" }],
  kyc_types: ["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT", "OTHER"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  emergency_relations: ["FATHER", "MOTHER", "SPOUSE", "BROTHER", "SISTER", "FRIEND", "OTHER"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  payroll_accounting: { enabled: false, message: "Payroll accounting bridge is not enabled. Staff creation stores HR/payroll setup only." },
};

const emptyForm: StaffFormState = {
  name: "", phone: "", email: "", designation: "", branch: "", department: "",
  joining_date: "", employment_type: "PERMANENT_MONTHLY", employment_status: "DRAFT",
  reporting_manager: "", work_location: "", probation_end_date: "",
  attendance_policy: "", shift_name: "", weekly_off: "", payroll_eligible: false,
  salary_effective_from: "", base_salary: "", daily_wage_rate: "", hourly_wage_rate: "",
  piece_rate_amount: "", piece_rate_unit_label: "", cost_center_code: "", payment_mode: "CASH",
  bank_account_name: "", bank_account_number: "", bank_ifsc: "", upi_id: "",
  kyc_status: "PENDING", kyc_id_type: "", kyc_id_number: "", address: "",
  emergency_contact_name: "", emergency_contact_relation: "", emergency_contact_phone: "",
  create_login: false, user_role: "STAFF", username: "", temporary_password: "", notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCur(v?: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return "₹" + n.toLocaleString("en-IN");
}

function payBasis(staff: HrStaff) {
  return staff.pay_basis || (staff.base_salary ? "Monthly" : staff.daily_wage_rate ? "Daily" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "—");
}

function formFromStaff(s: HrStaff): StaffFormState {
  return {
    ...emptyForm,
    name: s.name || "", phone: s.phone || "", designation: s.designation || "",
    branch: s.branch ? String(s.branch) : "", department: s.department || "",
    joining_date: s.joining_date || "", employment_type: (s.employment_type as EmploymentTypeValue) || "PERMANENT_MONTHLY",
    employment_status: s.employment_status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    reporting_manager: s.reporting_manager || "", work_location: s.work_location || "",
    probation_end_date: s.probation_end_date || "", attendance_policy: s.attendance_policy || "",
    shift_name: s.shift_name || "", payroll_eligible: Boolean(s.payroll_eligible),
    salary_effective_from: s.salary_effective_from || "", base_salary: s.base_salary || "",
    daily_wage_rate: s.daily_wage_rate || "", hourly_wage_rate: s.hourly_wage_rate || "",
    piece_rate_amount: s.piece_rate_amount || "", piece_rate_unit_label: s.piece_rate_unit_label || "",
    cost_center_code: s.cost_center_code || "", payment_mode: (s.payment_mode as PaymentModeValue) || "CASH",
    bank_account_name: s.bank_account_name || "", bank_account_number: s.bank_account_number || "",
    bank_ifsc: s.bank_ifsc || "", upi_id: s.upi_id || "",
    kyc_status: s.kyc_verified ? "VERIFIED" : "PENDING", kyc_id_type: s.kyc_id_type || "",
    kyc_id_number: s.kyc_id_number || "", address: s.address || "",
    emergency_contact_name: s.emergency_contact_name || "",
    emergency_contact_phone: s.emergency_contact_phone || "", notes: s.notes || "",
  };
}

function compactPayload(form: StaffFormState, targetStatus: EmploymentStatusValue) {
  return {
    full_name: form.name.trim(), name: form.name.trim(), phone: form.phone.trim(),
    email: form.email.trim(), designation: form.designation.trim(), title: form.designation.trim(),
    branch: form.branch ? Number(form.branch) : null, department: form.department.trim(),
    joining_date: form.joining_date || null, employment_type: form.employment_type,
    staff_type: form.employment_type, employment_status: targetStatus,
    is_active: targetStatus === "ACTIVE", reporting_manager: form.reporting_manager.trim(),
    work_location: form.work_location.trim(), probation_end_date: form.probation_end_date || null,
    attendance_policy: form.attendance_policy.trim(), shift_name: form.shift_name.trim(),
    shift: form.shift_name.trim(), weekly_off: form.weekly_off.trim(),
    payroll_eligible: form.payroll_eligible, salary_effective_from: form.salary_effective_from || null,
    salary_effective_date: form.salary_effective_from || null,
    base_salary: ["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) ? form.base_salary.trim() || null : null,
    daily_wage_rate: form.employment_type === "DAILY_WAGE" ? form.daily_wage_rate.trim() || null : null,
    hourly_wage_rate: form.employment_type === "HOURLY" ? form.hourly_wage_rate.trim() || null : null,
    piece_rate_amount: form.employment_type === "PIECE_RATE" ? form.piece_rate_amount.trim() || null : null,
    piece_rate_unit_label: form.employment_type === "PIECE_RATE" ? form.piece_rate_unit_label.trim() : "",
    cost_center_code: form.cost_center_code.trim(), cost_center: form.cost_center_code.trim(),
    payment_mode: form.payment_mode, bank_account_name: form.bank_account_name.trim(),
    bank_account_number: form.bank_account_number.trim(), bank_ifsc: form.bank_ifsc.trim(),
    upi_id: form.upi_id.trim(), kyc_status: form.kyc_status,
    kyc_verified: form.kyc_status === "VERIFIED", kyc_id_type: form.kyc_id_type.trim(),
    kyc_type: form.kyc_id_type.trim(), kyc_id_number: form.kyc_id_number.trim(),
    kyc_reference: form.kyc_id_number.trim(), address: form.address.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(),
    emergency_contact_relation: form.emergency_contact_relation.trim(),
    emergency_contact_phone: form.emergency_contact_phone.trim(),
    emergency_phone: form.emergency_contact_phone.trim(),
    create_login_account: form.create_login,
    user_role: form.create_login ? form.user_role : undefined,
    username: form.create_login ? form.username.trim() : undefined,
    temporary_password: form.create_login && form.temporary_password.trim() ? form.temporary_password.trim() : undefined,
    notes: form.notes.trim(),
  };
}

function parseApiErrors(err: unknown): { detail: string; fields: FieldErrors } {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const fields: FieldErrors = {};
        let detail = "";
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (key === "detail") detail = Array.isArray(value) ? (value as string[]).join(" ") : String(value);
          else fields[key] = Array.isArray(value) ? (value as string[]).join(" ") : String(value);
        }
        return { detail: detail || Object.values(fields).join("; "), fields };
      }
    } catch { /* ignore */ }
    return { detail: err.message, fields: {} };
  }
  return { detail: "Unknown error", fields: {} };
}

function localValidation(form: StaffFormState, status: EmploymentStatusValue) {
  const m: string[] = [];
  if (!form.name.trim()) m.push("full name");
  if (!form.phone.trim()) m.push("phone");
  if (["ONBOARDING", "ACTIVE"].includes(status)) {
    if (!form.designation.trim()) m.push("role/title");
    if (!form.branch) m.push("branch");
    if (!form.department.trim()) m.push("department");
    if (!form.joining_date) m.push("joining date");
  }
  if (status === "ACTIVE") {
    if (!form.attendance_policy && !form.shift_name) m.push("attendance policy or shift");
    if (form.kyc_status !== "VERIFIED" || !form.kyc_id_type || !form.kyc_id_number) m.push("verified KYC");
  }
  if (form.payroll_eligible) {
    if (!form.salary_effective_from) m.push("salary effective date");
    if (["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) && !form.base_salary.trim()) m.push("base salary");
    if (form.employment_type === "DAILY_WAGE" && !form.daily_wage_rate.trim()) m.push("daily wage");
    if (form.employment_type === "HOURLY" && !form.hourly_wage_rate.trim()) m.push("hourly wage");
    if (form.employment_type === "PIECE_RATE" && (!form.piece_rate_amount.trim() || !form.piece_rate_unit_label.trim())) m.push("piece rate + unit");
    if (form.payment_mode === "BANK" && !form.bank_account_number.trim()) m.push("bank account number");
    if (form.payment_mode === "UPI" && !form.upi_id.trim()) m.push("UPI ID");
  }
  if (form.create_login) {
    if (!form.username.trim()) m.push("username");
  }
  return m;
}

// ─── Reusable form components ─────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
      {hint && <span className="normal-case tracking-normal text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

function TI({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input value={value} type={type} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary" />
  );
}

function SI({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
      {children}
    </select>
  );
}

function optItems(opts: HrOption[] | undefined, placeholder = "Select") {
  return [<option key="" value="">{placeholder}</option>, ...(opts ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)];
}

function FieldErr({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name];
  if (!msg) return null;
  return <span className="mt-0.5 text-xs font-medium text-destructive">{Array.isArray(msg) ? msg.join(" ") : msg}</span>;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, tone = "neutral", icon }: {
  label: string; value: string | number; sub?: string;
  tone?: "ok" | "warn" | "bad" | "neutral"; icon?: ReactNode;
}) {
  const bg = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-red-200 bg-red-50", neutral: "border-border bg-card" };
  const tx = { ok: "text-emerald-900", warn: "text-amber-900", bad: "text-red-900", neutral: "text-foreground" };
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg[tone]}`}>
      <div className="flex items-center gap-2">
        {icon && <span className={`${tx[tone]} opacity-60`}>{icon}</span>}
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-0.5 text-2xl font-bold leading-tight ${tx[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ReadinessBadge({ ready, label }: { ready?: boolean; label: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      {label}
    </span>
  );
}

// ─── 4-step Wizard ────────────────────────────────────────────────────────────

function Wizard({ form, options, branches, editing, saving, fieldErrors, onChange, onClose, onSave }: {
  form: StaffFormState; options: HrStaffOptions; branches: BranchRecord[];
  editing: boolean; saving: boolean; fieldErrors: FieldErrors;
  onChange: (next: StaffFormState) => void;
  onClose: () => void;
  onSave: (status: EmploymentStatusValue) => void;
}) {
  const [step, setStep] = useState(0);
  const up = <K extends keyof StaffFormState>(k: K, v: StaffFormState[K]) => onChange({ ...form, [k]: v });
  const steps = ["Basic Identity", "Employment Setup", "Payroll Setup", "Docs & Access"];
  const val = { DRAFT: localValidation(form, "DRAFT"), ONBOARDING: localValidation(form, "ONBOARDING"), ACTIVE: localValidation(form, "ACTIVE") };

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{editing ? "Edit staff" : "Recruit new staff"}</h3>
          <p className="text-xs text-muted-foreground">Draft → Onboarding → Active. No payroll/accounting entries at this stage.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      {/* Step nav */}
      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <button key={s} type="button" onClick={() => setStep(i)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${i === step ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {options.payroll_accounting && !options.payroll_accounting.enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <strong>Payroll accounting not enabled.</strong> {options.payroll_accounting.message}
        </div>
      )}

      {/* Step 0 — Basic identity */}
      {step === 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Full name"><TI value={form.name} onChange={(v) => up("name", v)} /><FieldErr errors={fieldErrors} name="name" /></Field>
          <Field label="Phone" hint="Duplicate checked by backend"><TI value={form.phone} onChange={(v) => up("phone", v)} /><FieldErr errors={fieldErrors} name="phone" /></Field>
          <Field label="Role / title"><SI value={form.designation} onChange={(v) => up("designation", v)}>{optItems(options.roles_titles, "Select role/title")}</SI><FieldErr errors={fieldErrors} name="designation" /></Field>
          <Field label="Branch"><SI value={form.branch} onChange={(v) => up("branch", v)}><option value="">Select branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</SI><FieldErr errors={fieldErrors} name="branch" /></Field>
          <Field label="Department"><SI value={form.department} onChange={(v) => up("department", v)}>{optItems(options.departments, "Select department")}</SI><FieldErr errors={fieldErrors} name="department" /></Field>
          <Field label="Joining date"><TI type="date" value={form.joining_date} onChange={(v) => up("joining_date", v)} /><FieldErr errors={fieldErrors} name="joining_date" /></Field>
          <Field label="Staff type"><SI value={form.employment_type} onChange={(v) => up("employment_type", v as EmploymentTypeValue)}>{options.employment_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</SI></Field>
          <Field label="Email"><TI type="email" value={form.email} onChange={(v) => up("email", v)} /></Field>
          <Field label="Emergency contact"><TI value={form.emergency_contact_name} onChange={(v) => up("emergency_contact_name", v)} /></Field>
          <Field label="Emergency relation"><SI value={form.emergency_contact_relation} onChange={(v) => up("emergency_contact_relation", v)}>{optItems(options.emergency_relations, "Select relation")}</SI></Field>
          <Field label="Emergency phone"><TI value={form.emergency_contact_phone} onChange={(v) => up("emergency_contact_phone", v)} /></Field>
          <Field label="Address">
            <textarea value={form.address} onChange={(e) => up("address", e.target.value)}
              className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" />
          </Field>
        </div>
      )}

      {/* Step 1 — Employment */}
      {step === 1 && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Workflow status">
            <SI value={form.employment_status} onChange={(v) => up("employment_status", v as EmploymentStatusValue)}>
              {options.employment_statuses.filter((s) => s.value !== "INACTIVE").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SI>
          </Field>
          <Field label="Reporting manager"><TI value={form.reporting_manager} onChange={(v) => up("reporting_manager", v)} /></Field>
          <Field label="Work location"><TI value={form.work_location} onChange={(v) => up("work_location", v)} /></Field>
          <Field label="Probation end date">
            <div className="flex gap-2">
              <SI value="" onChange={(val) => {
                if (!val) return;
                if (!form.joining_date) return alert("Set joining date in Step 1 first.");
                const d = new Date(form.joining_date);
                if (val === "1M") d.setMonth(d.getMonth() + 1);
                else if (val === "3M") d.setMonth(d.getMonth() + 3);
                else if (val === "6M") d.setMonth(d.getMonth() + 6);
                else if (val === "1Y") d.setFullYear(d.getFullYear() + 1);
                up("probation_end_date", d.toISOString().split("T")[0]);
              }}>
                <option value="">Auto-calc…</option>
                <option value="1M">1 Month</option>
                <option value="3M">3 Months</option>
                <option value="6M">6 Months</option>
                <option value="1Y">1 Year</option>
              </SI>
              <div className="flex-1"><TI type="date" value={form.probation_end_date} onChange={(v) => up("probation_end_date", v)} /></div>
            </div>
          </Field>
          <Field label="Attendance policy"><SI value={form.attendance_policy} onChange={(v) => up("attendance_policy", v)}>{optItems(options.attendance_policies, "Select policy")}</SI></Field>
          <Field label="Shift"><SI value={form.shift_name} onChange={(v) => up("shift_name", v)}>{optItems(options.shifts, "Select shift")}</SI></Field>
          <Field label="Weekly off"><SI value={form.weekly_off} onChange={(v) => up("weekly_off", v)}>{optItems(options.weekly_offs, "Select weekly off")}</SI></Field>
        </div>
      )}

      {/* Step 2 — Payroll */}
      {step === 2 && (
        <div className="grid gap-4">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" checked={form.payroll_eligible} onChange={(e) => up("payroll_eligible", e.target.checked)} />
              Payroll eligible
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Salary effective date"><TI type="date" value={form.salary_effective_from} onChange={(v) => up("salary_effective_from", v)} /></Field>
            <Field label="Cost center"><SI value={form.cost_center_code} onChange={(v) => up("cost_center_code", v)}>{optItems(options.cost_centers, "Select cost center")}</SI></Field>
            <Field label="Payment mode"><SI value={form.payment_mode} onChange={(v) => up("payment_mode", v as PaymentModeValue)}>{options.payment_modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</SI></Field>
            {["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) && (
              <Field label={form.employment_type === "TEMPORARY" ? "Contract payout" : "Base salary"}><TI value={form.base_salary} onChange={(v) => up("base_salary", v)} /></Field>
            )}
            {form.employment_type === "DAILY_WAGE" && <Field label="Daily wage"><TI value={form.daily_wage_rate} onChange={(v) => up("daily_wage_rate", v)} /></Field>}
            {form.employment_type === "HOURLY" && <Field label="Hourly wage"><TI value={form.hourly_wage_rate} onChange={(v) => up("hourly_wage_rate", v)} /></Field>}
            {form.employment_type === "PIECE_RATE" && (
              <>
                <Field label="Piece rate"><TI value={form.piece_rate_amount} onChange={(v) => up("piece_rate_amount", v)} /></Field>
                <Field label="Piece unit"><TI value={form.piece_rate_unit_label} onChange={(v) => up("piece_rate_unit_label", v)} /></Field>
              </>
            )}
            {form.payment_mode === "BANK" && (
              <>
                <Field label="Bank account name"><TI value={form.bank_account_name} onChange={(v) => up("bank_account_name", v)} /></Field>
                <Field label="Bank account number"><TI value={form.bank_account_number} onChange={(v) => up("bank_account_number", v)} /></Field>
                <Field label="IFSC"><TI value={form.bank_ifsc} onChange={(v) => up("bank_ifsc", v)} /></Field>
              </>
            )}
            {form.payment_mode === "UPI" && <Field label="UPI ID"><TI value={form.upi_id} onChange={(v) => up("upi_id", v)} /></Field>}
          </div>
        </div>
      )}

      {/* Step 3 — Docs & access */}
      {step === 3 && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="KYC status"><SI value={form.kyc_status} onChange={(v) => up("kyc_status", v as KycStatusValue)}>{options.kyc_statuses.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</SI></Field>
          <Field label="KYC type"><SI value={form.kyc_id_type} onChange={(v) => up("kyc_id_type", v)}>{optItems(options.kyc_types, "Select type")}</SI></Field>
          <Field label="KYC reference"><TI value={form.kyc_id_number} onChange={(v) => up("kyc_id_number", v)} /></Field>
          {!editing && (
            <div className="md:col-span-3">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={form.create_login} onChange={(e) => up("create_login", e.target.checked)} />
                Create staff login account
              </label>
            </div>
          )}
          {!editing && form.create_login && (
            <>
              <Field label="User role"><SI value={form.user_role} onChange={(v) => up("user_role", v as "STAFF")}>{options.user_roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</SI></Field>
              <Field label="Username"><TI value={form.username} onChange={(v) => up("username", v)} placeholder={form.phone || "username"} /></Field>
              <Field label="Temporary password"><TI value={form.temporary_password} onChange={(v) => up("temporary_password", v)} placeholder="Optional, min 8 chars" /></Field>
            </>
          )}
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => up("notes", e.target.value)}
              className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" />
          </Field>
        </div>
      )}

      {/* Server errors */}
      {Object.keys(fieldErrors).length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold mb-1">Server validation errors:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {Object.entries(fieldErrors).map(([k, v]) => (
              <li key={k}><span className="font-medium">{k}:</span> {Array.isArray(v) ? v.join(" ") : v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer actions */}
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm">
        <p className="text-xs text-muted-foreground">Deactivation (not delete) preserves all history.</p>
        <div className="flex flex-wrap gap-2">
          {step > 0 && <ActionButton variant="ghost" onClick={() => setStep(step - 1)}>Back</ActionButton>}
          {step < steps.length - 1 && <ActionButton variant="secondary" onClick={() => setStep(step + 1)}>Next</ActionButton>}
          <ActionButton variant="secondary" loading={saving} disabled={saving || val.DRAFT.length > 0} onClick={() => onSave("DRAFT")}>Save draft</ActionButton>
          <ActionButton variant="secondary" loading={saving} disabled={saving || val.ONBOARDING.length > 0} onClick={() => onSave("ONBOARDING")}>Save onboarding</ActionButton>
          <ActionButton variant="primary" loading={saving} disabled={saving || val.ACTIVE.length > 0} onClick={() => onSave("ACTIVE")}>Activate</ActionButton>
        </div>
      </div>
      {(val.ONBOARDING.length > 0 || val.ACTIVE.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <span className="font-semibold">Onboarding blockers:</span> {val.ONBOARDING.join(", ") || "None"} &nbsp;|&nbsp;
          <span className="font-semibold">Activation blockers:</span> {val.ACTIVE.join(", ") || "None"}
        </div>
      )}
    </div>
  );
}

// ─── Leave request row ────────────────────────────────────────────────────────

function LeaveRow({ req, onUpdate }: { req: HrLeaveRequest; onUpdate: (updated: HrLeaveRequest) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "APPROVE" | "REJECT") {
    setBusy(action); setErr(null);
    try {
      await patchHrLeaveRequest(req.id, { action, reason: action === "REJECT" ? rejectReason : undefined });
      const updated = { ...req, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } as HrLeaveRequest;
      onUpdate(updated);
      setShowReject(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const isPending = req.status === "PENDING";

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm text-foreground">{req.employee_name}</p>
          <p className="text-xs text-muted-foreground">{req.leave_type_name} · {fmt(req.start_date)} → {fmt(req.end_date)} · {req.day_count} day{Number(req.day_count) !== 1 ? "s" : ""}</p>
          {req.reason && <p className="mt-0.5 text-xs text-muted-foreground italic">"{req.reason}"</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${req.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : req.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
            {req.status}
          </span>
        </div>
      </div>
      {isPending && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy}
            onClick={() => void act("APPROVE")}
            className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 transition">
            {busy === "APPROVE" ? "Approving…" : "Approve"}
          </button>
          <button type="button" disabled={!!busy}
            onClick={() => setShowReject((v) => !v)}
            className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50 transition">
            Reject
          </button>
        </div>
      )}
      {showReject && (
        <div className="flex gap-2">
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason (required)"
            className="flex-1 h-8 rounded-lg border border-input bg-background px-2 text-xs" />
          <button type="button" disabled={!rejectReason.trim() || !!busy}
            onClick={() => void act("REJECT")}
            className="rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition">
            {busy === "REJECT" ? "…" : "Confirm"}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminHrStaffPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  // Data
  const [rows,       setRows]       = useState<HrStaff[]>([]);
  const [branches,   setBranches]   = useState<BranchRecord[]>([]);
  const [identities, setIdentities] = useState<AdminStaffIdentity[]>([]);
  const [options,    setOptions]    = useState<HrStaffOptions>(fallbackOptions);
  const [summary,    setSummary]    = useState<HrSummary | null>(null);
  const [leaves,     setLeaves]     = useState<HrLeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveType[]>([]);
  const [advances,   setAdvances]   = useState<HrStaffAdvance[]>([]);

  // UI state
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [notice,   setNotice]   = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Wizard
  const [editorOpen, setEditorOpen] = useState(false);
  const [editStaff,  setEditStaff]  = useState<HrStaff | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyForm);

  // Deactivate
  const [deactivateTarget, setDeactivateTarget] = useState<HrStaff | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");

  // Filters
  const [filters, setFilters] = useState({ q: "", branch: "", department: "", employment_type: "", status: "", payroll_ready: "", kyc_verified: "" });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Attendance quick-mark
  const [attEmployee, setAttEmployee] = useState("");
  const [attStatus, setAttStatus]     = useState("PRESENT");
  const [attNotes, setAttNotes]       = useState("");
  const [attDate, setAttDate]         = useState(new Date().toISOString().split("T")[0]);
  const [attSaving, setAttSaving]     = useState(false);
  const [attOk, setAttOk]             = useState<string | null>(null);
  const [attErr, setAttErr]           = useState<string | null>(null);

  const identityByEmployee = useMemo(() => new Map(identities.map((i) => [i.employee, i])), [identities]);
  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");

  const activeCount    = rows.filter((r) => r.employment_status === "ACTIVE" || r.is_active).length;
  const draftCount     = rows.filter((r) => r.employment_status === "DRAFT" && !r.is_active).length;
  const payrollReady   = rows.filter((r) => r.payroll_ready).length;
  const missingKyc     = rows.filter((r) => !r.documents_ready).length;
  const missingAtt     = rows.filter((r) => !r.attendance_ready).length;

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async (overrideFilters = filters) => {
    try {
      setLoading(true); setError(null);
      const [staffRes, branchRes, idRes, optRes, sumRes, leaveRes, leaveTypeRes, advRes] = await Promise.all([
        listHrStaff({
          q: overrideFilters.q, branch: overrideFilters.branch, department: overrideFilters.department,
          employment_type: overrideFilters.employment_type, employment_status: overrideFilters.status,
          payroll_ready: overrideFilters.payroll_ready, kyc_verified: overrideFilters.kyc_verified,
        }),
        listBranches(),
        listAdminStaffIdentities(),
        getHrStaffOptions().catch(() => fallbackOptions),
        getHrSummary().catch(() => null),
        listHrLeaveRequests({ status: "PENDING" }).catch(() => ({ count: 0, results: [] as HrLeaveRequest[] })),
        listHrLeaveTypes().catch(() => ({ count: 0, results: [] as HrLeaveType[] })),
        listHrStaffAdvances().catch(() => ({ count: 0, results: [] as HrStaffAdvance[] })),
      ]);
      setRows(staffRes.results ?? []);
      setBranches(branchRes.results ?? []);
      setIdentities(idRes.results ?? []);
      setOptions(optRes ?? fallbackOptions);
      setSummary(sumRes);
      setLeaves(leaveRes.results ?? []);
      setLeaveTypes(leaveTypeRes.results ?? []);
      setAdvances(advRes.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HR cockpit.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  // Debounced search
  function handleSearch(q: string) {
    const next = { ...filters, q };
    setFilters(next);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(next), 400);
  }

  // ── Staff CRUD ──────────────────────────────────────────────────────────────

  function openCreate() { setForm(emptyForm); setEditStaff(null); setEditorOpen(true); setFieldErrors({}); setNotice(null); setError(null); }
  function openEdit(s: HrStaff) { setForm(formFromStaff(s)); setEditStaff(s); setEditorOpen(true); setFieldErrors({}); setNotice(null); setError(null); }

  async function saveStaff(targetStatus: EmploymentStatusValue) {
    if (saving) return;
    setSaving(true); setFieldErrors({}); setError(null);
    try {
      if (editStaff) {
        const patchStatus = targetStatus === "ONBOARDING" ? "DRAFT" : targetStatus;
        await patchHrStaff(editStaff.id, compactPayload(form, patchStatus as EmploymentStatusValue));
        setNotice(targetStatus === "ACTIVE" ? "Staff activated." : "Staff saved.");
      } else {
        const created = await createHrStaff(compactPayload(form, targetStatus));
        const pwNote = created.temporary_password ? ` Temp password: ${created.temporary_password}` : "";
        setNotice(`Staff ${targetStatus === "ACTIVE" ? "activated" : "saved"}.${pwNote}`);
      }
      setEditorOpen(false); setEditStaff(null);
      await load();
    } catch (err) {
      const { detail, fields } = parseApiErrors(err);
      if (Object.keys(fields).length > 0) { setFieldErrors(fields); setError(null); }
      else setError(detail || "Unable to save staff.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!deactivateTarget || !deactivationReason.trim()) return;
    try {
      await setHrStaffStatus(deactivateTarget.id, "DEACTIVATE", deactivationReason.trim());
      setNotice(`${deactivateTarget.name} deactivated.`);
      setDeactivateTarget(null); setDeactivationReason("");
      await load();
    } catch (err) {
      const { detail } = parseApiErrors(err);
      setError(detail || "Unable to deactivate.");
    }
  }

  async function reactivate(s: HrStaff) {
    try {
      await setHrStaffStatus(s.id, "REACTIVATE");
      setNotice(`${s.name} reactivated.`);
      await load();
    } catch (err) {
      const { detail } = parseApiErrors(err);
      setError(detail || "Unable to reactivate.");
    }
  }

  // ── Attendance quick-mark ───────────────────────────────────────────────────

  async function markAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (!attEmployee) { setAttErr("Select a staff member."); return; }
    setAttSaving(true); setAttErr(null); setAttOk(null);
    try {
      await markHrAttendance({ employee: Number(attEmployee), attendance_date: attDate, status: attStatus, notes: attNotes });
      setAttOk(`Attendance marked: ${rows.find((r) => String(r.id) === attEmployee)?.name ?? attEmployee} — ${attStatus} on ${fmt(attDate)}`);
      setAttNotes("");
    } catch (err) {
      setAttErr(err instanceof Error ? err.message : "Failed to mark attendance.");
    } finally {
      setAttSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "dashboard",  label: "Dashboard" },
    { id: "register",   label: `Staff (${rows.length})` },
    { id: "leave",      label: "Leave Requests", badge: pendingLeaves.length },
    { id: "attendance", label: "Attendance" },
    { id: "advances",   label: `Advances (${advances.length})` },
  ];

  const clearFilters = { q: "", branch: "", department: "", employment_type: "", status: "", payroll_ready: "", kyc_verified: "" };

  return (
    <ERPPageShell
      eyebrow="HR Module"
      title="Staff Management"
      subtitle="Recruit, onboard, activate, manage leave, attendance, payroll and advances."
      breadcrumbs={[
        { label: "Admin",    href: ROUTES.admin.dashboard },
        { label: "HR",       href: ROUTES.admin.hr },
        { label: "Staff" },
      ]}
      actions={[
        { href: ROUTES.admin.hrAttendance,     label: "Full Attendance", variant: "secondary" as const },
        { href: ROUTES.admin.hrPayroll,        label: "Payroll",         variant: "secondary" as const },
        { href: ROUTES.admin.hrStaffDocuments, label: "Documents",       variant: "secondary" as const },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{t.badge}</span>
            )}
          </button>
        ))}
        <button type="button" onClick={() => void load()} disabled={loading}
          className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Notices */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Loading HR cockpit…</div>
      )}

      {!loading && (
        <>
          {/* ══════════════════════════════════════════════ DASHBOARD */}
          {tab === "dashboard" && (
            <div className="space-y-6">
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label="Active staff"     value={activeCount}    tone={activeCount > 0 ? "ok" : "warn"} icon={<Users className="h-4 w-4" />} />
                <Kpi label="Draft / onboarding" value={draftCount}   tone="neutral" icon={<UserPlus className="h-4 w-4" />} />
                <Kpi label="Payroll ready"    value={payrollReady}   tone={payrollReady === activeCount && activeCount > 0 ? "ok" : "warn"} icon={<TrendingUp className="h-4 w-4" />} />
                <Kpi label="Missing KYC"      value={missingKyc}     tone={missingKyc === 0 ? "ok" : "bad"} icon={<Shield className="h-4 w-4" />} />
                <Kpi label="Pending leaves"   value={pendingLeaves.length} tone={pendingLeaves.length === 0 ? "ok" : "warn"} icon={<Clock className="h-4 w-4" />} />
              </div>

              {/* Live summary from API */}
              {summary && (
                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Today's HR snapshot</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                    {[
                      { label: "Today present",        value: summary.today_present },
                      { label: "Today absent",         value: summary.today_absent },
                      { label: "Pending leave requests", value: summary.pending_leave_requests },
                      { label: "Pending expense claims", value: summary.pending_expense_claims },
                      { label: "Payroll pending",      value: summary.payroll_pending },
                      { label: "Salary payment pending", value: summary.salary_payment_pending },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-lg font-bold text-foreground">{value ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Pending leaves quick view */}
              {pendingLeaves.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Pending leave approvals ({pendingLeaves.length})</h3>
                    <button type="button" onClick={() => setTab("leave")}
                      className="text-xs font-semibold text-primary hover:underline">
                      View all →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pendingLeaves.slice(0, 3).map((l) => (
                      <LeaveRow key={l.id} req={l}
                        onUpdate={(updated) => setLeaves((p) => p.map((x) => x.id === updated.id ? updated : x))} />
                    ))}
                    {pendingLeaves.length > 3 && (
                      <button type="button" onClick={() => setTab("leave")}
                        className="w-full rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition">
                        +{pendingLeaves.length - 3} more — open Leave tab
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* Pending advances */}
              {advances.filter((a) => a.status === "DRAFT").length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Staff advances awaiting approval</h3>
                    <button type="button" onClick={() => setTab("advances")} className="text-xs font-semibold text-primary hover:underline">View all →</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-sm border-collapse">
                      <thead><tr className="border-b border-border"><th className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Staff</th><th className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Amount</th><th className="pb-2 pr-4 text-left text-xs font-semibold text-muted-foreground">Reason</th><th className="pb-2 text-left text-xs font-semibold text-muted-foreground">Action</th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {advances.filter((a) => a.status === "DRAFT").slice(0, 5).map((a) => (
                          <tr key={a.id}>
                            <td className="py-2.5 pr-4 font-medium">{a.employee_name}</td>
                            <td className="py-2.5 pr-4 font-mono">{fmtCur(a.amount)}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[180px]">{a.reason}</td>
                            <td className="py-2.5">
                              <button type="button"
                                onClick={() => void approveHrStaffAdvance(a.id).then(() => void load())}
                                className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 transition">
                                Approve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Readiness warnings */}
              {rows.some((r) => r.readiness_warnings?.length) && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-amber-900">Profile readiness warnings</h3>
                  <ul className="space-y-1">
                    {rows.filter((r) => r.readiness_warnings?.length).slice(0, 6).map((r) => (
                      <li key={r.id} className="text-xs text-amber-800">
                        <Link href={`${ROUTES.admin.hrStaff}/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                        {" — "}{r.readiness_warnings?.join(", ")}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!options.payroll_accounting.enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <strong>Payroll accounting not enabled.</strong> {options.payroll_accounting.message}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════ STAFF REGISTER */}
          {tab === "register" && (
            <div className="space-y-5">
              {/* Recruit button */}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Staff register ({rows.length})</h3>
                <button type="button" onClick={openCreate}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition">
                  <UserPlus className="h-4 w-4" /> Recruit staff
                </button>
              </div>

              {/* Wizard */}
              {editorOpen && (
                <Wizard form={form} options={options} branches={branches} editing={Boolean(editStaff)}
                  saving={saving} fieldErrors={fieldErrors} onChange={setForm}
                  onClose={() => { setEditorOpen(false); setEditStaff(null); setFieldErrors({}); }}
                  onSave={(s) => void saveStaff(s)} />
              )}

              {/* Deactivation form */}
              {deactivateTarget && (
                <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Deactivate {deactivateTarget.name}</h3>
                  <p className="text-xs text-muted-foreground">Payroll, attendance, documents and audit history are preserved.</p>
                  <textarea value={deactivationReason} onChange={(e) => setDeactivationReason(e.target.value)}
                    placeholder="Reason for deactivation (required)"
                    className="w-full min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setDeactivateTarget(null); setDeactivationReason(""); }}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition">Cancel</button>
                    <button type="button" disabled={!deactivationReason.trim()} onClick={() => void deactivate()}
                      className="rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition">Deactivate</button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-7">
                  <input value={filters.q} onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Name, phone, code…"
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                  <select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    {optItems(options.departments, "All departments")}
                  </select>
                  <select value={filters.employment_type} onChange={(e) => setFilters({ ...filters, employment_type: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">All types</option>
                    {options.employment_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                  <select value={filters.payroll_ready} onChange={(e) => setFilters({ ...filters, payroll_ready: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">Payroll readiness</option>
                    <option value="true">Ready</option>
                    <option value="false">Not ready</option>
                  </select>
                  <select value={filters.kyc_verified} onChange={(e) => setFilters({ ...filters, kyc_verified: e.target.value })}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">All KYC</option>
                    <option value="true">Verified</option>
                    <option value="false">Pending</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void load()}
                    className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition">
                    Apply
                  </button>
                  <button type="button" onClick={() => { setFilters(clearFilters); void load(clearFilters); }}
                    className="rounded-xl border border-border px-4 py-1.5 text-xs font-semibold hover:bg-muted transition">
                    Clear
                  </button>
                </div>
              </div>

              {/* Table */}
              {rows.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  No staff found. <button type="button" onClick={openCreate} className="text-primary hover:underline ml-1">Recruit first staff →</button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {["Code", "Name", "Phone", "Role", "Branch", "Dept", "Type", "Pay basis", "Status", "Readiness", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const identity = identityByEmployee.get(row.id);
                        return (
                          <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20 align-top">
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.employee_code || `#${row.id}`}</td>
                            <td className="px-4 py-3">
                              <Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="font-semibold text-primary hover:underline">{row.name}</Link>
                              {identity && <p className="text-xs text-muted-foreground mt-0.5">@{identity.username}</p>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.phone || "—"}</td>
                            <td className="px-4 py-3">{row.designation || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.branch_name || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.department || "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {options.employment_types.find((t) => t.value === row.employment_type)?.label ?? row.employment_type ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-xs">{payBasis(row)}</td>
                            <td className="px-4 py-3">
                              <ERPStatusBadge
                                status={row.employment_status || (row.is_active ? "ACTIVE" : "INACTIVE")}
                                label={row.employment_status || (row.is_active ? "Active" : "Inactive")} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                <ReadinessBadge ready={row.profile_ready}    label="Profile" />
                                <ReadinessBadge ready={row.payroll_ready}    label="Payroll" />
                                <ReadinessBadge ready={row.attendance_ready} label="Att" />
                                <ReadinessBadge ready={row.documents_ready}  label="KYC" />
                                <ReadinessBadge ready={row.access_ready}     label="Access" />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5 flex-wrap">
                                <Link href={`${ROUTES.admin.hrStaff}/${row.id}`}
                                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted transition">
                                  Open
                                </Link>
                                <button type="button" onClick={() => openEdit(row)}
                                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted transition">
                                  Edit
                                </button>
                                {row.is_active ? (
                                  <button type="button" onClick={() => setDeactivateTarget(row)}
                                    className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-muted transition">
                                    Deactivate
                                  </button>
                                ) : (
                                  <button type="button" onClick={() => void reactivate(row)}
                                    className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted transition">
                                    Reactivate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                Staff creation never posts payroll journals, money movements, payments, or reconciliation records. Payroll runs are a separate workflow.
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════ LEAVE REQUESTS */}
          {tab === "leave" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Leave requests</h3>
                  <p className="text-xs text-muted-foreground">{pendingLeaves.length} pending approval · {leaves.length} total loaded</p>
                </div>
                <button type="button" onClick={() => void listHrLeaveRequests().then((r) => setLeaves(r.results ?? []))}
                  className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition">
                  <RefreshCw className="h-3.5 w-3.5" /> Reload
                </button>
              </div>

              {/* Leave types summary */}
              {leaveTypes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {leaveTypes.map((lt) => (
                    <span key={lt.id} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                      {lt.name} {lt.annual_allowance_days ? `(${lt.annual_allowance_days}d/yr)` : ""} {lt.is_paid ? "· Paid" : "· Unpaid"}
                    </span>
                  ))}
                </div>
              )}

              {/* Pending */}
              {pendingLeaves.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-700">Awaiting Approval ({pendingLeaves.length})</h4>
                  <div className="space-y-2">
                    {pendingLeaves.map((l) => (
                      <LeaveRow key={l.id} req={l}
                        onUpdate={(updated) => setLeaves((p) => p.map((x) => x.id === updated.id ? updated : x))} />
                    ))}
                  </div>
                </section>
              )}

              {/* Resolved */}
              {leaves.filter((l) => l.status !== "PENDING").length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Resolved</h4>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="border-b border-border bg-muted/30">
                        <tr>
                          {["Staff", "Type", "Dates", "Days", "Status"].map((h) => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leaves.filter((l) => l.status !== "PENDING").map((l) => (
                          <tr key={l.id} className="border-b border-border/60 hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">{l.employee_name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{l.leave_type_name}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmt(l.start_date)} → {fmt(l.end_date)}</td>
                            <td className="px-4 py-2.5">{l.day_count}</td>
                            <td className="px-4 py-2.5">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {leaves.length === 0 && (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  No leave requests found.
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════ ATTENDANCE */}
          {tab === "attendance" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Quick attendance entry</h3>
                <p className="text-xs text-muted-foreground">Mark attendance for any staff member for any date. For bulk import go to Full Attendance.</p>
              </div>

              <form onSubmit={(e) => void markAttendance(e)} className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Staff member
                    <select value={attEmployee} onChange={(e) => setAttEmployee(e.target.value)}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground">
                      <option value="">Select staff…</option>
                      {rows.filter((r) => r.is_active || r.employment_status === "ACTIVE").map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.employee_code || `#${r.id}`})</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Date
                    <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                    <select value={attStatus} onChange={(e) => setAttStatus(e.target.value)}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground">
                      {["PRESENT", "ABSENT", "HALF_DAY", "LATE", "LEAVE", "HOLIDAY", "WEEKLY_OFF"].map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Notes (optional)
                    <input value={attNotes} onChange={(e) => setAttNotes(e.target.value)}
                      placeholder="e.g. 4hrs OT"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                {attErr && <p className="text-xs text-red-600">{attErr}</p>}
                {attOk  && <p className="text-xs text-emerald-700 font-medium">{attOk}</p>}
                <button type="submit" disabled={attSaving || !attEmployee}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                  <UserCheck className="h-4 w-4" />
                  {attSaving ? "Marking…" : "Mark attendance"}
                </button>
              </form>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
                <p className="font-semibold">For bulk attendance</p>
                <p>Use the <Link href={ROUTES.admin.hrAttendance} className="font-semibold underline">Full Attendance page</Link> to view, filter, and export attendance records, or to import bulk entries via CSV.</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════ ADVANCES */}
          {tab === "advances" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Staff advances</h3>
                  <p className="text-xs text-muted-foreground">{advances.length} total · {advances.filter((a) => a.status === "DRAFT").length} awaiting approval · {advances.filter((a) => a.status === "DISBURSED" || a.status === "PARTIALLY_RECOVERED").length} outstanding</p>
                </div>
                <Link href={ROUTES.admin.hrStaffAdvances}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition">
                  Full advances register →
                </Link>
              </div>

              {advances.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  No staff advances on record.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {["Staff", "Date", "Amount", "Outstanding", "Reason", "Status", "Action"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {advances.map((a) => (
                        <tr key={a.id} className="border-b border-border/60 hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{a.employee_name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(a.request_date)}</td>
                          <td className="px-4 py-3 font-mono">{fmtCur(a.amount)}</td>
                          <td className="px-4 py-3 font-mono">{fmtCur(a.outstanding_amount)}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate" title={a.reason}>{a.reason}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              a.status === "RECOVERED" ? "bg-emerald-100 text-emerald-800" :
                              a.status === "DISBURSED" || a.status === "PARTIALLY_RECOVERED" ? "bg-blue-100 text-blue-800" :
                              a.status === "APPROVED" ? "bg-amber-100 text-amber-800" :
                              a.status === "CANCELLED" ? "bg-muted text-muted-foreground" :
                              "bg-amber-50 text-amber-700"
                            }`}>
                              {a.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {a.status === "DRAFT" && (
                              <button type="button"
                                onClick={() => void approveHrStaffAdvance(a.id).then(() => void load())}
                                className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 transition">
                                Approve
                              </button>
                            )}
                            {(a.status === "DISBURSED" || a.status === "PARTIALLY_RECOVERED") && (
                              <Link href={ROUTES.admin.hrStaffAdvances}
                                className="text-xs font-semibold text-primary hover:underline">
                                Record recovery →
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
