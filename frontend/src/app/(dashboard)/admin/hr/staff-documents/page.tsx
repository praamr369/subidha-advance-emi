"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import {
  DataTableShell,
  FormSection,
  KpiCard,
  QuickActionGrid,
  WorkflowCard,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import {
  createHrStaffDocument,
  listHrStaff,
  listHrStaffDocuments,
  patchHrStaffDocument,
  type HrStaff,
  type HrStaffDocument,
} from "@/services/admin-hr";

const DOCUMENT_TYPES = ["ID_PROOF", "ADDRESS_PROOF", "SALARY_AGREEMENT", "APPOINTMENT_LETTER", "OTHER"];
const DOCUMENT_STATUSES = ["ACTIVE", "INACTIVE"];

export default function AdminHrStaffDocumentsPage() {
  const searchParams = useSearchParams();
  const initialEmployee = searchParams.get("employee") || searchParams.get("staff") || "";
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [rows, setRows] = useState<HrStaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState({ employee: initialEmployee, document_type: "", status: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [upload, setUpload] = useState({ employee: initialEmployee, document_type: "OTHER", title: "", document_no: "", notes: "", file: null as File | null });

  const selectedStaff = useMemo(
    () => staff.find((member) => String(member.id) === filters.employee),
    [staff, filters.employee]
  );

  async function load(nextFilters = filters) {
    try {
      setLoading(true);
      const [staffPayload, docsPayload] = await Promise.all([listHrStaff(), listHrStaffDocuments(nextFilters)]);
      setStaff(staffPayload.results);
      setRows(docsPayload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load staff documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    await load(filters);
  }

  async function clearFilters() {
    const next = { employee: "", document_type: "", status: "" };
    setFilters(next);
    await load(next);
  }

  async function handleUpload() {
    if (!upload.employee || !upload.title.trim() || !upload.file) return;
    const payload = new FormData();
    payload.append("employee", upload.employee);
    payload.append("document_type", upload.document_type);
    payload.append("title", upload.title.trim());
    payload.append("document_no", upload.document_no.trim());
    payload.append("notes", upload.notes.trim());
    payload.append("file", upload.file);
    try {
      setSaving(true);
      await createHrStaffDocument(payload);
      setNotice("Staff document uploaded.");
      setUpload({ employee: filters.employee, document_type: "OTHER", title: "", document_no: "", notes: "", file: null });
      setDrawerOpen(false);
      await load(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload staff document.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDocumentStatus(row: HrStaffDocument) {
    await patchHrStaffDocument(row.id, { status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    setNotice(`Document marked ${row.status === "ACTIVE" ? "inactive" : "active"}.`);
    await load(filters);
  }

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Staff Documents"
      subtitle="Filter, upload, and maintain staff KYC and agreement documents."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Staff Documents" },
      ]}
      actions={[
        { href: ROUTES.admin.hrStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.hrPayroll, label: "Salary / Payroll", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <QuickActionGrid>
        <KpiCard label="Documents loaded" value={rows.length} helper="Current filtered records" />
        <KpiCard
          label="Active documents"
          value={rows.filter((row) => row.status === "ACTIVE").length}
          helper="Operationally valid"
        />
        <KpiCard
          label="Inactive documents"
          value={rows.filter((row) => row.status === "INACTIVE").length}
          helper="Kept for audit trail"
        />
        <WorkflowCard
          title="Document workflow"
          description="Upload from HR and toggle active/inactive without deleting historical records."
        />
      </QuickActionGrid>

      <FormSection
        title="Document filters"
        description="Filters call the staff document API; verify/reject is disabled because only ACTIVE/INACTIVE status exists."
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <ActionButton variant="primary" onClick={() => { setUpload((current) => ({ ...current, employee: filters.employee })); setDrawerOpen(true); }}>
            Upload Document
          </ActionButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select value={filters.employee} onChange={(event) => setFilters({ ...filters, employee: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All staff</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.employee_code})</option>)}
          </select>
          <select value={filters.document_type} onChange={(event) => setFilters({ ...filters, document_type: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All document types</option>
            {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">All statuses</option>
            {DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton onClick={() => void applyFilters()}>Apply Filters</ActionButton>
          <ActionButton variant="ghost" onClick={() => void clearFilters()}>Clear</ActionButton>
          {selectedStaff ? <Link href={`${ROUTES.admin.hrStaff}/${selectedStaff.id}`} className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold">Back to {selectedStaff.name}</Link> : null}
        </div>
      </FormSection>

      {drawerOpen ? (
        <FormSection
          title="Upload staff document"
          description="Uploads use POST /api/v1/admin/hr/staff-documents/."
          className="border border-primary/25"
        >
          <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" onClick={() => setDrawerOpen(false)}>Close</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select value={upload.employee} onChange={(event) => setUpload({ ...upload, employee: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">Select staff</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.employee_code})</option>)}
            </select>
            <select value={upload.document_type} onChange={(event) => setUpload({ ...upload, document_type: event.target.value })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
            <input value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} placeholder="Title" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={upload.document_no} onChange={(event) => setUpload({ ...upload, document_no: event.target.value })} placeholder="Document number" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={upload.notes} onChange={(event) => setUpload({ ...upload, notes: event.target.value })} placeholder="Notes" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input type="file" onChange={(event) => setUpload({ ...upload, file: event.target.files?.[0] || null })} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <div className="sticky bottom-3 mt-4 flex justify-end rounded-xl border border-border bg-background/95 p-3">
            <ActionButton variant="primary" loading={saving} disabled={!upload.employee || !upload.title.trim() || !upload.file} onClick={() => void handleUpload()}>
              Upload Document
            </ActionButton>
          </div>
        </FormSection>
      ) : null}

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
      {loading ? <LoadingBlock label="Loading staff documents..." /> : null}
      {!loading && error ? <ErrorState title="Staff documents unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No staff documents" description="Upload KYC, appointment, and salary agreement documents from this page or the staff profile." /> : null}

      {!loading && !error && rows.length > 0 ? (
        <DataTableShell>
          <div className="text-sm font-semibold text-foreground">Documents ({rows.length})</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Staff</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Document No</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Uploaded</th>
                  <th className="py-2 pr-4">Uploaded By</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <Link href={`${ROUTES.admin.hrStaff}/${row.employee}`} className="font-semibold text-primary hover:underline">{row.employee_name}</Link>
                      <div className="font-mono text-xs text-muted-foreground">{row.employee_code}</div>
                    </td>
                    <td className="py-3 pr-4">{row.document_type}</td>
                    <td className="py-3 pr-4">{row.title}</td>
                    <td className="py-3 pr-4">{row.document_no || "Unavailable"}</td>
                    <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                    <td className="py-3 pr-4">{row.created_at?.slice(0, 10) || "Unavailable"}</td>
                    <td className="py-3 pr-4">{row.uploaded_by_username || "Unavailable"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {row.file_url ? <a href={row.file_url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs font-semibold">Open file</a> : <span className="text-xs text-muted-foreground">No file URL</span>}
                        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs font-semibold" onClick={() => void toggleDocumentStatus(row)}>
                          {row.status === "ACTIVE" ? "Mark inactive" : "Mark active"}
                        </button>
                        <button type="button" disabled title="Verify/reject statuses are not supported by the current staff document API." className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground opacity-60">
                          Verify / Reject unavailable
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
