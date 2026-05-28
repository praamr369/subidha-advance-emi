"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import {
  getSetupReadiness,
  type SetupLaunchChecklistItem,
  type SetupReadinessFinanceAccount,
  type SetupReadinessPayload,
  type SetupReadinessSection,
} from "@/services/business-setup";

const sectionOrder = [
  "business_profile",
  "print_branding",
  "chart_of_accounts",
  "finance_accounts",
  "branch_cash_counter",
  "staff_roles",
  "product_catalog",
  "batch_lucky_ids",
  "payment_collection",
  "document_templates",
  "accounting_reconciliation",
  "amendment_recontract",
];

function statusToneClass(status?: string) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "BLOCKED") return "border-red-200 bg-red-50 text-red-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function safeList(values: string[]) {
  if (values.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function SectionCard({ section }: { section: SetupReadinessSection }) {
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${statusToneClass(section.status)}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">{section.title}</h2>
          <p className="mt-1 text-sm opacity-90">{section.why_this_matters}</p>
        </div>
        <ERPStatusBadge status={section.status} label={section.status.replace(/_/g, " ")} />
      </div>

      {section.blockers.length > 0 ? (
        <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide">Blockers</div>
          {safeList(section.blockers)}
        </div>
      ) : null}

      {section.warnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide">Warnings</div>
          {safeList(section.warnings)}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3 text-sm">
        <div className="font-semibold">Recommended action</div>
        <p className="mt-1 opacity-90">{section.recommended_action}</p>
      </div>

      <div className="mt-4">
        <Link
          href={section.target_route || ROUTES.admin.settingsBusinessSetup}
          className="inline-flex rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-white/80"
        >
          Open setup area
        </Link>
      </div>
    </article>
  );
}

function FinanceReadinessPanel({ accounts }: { accounts: SetupReadinessFinanceAccount[] }) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Finance Account Readiness</h2>
            <p className="mt-1 text-sm text-muted-foreground">No finance accounts are configured yet.</p>
          </div>
          <ERPStatusBadge status="BLOCKED" label="Blocked" />
        </div>
        <div className="mt-4">
          <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">
            Open Accounting Setup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Finance Account Readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only posting-readiness check for cash, bank, and UPI accounts. No remapping happens here.
          </p>
        </div>
        <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">
          Open Accounting Setup
        </Link>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Account</th>
              <th className="px-3 py-3">Kind</th>
              <th className="px-3 py-3">Mapped COA</th>
              <th className="px-3 py-3">Posting ready</th>
              <th className="px-3 py-3">Blocker / action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-3 py-3 font-medium text-foreground">{account.name}</td>
                <td className="px-3 py-3 text-muted-foreground">{account.kind}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {account.mapped_chart_account
                    ? `${account.mapped_chart_account.code} — ${account.mapped_chart_account.name}`
                    : "Not mapped"}
                </td>
                <td className="px-3 py-3">
                  <ERPStatusBadge status={account.posting_ready ? "READY" : "BLOCKED"} label={account.posting_ready ? "Ready" : "Blocked"} />
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {account.blocker_reason || account.recommended_action || "No blocker."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LaunchChecklist({ items }: { items: SetupLaunchChecklistItem[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Launch Checklist</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Items are marked ready only when the backend readiness payload supports them.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <ERPStatusBadge status={item.ready ? "READY" : "BLOCKED"} label={item.ready ? "Ready" : "Blocked"} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Source: {item.source_section.replace(/_/g, " ")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminSetupReadinessPage() {
  const [payload, setPayload] = useState<SetupReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReadiness() {
    setLoading(true);
    try {
      setPayload(await getSetupReadiness());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup readiness.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReadiness();
  }, []);

  const orderedSections = useMemo(() => {
    if (!payload) return [];
    const byKey = new Map(payload.sections.map((section) => [section.key, section]));
    return [
      ...sectionOrder.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])),
      ...payload.sections.filter((section) => !sectionOrder.includes(section.key)),
    ];
  }, [payload]);

  return (
    <ERPPageShell
      title="Setup Readiness"
      description="Admin-only master data and business readiness center for live shop operations. Checks are read-only and never auto-fix accounting, collection, or historical records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Business Setup", href: ROUTES.admin.settingsBusinessSetup },
        { label: "Setup Readiness" },
      ]}
    >
      <div className="space-y-6">
        <BusinessSetupLinks />

        {loading ? <ERPLoadingState label="Loading setup readiness..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load setup readiness" description={error} onRetry={() => void loadReadiness()} />
        ) : null}
        {!loading && !error && !payload ? (
          <ERPEmptyState title="No readiness payload available" description="The backend returned no setup readiness data." />
        ) : null}

        {payload ? (
          <>
            <section className={`rounded-2xl border p-5 shadow-sm ${statusToneClass(payload.summary.overall_status)}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-medium uppercase tracking-wide opacity-80">Overall readiness</div>
                  <h1 className="mt-2 text-3xl font-semibold">{payload.summary.overall_status.replace(/_/g, " ")}</h1>
                  <p className="mt-2 max-w-3xl text-sm opacity-90">
                    {payload.summary.next_recommended_action || "Review setup sections before live operations."}
                  </p>
                  <p className="mt-2 text-xs opacity-80">{payload.mutation_policy}</p>
                </div>
                <Link
                  href={payload.summary.next_target_route || ROUTES.admin.settingsBusinessSetup}
                  className="inline-flex rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-white/80"
                >
                  Open next setup action
                </Link>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-current/20 bg-white/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide">Ready</div>
                  <div className="mt-1 text-2xl font-semibold">{payload.summary.ready_count}</div>
                </div>
                <div className="rounded-xl border border-current/20 bg-white/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide">Warnings</div>
                  <div className="mt-1 text-2xl font-semibold">{payload.summary.warning_count}</div>
                </div>
                <div className="rounded-xl border border-current/20 bg-white/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide">Blockers</div>
                  <div className="mt-1 text-2xl font-semibold">{payload.summary.blocker_count}</div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-foreground">Guided Setup Steps</h2>
                <p className="text-sm text-muted-foreground">
                  Each card links to a real implemented route. No fake action buttons are exposed.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {orderedSections.map((section) => (
                  <SectionCard key={section.key} section={section} />
                ))}
              </div>
            </section>

            <FinanceReadinessPanel accounts={payload.finance_accounts} />
            <LaunchChecklist items={payload.launch_checklist} />
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
