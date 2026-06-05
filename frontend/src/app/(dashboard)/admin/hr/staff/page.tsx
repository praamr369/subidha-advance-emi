"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DataTableShell, FormSection, KpiCard, QuickActionGrid, WorkflowCard } from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import {
  createAdminStaffIdentity,
  listAdminStaffIdentities,
  type AdminStaffIdentity,
} from "@/services/staff";
import {
  createHrStaff,
  listHrStaff,
  patchHrStaff,
  setHrStaffStatus,
  type HrStaff,
} from "@/services/admin-hr";

type EmploymentTypeValue =
  | "PERMANENT_MONTHLY"
  | "TEMPORARY"
  | "DAILY_WAGE"
  | "HOURLY"
  | "PIECE_RATE"
  | "MANUFACTURING"
  | "SERVICE";

const EMPLOYMENT_TYPES: Array<{ value: EmploymentTypeValue; label: string; helper: string }> = [
  { value: "PERMANENT_MONTHLY", label: "Permanent Monthly", helper: "Requires base salary when payroll eligible" },
  { value: "TEMPORARY", label: "Contract", helper: "Uses contract/base payout when supported" },
  { value: "DAILY_WAGE", label: "Daily Wage", helper: "Requires daily wage" },
  { value: "HOURLY", label: "Hourly", helper: "Requires hourly wage" },
  { value: "PIECE_RATE", label: "Piece Rate", helper: "Requires rate and unit" },
  { value: "MANUFACTURING", label: "Manufacturing", helper: "Operational staff category" },
  { value: "SERVICE", label: "Service", helper: "Service desk/field staff category" },
];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
];

type StaffFormState = {
  name: string;
  phone: string;
  email: string;
  designation: string;
  branch: string;
  department: string;
  joining_date: string;
  employment_type: EmploymentTypeValue;
  employment_status: "DRAFT" | "ACTIVE";
  reporting_manager: string;
  work_location: string;
  probation_end_date: string;
  attendance_policy: string;
  shift_name: string;
  payroll_eligible: boolean;
  salary_effective_from: string;
  base_salary: string;
  daily_wage_rate: string;
  hourly_wage_rate: string;
  piece_rate_amount: string;
  piece_rate_unit_label: string;
  cost_center_code: string;
  payment_mode: "CASH" | "BANK" | "UPI";
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string;
  kyc_verified: boolean;
  kyc_id_type: string;
  kyc_id_number: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  create_login: boolean;
  username: string;
  temporary_password: string;
  notes: string;
};

const emptyForm: StaffFormState = {
  name: "",
  phone: "",
  email: "",
  designation: "",
  branch: "",
  department: "",
  joining_date: "",
  employment_type: "PERMANENT_MONTHLY",
  employment_status: "DRAFT",
  reporting_manager: "",
  work_location: "",
  probation_end_date: "",
  attendance_policy: "",
  shift_name: "",
  payroll_eligible: false,
  salary_effective_from: "",
  base_salary: "",
  daily_wage_rate: "",
  hourly_wage_rate: "",
  piece_rate_amount: "",
  piece_rate_unit_label: "",
  cost_center_code: "",
  payment_mode: "CASH",
  bank_account_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  upi_id: "",
  kyc_verified: false,
  kyc_id_type: "",
  kyc_id_number: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  create_login: false,
  username: "",
  temporary_password: "",
  notes: "",
};

function formFromStaff(staff: HrStaff): StaffFormState {
  return {
    ...emptyForm,
    name: staff.name || "",
    phone: staff.phone || "",
    designation: staff.designation || "",
    branch: staff.branch ? String(staff.branch) : "",
    department: staff.department || "",
    joining_date: staff.joining_date || "",
    employment_type: (staff.employment_type as EmploymentTypeValue) || "PERMANENT_MONTHLY",
    employment_status: staff.employment_status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    reporting_manager: staff.reporting_manager || "",
    work_location: staff.work_location || "",
    probation_end_date: staff.probation_end_date || "",
    attendance_policy: staff.attendance_policy || "",
    shift_name: staff.shift_name || "",
    payroll_eligible: Boolean(staff.payroll_eligible),
    salary_effective_from: staff.salary_effective_from || "",
    base_salary: staff.base_salary || "",
    daily_wage_rate: staff.daily_wage_rate || "",
    hourly_wage_rate: staff.hourly_wage_rate || "",
    piece_rate_amount: staff.piece_rate_amount || "",
    piece_rate_unit_label: staff.piece_rate_unit_label || "",
    cost_center_code: staff.cost_center_code || "",
    payment_mode: (staff.payment_mode as StaffFormState["payment_mode"]) || "CASH",
    bank_account_name: staff.bank_account_name || "",
    bank_account_number: staff.bank_account_number || "",
    bank_ifsc: staff.bank_ifsc || "",
    upi_id: staff.upi_id || "",
    kyc_verified: Boolean(staff.kyc_verified),
    kyc_id_type: staff.kyc_id_type || "",
    kyc_id_number: staff.kyc_id_number || "",
    address: staff.address || "",
    emergency_contact_name: staff.emergency_contact_name || "",
    emergency_contact_phone: staff.emergency_contact_phone || "",
    notes: staff.notes || "",
  };
}

function compactPayload(form: StaffFormState) {
  const base = {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    designation: form.designation.trim(),
    branch: form.branch ? Number(form.branch) : null,
    department: form.department.trim(),
    joining_date: form.joining_date || null,
    employment_type: form.employment_type,
    employment_status: form.employment_status,
    is_active: form.employment_status === "ACTIVE",
    reporting_manager: form.reporting_manager.trim(),
    work_location: form.work_location.trim(),
    probation_end_date: form.probation_end_date || null,
    attendance_policy: form.attendance_policy.trim(),
    shift_name: form.shift_name.trim(),
    payroll_eligible: form.payroll_eligible,
    salary_effective_from: form.salary_effective_from || null,
    base_salary: form.employment_type === "PERMANENT_MONTHLY" || form.employment_type === "TEMPORARY" ? form.base_salary.trim() || null : null,
    daily_wage_rate: form.employment_type === "DAILY_WAGE" ? form.daily_wage_rate.trim() || null : null,
    hourly_wage_rate: form.employment_type === "HOURLY" ? form.hourly_wage_rate.trim() || null : null,
    piece_rate_amount: form.employment_type === "PIECE_RATE" ? form.piece_rate_amount.trim() || null : null,
    piece_rate_unit_label: form.employment_type === "PIECE_RATE" ? form.piece_rate_unit_label.trim() : "",
    cost_center_code: form.cost_center_code.trim(),
    payment_mode: form.payment_mode,
    bank_account_name: form.bank_account_name.trim(),
    bank_account_number: form.bank_account_number.trim(),
    bank_ifsc: form.bank_ifsc.trim(),
    upi_id: form.upi_id.trim(),
    kyc_verified: form.kyc_verified,
    kyc_id_type: form.kyc_id_type.trim(),
    kyc_id_number: form.kyc_id_number.trim(),
    address: form.address.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(),
    emergency_contact_phone: form.emergency_contact_phone.trim(),
    notes: form.notes.trim(),
  };
  return base;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
      {hint ? <span className="normal-case tracking-normal text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      value={value}
      type={type}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary"
    />
  );
}

function SelectInput({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">
      {children}
    </select>
  );
}

function ReadinessBadge({ ready, label }: { ready?: boolean; label: string }) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{label}</span>;
}

function payBasis(staff: HrStaff) {
  return staff.pay_basis || (staff.base_salary ? "Monthly/base" : staff.daily_wage_rate ? "Daily wage" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "Not configured");
}

function Wizard({
  form,
  branches,
  editing,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: StaffFormState;
  branches: BranchRecord[];
  editing: boolean;
  saving: boolean;
  onChange: (next: StaffFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [step, setStep] = useState(0);
  const update = <K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) => onChange({ ...form, [key]: value });
  const activeRequiredMissing = form.employment_status === "ACTIVE" && (!form.name.trim() || !form.phone.trim() || !form.designation.trim() || !form.branch || !form.joining_date || !form.department.trim());
  const payrollMissing = form.payroll_eligible && (
    !form.salary_effective_from ||
    (form.employment_type === "PERMANENT_MONTHLY" && !form.base_salary.trim()) ||
    (form.employment_type === "DAILY_WAGE" && !form.daily_wage_rate.trim()) ||
    (form.employment_type === "HOURLY" && !form.hourly_wage_rate.trim()) ||
    (form.employment_type === "PIECE_RATE" && (!form.piece_rate_amount.trim() || !form.piece_rate_unit_label.trim())) ||
    (form.payment_mode === "BANK" && !form.bank_account_number.trim()) ||
    (form.payment_mode === "UPI" && !form.upi_id.trim())
  );
  const canSave = form.name.trim().length >= 2 && form.phone.trim().length >= 8 && !activeRequiredMissing && !payrollMissing;
  const steps = ["Basic Identity", "Employment Setup", "Payroll Setup", "Documents and Access"];

  return (
    <FormSection title={editing ? "Edit staff setup" : "Create staff"} description="Progressive onboarding form with conditional payroll fields and draft support." className="border border-primary/25">
      <div className="flex flex-wrap gap-2">
        {steps.map((item, index) => (
          <button key={item} type="button" onClick={() => setStep(index)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${step === index ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}>
            {index + 1}. {item}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4">
        {step === 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Full name"><TextInput value={form.name} onChange={(value) => update("name", value)} /></Field>
            <Field label="Phone" hint="Required and duplicate-checked by API"><TextInput value={form.phone} onChange={(value) => update("phone", value)} /></Field>
            <Field label="Role / title"><TextInput value={form.designation} onChange={(value) => update("designation", value)} /></Field>
            <Field label="Branch">
              <SelectInput value={form.branch} onChange={(value) => update("branch", value)}>
                <option value="">Select branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
              </SelectInput>
            </Field>
            <Field label="Department"><TextInput value={form.department} onChange={(value) => update("department", value)} /></Field>
            <Field label="Joining date"><TextInput type="date" value={form.joining_date} onChange={(value) => update("joining_date", value)} /></Field>
            <Field label="Staff type">
              <SelectInput value={form.employment_type} onChange={(value) => update("employment_type", value as EmploymentTypeValue)}>
                {EMPLOYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Email"><TextInput type="email" value={form.email} onChange={(value) => update("email", value)} /></Field>
            <Field label="Emergency contact"><TextInput value={form.emergency_contact_name} onChange={(value) => update("emergency_contact_name", value)} /></Field>
            <Field label="Emergency phone"><TextInput value={form.emergency_contact_phone} onChange={(value) => update("emergency_contact_phone", value)} /></Field>
            <Field label="Address"><textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" /></Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Employment status">
              <SelectInput value={form.employment_status} onChange={(value) => update("employment_status", value as StaffFormState["employment_status"])}>
                {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Reporting manager"><TextInput value={form.reporting_manager} onChange={(value) => update("reporting_manager", value)} /></Field>
            <Field label="Work location"><TextInput value={form.work_location} onChange={(value) => update("work_location", value)} /></Field>
            <Field label="Probation end date"><TextInput type="date" value={form.probation_end_date} onChange={(value) => update("probation_end_date", value)} /></Field>
            <Field label="Attendance policy"><TextInput value={form.attendance_policy} onChange={(value) => update("attendance_policy", value)} placeholder="Day shift, weekly off, policy name" /></Field>
            <Field label="Shift"><TextInput value={form.shift_name} onChange={(value) => update("shift_name", value)} /></Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-border bg-background p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={form.payroll_eligible} onChange={(event) => update("payroll_eligible", event.target.checked)} />
                Payroll eligible
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Salary effective date"><TextInput type="date" value={form.salary_effective_from} onChange={(value) => update("salary_effective_from", value)} /></Field>
              <Field label="Cost center"><TextInput value={form.cost_center_code} onChange={(value) => update("cost_center_code", value)} /></Field>
              <Field label="Payment mode">
                <SelectInput value={form.payment_mode} onChange={(value) => update("payment_mode", value as StaffFormState["payment_mode"])}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="UPI">UPI</option>
                </SelectInput>
              </Field>
              {form.employment_type === "PERMANENT_MONTHLY" || form.employment_type === "TEMPORARY" ? <Field label={form.employment_type === "TEMPORARY" ? "Contract payout amount" : "Base salary"}><TextInput value={form.base_salary} onChange={(value) => update("base_salary", value)} /></Field> : null}
              {form.employment_type === "DAILY_WAGE" ? <Field label="Daily wage"><TextInput value={form.daily_wage_rate} onChange={(value) => update("daily_wage_rate", value)} /></Field> : null}
              {form.employment_type === "HOURLY" ? <Field label="Hourly wage"><TextInput value={form.hourly_wage_rate} onChange={(value) => update("hourly_wage_rate", value)} /></Field> : null}
              {form.employment_type === "PIECE_RATE" ? (
                <>
                  <Field label="Piece rate"><TextInput value={form.piece_rate_amount} onChange={(value) => update("piece_rate_amount", value)} /></Field>
                  <Field label="Piece unit"><TextInput value={form.piece_rate_unit_label} onChange={(value) => update("piece_rate_unit_label", value)} /></Field>
                </>
              ) : null}
              {form.payment_mode === "BANK" ? (
                <>
                  <Field label="Bank account name"><TextInput value={form.bank_account_name} onChange={(value) => update("bank_account_name", value)} /></Field>
                  <Field label="Bank account number"><TextInput value={form.bank_account_number} onChange={(value) => update("bank_account_number", value)} /></Field>
                  <Field label="IFSC"><TextInput value={form.bank_ifsc} onChange={(value) => update("bank_ifsc", value)} /></Field>
                </>
              ) : null}
              {form.payment_mode === "UPI" ? <Field label="UPI ID"><TextInput value={form.upi_id} onChange={(value) => update("upi_id", value)} /></Field> : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="KYC status">
              <SelectInput value={form.kyc_verified ? "true" : "false"} onChange={(value) => update("kyc_verified", value === "true")}>
                <option value="false">Pending</option>
                <option value="true">Verified</option>
              </SelectInput>
            </Field>
            <Field label="KYC type"><TextInput value={form.kyc_id_type} onChange={(value) => update("kyc_id_type", value)} /></Field>
            <Field label="KYC reference"><TextInput value={form.kyc_id_number} onChange={(value) => update("kyc_id_number", value)} /></Field>
            {!editing ? (
              <>
                <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
                  <input type="checkbox" checked={form.create_login} onChange={(event) => update("create_login", event.target.checked)} />
                  Create staff login account
                </label>
                {form.create_login ? (
                  <>
                    <Field label="Username"><TextInput value={form.username} onChange={(value) => update("username", value)} placeholder={form.phone || "username"} /></Field>
                    <Field label="Temporary password"><TextInput value={form.temporary_password} onChange={(value) => update("temporary_password", value)} placeholder="Optional, min 8 chars" /></Field>
                  </>
                ) : null}
              </>
            ) : null}
            <Field label="Notes"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" /></Field>
          </div>
        ) : null}
      </div>

      {(activeRequiredMissing || payrollMissing) ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {activeRequiredMissing ? "Active staff requires name, phone, role/title, branch, department, joining date, and staff type. " : null}
          {payrollMissing ? "Payroll eligible staff requires the matching pay setup, salary effective date, and selected payment details." : null}
        </div>
      ) : null}

      <div className="sticky bottom-3 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">Delete is not available. Deactivation preserves payroll, attendance, documents, and audit history.</span>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="ghost" onClick={onClose}>Close</ActionButton>
          {step > 0 ? <ActionButton variant="secondary" onClick={() => setStep(step - 1)}>Back</ActionButton> : null}
          {step < steps.length - 1 ? <ActionButton variant="secondary" onClick={() => setStep(step + 1)}>Next</ActionButton> : null}
          <ActionButton variant="primary" loading={saving} disabled={!canSave} onClick={onSave}>{editing ? "Save changes" : form.employment_status === "DRAFT" ? "Save draft" : "Create active staff"}</ActionButton>
        </div>
      </div>
    </FormSection>
  );
}

export default function AdminHrStaffRegisterPage() {
  const [rows, setRows] = useState<HrStaff[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [identities, setIdentities] = useState<AdminStaffIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<HrStaff | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyForm);
  const [deactivateStaff, setDeactivateStaff] = useState<HrStaff | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    branch: "",
    department: "",
    employment_type: "",
    status: "",
    payroll_ready: "",
    kyc_verified: "",
  });

  const identityByEmployee = useMemo(() => new Map(identities.map((identity) => [identity.employee, identity])), [identities]);
  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department || "").filter(Boolean))).sort(), [rows]);
  const activeCount = rows.filter((row) => row.employment_status === "ACTIVE" || row.is_active).length;
  const draftCount = rows.filter((row) => row.employment_status === "DRAFT").length;
  const payrollReadyCount = rows.filter((row) => row.payroll_ready).length;
  const missingKycCount = rows.filter((row) => !row.documents_ready).length;
  const attendanceMissingCount = rows.filter((row) => !row.attendance_ready).length;

  async function load(nextFilters = filters) {
    try {
      setLoading(true);
      const [staffPayload, branchPayload, identityPayload] = await Promise.all([
        listHrStaff(nextFilters),
        listBranches({ status: "ACTIVE" }),
        listAdminStaffIdentities(),
      ]);
      setRows(staffPayload.results);
      setBranches(branchPayload.results);
      setIdentities(identityPayload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load staff cockpit.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm({ ...emptyForm, joining_date: new Date().toISOString().slice(0, 10) });
    setEditStaff(null);
    setEditorOpen(true);
    setNotice(null);
  }

  function openEdit(staff: HrStaff) {
    setForm(formFromStaff(staff));
    setEditStaff(staff);
    setEditorOpen(true);
    setNotice(null);
  }

  async function saveStaff() {
    try {
      setSaving(true);
      if (editStaff) {
        await patchHrStaff(editStaff.id, compactPayload(form));
        setNotice("Staff setup updated.");
      } else {
        const created = await createHrStaff(compactPayload(form));
        const employee = (created as { employee?: HrStaff }).employee;
        if (form.create_login && employee) {
          await createAdminStaffIdentity({
            employee: employee.id,
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            username: form.username.trim() || form.phone.trim(),
            temporary_password: form.temporary_password.trim() || undefined,
            designation: form.designation.trim(),
            department: form.department.trim(),
            branch: form.branch ? Number(form.branch) : null,
            joining_date: form.joining_date || new Date().toISOString().slice(0, 10),
            base_salary: form.base_salary.trim() || null,
            login_enabled: true,
          });
        }
        setNotice(form.employment_status === "DRAFT" ? "Draft staff saved." : "Active staff created.");
      }
      setEditorOpen(false);
      setEditStaff(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save staff setup.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!deactivateStaff || !deactivationReason.trim()) return;
    try {
      await setHrStaffStatus(deactivateStaff.id, "DEACTIVATE", deactivationReason.trim());
      setNotice(`${deactivateStaff.name} deactivated. History remains preserved.`);
      setDeactivateStaff(null);
      setDeactivationReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to deactivate staff.");
    }
  }

  async function reactivate(staff: HrStaff) {
    try {
      await setHrStaffStatus(staff.id, "REACTIVATE");
      setNotice(`${staff.name} reactivated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reactivate staff.");
    }
  }

  const clearFilters = { q: "", branch: "", department: "", employment_type: "", status: "", payroll_ready: "", kyc_verified: "" };

  return (
    <ERPPageShell
      eyebrow="Staff HR"
      title="Staff Cockpit"
      subtitle="Onboard, verify, payroll-enable, and safely deactivate staff from one operational register."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Staff Cockpit" },
      ]}
      actions={[
        { href: ROUTES.admin.hrAttendance, label: "Attendance", variant: "secondary" },
        { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" },
        { href: ROUTES.admin.hrStaffDocuments, label: "Documents", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ERPSectionShell title="Operational Summary" actions={<ActionButton variant="primary" onClick={openCreate}>Create staff</ActionButton>}>
        <QuickActionGrid className="xl:grid-cols-5">
          <KpiCard label="Active staff" value={activeCount} helper="Employment status active" />
          <KpiCard label="Draft/onboarding" value={draftCount} helper="Saved but not active" />
          <KpiCard label="Payroll ready" value={payrollReadyCount} helper="Eligible with valid pay setup" />
          <KpiCard label="Missing KYC/documents" value={missingKycCount} helper="KYC not verified or incomplete" />
          <KpiCard label="Attendance setup missing" value={attendanceMissingCount} helper="No policy or shift" />
        </QuickActionGrid>
      </ERPSectionShell>

      <FormSection title="Search and filters" description="Filters call the existing staff API and keep results endpoint-backed.">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <TextInput value={filters.q} onChange={(value) => setFilters({ ...filters, q: value })} placeholder="Name, phone, code" />
          <SelectInput value={filters.branch} onChange={(value) => setFilters({ ...filters, branch: value })}>
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </SelectInput>
          <SelectInput value={filters.department} onChange={(value) => setFilters({ ...filters, department: value })}>
            <option value="">All departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </SelectInput>
          <SelectInput value={filters.employment_type} onChange={(value) => setFilters({ ...filters, employment_type: value })}>
            <option value="">All staff types</option>
            {EMPLOYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </SelectInput>
          <SelectInput value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })}>
            <option value="">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="INACTIVE">Inactive</option>
          </SelectInput>
          <SelectInput value={filters.payroll_ready} onChange={(value) => setFilters({ ...filters, payroll_ready: value })}>
            <option value="">Payroll readiness</option>
            <option value="true">Ready</option>
            <option value="false">Not ready</option>
          </SelectInput>
          <SelectInput value={filters.kyc_verified} onChange={(value) => setFilters({ ...filters, kyc_verified: value })}>
            <option value="">All KYC</option>
            <option value="true">Verified</option>
            <option value="false">Pending</option>
          </SelectInput>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton onClick={() => void load()}>Apply filters</ActionButton>
          <ActionButton variant="ghost" onClick={() => { setFilters(clearFilters); void load(clearFilters); }}>Clear</ActionButton>
        </div>
      </FormSection>

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
      {loading ? <ERPLoadingState label="Loading staff cockpit..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load staff cockpit" description={error} onRetry={() => void load()} /> : null}

      {editorOpen ? (
        <Wizard
          form={form}
          branches={branches}
          editing={Boolean(editStaff)}
          saving={saving}
          onChange={setForm}
          onClose={() => { setEditorOpen(false); setEditStaff(null); }}
          onSave={() => void saveStaff()}
        />
      ) : null}

      {deactivateStaff ? (
        <FormSection title={`Deactivate ${deactivateStaff.name}`} description="Deactivation preserves staff profile, attendance, documents, payroll history, and audit metadata." className="border border-destructive/30">
          <Field label="Reason">
            <textarea value={deactivationReason} onChange={(event) => setDeactivationReason(event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" />
          </Field>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <ActionButton variant="ghost" onClick={() => { setDeactivateStaff(null); setDeactivationReason(""); }}>Cancel</ActionButton>
            <ActionButton variant="destructive" disabled={!deactivationReason.trim()} onClick={() => void deactivate()}>Deactivate</ActionButton>
          </div>
        </FormSection>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No staff found" description="Create the first staff profile or clear filters." action={<ActionButton variant="primary" onClick={openCreate}>Create first staff</ActionButton>} />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title={`Staff register (${rows.length})`} description="Open a staff cockpit for employment, attendance, payroll, documents, access, and timeline context.">
          <DataTableShell>
            <div className="overflow-auto">
              <table className="min-w-[1100px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Staff code</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Role/title</th>
                    <th className="py-2 pr-4">Branch</th>
                    <th className="py-2 pr-4">Department</th>
                    <th className="py-2 pr-4">Staff type</th>
                    <th className="py-2 pr-4">Pay basis</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Readiness</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {rows.map((row) => {
                    const identity = identityByEmployee.get(row.id);
                    return (
                      <tr key={row.id} className="border-t border-border/60 align-top">
                        <td className="py-3 pr-4 font-mono text-xs">{row.employee_code || `#${row.id}`}</td>
                        <td className="py-3 pr-4">
                          <Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="font-semibold text-primary hover:underline">{row.name}</Link>
                          {identity ? <div className="mt-1 text-xs text-muted-foreground">Login: {identity.username}</div> : null}
                        </td>
                        <td className="py-3 pr-4">{row.phone || "Unavailable"}</td>
                        <td className="py-3 pr-4">{row.designation || "Unassigned"}</td>
                        <td className="py-3 pr-4">{row.branch_name || "No branch"}</td>
                        <td className="py-3 pr-4">{row.department || "Unassigned"}</td>
                        <td className="py-3 pr-4">{EMPLOYMENT_TYPES.find((type) => type.value === row.employment_type)?.label || row.employment_type || "Unassigned"}</td>
                        <td className="py-3 pr-4">{payBasis(row)}</td>
                        <td className="py-3 pr-4"><ERPStatusBadge status={row.employment_status || (row.is_active ? "ACTIVE" : "INACTIVE")} label={row.employment_status || (row.is_active ? "Active" : "Inactive")} /></td>
                        <td className="py-3 pr-4">
                          <div className="flex min-w-56 flex-wrap gap-1">
                            <ReadinessBadge ready={row.profile_ready} label="Profile" />
                            <ReadinessBadge ready={row.payroll_ready} label="Payroll" />
                            <ReadinessBadge ready={row.attendance_ready} label="Attendance" />
                            <ReadinessBadge ready={row.documents_ready} label="KYC" />
                            <ReadinessBadge ready={row.access_ready} label="Access" />
                          </div>
                          {row.readiness_warnings?.length ? <div className="mt-2 text-xs text-amber-700">{row.readiness_warnings.join(", ")}</div> : null}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex min-w-44 flex-wrap gap-2">
                            <Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">Open</Link>
                            <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => openEdit(row)}>Edit</button>
                            {row.is_active ? (
                              <button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-semibold text-destructive hover:bg-muted" onClick={() => setDeactivateStaff(row)}>Deactivate</button>
                            ) : (
                              <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void reactivate(row)}>Reactivate</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DataTableShell>
        </ERPSectionShell>
      ) : null}

      <WorkflowCard
        title="Controls preserved"
        description="No delete action is exposed. Staff deactivation uses the existing status endpoint with a reason and keeps historical HR/payroll records intact."
      />
    </ERPPageShell>
  );
}
