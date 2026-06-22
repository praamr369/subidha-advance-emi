import { PageHeader } from "@/shared/ui/PageHeader";
import { LoadingState } from "@/shared/ui/LoadingState";
import { ErrorState } from "@/shared/ui/ErrorState";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { formatMoney } from "@/shared/money/format";
import { useAdminDashboard } from "../api/dashboard.queries";
import { StatCard } from "../components/StatCard";
import { DashboardSection } from "../components/DashboardSection";
import { MiniTable } from "../components/MiniTable";
import type { RecentActivityItem, ReconciliationRow, DueSubscriptionRow } from "../api/dashboard.types";
import {
  Banknote,
  TrendingUp,
  Clock,
  AlertTriangle,
  Users,
  Package,
  Trophy,
  Dices,
  ShieldAlert,
  Activity,
} from "lucide-react";

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useAdminDashboard();

  if (isLoading) return <LoadingState message="Loading dashboard..." />;

  if (isError) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        message={error instanceof Error ? error.message : "Unknown error"}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) return <LoadingState />;

  const d = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Admin operations overview"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard
          label="Today's Collections"
          value={formatMoney(d.collections.today_net_amount)}
          icon={Banknote}
          tone="success"
          sub={`${d.collections.today_active_transaction_count} transactions`}
        />
        <StatCard
          label="Total Revenue"
          value={formatMoney(d.financial.total_revenue)}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          label="Pending EMIs"
          value={d.emi.pending}
          icon={Clock}
          tone={d.emi.pending > 0 ? "warning" : "default"}
          sub={formatMoney(d.summary.total_pending_amount)}
        />
        <StatCard
          label="Overdue EMIs"
          value={d.emi.overdue}
          icon={AlertTriangle}
          tone={d.emi.overdue > 0 ? "danger" : "success"}
          sub={formatMoney(d.summary.overdue_amount)}
        />
        <StatCard
          label="Active Subscriptions"
          value={d.subscriptions.active}
          icon={Users}
          tone="info"
          sub={`${d.subscriptions.completed} completed, ${d.subscriptions.won} won`}
        />
      </div>

      {/* ── Row: Collections + EMI Status ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardSection title="Today's Collections" badge={`${d.collections.today_transaction_count} txns`}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-stone-400">Gross</p>
              <p className="text-lg font-semibold tabular-nums text-stone-800">
                {formatMoney(d.collections.today_gross_amount)}
              </p>
            </div>
            <div>
              <p className="text-stone-400">Reversals</p>
              <p className="text-lg font-semibold tabular-nums text-red-600">
                {formatMoney(d.collections.today_reversed_amount)}
              </p>
            </div>
            <div>
              <p className="text-stone-400">Net</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-700">
                {formatMoney(d.collections.today_net_amount)}
              </p>
            </div>
            <div>
              <p className="text-stone-400">Active / Reversed</p>
              <p className="text-lg font-semibold text-stone-800">
                {d.collections.today_active_transaction_count} / {d.collections.today_reversed_transaction_count}
              </p>
            </div>
          </div>
        </DashboardSection>

        <DashboardSection title="EMI Health">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-stone-400">Pending</p>
              <p className="text-lg font-semibold text-amber-600">{d.emi.pending}</p>
              <p className="text-xs text-stone-400">{formatMoney(d.summary.total_pending_amount)}</p>
            </div>
            <div>
              <p className="text-stone-400">Overdue</p>
              <p className="text-lg font-semibold text-red-600">{d.emi.overdue}</p>
              <p className="text-xs text-stone-400">{formatMoney(d.summary.overdue_amount)}</p>
            </div>
            <div>
              <p className="text-stone-400">Outstanding</p>
              <p className="text-lg font-semibold text-stone-700">
                {formatMoney(d.financial.total_outstanding)}
              </p>
            </div>
          </div>
        </DashboardSection>
      </div>

      {/* ── Row: Subscriptions + Batches/Draw ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardSection title="Subscription KPIs">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <MetricRow icon={Users} label="Total Customers" value={d.subscription_kpis.total_customers} />
            <MetricRow icon={Package} label="Total Subscriptions" value={d.subscription_kpis.total_subscriptions} />
            <MetricRow icon={Trophy} label="Winners" value={d.subscriptions.won} />
            <MetricRow
              icon={ShieldAlert}
              label="Defaulted"
              value={d.subscription_kpis.defaulted_subscriptions}
              danger={d.subscription_kpis.defaulted_subscriptions > 0}
            />
            <div className="col-span-2 border-t border-stone-100 pt-3">
              <div className="flex justify-between text-xs text-stone-400">
                <span>Contract Value: {formatMoney(d.subscription_kpis.total_contract_value)}</span>
                <span>Monthly Value: {formatMoney(d.subscription_kpis.total_monthly_value)}</span>
              </div>
            </div>
          </div>
        </DashboardSection>

        <DashboardSection
          title="Batches & Draws"
          badge={`${d.batches.open_batches} open`}
        >
          <div className="grid grid-cols-2 gap-4 text-sm">
            <MetricRow icon={Dices} label="Total Batches" value={d.batches.total_batches} />
            <MetricRow icon={Trophy} label="Total Draws" value={d.batches.total_draws} />
            <MetricRow icon={Activity} label="Live Batches" value={d.batches.live_batches} />
            <MetricRow icon={Package} label="Open Batches" value={d.batches.open_batches} />
          </div>
          {d.batches.next_draw_batch && (
            <div className="mt-4 rounded-md bg-brand-50 px-4 py-3 text-sm">
              <p className="font-medium text-brand-800">
                Next Draw: {d.batches.next_draw_batch.batch_code}
              </p>
              <p className="text-brand-600">
                {d.batches.next_draw_batch.draw_date} — {d.batches.next_draw_batch.days_until_draw} days away
                <span className="ml-2">
                  ({d.batches.next_draw_batch.available_slots} slots available)
                </span>
              </p>
            </div>
          )}
        </DashboardSection>
      </div>

      {/* ── Row: Risk + Portfolio Mix ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardSection title="Risk Assessment">
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div>
              <p className="text-2xl font-bold text-emerald-600">{d.risk.healthy}</p>
              <p className="text-xs text-stone-400">Healthy</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{d.risk.at_risk}</p>
              <p className="text-xs text-stone-400">At Risk</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{d.risk.high_risk}</p>
              <p className="text-xs text-stone-400">High Risk</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-600">{d.risk.defaulted}</p>
              <p className="text-xs text-stone-400">Defaulted</p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-stone-400">
            Default rate: {(d.risk.default_rate * 100).toFixed(1)}%
          </p>
        </DashboardSection>

        <DashboardSection title="Portfolio Mix">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <p className="text-2xl font-bold text-brand-700">{d.portfolio_mix.emi}</p>
              <p className="text-xs text-stone-400">EMI</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{d.portfolio_mix.rent}</p>
              <p className="text-xs text-stone-400">Rent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{d.portfolio_mix.lease}</p>
              <p className="text-xs text-stone-400">Lease</p>
            </div>
          </div>
          {d.crm && (
            <div className="mt-4 border-t border-stone-100 pt-3 text-sm">
              <p className="text-stone-400">CRM Leads: {d.crm.open_leads} open</p>
            </div>
          )}
        </DashboardSection>
      </div>

      {/* ── Recent Activity ── */}
      <DashboardSection
        title="Recent Activity"
        badge={`${d.recent_activity.length} today`}
      >
        <MiniTable
          data={d.recent_activity.slice(0, 10)}
          keyFn={(r) => r.payment_id}
          emptyMessage="No activity today"
          columns={[
            {
              label: "Customer",
              render: (r: RecentActivityItem) => r.customer_name ?? "—",
            },
            {
              label: "Amount",
              render: (r: RecentActivityItem) => (
                <span className={r.is_reversed ? "text-red-500 line-through" : "tabular-nums"}>
                  {formatMoney(r.amount)}
                </span>
              ),
            },
            {
              label: "Method",
              render: (r: RecentActivityItem) => r.method ?? "—",
            },
            {
              label: "Subscription",
              render: (r: RecentActivityItem) => r.subscription_number ?? "—",
            },
            {
              label: "Status",
              render: (r: RecentActivityItem) =>
                r.is_reversed ? (
                  <StatusBadge label="Reversed" variant="danger" />
                ) : (
                  <StatusBadge label="Active" variant="success" />
                ),
            },
          ]}
        />
      </DashboardSection>

      {/* ── Due Subscriptions ── */}
      {d.due_subscriptions.length > 0 && (
        <DashboardSection
          title="Due Subscriptions"
          badge={`${d.due_subscriptions.length} items`}
        >
          <MiniTable
            data={d.due_subscriptions.slice(0, 10)}
            keyFn={(r) => String(r.id)}
            columns={[
              {
                label: "Customer",
                render: (r: DueSubscriptionRow) => r.customer_name ?? "—",
              },
              {
                label: "Subscription",
                render: (r: DueSubscriptionRow) => r.subscription_number ?? "—",
              },
              {
                label: "Due Date",
                render: (r: DueSubscriptionRow) => r.due_date ?? "—",
              },
              {
                label: "Amount",
                render: (r: DueSubscriptionRow) => (
                  <span className="tabular-nums">{formatMoney(r.pending_amount)}</span>
                ),
              },
              {
                label: "Status",
                render: (r: DueSubscriptionRow) =>
                  r.is_overdue ? (
                    <StatusBadge label={`${r.overdue_days ?? 0}d overdue`} variant="danger" />
                  ) : (
                    <StatusBadge label="Upcoming" variant="warning" />
                  ),
              },
            ]}
          />
        </DashboardSection>
      )}

      {/* ── Winner Surface ── */}
      {d.winner_surface && d.winner_surface.winner_subscriptions > 0 && (
        <DashboardSection title="Winner Summary">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-stone-400">Winner Subscriptions</p>
              <p className="text-lg font-semibold text-brand-700">
                {d.winner_surface.winner_subscriptions}
              </p>
            </div>
            <div>
              <p className="text-stone-400">Waived EMIs</p>
              <p className="text-lg font-semibold text-emerald-600">
                {d.winner_surface.waived_emis}
              </p>
            </div>
            <div>
              <p className="text-stone-400">Total Waived</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-600">
                {formatMoney(d.winner_surface.total_waived_amount)}
              </p>
            </div>
          </div>
        </DashboardSection>
      )}

      {/* ── Reconciliation Alerts ── */}
      {d.reconciliation && d.reconciliation.flagged_count > 0 && (
        <DashboardSection
          title="Reconciliation Exceptions"
          badge={`${d.reconciliation.flagged_count} flagged`}
        >
          <MiniTable
            data={d.reconciliation.results.slice(0, 10)}
            keyFn={(r) => r.subscription_id}
            columns={[
              {
                label: "Subscription",
                render: (r: ReconciliationRow) => r.subscription_number,
              },
              {
                label: "Customer",
                render: (r: ReconciliationRow) => r.customer_name ?? "—",
              },
              {
                label: "Paid",
                render: (r: ReconciliationRow) => (
                  <span className="tabular-nums">{formatMoney(r.paid_amount)}</span>
                ),
              },
              {
                label: "Outstanding",
                render: (r: ReconciliationRow) => (
                  <span className="tabular-nums">{formatMoney(r.pending_outstanding)}</span>
                ),
              },
              {
                label: "Delta",
                render: (r: ReconciliationRow) => {
                  const delta = Number(r.delta ?? 0);
                  return (
                    <span
                      className={`tabular-nums font-medium ${delta !== 0 ? "text-red-600" : "text-stone-500"}`}
                    >
                      {formatMoney(r.delta)}
                    </span>
                  );
                },
              },
            ]}
          />
        </DashboardSection>
      )}

      {/* ── Commission Summary ── */}
      <DashboardSection title="Commission Summary">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-stone-400">Total</p>
            <p className="font-semibold tabular-nums text-stone-800">
              {formatMoney(d.commission_summary.total_commission)}
            </p>
            <p className="text-xs text-stone-400">{d.commission_summary.total_count} entries</p>
          </div>
          <div>
            <p className="text-stone-400">Pending</p>
            <p className="font-semibold tabular-nums text-amber-600">
              {formatMoney(d.commission_summary.pending_commission)}
            </p>
            <p className="text-xs text-stone-400">{d.commission_summary.pending_count}</p>
          </div>
          <div>
            <p className="text-stone-400">Settled</p>
            <p className="font-semibold tabular-nums text-emerald-600">
              {formatMoney(d.commission_summary.settled_commission)}
            </p>
            <p className="text-xs text-stone-400">{d.commission_summary.settled_count}</p>
          </div>
          <div>
            <p className="text-stone-400">Reversed</p>
            <p className="font-semibold tabular-nums text-red-600">
              {formatMoney(d.commission_summary.reversed_commission)}
            </p>
            <p className="text-xs text-stone-400">{d.commission_summary.reversed_count}</p>
          </div>
        </div>
      </DashboardSection>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: import("lucide-react").LucideIcon;
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="text-stone-400" />
      <div>
        <p className={`text-lg font-semibold ${danger ? "text-red-600" : "text-stone-800"}`}>
          {value}
        </p>
        <p className="text-xs text-stone-400">{label}</p>
      </div>
    </div>
  );
}
