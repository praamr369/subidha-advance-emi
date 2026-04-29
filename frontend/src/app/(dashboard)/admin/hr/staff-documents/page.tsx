"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  createHrStaffDocument,
  listHrStaff,
  listHrStaffDocuments,
  type HrStaff,
  type HrStaffDocument,
} from "@/services/admin-hr";

export default function AdminHrStaffDocumentsPage() {
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [rows, setRows] = useState<HrStaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState("OTHER");
  const [title, setTitle] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    try {
      setLoading(true);
      const [staffPayload, docsPayload] = await Promise.all([listHrStaff(), listHrStaffDocuments()]);
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
  }, []);

  async function handleUpload() {
    if (!employeeId || !title.trim() || !file) return;
    const payload = new FormData();
    payload.append("employee", employeeId);
    payload.append("document_type", documentType);
    payload.append("title", title.trim());
    payload.append("document_no", documentNo.trim());
    payload.append("notes", notes.trim());
    payload.append("file", file);
    try {
      await createHrStaffDocument(payload);
      setTitle("");
      setDocumentNo("");
      setNotes("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload staff document.");
    }
  }

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Staff Documents"
      subtitle="KYC and payroll document metadata/upload workflow for staff profiles."
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
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Upload Staff Document</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Select staff</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.employee_code})
              </option>
            ))}
          </select>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="ID_PROOF">ID Proof</option>
            <option value="ADDRESS_PROOF">Address Proof</option>
            <option value="SALARY_AGREEMENT">Salary Agreement</option>
            <option value="APPOINTMENT_LETTER">Appointment Letter</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={documentNo}
            onChange={(e) => setDocumentNo(e.target.value)}
            placeholder="Document no (optional)"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleUpload()}
          className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          disabled={!employeeId || !title.trim() || !file}
        >
          Upload document
        </button>
      </section>

      {loading ? <LoadingBlock label="Loading staff documents..." /> : null}
      {!loading && error ? <ErrorState title="Staff documents unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No staff documents" description="Upload KYC/salary documents for compliance." /> : null}

      {!loading && !error && rows.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Recent Documents</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Document No</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">File</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-4">{row.employee_name}</td>
                    <td className="py-2 pr-4">{row.document_type}</td>
                    <td className="py-2 pr-4">{row.title}</td>
                    <td className="py-2 pr-4">{row.document_no || "—"}</td>
                    <td className="py-2 pr-4">{row.status}</td>
                    <td className="py-2 pr-4">
                      {row.file_url ? (
                        <a href={row.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PortalPage>
  );
}
