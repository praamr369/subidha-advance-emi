// frontend/src/components/admin/workflow/AdminWorkflowDashboard.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import type { AdminWorkflowViewModel } from "@/features/admin-workflow/dashboard";
import { fetchAdminWorkflow } from "@/features/admin-workflow/dashboard";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";

// Simple class name utility
function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function toneClassName(tone: string | undefined): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function healthClassName(health: string): string {
  switch (health) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "attention":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function QueueCard({
  title,
  href,
  icon,
  rows,
  emptyText,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  rows: Array<{ id: number | string; title: string; description: string; stat?: string; amount?: string; }>;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-muted p-2">{icon}</div>
          <div>
            <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">Operational queue</p>
          </div>
        </div>

        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
        >
          Open
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3 p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          rows.map((row) => (
            <div
              key={String(row.id)}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{row.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.description}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-foreground">
                    {row.amount || row.stat}
                  </div>
                  {row.amount ? (
                    <div className="mt-1 text-xs text-muted-foreground">{row.stat}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function AdminWorkflowDashboard() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: AdminWorkflowViewModel | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;

    fetchAdminWorkflow()
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load admin workflow",
          data: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalPage
      title="Admin control center"
      subtitle="Enterprise workflow for customer onboarding, subscription control, batch operations, collections, lucky draw governance, and reconciliation."
      actions={[
        { href: "/admin/subscriptions/advance-emi/create", label: "Create subscription", variant: "primary" },
        { href: "/admin/finance/collect", label: "Collect payment", variant: "secondary" },
        { href: "/admin/lucky-draws/create", label: "Run lucky draw", variant: "ghost" },
      ]}
      breadcrumbs={[
        { href: "/admin", label: "Admin" },
        { label: "Control center" },
      ]}
    >
      {state.loading ? <LoadingBlock label="Building enterprise workflow view..." /> : null}
      {state.error ? (
        <ErrorState
          title="Unable to load admin workflow"
          description={state.error}
        />
      ) : null}

      {!state.loading && !state.error && state.data ? (
        <div className="grid gap-5">
          <section className="grid gap-4 xl:grid-cols-5">
            {state.data.metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-card-foreground">
                  {metric.value}
                </div>
                <span
                  className={cn(
                    "mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                    toneClassName(metric.tone)
                  )}
                >
                  {metric.helpText || "Live operational signal"}
                </span>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold text-card-foreground">Workflow modules</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each module aligns to a production admin responsibility.
                </p>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                {state.data.modules.map((module) => (
                  <article
                    key={module.id}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{module.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {module.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
                          healthClassName(module.health)
                        )}
                      >
                        {module.health}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Primary metric
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {module.primaryMetric}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Supporting metric
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {module.supportingMetric}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {module.actions.map((action) => (
                        <Link
                          key={action.href}
                          href={action.href}
                          className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
                        >
                          {action.label}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      ))}
                    </div>

                    <div className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Owner: {module.owner}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold text-card-foreground">Priority actions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Suggested flow for today&apos;s admin execution cycle.
                </p>
              </div>

              <div className="space-y-3 p-5">
                {state.data.tasks.map((task, index) => (
                  <Link
                    href={task.href}
                    key={task.id}
                    className="block rounded-2xl border border-border bg-background p-4 transition hover:border-ring hover:bg-accent/40"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-foreground">{task.title}</div>
                          {task.stat ? (
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                                toneClassName(task.tone)
                              )}
                            >
                              {task.stat}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <QueueCard
              title="Overdue recovery queue"
              href="/admin/emis/overdue"
              icon={<AlertTriangle className="h-5 w-5" />}
              rows={state.data.overdueAlerts}
              emptyText="No overdue alerts were returned by the dashboard endpoint."
            />
            <QueueCard
              title="Recent collections"
              href="/admin/payments"
              icon={<CircleDollarSign className="h-5 w-5" />}
              rows={state.data.recentPayments}
              emptyText="No recent payments were returned by the dashboard endpoint."
            />
            <QueueCard
              title="Draw schedule"
              href="/admin/lucky-draws"
              icon={<Boxes className="h-5 w-5" />}
              rows={state.data.drawItems}
              emptyText="No draw schedules are available."
            />
            <QueueCard
              title="Reconciliation warnings"
              href={buildAdminReconciliationRoute()}
              icon={<ShieldAlert className="h-5 w-5" />}
              rows={state.data.reconciliationItems}
              emptyText="No reconciliation warnings are currently open."
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Link
              href="/admin/settings"
              className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
            >
              <BadgeCheck className="h-5 w-5" />
              <div className="mt-4 text-base font-semibold text-card-foreground">
                Governance settings
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Configure policy defaults, role controls, and financial guardrails.
              </p>
            </Link>
            <Link
              href="/admin/reports"
              className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
            >
              <ClipboardList className="h-5 w-5" />
              <div className="mt-4 text-base font-semibold text-card-foreground">
                Reporting center
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Revenue, collections, batch performance, and overdue reports.
              </p>
            </Link>
            <Link
              href="/admin/audit-logs"
              className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
            >
              <ShieldAlert className="h-5 w-5" />
              <div className="mt-4 text-base font-semibold text-card-foreground">
                Audit review
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Trace operational actions, financial changes, and exception review history.
              </p>
            </Link>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}
