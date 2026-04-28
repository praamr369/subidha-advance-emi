"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { createHrStaff, listHrStaff, type HrStaff } from "@/services/admin-hr";

export default function AdminHrStaffRegisterPage() {
  const [rows, setRows] = useState<HrStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const canCreate = useMemo(() => name.trim().length >= 2 && phone.trim().length >= 8, [name, phone]);

  async function load() {
    try {
      setLoading(true);
      const payload = await listHrStaff();
      setRows(payload.results);
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
  }, []);

  async function handleCreate() {
    if (!canCreate) return;
    try {
      await createHrStaff({ name: name.trim(), phone: phone.trim() });
      setName("");
      setPhone("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create staff.");
    }
  }

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Staff Register"
      subtitle="Create and manage staff profiles (employee records) without duplicating users."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Staff Register" },
      ]}
      actions={[
        { href: ROUTES.admin.hrAttendance, label: "Attendance", variant: "secondary" },
        { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Quick create staff</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canCreate}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Create staff
          </button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          For login-enabled staff (cashier/admin), create internal users separately and assign cash counters in the Counters module.
        </div>
      </section>

      {loading ? <LoadingBlock label="Loading staff..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load staff" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No staff yet" description="Create staff profiles to start attendance and payroll workflows." /> : null}

      {!loading && !error && rows.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Staff</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Branch</th>
                  <th className="py-2 pr-4">Joining</th>
                  <th className="py-2 pr-4">Active</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">{row.employee_code}</td>
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4">{row.phone || "—"}</td>
                    <td className="py-2 pr-4">{row.branch_name || "—"}</td>
                    <td className="py-2 pr-4">{row.joining_date}</td>
                    <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
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

