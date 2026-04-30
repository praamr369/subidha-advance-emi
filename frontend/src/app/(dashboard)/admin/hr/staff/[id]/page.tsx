"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import {
  createHrStaffDocument,
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
  type HrAttendance,
  type HrExpenseClaim,
  type HrLeaveRequest,
  type HrPayrollSheet,
  type HrSalaryPayment,
  type HrStaff,
  type HrStaffDocument,
} from "@/services/admin-hr";

const EMPLOYMENT_TYPES = ["PERMANENT_MONTHLY", "TEMPORARY", "DAILY_WAGE", "HOURLY", "PIECE_RATE", "MANUFACTURING", "SERVICE"];

type EditForm = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  branch: string;
  joining_date: string;
  employment_type: string;
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
  emergency_contact_phone: string;
  cost_center_code: string;
  payroll_expense_account: string;
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
    emergency_contact_phone: staff.emergency_contact_phone || "",
    cost_center_code: staff.cost_center_code || "",
    payroll_expense_account: staff.payroll_expense_account ? String(staff.payroll_expense_account) : "",
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
    <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value || "Unavailable"}</div>
    </div>
  );
}

function Section({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
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
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>{columns.map((column) => <th key={column} className="py-2 pr-4">{column}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-border/60">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-4 align-top">{cell || "Unavailable"}</td>)}</tr>)}</tbody>
      </table>
    </div>
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
        employment_type: form.employment_type,
        base_salary: form.base_salary.trim() || null,
        daily_wage_rate: form.daily_wage_rate.trim() || null,
        hourly_wage_rate: form.hourly_wage_rate.trim() || null,
        piece_rate_amount: form.piece_rate_amount.trim() || null,
        piece_rate_unit_label: form.piece_rate_unit_label.trim(),
        salary_effective_from: form.salary_effective_from || null,
        temporary_contract_end_date: form.temporary_contract_end_date || null,
        kyc_id_type: form.kyc_id_type.trim(),
        kyc_id_number: form.kyc_id_number.trim(),
        kyc_verified: form.kyc_verified,
        address: form.address.trim(),
        emergency_contact_name: form.emergency_contact_name.trim(),
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
    <Section title="Edit Profile" description="Tabbed edit form backed by PATCH /api/v1/admin/hr/staff/{id}/.">
      <div className="flex flex-wrap gap-2">
        {["BASIC", "EMPLOYMENT", "PAYROLL", "KYC", "EMERGENCY", "ACCOUNTING"].map((item) => (
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
          </>
        ) : null}
        {tab === "EMPLOYMENT" ? (
          <>
            {field("Employment type", <select className={inputClass} value={form.employment_type} onChange={(event) => update("employment_type", event.target.value)}>{EMPLOYMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select>)}
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
            {field("Emergency phone", <input className={inputClass} value={form.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} />)}
            {field("Address", <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm" value={form.address} onChange={(event) => update("address", event.target.value)} />)}
          </>
        ) : null}
        {tab === "ACCOUNTING" ? (
          <>
            {field("Cost center", <input className={inputClass} value={form.cost_center_code} onChange={(event) => update("cost_center_code", event.target.value)} />)}
            {field("Payroll expense account ID", <input className={inputClass} value={form.payroll_expense_account} onChange={(event) => update("payroll_expense_account", event.target.value)} />)}
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
    </Section>
  );
}

export default function AdminHrStaffProfilePage() {
  const params = useParams<{ id: string }>();
  const staffId = Number(params.id);
  const [staff, setStaff] = useState<HrStaff | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [documents, setDocuments] = useState<HrStaffDocument[]>([]);
  const [attendance, setAttendance] = useState<HrAttendance[]>([]);
  const [leave, setLeave] = useState<HrLeaveRequest[]>([]);
  const [expenses, setExpenses] = useState<HrExpenseClaim[]>([]);
  const [salarySheets, setSalarySheets] = useState<HrPayrollSheet[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<HrSalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState({ document_type: "OTHER", title: "", document_no: "", notes: "", file: null as File | null });

  const attendanceSummary = useMemo(() => {
    const count = (status: string) => attendance.filter((row) => row.status === status).length;
    return { present: count("PRESENT"), absent: count("ABSENT"), late: count("LATE"), leave: count("LEAVE") };
  }, [attendance]);

  async function load() {
    if (!staffId) return;
    try {
      setLoading(true);
      const [staffPayload, branchPayload, docsPayload, attendancePayload, leavePayload, expensePayload, payrollPayload, paymentPayload] = await Promise.all([
        getHrStaff(staffId),
        listBranches({ status: "ACTIVE" }),
        listHrStaffDocuments({ employee: staffId }),
        listHrAttendance(`employee=${staffId}`),
        listHrLeaveRequests({ employee: staffId }),
        listHrExpenseClaims({ employee: staffId }),
        getHrPayroll({ employee: staffId }),
        listHrSalaryPayments({ employee: staffId }),
      ]);
      setStaff(staffPayload);
      setBranches(branchPayload.results);
      setDocuments(docsPayload.results);
      setAttendance(attendancePayload.results);
      setLeave(leavePayload.results);
      setExpenses(expensePayload.results);
      setSalarySheets(payrollPayload.salary_sheets);
      setSalaryPayments(paymentPayload.results);
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
    if (staff.is_active && !window.confirm(`Deactivate ${staff.name}? Payroll, attendance, and documents will remain preserved.`)) return;
    await setHrStaffStatus(staff.id, action);
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

  if (loading) return <PortalPage title="Staff Profile"><LoadingBlock label="Loading staff profile..." /></PortalPage>;
  if (error) return <PortalPage title="Staff Profile"><ErrorState title="Staff profile unavailable" description={error} onRetry={() => void load()} /></PortalPage>;
  if (!staff) return <PortalPage title="Staff Profile"><EmptyState title="Staff profile not found" /></PortalPage>;

  return (
    <PortalPage
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
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{staff.name}</h1>
              <StatusBadge status={staff.is_active ? "ACTIVE" : "INACTIVE"} label={staff.is_active ? "Active" : "Inactive"} size="md" />
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
      </section>

      {editing ? <EditPanel staff={staff} branches={branches} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} /> : null}

      <Section title="Profile Overview">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Phone" value={staff.phone} />
          <Detail label="Alternate phone" value="Not available on current staff API" />
          <Detail label="Email" value="Not available on current staff API" />
          <Detail label="Role / title" value={staff.designation} />
          <Detail label="Address" value={staff.address} />
          <Detail label="Emergency contact" value={`${staff.emergency_contact_name || "Unavailable"} ${staff.emergency_contact_phone || ""}`.trim()} />
          <Detail label="Joining date" value={staff.joining_date} />
          <Detail label="Leaving date" value="Not available on current staff API" />
          <Detail label="KYC status" value={<StatusBadge status={staff.kyc_verified ? "ACTIVE" : "PENDING"} label={staff.kyc_verified ? "Verified" : "Pending"} />} />
          <Detail label="KYC reference" value={`${staff.kyc_id_type || "KYC"} ${mask(staff.kyc_id_number)}`} />
        </div>
      </Section>

      <Section title="Employment & Payroll">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Employment type" value={staff.employment_type} />
          <Detail label="Salary type" value={staff.base_salary ? "Monthly base" : staff.daily_wage_rate ? "Daily wage" : staff.hourly_wage_rate ? "Hourly" : staff.piece_rate_amount ? "Piece rate" : "Not configured"} />
          <Detail label="Base salary" value={staff.base_salary} />
          <Detail label="Daily wage" value={staff.daily_wage_rate} />
          <Detail label="Hourly wage" value={staff.hourly_wage_rate} />
          <Detail label="Piece-rate info" value={staff.piece_rate_amount ? `${staff.piece_rate_amount} / ${staff.piece_rate_unit_label || "unit"}` : "Unavailable"} />
          <Detail label="Cost center" value={staff.cost_center_code} />
          <Detail label="Payroll expense account" value={staff.payroll_expense_account || "Not mapped"} />
          <Detail label="Salary effective date" value={staff.salary_effective_from} />
          <Detail label="Contract end date" value={staff.temporary_contract_end_date} />
        </div>
      </Section>

      <Section title="Documents" description="Document actions use staff document APIs. Verification is deferred because the backend only supports ACTIVE/INACTIVE document status.">
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
            <StatusBadge key="status" status={doc.status} />,
            doc.created_at?.slice(0, 10),
            doc.uploaded_by_username || "Unavailable",
            <div key="actions" className="flex flex-wrap gap-2">
              {doc.file_url ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs font-semibold">Open file</a> : <span className="text-xs text-muted-foreground">No file URL</span>}
              <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold" onClick={() => void patchHrStaffDocument(doc.id, { status: doc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }).then(load)}>{doc.status === "ACTIVE" ? "Mark inactive" : "Mark active"}</button>
              <button type="button" disabled title="Verify/reject statuses are not exposed by the current backend document model." className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground opacity-60">Verify / Reject unavailable</button>
            </div>,
          ])}
        />
      </Section>

      <Section title="Attendance Summary">
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Detail label="Present" value={attendanceSummary.present} />
          <Detail label="Absent" value={attendanceSummary.absent} />
          <Detail label="Late" value={attendanceSummary.late} />
          <Detail label="Leave" value={attendanceSummary.leave} />
        </div>
        <TinyTable empty="No recent attendance rows" columns={["Date", "Status", "Hours", "Notes"]} rows={attendance.slice(0, 10).map((row) => [row.attendance_date, row.status, row.worked_hours, row.notes])} />
        <Link href={ROUTES.admin.hrAttendance} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Attendance page</Link>
      </Section>

      <Section title="Leave & Expense Summary">
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
      </Section>

      <Section title="Payroll History">
        <div className="grid gap-4 xl:grid-cols-2">
          <TinyTable empty="No salary sheets" columns={["Period", "Gross", "Net", "Status"]} rows={salarySheets.slice(0, 8).map((row) => [`${row.year}-${String(row.month).padStart(2, "0")}`, row.gross_amount, row.net_amount, row.status])} />
          <TinyTable empty="No salary payments" columns={["Date", "Amount", "Account", "Reference"]} rows={salaryPayments.slice(0, 8).map((row) => [row.payment_date, row.amount, row.finance_account_name || "Unavailable", row.reference_no || "Unavailable"])} />
        </div>
        <Link href={ROUTES.admin.hrPayroll} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Payroll page</Link>
      </Section>

      <Section title="Audit / Activity Timeline" description="Dedicated HR audit timeline endpoint is not available yet. This safe empty state avoids fabricating activity.">
        <EmptyState title="Timeline deferred" description="Profile updates, document status changes, deactivate/reactivate events, and salary setup changes should be shown here once a dedicated audit endpoint is exposed." />
      </Section>
    </PortalPage>
  );
}
