"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  DataTableShell,
  FormSection,
  KpiCard,
  QuickActionGrid,
  WorkflowCard,
} from "@/components/ui/operations";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import {
  createHrStaff,
  downloadHrSalaryAgreementPdf,
  downloadHrStaffProfilePdf,
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

const EMPLOYMENT_TYPES: Array<{ value: EmploymentTypeValue; label: string }> = [
  { value: "PERMANENT_MONTHLY", label: "Permanent Monthly" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "DAILY_WAGE", label: "Daily Wage" },
  { value: "HOURLY", label: "Hourly" },
  { value: "PIECE_RATE", label: "Piece Rate" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "SERVICE", label: "Service" },
];

type StaffFormState = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  employment_type: EmploymentTypeValue;
  branch: string;
  joining_date: string;
  base_salary: string;
  daily_wage_rate: string;
  hourly_wage_rate: string;
  piece_rate_amount: string;
  piece_rate_unit_label: string;
  kyc_id_type: string;
  kyc_id_number: string;
  kyc_verified: boolean;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  cost_center_code: string;
};

const emptyForm: StaffFormState = {
  name: "",
  phone: "",
  designation: "",
  department: "",
  employment_type: "PERMANENT_MONTHLY",
  branch: "",
  joining_date: "",
  base_salary: "",
  daily_wage_rate: "",
  hourly_wage_rate: "",
  piece_rate_amount: "",
  piece_rate_unit_label: "",
  kyc_id_type: "",
  kyc_id_number: "",
  kyc_verified: false,
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  cost_center_code: "",
};

function formFromStaff(staff: HrStaff): StaffFormState {
  return {
    ...emptyForm,
    name: staff.name || "",
    phone: staff.phone || "",
    designation: staff.designation || "",
    department: staff.department || "",
    employment_type: (staff.employment_type as EmploymentTypeValue) || "PERMANENT_MONTHLY",
    branch: staff.branch ? String(staff.branch) : "",
    joining_date: staff.joining_date || "",
    base_salary: staff.base_salary || "",
    daily_wage_rate: staff.daily_wage_rate || "",
    hourly_wage_rate: staff.hourly_wage_rate || "",
    piece_rate_amount: staff.piece_rate_amount || "",
    piece_rate_unit_label: staff.piece_rate_unit_label || "",
    kyc_id_type: staff.kyc_id_type || "",
    kyc_id_number: staff.kyc_id_number || "",
    kyc_verified: Boolean(staff.kyc_verified),
    address: staff.address || "",
    emergency_contact_name: staff.emergency_contact_name || "",
    emergency_contact_phone: staff.emergency_contact_phone || "",
    cost_center_code: staff.cost_center_code || "",
  };
}

function compactPayload(form: StaffFormState) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    designation: form.designation.trim(),
    department: form.department.trim(),
    employment_type: form.employment_type,
    branch: form.branch ? Number(form.branch) : null,
    joining_date: form.joining_date || null,
    base_salary: form.base_salary.trim() || null,
    daily_wage_rate: form.daily_wage_rate.trim() || null,
    hourly_wage_rate: form.hourly_wage_rate.trim() || null,
    piece_rate_amount: form.piece_rate_amount.trim() || null,
    piece_rate_unit_label: form.piece_rate_unit_label.trim(),
    kyc_id_type: form.kyc_id_type.trim(),
    kyc_id_number: form.kyc_id_number.trim(),
    kyc_verified: form.kyc_verified,
    address: form.address.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(),
    emergency_contact_phone: form.emergency_contact_phone.trim(),
    cost_center_code: form.cost_center_code.trim(),
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
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
      className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary"
    />
  );
}

function StaffForm({
  form,
  branches,
  onChange,
}: {
  form: StaffFormState;
  branches: BranchRecord[];
  onChange: (next: StaffFormState) => void;
}) {
  const update = <K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Full name"><TextInput value={form.name} onChange={(value) => update("name", value)} /></Field>
        <Field label="Phone"><TextInput value={form.phone} onChange={(value) => update("phone", value)} /></Field>
        <Field label="Role / title"><TextInput value={form.designation} onChange={(value) => update("designation", value)} /></Field>
        <Field label="Department"><TextInput value={form.department} onChange={(value) => update("department", value)} /></Field>
        <Field label="Staff type">
          <select value={form.employment_type} onChange={(event) => update("employment_type", event.target.value as EmploymentTypeValue)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            {EMPLOYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="Branch">
          <select value={form.branch} onChange={(event) => update("branch", event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">Unassigned</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Joining date"><TextInput type="date" value={form.joining_date} onChange={(value) => update("joining_date", value)} /></Field>
        <Field label="Base salary"><TextInput value={form.base_salary} onChange={(value) => update("base_salary", value)} /></Field>
        <Field label="Daily wage"><TextInput value={form.daily_wage_rate} onChange={(value) => update("daily_wage_rate", value)} /></Field>
        <Field label="Hourly wage"><TextInput value={form.hourly_wage_rate} onChange={(value) => update("hourly_wage_rate", value)} /></Field>
        <Field label="Piece rate"><TextInput value={form.piece_rate_amount} onChange={(value) => update("piece_rate_amount", value)} /></Field>
        <Field label="Piece unit"><TextInput value={form.piece_rate_unit_label} onChange={(value) => update("piece_rate_unit_label", value)} /></Field>
        <Field label="Cost center"><TextInput value={form.cost_center_code} onChange={(value) => update("cost_center_code", value)} /></Field>
        <Field label="KYC verified">
          <select value={form.kyc_verified ? "true" : "false"} onChange={(event) => update("kyc_verified", event.target.value === "true")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="false">Pending</option>
            <option value="true">Verified</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="KYC type"><TextInput value={form.kyc_id_type} onChange={(value) => update("kyc_id_type", value)} /></Field>
        <Field label="KYC reference"><TextInput value={form.kyc_id_number} onChange={(value) => update("kyc_id_number", value)} /></Field>
        <Field label="Emergency phone"><TextInput value={form.emergency_contact_phone} onChange={(value) => update("emergency_contact_phone", value)} /></Field>
        <Field label="Emergency contact"><TextInput value={form.emergency_contact_name} onChange={(value) => update("emergency_contact_name", value)} /></Field>
        <Field label="Address">
          <textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary" />
        </Field>
      </div>
    </div>
  );
}

export default function AdminHrStaffRegisterPage() {
  const [rows, setRows] = useState<HrStaff[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<HrStaff | null>(null);
  const [form, setForm] = useState<StaffFormState>(emptyForm);
  const [filters, setFilters] = useState({
    q: "",
    is_active: "",
    department: "",
    employment_type: "",
    branch: "",
    kyc_verified: "",
  });

  const departments = useMemo(() => {
    const values = new Set(rows.map((row) => row.department || "").filter(Boolean));
    return Array.from(values).sort();
  }, [rows]);

  const canSave = form.name.trim().length >= 2 && form.phone.trim().length >= 8;
  const activeCount = rows.filter((row) => row.is_active).length;
  const verifiedKycCount = rows.filter((row) => row.kyc_verified).length;

  async function load() {
    try {
      setLoading(true);
      const [staffPayload, branchPayload] = await Promise.all([listHrStaff(filters), listBranches({ status: "ACTIVE" })]);
      setRows(staffPayload.results);
      setBranches(branchPayload.results);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load staff register.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    await load();
  }

  function openCreate() {
    setForm({ ...emptyForm, joining_date: new Date().toISOString().slice(0, 10) });
    setEditStaff(null);
    setCreateOpen(true);
    setNotice(null);
  }

  function openEdit(staff: HrStaff) {
    setForm(formFromStaff(staff));
    setEditStaff(staff);
    setCreateOpen(false);
    setNotice(null);
  }

  async function saveStaff() {
    if (!canSave) return;
    try {
      setSaving(true);
      if (editStaff) {
        await patchHrStaff(editStaff.id, compactPayload(form));
        setNotice("Staff profile updated.");
      } else {
        await createHrStaff(compactPayload(form));
        setNotice("Staff profile created.");
      }
      setCreateOpen(false);
      setEditStaff(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save staff profile.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(staff: HrStaff) {
    const nextAction = staff.is_active ? "DEACTIVATE" : "REACTIVATE";
    if (staff.is_active && !window.confirm(`Deactivate ${staff.name}? Attendance, documents, and payroll history will remain preserved.`)) {
      return;
    }
    try {
      await setHrStaffStatus(staff.id, nextAction);
      setNotice(`${staff.name} ${staff.is_active ? "deactivated" : "reactivated"}.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update staff status.");
    }
  }

  const editorOpen = createOpen || Boolean(editStaff);

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Staff Register"
      subtitle="Search, filter, and manage staff profiles with real HR controls."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Staff Register" },
      ]}
      actions={[
        { href: ROUTES.admin.hr, label: "Staff Workspace", variant: "secondary" },
        { href: ROUTES.admin.hrAttendance, label: "Attendance", variant: "secondary" },
        { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" },
        { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <QuickActionGrid>
        <KpiCard label="Total staff" value={rows.length} helper="Current register scope" />
        <KpiCard label="Active staff" value={activeCount} helper="Ready for scheduling/payroll" />
        <KpiCard label="KYC verified" value={verifiedKycCount} helper="Compliant profiles" />
        <WorkflowCard
          title="Daily HR actions"
          description="Use attendance, payroll, and documents to complete daily operator workflows."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href={ROUTES.admin.hrAttendance} className="text-xs font-semibold text-primary hover:underline">
                Mark attendance
              </Link>
              <Link href={ROUTES.admin.hrPayroll} className="text-xs font-semibold text-primary hover:underline">
                Run payroll
              </Link>
            </div>
          }
        />
      </QuickActionGrid>

      <FormSection
        title="Staff search and filters"
        description="All filters call the staff register API; no local fake records are used."
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <ActionButton variant="primary" onClick={openCreate}>Create Staff</ActionButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <TextInput value={filters.q} onChange={(value) => setFilters({ ...filters, q: value })} placeholder="Name, phone, code" />
          <select value={filters.is_active} onChange={(event) => setFilters({ ...filters, is_active: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select value={filters.employment_type} onChange={(event) => setFilters({ ...filters, employment_type: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All staff types</option>
            {EMPLOYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select value={filters.kyc_verified} onChange={(event) => setFilters({ ...filters, kyc_verified: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All KYC</option>
            <option value="true">Verified</option>
            <option value="false">Pending</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton onClick={() => void applyFilters()}>Apply Filters</ActionButton>
          <ActionButton variant="ghost" onClick={() => { setFilters({ q: "", is_active: "", department: "", employment_type: "", branch: "", kyc_verified: "" }); void listHrStaff().then((payload) => setRows(payload.results)); }}>Clear</ActionButton>
        </div>
      </FormSection>

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
      {loading ? <LoadingBlock label="Loading staff..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load staff" description={error} onRetry={() => void load()} /> : null}

      {editorOpen ? (
        <FormSection
          title={editStaff ? "Edit staff profile" : "Create staff profile"}
          description="Profile, employment, payroll setup, KYC, emergency, and cost mapping fields."
          className="border border-primary/25"
        >
          <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" onClick={() => { setCreateOpen(false); setEditStaff(null); }}>
              Close
            </button>
          </div>
          <div className="mt-4"><StaffForm form={form} branches={branches} onChange={setForm} /></div>
          <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm">
            <span className="text-xs text-muted-foreground">No delete action is available. Deactivation preserves audit and payroll history.</span>
            <ActionButton variant="primary" loading={saving} disabled={!canSave} onClick={() => void saveStaff()}>
              Save Profile
            </ActionButton>
          </div>
        </FormSection>
      ) : null}

      {!loading && !error && rows.length === 0 ? <EmptyState title="No staff found" description="Adjust filters or create a staff profile." /> : null}

      {!loading && !error && rows.length > 0 ? (
        <DataTableShell>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Staff ({rows.length})</div>
            <div className="text-xs text-muted-foreground">Profile pages are opened from staff names and View Profile actions.</div>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Staff</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Staff type</th>
                  <th className="py-2 pr-4">Salary type</th>
                  <th className="py-2 pr-4">Branch / Counter</th>
                  <th className="py-2 pr-4">KYC</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="font-semibold text-primary hover:underline">
                        {row.name}
                      </Link>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{row.employee_code || `#${row.id}`}</div>
                    </td>
                    <td className="py-3 pr-4">{row.phone || "Unavailable"}</td>
                    <td className="py-3 pr-4">{row.department || "Unassigned"}</td>
                    <td className="py-3 pr-4">{row.employment_type || "Unassigned"}</td>
                    <td className="py-3 pr-4">{row.base_salary ? "Monthly base" : row.daily_wage_rate ? "Daily wage" : row.hourly_wage_rate ? "Hourly" : row.piece_rate_amount ? "Piece rate" : "Not configured"}</td>
                    <td className="py-3 pr-4">
                      <div>{row.branch_name || "No branch"}</div>
                      <div className="text-xs text-muted-foreground">Counter assignment not exposed on staff profile API.</div>
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={row.kyc_verified ? "ACTIVE" : "PENDING"} label={row.kyc_verified ? "Verified" : "Pending"} /></td>
                    <td className="py-3 pr-4"><StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} label={row.is_active ? "Active" : "Inactive"} /></td>
                    <td className="py-3 pr-4">
                      <div className="flex min-w-56 flex-wrap gap-2">
                        <Link href={`${ROUTES.admin.hrStaff}/${row.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">View profile</Link>
                        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => openEdit(row)}>Edit</button>
                        <Link href={`${ROUTES.admin.hrStaffDocuments}?employee=${row.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">Documents</Link>
                        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void downloadHrStaffProfilePdf(row.id, `staff-profile-${row.employee_code || row.id}.pdf`)}>Profile PDF</button>
                        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void downloadHrSalaryAgreementPdf(row.id, `salary-agreement-${row.employee_code || row.id}.pdf`)}>Salary PDF</button>
                        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void toggleStatus(row)}>
                          {row.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      ) : null}
    </PortalPage>
  );
}
