"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
import { listAdminStaffIdentities, type AdminStaffIdentity } from "@/services/staff";
import {
  createHrStaff,
  getHrStaffOptions,
  listHrStaff,
  patchHrStaff,
  setHrStaffStatus,
  type HrOption,
  type HrStaff,
  type HrStaffOptions,
} from "@/services/admin-hr";

type EmploymentTypeValue = "PERMANENT_MONTHLY" | "TEMPORARY" | "DAILY_WAGE" | "HOURLY" | "PIECE_RATE" | "MANUFACTURING" | "SERVICE";
type EmploymentStatusValue = "DRAFT" | "ONBOARDING" | "ACTIVE";
type PaymentModeValue = "CASH" | "BANK" | "UPI";
type KycStatusValue = "PENDING" | "VERIFIED" | "REJECTED";

type StaffFormState = {
  name: string;
  phone: string;
  email: string;
  designation: string;
  branch: string;
  department: string;
  joining_date: string;
  employment_type: EmploymentTypeValue;
  employment_status: EmploymentStatusValue;
  reporting_manager: string;
  work_location: string;
  probation_end_date: string;
  attendance_policy: string;
  shift_name: string;
  weekly_off: string;
  payroll_eligible: boolean;
  salary_effective_from: string;
  base_salary: string;
  daily_wage_rate: string;
  hourly_wage_rate: string;
  piece_rate_amount: string;
  piece_rate_unit_label: string;
  cost_center_code: string;
  payment_mode: PaymentModeValue;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string;
  kyc_status: KycStatusValue;
  kyc_id_type: string;
  kyc_id_number: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  create_login: boolean;
  user_role: "STAFF";
  username: string;
  temporary_password: string;
  notes: string;
};

const fallbackOptions: HrStaffOptions = {
  employment_statuses: [
    { value: "DRAFT", label: "Draft" },
    { value: "ONBOARDING", label: "Onboarding" },
    { value: "ACTIVE", label: "Active" },
  ],
  employment_types: [
    { value: "PERMANENT_MONTHLY", label: "Permanent Monthly" },
    { value: "TEMPORARY", label: "Temporary" },
    { value: "DAILY_WAGE", label: "Daily Wage" },
    { value: "HOURLY", label: "Hourly" },
    { value: "PIECE_RATE", label: "Piece Rate" },
    { value: "MANUFACTURING", label: "Manufacturing" },
    { value: "SERVICE", label: "Service" },
  ],
  payment_modes: [{ value: "CASH", label: "Cash" }, { value: "BANK", label: "Bank" }, { value: "UPI", label: "UPI" }],
  user_roles: [{ value: "STAFF", label: "Staff" }],
  departments: ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"].map((value) => ({ value, label: value.replace("_", " ") })),
  roles_titles: ["Sales Executive", "Cashier", "Delivery Staff", "Inventory Staff", "Accountant", "HR Executive", "Service Staff", "Helper", "Manager"].map((label) => ({ value: label, label })),
  attendance_policies: ["DAY_SHIFT", "SHOP_STANDARD", "FIELD_STAFF", "FLEXIBLE"].map((value) => ({ value, label: value.replace("_", " ") })),
  shifts: ["DAY", "EVENING", "FULL_DAY", "FIELD"].map((value) => ({ value, label: value.replace("_", " ") })),
  weekly_offs: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "ROTATIONAL"].map((value) => ({ value, label: value.replace("_", " ") })),
  cost_centers: ["SALES", "COLLECTION", "DELIVERY", "INVENTORY", "ACCOUNTING", "HR", "SERVICE", "MANUFACTURING"].map((value) => ({ value, label: value.replace("_", " ") })),
  kyc_statuses: [{ value: "PENDING", label: "Pending" }, { value: "VERIFIED", label: "Verified" }, { value: "REJECTED", label: "Rejected" }],
  kyc_types: ["AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT", "OTHER"].map((value) => ({ value, label: value.replace("_", " ") })),
  emergency_relations: ["FATHER", "MOTHER", "SPOUSE", "BROTHER", "SISTER", "FRIEND", "OTHER"].map((value) => ({ value, label: value.replace("_", " ") })),
  payroll_accounting: { enabled: false, message: "Payroll accounting bridge is not enabled. Staff creation stores HR/payroll setup only." },
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
  weekly_off: "",
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
  kyc_status: "PENDING",
  kyc_id_type: "",
  kyc_id_number: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_relation: "",
  emergency_contact_phone: "",
  create_login: false,
  user_role: "STAFF",
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
    payment_mode: (staff.payment_mode as PaymentModeValue) || "CASH",
    bank_account_name: staff.bank_account_name || "",
    bank_account_number: staff.bank_account_number || "",
    bank_ifsc: staff.bank_ifsc || "",
    upi_id: staff.upi_id || "",
    kyc_status: staff.kyc_verified ? "VERIFIED" : "PENDING",
    kyc_id_type: staff.kyc_id_type || "",
    kyc_id_number: staff.kyc_id_number || "",
    address: staff.address || "",
    emergency_contact_name: staff.emergency_contact_name || "",
    emergency_contact_phone: staff.emergency_contact_phone || "",
    notes: staff.notes || "",
  };
}

function compactPayload(form: StaffFormState, targetStatus: EmploymentStatusValue) {
  return {
    full_name: form.name.trim(),
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    designation: form.designation.trim(),
    title: form.designation.trim(),
    branch: form.branch ? Number(form.branch) : null,
    department: form.department.trim(),
    joining_date: form.joining_date || null,
    employment_type: form.employment_type,
    staff_type: form.employment_type,
    employment_status: targetStatus,
    is_active: targetStatus === "ACTIVE",
    reporting_manager: form.reporting_manager.trim(),
    work_location: form.work_location.trim(),
    probation_end_date: form.probation_end_date || null,
    attendance_policy: form.attendance_policy.trim(),
    shift_name: form.shift_name.trim(),
    shift: form.shift_name.trim(),
    weekly_off: form.weekly_off.trim(),
    payroll_eligible: form.payroll_eligible,
    salary_effective_from: form.salary_effective_from || null,
    salary_effective_date: form.salary_effective_from || null,
    base_salary: ["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) ? form.base_salary.trim() || null : null,
    daily_wage_rate: form.employment_type === "DAILY_WAGE" ? form.daily_wage_rate.trim() || null : null,
    hourly_wage_rate: form.employment_type === "HOURLY" ? form.hourly_wage_rate.trim() || null : null,
    piece_rate_amount: form.employment_type === "PIECE_RATE" ? form.piece_rate_amount.trim() || null : null,
    piece_rate_unit_label: form.employment_type === "PIECE_RATE" ? form.piece_rate_unit_label.trim() : "",
    cost_center_code: form.cost_center_code.trim(),
    cost_center: form.cost_center_code.trim(),
    payment_mode: form.payment_mode,
    bank_account_name: form.bank_account_name.trim(),
    bank_account_number: form.bank_account_number.trim(),
    bank_ifsc: form.bank_ifsc.trim(),
    upi_id: form.upi_id.trim(),
    kyc_status: form.kyc_status,
    kyc_verified: form.kyc_status === "VERIFIED",
    kyc_id_type: form.kyc_id_type.trim(),
    kyc_type: form.kyc_id_type.trim(),
    kyc_id_number: form.kyc_id_number.trim(),
    kyc_reference: form.kyc_id_number.trim(),
    address: form.address.trim(),
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

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
      {hint ? <span className="normal-case tracking-normal text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <input value={value} type={type} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary" />;
}

function SelectInput({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary">{children}</select>;
}

function optionItems(options: HrOption[] | undefined, placeholder = "Select") {
  return [<option key="" value="">{placeholder}</option>, ...(options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)];
}

function ReadinessBadge({ ready, label }: { ready?: boolean; label: string }) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{label}</span>;
}

function payBasis(staff: HrStaff) {
  return staff.pay_basis || (staff.base_salary ? "Monthly/base" : staff.daily_wage_rate ? "Daily wage" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "Not configured");
}

type FieldErrors = Record<string, string | string[]>;

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name];
  if (!msg) return null;
  return <span className="mt-0.5 text-xs font-medium text-destructive">{Array.isArray(msg) ? msg.join(" ") : msg}</span>;
}

function localValidation(form: StaffFormState, status: EmploymentStatusValue) {
  const missing: string[] = [];
  if (!form.name.trim()) missing.push("full name");
  if (!form.phone.trim()) missing.push("phone");
  if (["ONBOARDING", "ACTIVE"].includes(status)) {
    if (!form.designation.trim()) missing.push("role/title");
    if (!form.branch) missing.push("branch");
    if (!form.department.trim()) missing.push("department");
    if (!form.joining_date) missing.push("joining date");
  }
  if (status === "ACTIVE") {
    if (!form.attendance_policy && !form.shift_name) missing.push("attendance policy or shift");
    if (form.kyc_status !== "VERIFIED" || !form.kyc_id_type || !form.kyc_id_number) missing.push("verified KYC");
  }
  if (form.payroll_eligible) {
    if (!form.salary_effective_from) missing.push("salary effective date");
    if (["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) && !form.base_salary.trim()) missing.push("base salary");
    if (form.employment_type === "DAILY_WAGE" && !form.daily_wage_rate.trim()) missing.push("daily wage");
    if (form.employment_type === "HOURLY" && !form.hourly_wage_rate.trim()) missing.push("hourly wage");
    if (form.employment_type === "PIECE_RATE" && (!form.piece_rate_amount.trim() || !form.piece_rate_unit_label.trim())) missing.push("piece rate and unit");
    if (form.payment_mode === "BANK" && !form.bank_account_number.trim()) missing.push("bank account number");
    if (form.payment_mode === "UPI" && !form.upi_id.trim()) missing.push("UPI ID");
  }
  if (form.create_login) {
    if (form.user_role !== "STAFF") missing.push("valid STAFF login role");
    if (!form.username.trim()) missing.push("username");
  }
  return missing;
}

function Wizard({ form, options, branches, editing, saving, fieldErrors, onChange, onClose, onSave }: { form: StaffFormState; options: HrStaffOptions; branches: BranchRecord[]; editing: boolean; saving: boolean; fieldErrors: FieldErrors; onChange: (next: StaffFormState) => void; onClose: () => void; onSave: (targetStatus: EmploymentStatusValue) => void }) {
  const [step, setStep] = useState(0);
  const update = <K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) => onChange({ ...form, [key]: value });
  const steps = ["Basic Identity", "Employment Setup", "Payroll Setup", "Documents and Access"];
  const validation = {
    DRAFT: localValidation(form, "DRAFT"),
    ONBOARDING: localValidation(form, "ONBOARDING"),
    ACTIVE: localValidation(form, "ACTIVE"),
  };

  return (
    <FormSection title={editing ? "Edit staff setup" : "Recruit staff"} description="Draft → onboarding → active workflow. Staff creation never posts payroll, journals, money movements, receipts, or reconciliation records." className="border border-primary/25">
      <div className="flex flex-wrap gap-2">
        {steps.map((item, index) => <button key={item} type="button" onClick={() => setStep(index)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${step === index ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}>{index + 1}. {item}</button>)}
      </div>

      {options.payroll_accounting && !options.payroll_accounting.enabled ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Payroll accounting not enabled.</strong> {options.payroll_accounting.message}</div> : null}
      {options.unsupported_profile_fields?.length ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">Backend gaps: {options.unsupported_profile_fields.map((gap) => `${gap.field}: ${gap.reason}`).join(" | ")}</div> : null}

      <div className="mt-5 grid gap-4">
        {step === 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Full name"><TextInput value={form.name} onChange={(value) => update("name", value)} /><FieldError errors={fieldErrors} name="name" /></Field>
            <Field label="Phone" hint="Duplicate checked by backend"><TextInput value={form.phone} onChange={(value) => update("phone", value)} /><FieldError errors={fieldErrors} name="phone" /></Field>
            <Field label="Role / title"><SelectInput value={form.designation} onChange={(value) => update("designation", value)}>{optionItems(options.roles_titles, "Select role/title")}</SelectInput><FieldError errors={fieldErrors} name="designation" /></Field>
            <Field label="Branch"><SelectInput value={form.branch} onChange={(value) => update("branch", value)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</SelectInput><FieldError errors={fieldErrors} name="branch" /></Field>
            <Field label="Department"><SelectInput value={form.department} onChange={(value) => update("department", value)}>{optionItems(options.departments, "Select department")}</SelectInput><FieldError errors={fieldErrors} name="department" /></Field>
            <Field label="Joining date"><TextInput type="date" value={form.joining_date} onChange={(value) => update("joining_date", value)} /><FieldError errors={fieldErrors} name="joining_date" /></Field>
            <Field label="Staff type"><SelectInput value={form.employment_type} onChange={(value) => update("employment_type", value as EmploymentTypeValue)}>{options.employment_types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</SelectInput><FieldError errors={fieldErrors} name="employment_type" /></Field>
            <Field label="Email"><TextInput type="email" value={form.email} onChange={(value) => update("email", value)} /><FieldError errors={fieldErrors} name="email" /></Field>
            <Field label="Emergency contact"><TextInput value={form.emergency_contact_name} onChange={(value) => update("emergency_contact_name", value)} /></Field>
            <Field label="Emergency relation"><SelectInput value={form.emergency_contact_relation} onChange={(value) => update("emergency_contact_relation", value)}>{optionItems(options.emergency_relations, "Select relation")}</SelectInput></Field>
            <Field label="Emergency phone"><TextInput value={form.emergency_contact_phone} onChange={(value) => update("emergency_contact_phone", value)} /></Field>
            <Field label="Address"><textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" /></Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Current workflow"><SelectInput value={form.employment_status} onChange={(value) => update("employment_status", value as EmploymentStatusValue)}>{options.employment_statuses.filter((item) => item.value !== "INACTIVE").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectInput></Field>
            <Field label="Reporting manager"><TextInput value={form.reporting_manager} onChange={(value) => update("reporting_manager", value)} /></Field>
            <Field label="Work location"><TextInput value={form.work_location} onChange={(value) => update("work_location", value)} /></Field>
            <Field label="Probation end date"><TextInput type="date" value={form.probation_end_date} onChange={(value) => update("probation_end_date", value)} /></Field>
            <Field label="Attendance policy"><SelectInput value={form.attendance_policy} onChange={(value) => update("attendance_policy", value)}>{optionItems(options.attendance_policies, "Select policy")}</SelectInput><FieldError errors={fieldErrors} name="attendance_policy" /></Field>
            <Field label="Shift"><SelectInput value={form.shift_name} onChange={(value) => update("shift_name", value)}>{optionItems(options.shifts, "Select shift")}</SelectInput></Field>
            <Field label="Weekly off"><SelectInput value={form.weekly_off} onChange={(value) => update("weekly_off", value)}>{optionItems(options.weekly_offs, "Select weekly off")}</SelectInput></Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-border bg-background p-3"><label className="flex items-center gap-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={form.payroll_eligible} onChange={(event) => update("payroll_eligible", event.target.checked)} />Payroll eligible</label></div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Salary effective date"><TextInput type="date" value={form.salary_effective_from} onChange={(value) => update("salary_effective_from", value)} /><FieldError errors={fieldErrors} name="salary_effective_from" /></Field>
              <Field label="Cost center"><SelectInput value={form.cost_center_code} onChange={(value) => update("cost_center_code", value)}>{optionItems(options.cost_centers, "Select cost center")}</SelectInput></Field>
              <Field label="Payment mode"><SelectInput value={form.payment_mode} onChange={(value) => update("payment_mode", value as PaymentModeValue)}>{options.payment_modes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field>
              {["PERMANENT_MONTHLY", "TEMPORARY", "MANUFACTURING", "SERVICE"].includes(form.employment_type) ? <Field label={form.employment_type === "TEMPORARY" ? "Contract payout amount" : "Base salary"}><TextInput value={form.base_salary} onChange={(value) => update("base_salary", value)} /><FieldError errors={fieldErrors} name="base_salary" /></Field> : null}
              {form.employment_type === "DAILY_WAGE" ? <Field label="Daily wage"><TextInput value={form.daily_wage_rate} onChange={(value) => update("daily_wage_rate", value)} /><FieldError errors={fieldErrors} name="daily_wage_rate" /></Field> : null}
              {form.employment_type === "HOURLY" ? <Field label="Hourly wage"><TextInput value={form.hourly_wage_rate} onChange={(value) => update("hourly_wage_rate", value)} /><FieldError errors={fieldErrors} name="hourly_wage_rate" /></Field> : null}
              {form.employment_type === "PIECE_RATE" ? <><Field label="Piece rate"><TextInput value={form.piece_rate_amount} onChange={(value) => update("piece_rate_amount", value)} /></Field><Field label="Piece unit"><TextInput value={form.piece_rate_unit_label} onChange={(value) => update("piece_rate_unit_label", value)} /></Field></> : null}
              {form.payment_mode === "BANK" ? <><Field label="Bank account name"><TextInput value={form.bank_account_name} onChange={(value) => update("bank_account_name", value)} /></Field><Field label="Bank account number"><TextInput value={form.bank_account_number} onChange={(value) => update("bank_account_number", value)} /><FieldError errors={fieldErrors} name="bank_account_number" /></Field><Field label="IFSC"><TextInput value={form.bank_ifsc} onChange={(value) => update("bank_ifsc", value)} /></Field></> : null}
              {form.payment_mode === "UPI" ? <Field label="UPI ID"><TextInput value={form.upi_id} onChange={(value) => update("upi_id", value)} /><FieldError errors={fieldErrors} name="upi_id" /></Field> : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="KYC status"><SelectInput value={form.kyc_status} onChange={(value) => update("kyc_status", value as KycStatusValue)}>{options.kyc_statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput><FieldError errors={fieldErrors} name="kyc_status" /></Field>
            <Field label="KYC type"><SelectInput value={form.kyc_id_type} onChange={(value) => update("kyc_id_type", value)}>{optionItems(options.kyc_types, "Select KYC type")}</SelectInput></Field>
            <Field label="KYC reference"><TextInput value={form.kyc_id_number} onChange={(value) => update("kyc_id_number", value)} /></Field>
            {!editing ? <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={form.create_login} onChange={(event) => update("create_login", event.target.checked)} />Create staff login account</label> : null}
            {!editing && form.create_login ? <><Field label="User role"><SelectInput value={form.user_role} onChange={(value) => update("user_role", value as "STAFF")}>{options.user_roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput><FieldError errors={fieldErrors} name="user_role" /></Field><Field label="Username"><TextInput value={form.username} onChange={(value) => update("username", value)} placeholder={form.phone || "username"} /><FieldError errors={fieldErrors} name="username" /></Field><Field label="Temporary password"><TextInput value={form.temporary_password} onChange={(value) => update("temporary_password", value)} placeholder="Optional, min 8 chars" /></Field></> : null}
            <Field label="Notes"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" /></Field>
          </div>
        ) : null}
      </div>

      {Object.keys(fieldErrors).length > 0 ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><p className="font-semibold">Errors from server:</p><ul className="mt-1 list-inside list-disc space-y-0.5">{Object.entries(fieldErrors).map(([field, msg]) => <li key={field}><span className="font-medium">{field}:</span> {Array.isArray(msg) ? msg.join(" ") : msg}</li>)}</ul></div> : null}

      <div className="sticky bottom-3 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">Delete is not available. Deactivation preserves payroll, attendance, documents, and audit history.</span>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="ghost" onClick={onClose}>Close</ActionButton>
          {step > 0 ? <ActionButton variant="secondary" onClick={() => setStep(step - 1)}>Back</ActionButton> : null}
          {step < steps.length - 1 ? <ActionButton variant="secondary" onClick={() => setStep(step + 1)}>Next</ActionButton> : null}
          <ActionButton variant="secondary" loading={saving} disabled={saving || validation.DRAFT.length > 0} onClick={() => onSave("DRAFT")}>Save draft</ActionButton>
          <ActionButton variant="secondary" loading={saving} disabled={saving || validation.ONBOARDING.length > 0} onClick={() => onSave("ONBOARDING")}>Save onboarding</ActionButton>
          <ActionButton variant="primary" loading={saving} disabled={saving || validation.ACTIVE.length > 0} onClick={() => onSave("ACTIVE")}>Activate staff</ActionButton>
        </div>
      </div>
      {(validation.ONBOARDING.length > 0 || validation.ACTIVE.length > 0) ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><div>Onboarding blockers: {validation.ONBOARDING.join(", ") || "None"}</div><div>Activation blockers: {validation.ACTIVE.join(", ") || "None"}</div></div> : null}
    </FormSection>
  );
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
    } catch {}
    return { detail: err.message, fields: {} };
  }
  return { detail: "Unknown error", fields: {} };
}

export default function AdminHrStaffRegisterPage() {
  const [rows, setRows] = useState<HrStaff[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [identities, setIdentities] = useState<AdminStaffIdentity[]>([]);
  const [options, setOptions] = useState<HrStaffOptions>(fallbackOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<HrStaff | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyForm);
  const [deactivateStaff, setDeactivateStaff] = useState<HrStaff | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [filters, setFilters] = useState({ q: "", branch: "", department: "", employment_type: "", status: "", payroll_ready: "", kyc_verified: "" });

  const identityByEmployee = useMemo(() => new Map(identities.map((identity) => [identity.employee, identity])), [identities]);
  const activeCount = rows.filter((row) => row.employment_status === "ACTIVE" || row.is_active).length;
  const draftCount = rows.filter((row) => row.employment_status === "DRAFT" && !row.is_active).length;
  const payrollReadyCount = rows.filter((row) => row.payroll_ready).length;
  const missingKycCount = rows.filter((row) => !row.documents_ready).length;
  const attendanceMissingCount = rows.filter((row) => !row.attendance_ready).length;

  const load = useCallback(async (overrideFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const [staffRes, branchRes, identitiesRes, optionsRes] = await Promise.all([
        listHrStaff({ q: overrideFilters.q, branch: overrideFilters.branch, department: overrideFilters.department, employment_type: overrideFilters.employment_type, employment_status: overrideFilters.status, payroll_ready: overrideFilters.payroll_ready, kyc_verified: overrideFilters.kyc_verified }),
        listBranches(),
        listAdminStaffIdentities(),
        getHrStaffOptions().catch(() => fallbackOptions),
      ]);
      setRows(staffRes.results || []);
      setBranches(branchRes.results || []);
      setIdentities(identitiesRes.results || []);
      setOptions(optionsRes || fallbackOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load staff cockpit.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setEditStaff(null);
    setEditorOpen(true);
    setFieldErrors({});
    setNotice(null);
    setError(null);
  }

  function openEdit(staff: HrStaff) {
    setForm(formFromStaff(staff));
    setEditStaff(staff);
    setEditorOpen(true);
    setFieldErrors({});
    setNotice(null);
    setError(null);
  }

  async function saveStaff(targetStatus: EmploymentStatusValue) {
    if (saving) return;
    try {
      setSaving(true);
      setFieldErrors({});
      setError(null);
      if (editStaff) {
        const patchStatus = targetStatus === "ONBOARDING" ? "DRAFT" : targetStatus;
        await patchHrStaff(editStaff.id, compactPayload(form, patchStatus as EmploymentStatusValue));
        setNotice(targetStatus === "ACTIVE" ? "Staff activated." : targetStatus === "ONBOARDING" ? "Staff onboarding saved." : "Staff draft saved.");
      } else {
        const created = await createHrStaff(compactPayload(form, targetStatus));
        const passwordNote = created.temporary_password ? ` Temporary password: ${created.temporary_password}` : "";
        setNotice(`${targetStatus === "ACTIVE" ? "Staff activated" : targetStatus === "ONBOARDING" ? "Staff onboarding saved" : "Staff draft saved"}.${passwordNote}`);
      }
      setEditorOpen(false);
      setEditStaff(null);
      await load();
    } catch (err) {
      const { detail, fields } = parseApiErrors(err);
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
        setError(null);
      } else {
        setError(detail || "Unable to save staff setup.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!deactivateStaff || !deactivationReason.trim()) return;
    try {
      await setHrStaffStatus(deactivateStaff.id, "DEACTIVATE", deactivationReason.trim());
      setNotice(`${deactivateStaff.name} deactivated. Payroll, attendance, document, and audit history remain preserved.`);
      setDeactivateStaff(null);
      setDeactivationReason("");
      await load();
    } catch (err) {
      const { detail, fields } = parseApiErrors(err);
      setFieldErrors(fields);
      setError(detail || "Unable to deactivate staff.");
    }
  }

  async function reactivate(staff: HrStaff) {
    try {
      await setHrStaffStatus(staff.id, "REACTIVATE");
      setNotice(`${staff.name} reactivated.`);
      await load();
    } catch (err) {
      const { detail, fields } = parseApiErrors(err);
      setFieldErrors(fields);
      setError(detail || "Unable to reactivate staff.");
    }
  }

  const clearFilters = { q: "", branch: "", department: "", employment_type: "", status: "", payroll_ready: "", kyc_verified: "" };

  return (
    <ERPPageShell eyebrow="Staff HR" title="Staff Recruitment & Onboarding" subtitle="Draft, onboard, activate, payroll-enable, login-enable, and safely deactivate staff without creating payroll/accounting postings." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "HR", href: ROUTES.admin.hr }, { label: "Staff" }]} actions={[{ href: ROUTES.admin.hrAttendance, label: "Attendance", variant: "secondary" }, { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" }, { href: ROUTES.admin.hrStaffDocuments, label: "Documents", variant: "secondary" }]} statusBadge={{ label: "Admin Only", tone: "info" }}>
      <ERPSectionShell title="Operational Summary" actions={<ActionButton variant="primary" onClick={openCreate}>Recruit staff</ActionButton>}>
        <QuickActionGrid className="xl:grid-cols-5"><KpiCard label="Active staff" value={activeCount} helper="Activated staff" /><KpiCard label="Draft/onboarding" value={draftCount} helper="Saved but not active" /><KpiCard label="Payroll ready" value={payrollReadyCount} helper="Eligible with valid pay setup" /><KpiCard label="Missing KYC/documents" value={missingKycCount} helper="KYC not verified or incomplete" /><KpiCard label="Attendance setup missing" value={attendanceMissingCount} helper="No policy or shift" /></QuickActionGrid>
      </ERPSectionShell>

      {!options.payroll_accounting.enabled ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Payroll accounting not enabled.</strong> {options.payroll_accounting.message}</div> : null}

      <FormSection title="Search and filters" description="Filters call the staff API and avoid fake frontend-only state.">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <TextInput value={filters.q} onChange={(value) => setFilters({ ...filters, q: value })} placeholder="Name, phone, code" />
          <SelectInput value={filters.branch} onChange={(value) => setFilters({ ...filters, branch: value })}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectInput>
          <SelectInput value={filters.department} onChange={(value) => setFilters({ ...filters, department: value })}>{optionItems(options.departments, "All departments")}</SelectInput>
          <SelectInput value={filters.employment_type} onChange={(value) => setFilters({ ...filters, employment_type: value })}><option value="">All staff types</option>{options.employment_types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</SelectInput>
          <SelectInput value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })}><option value="">All status</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ONBOARDING">Onboarding</option><option value="INACTIVE">Inactive</option></SelectInput>
          <SelectInput value={filters.payroll_ready} onChange={(value) => setFilters({ ...filters, payroll_ready: value })}><option value="">Payroll readiness</option><option value="true">Ready</option><option value="false">Not ready</option></SelectInput>
          <SelectInput value={filters.kyc_verified} onChange={(value) => setFilters({ ...filters, kyc_verified: value })}><option value="">All KYC</option><option value="true">Verified</option><option value="false">Pending</option></SelectInput>
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => void load()}>Apply filters</ActionButton><ActionButton variant="ghost" onClick={() => { setFilters(clearFilters); void load(clearFilters); }}>Clear</ActionButton></div>
      </FormSection>

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
      {loading ? <ERPLoadingState label="Loading staff cockpit..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load staff cockpit" description={error} onRetry={() => void load()} /> : null}

      {editorOpen ? <Wizard form={form} options={options} branches={branches} editing={Boolean(editStaff)} saving={saving} fieldErrors={fieldErrors} onChange={setForm} onClose={() => { setEditorOpen(false); setEditStaff(null); setFieldErrors({}); }} onSave={(target) => void saveStaff(target)} /> : null}

      {deactivateStaff ? <FormSection title={`Deactivate ${deactivateStaff.name}`} description="Deactivation preserves staff profile, payroll, attendance, documents, and audit metadata." className="border border-destructive/30"><Field label="Reason"><textarea value={deactivationReason} onChange={(event) => setDeactivationReason(event.target.value)} className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" /></Field><div className="mt-3 flex flex-wrap justify-end gap-2"><ActionButton variant="ghost" onClick={() => { setDeactivateStaff(null); setDeactivationReason(""); }}>Cancel</ActionButton><ActionButton variant="destructive" disabled={!deactivationReason.trim()} onClick={() => void deactivate()}>Deactivate</ActionButton></div></FormSection> : null}

      {!loading && !error && rows.length === 0 ? <ERPEmptyState title="No staff found" description="Create the first staff profile or clear filters." action={<ActionButton variant="primary" onClick={openCreate}>Create first staff</ActionButton>} /> : null}

      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title={`Staff register (${rows.length})`} description="Open a staff profile for employment, attendance, payroll, documents, access, and timeline context.">
          <DataTableShell><div className="overflow-auto"><table className="min-w-[1100px] text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-4">Staff code</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Phone</th><th className="py-2 pr-4">Role/title</th><th className="py-2 pr-4">Branch</th><th className="py-2 pr-4">Department</th><th className="py-2 pr-4">Staff type</th><th className="py-2 pr-4">Pay basis</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Readiness</th><th className="py-2 pr-4">Actions</th></tr></thead><tbody className="text-foreground">{rows.map((row) => { const identity = identityByEmployee.get(row.id); return <tr key={row.id} className="border-t border-border/60 align-top"><td className="py-3 pr-4 font-mono text-xs">{row.employee_code || `#${row.id}`}</td><td className="py-3 pr-4"><Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="font-semibold text-primary hover:underline">{row.name}</Link>{identity ? <div className="mt-1 text-xs text-muted-foreground">Login: {identity.username}</div> : null}</td><td className="py-3 pr-4">{row.phone || "Unavailable"}</td><td className="py-3 pr-4">{row.designation || "Unassigned"}</td><td className="py-3 pr-4">{row.branch_name || "No branch"}</td><td className="py-3 pr-4">{row.department || "Unassigned"}</td><td className="py-3 pr-4">{options.employment_types.find((type) => type.value === row.employment_type)?.label || row.employment_type || "Unassigned"}</td><td className="py-3 pr-4">{payBasis(row)}</td><td className="py-3 pr-4"><ERPStatusBadge status={row.employment_status || (row.is_active ? "ACTIVE" : "INACTIVE")} label={row.employment_status || (row.is_active ? "Active" : "Inactive")} /></td><td className="py-3 pr-4"><div className="flex min-w-56 flex-wrap gap-1"><ReadinessBadge ready={row.profile_ready} label="Profile" /><ReadinessBadge ready={row.payroll_ready} label="Payroll" /><ReadinessBadge ready={row.attendance_ready} label="Attendance" /><ReadinessBadge ready={row.documents_ready} label="KYC" /><ReadinessBadge ready={row.access_ready} label="Access" /></div>{row.readiness_warnings?.length ? <div className="mt-2 text-xs text-amber-700">{row.readiness_warnings.join(", ")}</div> : null}</td><td className="py-3 pr-4"><div className="flex min-w-44 flex-wrap gap-2"><Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">Open</Link><button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => openEdit(row)}>Edit</button>{row.is_active ? <button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-semibold text-destructive hover:bg-muted" onClick={() => setDeactivateStaff(row)}>Deactivate</button> : <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void reactivate(row)}>Reactivate</button>}</div></td></tr>; })}</tbody></table></div></DataTableShell>
        </ERPSectionShell>
      ) : null}

      <WorkflowCard title="Safety rules" description="Staff creation is HR/profile setup only. It never creates payroll journals, money movements, payments, receipts, or reconciliation items. Payroll setup and salary payment remain separate auditable workflows." />
    </ERPPageShell>
  );
}
