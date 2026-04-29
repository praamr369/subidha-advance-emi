"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
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

export default function AdminHrStaffRegisterPage() {
  const [rows, setRows] = useState<HrStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentTypeValue>("PERMANENT_MONTHLY");
  const [baseSalary, setBaseSalary] = useState("");
  const [dailyWageRate, setDailyWageRate] = useState("");
  const [hourlyWageRate, setHourlyWageRate] = useState("");
  const [pieceRateAmount, setPieceRateAmount] = useState("");
  const [pieceRateUnitLabel, setPieceRateUnitLabel] = useState("");
  const [kycIdType, setKycIdType] = useState("");
  const [kycIdNumber, setKycIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

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
      await createHrStaff({
        name: name.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        department: department.trim(),
        employment_type: employmentType,
        base_salary: baseSalary.trim() || null,
        daily_wage_rate: dailyWageRate.trim() || null,
        hourly_wage_rate: hourlyWageRate.trim() || null,
        piece_rate_amount: pieceRateAmount.trim() || null,
        piece_rate_unit_label: pieceRateUnitLabel.trim(),
        kyc_id_type: kycIdType.trim(),
        kyc_id_number: kycIdNumber.trim(),
        address: address.trim(),
      });
      setName("");
      setPhone("");
      setDesignation("");
      setDepartment("");
      setBaseSalary("");
      setDailyWageRate("");
      setHourlyWageRate("");
      setPieceRateAmount("");
      setPieceRateUnitLabel("");
      setKycIdType("");
      setKycIdNumber("");
      setAddress("");
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
        { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "secondary" },
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
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as EmploymentTypeValue)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="PERMANENT_MONTHLY">Permanent Monthly Staff</option>
            <option value="TEMPORARY">Temporary Staff</option>
            <option value="DAILY_WAGE">Daily Wage Worker</option>
            <option value="HOURLY">Hourly Worker</option>
            <option value="PIECE_RATE">Piece-rate Worker</option>
            <option value="MANUFACTURING">Manufacturing Worker</option>
            <option value="SERVICE">Service Worker</option>
          </select>
          <input
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="Base salary"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={dailyWageRate}
            onChange={(e) => setDailyWageRate(e.target.value)}
            placeholder="Daily wage rate"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={hourlyWageRate}
            onChange={(e) => setHourlyWageRate(e.target.value)}
            placeholder="Hourly wage rate"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={pieceRateAmount}
            onChange={(e) => setPieceRateAmount(e.target.value)}
            placeholder="Piece-rate amount"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={pieceRateUnitLabel}
            onChange={(e) => setPieceRateUnitLabel(e.target.value)}
            placeholder="Piece-rate unit"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={kycIdType}
            onChange={(e) => setKycIdType(e.target.value)}
            placeholder="KYC ID type"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={kycIdNumber}
            onChange={(e) => setKycIdNumber(e.target.value)}
            placeholder="KYC ID number"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
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
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">KYC</th>
                  <th className="py-2 pr-4">Joining</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">{row.employee_code}</td>
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4">{row.phone || "—"}</td>
                    <td className="py-2 pr-4">{row.branch_name || "—"}</td>
                    <td className="py-2 pr-4">{row.employment_type || "—"}</td>
                    <td className="py-2 pr-4">{row.kyc_verified ? "Verified" : "Pending"}</td>
                    <td className="py-2 pr-4">{row.joining_date}</td>
                    <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs"
                          onClick={() => setSelectedStaffId(row.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs"
                          onClick={() => void setHrStaffStatus(row.id, row.is_active ? "DEACTIVATE" : "REACTIVATE").then(load)}
                        >
                          {row.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                        <a
                          href={`/api/v1/admin/hr/staff/${row.id}/profile-pdf/`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          Profile PDF
                        </a>
                        <a
                          href={`/api/v1/admin/hr/staff/${row.id}/salary-agreement-pdf/`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          Salary PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {selectedStaffId ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-foreground">Edit staff details</div>
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() =>
              void patchHrStaff(selectedStaffId, {
                address,
                kyc_id_type: kycIdType,
                kyc_id_number: kycIdNumber,
                designation,
                department,
                employment_type: employmentType,
                base_salary: baseSalary || null,
                daily_wage_rate: dailyWageRate || null,
                hourly_wage_rate: hourlyWageRate || null,
                piece_rate_amount: pieceRateAmount || null,
                piece_rate_unit_label: pieceRateUnitLabel,
              }).then(load)
            }
          >
            Save staff edit
          </button>
        </section>
      ) : null}
    </PortalPage>
  );
}

