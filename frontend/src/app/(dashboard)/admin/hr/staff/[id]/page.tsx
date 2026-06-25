"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import ActionButton from "@/components/ui/ActionButton";
import {
  DataTableShell,
  DetailPanel,
  FormSection,
  KpiCard,
  QuickActionGrid,
  Timeline,
  WorkflowCard,
} from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import { listAdminStaffIdentities, type AdminStaffIdentity } from "@/services/staff";
import {
  createHrStaffDocument,
  getAdminAuditTimeline,
  downloadHrSalaryAgreementPdf,
  downloadHrStaffProfilePdf,
  getHrPayroll,
  getHrStaff,
  listHrAttendance,
  listHrExpenseClaims,
  listHrLeaveRequests,
  listHrSalaryPayments,
  listHrStaffDocuments,
  patchHrStaff,
  patchHrStaffDocument,
  setHrStaffStatus,
  reviewHrStaffDocument,
  type HrAttendance,
  type AdminAuditEntry,
  type HrExpenseClaim,
  type HrLeaveRequest,
  type HrPayrollSheet,
  type HrSalaryPayment,
  type HrStaff,
  type HrStaffDocument,
} from "@/services/admin-hr";

const EMPLOYMENT_TYPES = ["PERMANENT_MONTHLY", "TEMPORARY", "DAILY_WAGE", "HOURLY", "PIECE_RATE", "MANUFACTURING", "SERVICE"];
const DETAIL_TABS = ["Overview", "Employment", "Attendance", "Payroll", "Documents", "KYC", "Access", "Timeline"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

type StaffAuditEntry = AdminAuditEntry & { source_label: string };

type EditForm = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  branch: string;
  joining_date: string;
  employment_type: string;
  weekly_off: string;
  base_salary: string;
  daily_wage_rate: string;
  hourly_wage_rate: string;
  piece_rate_amount: string;
  piece_rate_unit_label: string;
  salary_effective_from: string;
  temporary_contract_end_date: string;
  kyc_id_type: string;
  kyc_id_number: string;
  kyc_verified: boolean;
  address: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  cost_center_code: string;
  payroll_expense_account: string;
  employment_status: string;
  reporting_manager: string;
  work_location: string;
  probation_end_date: string;
  attendance_policy: string;
  shift_name: string;
  payroll_eligible: boolean;
  payment_mode: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string;
};

function formFromStaff(staff: HrStaff): EditForm {
  return {
    name: staff.name || "",
    phone: staff.phone || "",
    designation: staff.designation || "",
    department: staff.department || "",
    branch: staff.branch ? String(staff.branch) : "",
    joining_date: staff.joining_date || "",
    employment_type: staff.employment_type || "PERMANENT_MONTHLY",
    weekly_off: staff.weekly_off || "",
    base_salary: staff.base_salary || "",
    daily_wage_rate: staff.daily_wage_rate || "",
    hourly_wage_rate: staff.hourly_wage_rate || "",
    piece_rate_amount: staff.piece_rate_amount || "",
    piece_rate_unit_label: staff.piece_rate_unit_label || "",
    salary_effective_from: staff.salary_effective_from || "",
    temporary_contract_end_date: staff.temporary_contract_end_date || "",
    kyc_id_type: staff.kyc_id_type || "",
    kyc_id_number: staff.kyc_id_number || "",
    kyc_verified: Boolean(staff.kyc_verified),
    address: staff.address || "",
    emergency_contact_name: staff.emergency_contact_name || "",
    emergency_contact_relation: staff.emergency_contact_relation || "",
    emergency_contact_phone: staff.emergency_contact_phone || "",
    cost_center_code: staff.cost_center_code || "",
    payroll_expense_account: staff.payroll_expense_account ? String(staff.payroll_expense_account) : "",
    employment_status: staff.employment_status || (staff.is_active ? "ACTIVE" : "DRAFT"),
    reporting_manager: staff.reporting_manager || "",
    work_location: staff.work_location || "",
    probation_end_date: staff.probation_end_date || "",
    attendance_policy: staff.attendance_policy || "",
    shift_name: staff.shift_name || "",
    payroll_eligible: Boolean(staff.payroll_eligible),
    payment_mode: staff.payment_mode || "CASH",
    bank_account_name: staff.bank_account_name || "",
    bank_account_number: staff.bank_account_number || "",
    bank_ifsc: staff.bank_ifsc || "",
    upi_id: staff.upi_id || "",
  };
}

function mask(value?: string | null) {
  const text = (value || "").trim();
  if (!text) return "Unavailable";
  if (text.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value || "Unavailable"}</div>
    </div>
  );
}

function ReadinessBadge({ ready, label }: { ready?: boolean; label: string }) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{label}</span>;
}

function formatAuditMeta(metadata?: Record<string, unknown>) {
  if (!metadata) return "";
  const parts: string[] = [];
  const documentType = metadata["document_type"] ? String(metadata["document_type"]) : "";
  const title = metadata["title"] ? String(metadata["title"]) : "";
  const status = metadata["status"] ? String(metadata["status"]) : "";
  const reason = metadata["reason"] ? String(metadata["reason"]) : "";
  const notes = metadata["notes"] ? String(metadata["notes"]) : "";
  if (documentType || title) parts.push([documentType, title].filter(Boolean).join(" · "));
  if (status) parts.push(`Status: ${status}`);
  if (reason) parts.push(`Reason: ${reason}`);
  if (notes) parts.push(notes);
  return parts.join(" | ");
}

function formatAuditAction(actionType: string) {
  return actionType
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function TinyTable({
  empty,
  columns,
  rows,
}: {
  empty: string;
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (!rows.length) return <ERPEmptyState title={empty} />;
  return (
    <DataTableShell className="p-3">
      <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>{columns.map((column) => <th key={column} className="py-2 pr-4">{column}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-border/60">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-4 align-top">{cell || "Unavailable"}</td>)}</tr>)}</tbody>
      </table>
      </div>
    </DataTableShell>
  );
}

function EditPanel({
  staff,
  branches,
  onCancel,
  onSaved,
}: {
  staff: HrStaff;
  branches: BranchRecord[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("BASIC");
  const [form, setForm] = useState<EditForm>(() => formFromStaff(staff));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const canSave = form.name.trim().length >= 2 && form.phone.trim().length >= 8;

  async function save() {
    if (!canSave) return;
    try {
      setSaving(true);
      await patchHrStaff(staff.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
        department: form.department.trim(),
        branch: form.branch ? Number(form.branch) : null,
        joining_date: form.joining_date || null,
        employment_status: form.employment_status,
        employment_type: form.employment_type,
        weekly_off: form.weekly_off.trim(),
        reporting_manager: form.reporting_manager.trim(),
        work_location: form.work_location.trim(),
        probation_end_date: form.probation_end_date || null,
        attendance_policy: form.attendance_policy.trim(),
        shift_name: form.shift_name.trim(),
        base_salary: form.base_salary.trim() || null,
        daily_wage_rate: form.daily_wage_rate.trim() || null,
        hourly_wage_rate: form.hourly_wage_rate.trim() || null,
        piece_rate_amount: form.piece_rate_amount.trim() || null,
        piece_rate_unit_label: form.piece_rate_unit_label.trim(),
        payroll_eligible: form.payroll_eligible,
        payment_mode: form.payment_mode,
        bank_account_name: form.bank_account_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim(),
        upi_id: form.upi_id.trim(),
        salary_effective_from: form.salary_effective_from || null,
        temporary_contract_end_date: form.temporary_contract_end_date || null,
        kyc_id_type: form.kyc_id_type.trim(),
        kyc_id_number: form.kyc_id_number.trim(),
        kyc_verified: form.kyc_verified,
        address: form.address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_relation: form.emergency_contact_relation.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        cost_center_code: form.cost_center_code.trim(),
        payroll_expense_account: form.payroll_expense_account ? Number(form.payroll_expense_account) : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save staff profile.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary";
  const field = (label: string, input: ReactNode) => (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}{input}</label>
  );

  return (
    <FormSection title="Edit Profile" description="Tabbed edit form backed by PATCH /api/v1/admin/hr/staff/{id}/.">
      <div className="flex flex-wrap gap-2">
        {["BASIC", "EMPLOYMENT", "PAYROLL", "KYC", "EMERGENCY", "ACCESS"].map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tab === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
            {item}
          </button>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {tab === "BASIC" ? (
          <>
            {field("Full name", <input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} />)}
            {field("Phone", <input className={inputClass} value={form.phone} onChange={(event) => update("phone", event.target.value)} />)}
            {field("Role / title", <input className={inputClass} value={form.designation} onChange={(event) => update("designation", event.target.value)} />)}
            {field("Department", <input className={inputClass} value={form.department} onChange={(event) => update("department", event.target.value)} />)}
            {field("Branch", <select className={inputClass} value={form.branch} onChange={(event) => update("branch", event.target.value)}><option value="">Unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>)}
            {field("Joining date", <input type="date" className={inputClass} value={form.joining_date} onChange={(event) => update("joining_date", event.target.value)} />)}
            {field("Employment status", <select className={inputClass} value={form.employment_status} onChange={(event) => update("employment_status", event.target.value)}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option></select>)}
          </>
        ) : null}
        {tab === "EMPLOYMENT" ? (
          <>
            {field("Employment type", <select className={inputClass} value={form.employment_type} onChange={(event) => update("employment_type", event.target.value)}>{EMPLOYMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select>)}
            {field("Weekly off", <input className={inputClass} value={form.weekly_off} onChange={(event) => update("weekly_off", event.target.value)} placeholder="SUNDAY" />)}
            {field("Reporting manager", <input className={inputClass} value={form.reporting_manager} onChange={(event) => update("reporting_manager", event.target.value)} />)}
            {field("Work location", <input className={inputClass} value={form.work_location} onChange={(event) => update("work_location", event.target.value)} />)}
            {field("Probation end date", <input type="date" className={inputClass} value={form.probation_end_date} onChange={(event) => update("probation_end_date", event.target.value)} />)}
            {field("Attendance policy", <input className={inputClass} value={form.attendance_policy} onChange={(event) => update("attendance_policy", event.target.value)} />)}
            {field("Shift", <input className={inputClass} value={form.shift_name} onChange={(event) => update("shift_name", event.target.value)} />)}
            {field("Salary effective date", <input type="date" className={inputClass} value={form.salary_effective_from} onChange={(event) => update("salary_effective_from", event.target.value)} />)}
            {field("Contract end date", <input type="date" className={inputClass} value={form.temporary_contract_end_date} onChange={(event) => update("temporary_contract_end_date", event.target.value)} />)}
          </>
        ) : null}
        {tab === "PAYROLL" ? (
          <>
            {field("Base salary", <input className={inputClass} value={form.base_salary} onChange={(event) => update("base_salary", event.target.value)} />)}
            {field("Daily wage", <input className={inputClass} value={form.daily_wage_rate} onChange={(event) => update("daily_wage_rate", event.target.value)} />)}
            {field("Hourly wage", <input className={inputClass} value={form.hourly_wage_rate} onChange={(event) => update("hourly_wage_rate", event.target.value)} />)}
            {field("Piece rate", <input className={inputClass} value={form.piece_rate_amount} onChange={(event) => update("piece_rate_amount", event.target.value)} />)}
            {field("Piece unit", <input className={inputClass} value={form.piece_rate_unit_label} onChange={(event) => update("piece_rate_unit_label", event.target.value)} />)}
            {field("Payroll eligible", <select className={inputClass} value={form.payroll_eligible ? "true" : "false"} onChange={(event) => update("payroll_eligible", event.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select>)}
            {field("Payment mode", <select className={inputClass} value={form.payment_mode} onChange={(event) => update("payment_mode", event.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option></select>)}
          </>
        ) : null}
        {tab === "KYC" ? (
          <>
            {field("KYC type", <input className={inputClass} value={form.kyc_id_type} onChange={(event) => update("kyc_id_type", event.target.value)} />)}
            {field("KYC reference", <input className={inputClass} value={form.kyc_id_number} onChange={(event) => update("kyc_id_number", event.target.value)} />)}
            {field("KYC status", <select className={inputClass} value={form.kyc_verified ? "true" : "false"} onChange={(event) => update("kyc_verified", event.target.value === "true")}><option value="false">Pending</option><option value="true">Verified</option></select>)}
          </>
        ) : null}
        {tab === "EMERGENCY" ? (
          <>
            {field("Emergency contact", <input className={inputClass} value={form.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} />)}
            {field("Emergency relation", <input className={inputClass} value={form.emergency_contact_relation} onChange={(event) => update("emergency_contact_relation", event.target.value)} placeholder="SPOUSE" />)}
            {field("Emergency phone", <input className={inputClass} value={form.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} />)}
            {field("Address", <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm" value={form.address} onChange={(event) => update("address", event.target.value)} />)}
          </>
        ) : null}
        {tab === "ACCESS" ? (
          <>
            {field("Cost center", <input className={inputClass} value={form.cost_center_code} onChange={(event) => update("cost_center_code", event.target.value)} />)}
            {field("Payroll expense account ID", <input className={inputClass} value={form.payroll_expense_account} onChange={(event) => update("payroll_expense_account", event.target.value)} />)}
            {field("Bank account name", <input className={inputClass} value={form.bank_account_name} onChange={(event) => update("bank_account_name", event.target.value)} />)}
            {field("Bank account number", <input className={inputClass} value={form.bank_account_number} onChange={(event) => update("bank_account_number", event.target.value)} />)}
            {field("IFSC", <input className={inputClass} value={form.bank_ifsc} onChange={(event) => update("bank_ifsc", event.target.value)} />)}
            {field("UPI ID", <input className={inputClass} value={form.upi_id} onChange={(event) => update("upi_id", event.target.value)} />)}
          </>
        ) : null}
      </div>
      <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">No delete button. Use deactivate/reactivate to preserve history.</span>
        <div className="flex gap-2">
          <ActionButton variant="ghost" onClick={onCancel}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={!canSave} loading={saving} onClick={() => void save()}>Save Profile</ActionButton>
        </div>
      </div>
    </FormSection>
  );
}

export default function AdminHrStaffProfilePage() {
  const params = useParams<{ id: string }>();
  const staffId = Number(params.id);
  const [staff, setStaff] = useState<HrStaff | null>(null);
  const [identity, setIdentity] = useState<AdminStaffIdentity | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [documents, setDocuments] = useState<HrStaffDocument[]>([]);
  const [attendance, setAttendance] = useState<HrAttendance[]>([]);
  const [leave, setLeave] = useState<HrLeaveRequest[]>([]);
  const [expenses, setExpenses] = useState<HrExpenseClaim[]>([]);
  const [salarySheets, setSalarySheets] = useState<HrPayrollSheet[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<HrSalaryPayment[]>([]);
  const [auditEntries, setAuditEntries] = useState<StaffAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("Overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState({ document_type: "OTHER", title: "", document_no: "", notes: "", file: null as File | null });
  const [reviewModal, setReviewModal] = useState<{ documentId: number; action: "verify" | "reject"; title: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const attendanceSummary = useMemo(() => {
    const count = (status: string) => attendance.filter((row) => row.status === status).length;
    return { present: count("PRESENT"), absent: count("ABSENT"), late: count("LATE"), leave: count("LEAVE") };
  }, [attendance]);

  async function load() {
    if (!staffId) return;
    try {
      setLoading(true);
      const [staffPayload, branchPayload, docsPayload, attendancePayload, leavePayload, expensePayload, payrollPayload, paymentPayload, identityPayload] = await Promise.all([
        getHrStaff(staffId),
        listBranches({ status: "ACTIVE" }),
        listHrStaffDocuments({ employee: staffId }),
        listHrAttendance(`employee=${staffId}`),
        listHrLeaveRequests({ employee: staffId }),
        listHrExpenseClaims({ employee: staffId }),
        getHrPayroll({ employee: staffId }),
        listHrSalaryPayments({ employee: staffId }),
        listAdminStaffIdentities(),
      ]);
      const identity = identityPayload.results.find((item) => item.employee === staffPayload.id) || null;
      const auditPayloads = await Promise.all([
        getAdminAuditTimeline("EmployeeProfile", staffPayload.id),
        identity ? getAdminAuditTimeline("StaffIdentity", identity.id) : Promise.resolve([] as AdminAuditEntry[]),
        getAdminAuditTimeline("EmployeeDocument", staffPayload.id),
      ]);
      setStaff(staffPayload);
      setIdentity(identity);
      setBranches(branchPayload.results);
      setDocuments(docsPayload.results);
      setAttendance(attendancePayload.results);
      setLeave(leavePayload.results);
      setExpenses(expensePayload.results);
      setSalarySheets(payrollPayload.salary_sheets);
      setSalaryPayments(paymentPayload.results);
      setAuditEntries(
        auditPayloads
          .flatMap((entries, index) => entries.map((entry) => ({ ...entry, source_label: index === 0 ? "EmployeeProfile" : index === 1 ? "StaffIdentity" : "EmployeeDocument" })))
          .sort((left, right) => (left.created_at < right.created_at ? 1 : left.created_at > right.created_at ? -1 : right.id - left.id))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load staff profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  async function toggleStatus() {
    if (!staff) return;
    const action = staff.is_active ? "DEACTIVATE" : "REACTIVATE";
    const reason = staff.is_active ? window.prompt(`Deactivate ${staff.name}? Payroll, attendance, and documents will remain preserved. Enter reason:`) : "";
    if (staff.is_active && !reason?.trim()) return;
    await setHrStaffStatus(staff.id, action, reason?.trim());
    await load();
  }

  async function uploadDocument() {
    if (!staff || !upload.title.trim() || !upload.file) return;
    const payload = new FormData();
    payload.append("employee", String(staff.id));
    payload.append("document_type", upload.document_type);
    payload.append("title", upload.title.trim());
    payload.append("document_no", upload.document_no.trim());
    payload.append("notes", upload.notes.trim());
    payload.append("file", upload.file);
    await createHrStaffDocument(payload);
    setUpload({ document_type: "OTHER", title: "", document_no: "", notes: "", file: null });
    setUploadOpen(false);
    await load();
  }

  function openReviewModal(documentId: number, action: "verify" | "reject", title: string) {
    setReviewModal({ documentId, action, title });
    setReviewNotes("");
  }

  async function submitReview() {
    if (!reviewModal) return;
    try {
      setReviewSaving(true);
      await reviewHrStaffDocument(reviewModal.documentId, reviewModal.action, reviewNotes);
      setReviewModal(null);
      setReviewNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update document review.");
    } finally {
      setReviewSaving(false);
    }
  }

  if (loading) return <ERPPageShell title="Staff Profile"><ERPLoadingState label="Loading staff profile..." /></ERPPageShell>;
  if (error) return <ERPPageShell title="Staff Profile"><ERPErrorState title="Staff profile unavailable" description={error} onRetry={() => void load()} /></ERPPageShell>;
  if (!staff) return <ERPPageShell title="Staff Profile"><ERPEmptyState title="Staff profile not found" /></ERPPageShell>;

  return (
    <ERPPageShell
      eyebrow="Staff 360"
      title={staff.name}
      subtitle={`${staff.employee_code || `Staff #${staff.id}`} · ${staff.department || "No department"} · ${staff.employment_type || "No staff type"}`}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Staff Register", href: ROUTES.admin.hrStaff },
        { label: staff.name },
      ]}
      statusBadge={{ label: staff.is_active ? "Active" : "Inactive", tone: staff.is_active ? "success" : "warning" }}
      maxWidth="1180px"
    >
      <DetailPanel title="Staff profile summary" description="Operational identity and current status.">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{staff.name}</h1>
              <ERPStatusBadge status={staff.is_active ? "ACTIVE" : "INACTIVE"} label={staff.is_active ? "Active" : "Inactive"} size="md" />
            </div>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <span>ID: {staff.employee_code || staff.id}</span>
              <span>Department: {staff.department || "Unassigned"}</span>
              <span>Type: {staff.employment_type || "Unassigned"}</span>
              <span>Branch: {staff.branch_name || "Unassigned"} / Counter not exposed</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" onClick={() => setEditing(true)}>Edit Profile</ActionButton>
            <ActionButton variant={staff.is_active ? "destructive" : "secondary"} onClick={() => void toggleStatus()}>{staff.is_active ? "Deactivate" : "Reactivate"}</ActionButton>
            <ActionButton onClick={() => void downloadHrStaffProfilePdf(staff.id, `staff-profile-${staff.employee_code || staff.id}.pdf`)}>Download Profile PDF</ActionButton>
            <ActionButton onClick={() => void downloadHrSalaryAgreementPdf(staff.id, `salary-agreement-${staff.employee_code || staff.id}.pdf`)}>Download Salary Agreement PDF</ActionButton>
          </div>
        </div>
      </DetailPanel>

      {editing ? <EditPanel staff={staff} branches={branches} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} /> : null}

      <QuickActionGrid>
        <KpiCard label="Present days" value={attendanceSummary.present} helper="Current loaded attendance rows" />
        <KpiCard label="Leave requests" value={leave.length} helper="Recent leave records" />
        <KpiCard label="Expense claims" value={expenses.length} helper="Recent claims" />
        <WorkflowCard
          title="Staff workflow"
          description="Use profile edit, document upload, and status toggle for controlled HR operations."
        />
      </QuickActionGrid>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
        {DETAIL_TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" ? <DetailPanel title="Overview" description="Identity, readiness, and operational warnings.">
        <div className="mb-4 flex flex-wrap gap-2">
          <ReadinessBadge ready={staff.profile_ready} label="Profile ready" />
          <ReadinessBadge ready={staff.employment_ready} label="Employment ready" />
          <ReadinessBadge ready={staff.payroll_ready} label="Payroll ready" />
          <ReadinessBadge ready={staff.attendance_ready} label="Attendance ready" />
          <ReadinessBadge ready={staff.documents_ready} label="Documents ready" />
          <ReadinessBadge ready={staff.access_ready} label="Access ready" />
        </div>
        {staff.readiness_warnings?.length ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{staff.readiness_warnings.join(" | ")}</div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Phone" value={staff.phone} />
          <Detail label="Alternate phone" value="Not available on current staff API" />
          <Detail label="Email" value="Not available on current staff API" />
          <Detail label="Role / title" value={staff.designation} />
          <Detail label="Weekly off" value={staff.weekly_off} />
          <Detail label="Address" value={staff.address} />
          <Detail label="Emergency contact" value={`${staff.emergency_contact_name || "Unavailable"} ${staff.emergency_contact_phone || ""}`.trim()} />
          <Detail label="Emergency relation" value={staff.emergency_contact_relation} />
          <Detail label="Joining date" value={staff.joining_date} />
          <Detail label="Leaving date" value="Not available on current staff API" />
          <Detail label="KYC status" value={<ERPStatusBadge status={staff.kyc_verified ? "ACTIVE" : "PENDING"} label={staff.kyc_verified ? "Verified" : "Pending"} />} />
          <Detail label="KYC reference" value={`${staff.kyc_id_type || "KYC"} ${mask(staff.kyc_id_number)}`} />
        </div>
      </DetailPanel> : null}

      {activeTab === "Employment" ? <DetailPanel title="Employment">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Employment status" value={staff.employment_status || (staff.is_active ? "ACTIVE" : "DRAFT")} />
          <Detail label="Employment type" value={staff.employment_type} />
          <Detail label="Reporting manager" value={staff.reporting_manager} />
          <Detail label="Work location" value={staff.work_location} />
          <Detail label="Probation end date" value={staff.probation_end_date} />
          <Detail label="Attendance policy" value={staff.attendance_policy} />
          <Detail label="Shift" value={staff.shift_name} />
          <Detail label="Deactivation reason" value={staff.deactivation_reason} />
        </div>
      </DetailPanel> : null}

      {activeTab === "Payroll" ? <DetailPanel title="Payroll">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Pay basis" value={staff.pay_basis || (staff.base_salary ? "Monthly base" : staff.daily_wage_rate ? "Daily wage" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "Not configured")} />
          <Detail label="Payroll eligible" value={staff.payroll_eligible ? "Yes" : "No"} />
          <Detail label="Base salary" value={staff.base_salary} />
          <Detail label="Daily wage" value={staff.daily_wage_rate} />
          <Detail label="Hourly wage" value={staff.hourly_wage_rate} />
          <Detail label="Piece-rate info" value={staff.piece_rate_amount ? `${staff.piece_rate_amount} / ${staff.piece_rate_unit_label || "unit"}` : "Unavailable"} />
          <Detail label="Payment mode" value={staff.payment_mode} />
          <Detail label="Bank account" value={staff.bank_account_number ? mask(staff.bank_account_number) : "Unavailable"} />
          <Detail label="UPI" value={staff.upi_id} />
          <Detail label="Cost center" value={staff.cost_center_code} />
          <Detail label="Payroll expense account" value={staff.payroll_expense_account || "Not mapped"} />
          <Detail label="Salary effective date" value={staff.salary_effective_from} />
          <Detail label="Contract end date" value={staff.temporary_contract_end_date} />
        </div>
      </DetailPanel> : null}

      {activeTab === "Documents" ? <DetailPanel title="Documents" description="Document actions use the staff document API and review endpoint. Verify and reject map to ACTIVE and INACTIVE status while preserving audit history.">
        <div className="mb-3 flex justify-end"><ActionButton variant="primary" onClick={() => setUploadOpen(!uploadOpen)}>Upload Document</ActionButton></div>
        {uploadOpen ? (
          <div className="mb-4 rounded-xl border border-border bg-background p-3">
            <div className="grid gap-3 md:grid-cols-3">
              <select value={upload.document_type} onChange={(event) => setUpload({ ...upload, document_type: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="ID_PROOF">ID Proof</option><option value="ADDRESS_PROOF">Address Proof</option><option value="SALARY_AGREEMENT">Salary Agreement</option><option value="APPOINTMENT_LETTER">Appointment Letter</option><option value="OTHER">Other</option>
              </select>
              <input value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} placeholder="Title" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={upload.document_no} onChange={(event) => setUpload({ ...upload, document_no: event.target.value })} placeholder="Document number" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={upload.notes} onChange={(event) => setUpload({ ...upload, notes: event.target.value })} placeholder="Notes" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input type="file" onChange={(event) => setUpload({ ...upload, file: event.target.files?.[0] || null })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <ActionButton variant="primary" disabled={!upload.title.trim() || !upload.file} onClick={() => void uploadDocument()}>Upload</ActionButton>
            </div>
          </div>
        ) : null}
        <TinyTable
          empty="No documents uploaded"
          columns={["Type", "Title", "Document No", "Status", "Uploaded", "Uploaded By", "Actions"]}
          rows={documents.map((doc) => [
            doc.document_type,
            doc.title,
            doc.document_no || "Unavailable",
            <ERPStatusBadge key="status" status={doc.status} />,
            doc.created_at?.slice(0, 10),
            doc.uploaded_by_username || "Unavailable",
            <div key="actions" className="flex flex-wrap gap-2">
              {doc.file_url ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs font-semibold">Open file</a> : <span className="text-xs text-muted-foreground">No file URL</span>}
              <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold" onClick={() => void patchHrStaffDocument(doc.id, { status: doc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }).then(load)}>{doc.status === "ACTIVE" ? "Mark inactive" : "Mark active"}</button>
              <button type="button" className="rounded-md border border-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => openReviewModal(doc.id, "verify", doc.title)}>Verify</button>
              <button type="button" className="rounded-md border border-red-400 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => openReviewModal(doc.id, "reject", doc.title)}>Reject</button>
            </div>,
          ])}
        />
      </DetailPanel> : null}

      {activeTab === "KYC" ? <KycDocumentPanel mode="admin" owner="staff" ownerId={staff.id} /> : null}

      {activeTab === "Attendance" ? <DetailPanel title="Attendance Summary">
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Detail label="Present" value={attendanceSummary.present} />
          <Detail label="Absent" value={attendanceSummary.absent} />
          <Detail label="Late" value={attendanceSummary.late} />
          <Detail label="Leave" value={attendanceSummary.leave} />
        </div>
        <TinyTable empty="No recent attendance rows" columns={["Date", "Status", "Hours", "Notes"]} rows={attendance.slice(0, 10).map((row) => [row.attendance_date, row.status, row.worked_hours, row.notes])} />
        <Link href={ROUTES.admin.hrAttendance} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Attendance page</Link>
      </DetailPanel> : null}

      {activeTab === "Attendance" ? <DetailPanel title="Leave & Expense Summary">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <TinyTable empty="No leave requests" columns={["Request", "Type", "Dates", "Status"]} rows={leave.slice(0, 8).map((row) => [row.request_no, row.leave_type_name, `${row.start_date} to ${row.end_date}`, row.status])} />
            <Link href={ROUTES.admin.hrLeave} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Leave Requests</Link>
          </div>
          <div>
            <TinyTable empty="No expense claims" columns={["Claim", "Date", "Amount", "Status"]} rows={expenses.slice(0, 8).map((row) => [row.claim_no, row.claim_date, row.amount, row.status])} />
            <Link href={ROUTES.admin.hrExpenses} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Expense Claims</Link>
          </div>
        </div>
      </DetailPanel> : null}

      {activeTab === "Payroll" ? <DetailPanel title="Payroll History">
        <div className="grid gap-4 xl:grid-cols-2">
          <TinyTable empty="No salary sheets" columns={["Period", "Gross", "Net", "Status"]} rows={salarySheets.slice(0, 8).map((row) => [`${row.year}-${String(row.month).padStart(2, "0")}`, row.gross_amount, row.net_amount, row.status])} />
          <TinyTable empty="No salary payments" columns={["Date", "Amount", "Account", "Reference"]} rows={salaryPayments.slice(0, 8).map((row) => [row.payment_date, row.amount, row.finance_account_name || "Unavailable", row.reference_no || "Unavailable"])} />
        </div>
        <Link href={ROUTES.admin.hrPayroll} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Payroll page</Link>
      </DetailPanel> : null}

      {activeTab === "Access" ? <DetailPanel title="Access">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Login created" value={identity ? "Yes" : "No"} />
          <Detail label="Username" value={identity?.username} />
          <Detail label="Login enabled" value={identity ? (identity.login_enabled ? "Yes" : "No") : "Unavailable"} />
          <Detail label="Capability group" value="Staff role capability matrix is managed in role permissions." />
        </div>
      </DetailPanel> : null}

      {activeTab === "Timeline" ? (
        <Timeline title="Audit / Activity Timeline">
          {auditEntries.length ? (
            auditEntries.map((entry) => (
              <div key={`${entry.source_label}-${entry.id}`} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{formatAuditAction(entry.action_type)}</div>
                    <div className="text-xs text-muted-foreground">{entry.source_label} | {entry.performed_by_username || "system"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{entry.created_at?.slice(0, 19).replace("T", " ")}</div>
                </div>
                {formatAuditMeta(entry.metadata) ? <div className="mt-2 text-sm text-muted-foreground">{formatAuditMeta(entry.metadata)}</div> : null}
              </div>
            ))
          ) : (
            <ERPEmptyState title="No audit events yet" description="Staff profile, identity, and document changes will appear here after the first backend-backed action." />
          )}
        </Timeline>
      ) : null}

      {reviewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-bold">
              {reviewModal.action === "verify" ? "Verify document" : "Reject document"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewModal.title} will be marked {reviewModal.action === "verify" ? "ACTIVE" : "INACTIVE"} and written to the audit timeline.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes {reviewModal.action === "reject" ? "(recommended)" : "(optional)"}
            </label>
            <textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder={reviewModal.action === "reject" ? "Reason for rejection" : "Optional review notes"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton variant="ghost" onClick={() => setReviewModal(null)}>Cancel</ActionButton>
              <ActionButton variant={reviewModal.action === "verify" ? "primary" : "destructive"} loading={reviewSaving} onClick={() => void submitReview()}>
                {reviewModal.action === "verify" ? "Verify" : "Reject"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
