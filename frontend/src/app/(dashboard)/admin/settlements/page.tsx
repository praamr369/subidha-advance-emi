// src/app/(dashboard)/admin/settlements/page.tsx

"use client";

import Link from "next/link";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function SettlementsOverview() {
  return (
    <ERPPageShell
      title="Settlements"
      subtitle="Admin-only bank statement and UPI settlement import evidence with manual allocation tooling."
      helperNote="Imports only store evidence. They do not match payments, post accounting, or close reconciliation items."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      headerMode="erp"
    >
      <ERPSectionShell
        title="Settlement evidence"
        description="Upload imports as evidence only. Use manual allocations to link evidence to existing targets without mutating payment, receipt, movement, accounting, or reconciliation state."
      >
        <ERPDataToolbar
          left={
            <div className="text-sm text-muted-foreground">
              Manual allocation only. No auto-matching or suggestions are performed in this phase.
            </div>
          }
          right={
            <div className="flex flex-wrap gap-2">
              <Link
                href={ROUTES.admin.settlementsBankImports}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground hover:bg-[var(--surface-muted)]"
              >
                Bank imports
              </Link>
              <Link
                href={ROUTES.admin.settlementsUpiImports}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground hover:bg-[var(--surface-muted)]"
              >
                UPI imports
              </Link>
              <Link
                href={ROUTES.admin.settlementsDayCloses}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground hover:bg-[var(--surface-muted)]"
              >
                Day-closes
              </Link>
            </div>
          }
        />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Bank statement evidence
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload statement CSVs for a bank finance account and period. Review parsed lines and apply manual allocations to existing
              payments, receipts, or money movements.
            </div>
            <div className="mt-3">
              <Link className="text-sm font-semibold text-primary hover:underline" href={ROUTES.admin.settlementsBankImports}>
                Open bank imports →
              </Link>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              UPI settlement evidence
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload UPI settlement CSVs for a UPI finance account and settlement date. Review parsed lines and apply manual allocations
              to existing targets without changing posting or reconciliation flows.
            </div>
            <div className="mt-3">
              <Link className="text-sm font-semibold text-primary hover:underline" href={ROUTES.admin.settlementsUpiImports}>
                Open UPI imports →
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cashier day-close evidence
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            Review cashier day-close variance as evidence only. Approval/rejection does not create accounting entries, allocations, or reconciliation item closures.
          </div>
          <div className="mt-3">
            <Link className="text-sm font-semibold text-primary hover:underline" href={ROUTES.admin.settlementsDayCloses}>
              Open day-closes →
            </Link>
          </div>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
