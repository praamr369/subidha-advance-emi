"use client";

import { useParams } from "next/navigation";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { getStaffPayslip, type StaffPayslip } from "@/services/staff";

function money(value?: string | null): string {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export default function StaffPayslipDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  return (
    <StaffDataPage<StaffPayslip>
      title="Payslip Detail"
      description="Read-only payslip details for your own salary sheet."
      load={() => getStaffPayslip(id)}
      render={(data) => (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Period</div><div className="mt-2 text-xl font-semibold">{data.year}-{String(data.month).padStart(2, "0")}</div></div>
            <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Gross</div><div className="mt-2 text-xl font-semibold">{money(data.gross_amount)}</div></div>
            <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Deductions</div><div className="mt-2 text-xl font-semibold">{money(data.deductions_amount)}</div></div>
            <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Net</div><div className="mt-2 text-xl font-semibold">{money(data.net_amount)}</div></div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Salary lines</h2>
            {data.lines?.length ? (
              <div className="mt-4 grid gap-2">
                {data.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                    <span>{line.component_name} · {line.component_type}</span>
                    <span className="font-semibold">{money(line.amount)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">No salary component lines exposed for this payslip.</p>}
          </section>
        </div>
      )}
    />
  );
}
