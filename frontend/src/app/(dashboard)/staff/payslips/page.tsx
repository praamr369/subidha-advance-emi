"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { ROUTES } from "@/lib/routes";
import { getStaffPayslips, type StaffPayslip } from "@/services/staff";


export default function StaffPayslipsPage() {
  return (
    <StaffDataPage<{ results: StaffPayslip[] }>
      title="Payslips"
      description="Read-only history of your own salary sheets and payment posture. Salary payments cannot be created from the staff portal."
      load={getStaffPayslips}
      empty={(data) => data.results.length === 0}
      emptyMessage="No payslips are available for your profile."
      render={(data) => (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold">{row.year}-{String(row.month).padStart(2, "0")}</td>
                  <td className="px-4 py-3">{formatRupee(row.gross_amount)}</td>
                  <td className="px-4 py-3">{formatRupee(row.deductions_amount)}</td>
                  <td className="px-4 py-3 font-semibold">{formatRupee(row.net_amount)}</td>
                  <td className="px-4 py-3">{formatRupee(row.payment_total)}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3"><Link className="font-semibold underline underline-offset-4" href={`${ROUTES.staff.payslips}/${row.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    />
  );
}
